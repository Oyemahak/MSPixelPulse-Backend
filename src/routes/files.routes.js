// backend/src/routes/files.routes.js

import crypto from 'crypto';

import { Router } from 'express';
import multer from 'multer';

import Project from '../models/Project.js';
import User from '../models/User.js';

import {
  optionalAuth,
  requireAuth,
} from '../middleware/auth.js';

import {
  cleanFileName,
  projectFilePrefix,
  validateUpload,
} from '../lib/filePolicy.js';

import {
  canReadProject,
  canWriteProject,
  projectAccessError,
} from '../lib/projectAccess.js';

import {
  storageProviderName,
} from '../config/providers.js';

import {
  findFileByDriveFileId,
} from '../repositories/files.repository.js';

import {
  getStorageProvider,
} from '../storage/provider.js';

import {
  signDriveUploadCompletion,
  verifyDriveFileAccess,
  verifyDriveUploadCompletion,
} from '../storage/fileAccessToken.js';

const router = Router();

/*
 * Multipart uploads pass through the Vercel Function body.
 *
 * Keep them below Vercel's request-body ceiling.
 * Larger project files use the resumable Google Drive flow
 * instead and therefore do not pass file bytes through
 * Vercel.
 */
const MULTIPART_MAX_BYTES =
  4 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MULTIPART_MAX_BYTES,
    files: 1,
  },
});

/*
 * File types supported by the Google Drive resumable flow.
 *
 * Avatar remains supported here for backward compatibility,
 * although the current frontend now uses
 * /users/me/avatar directly.
 */
const DIRECT_UPLOAD_PURPOSES =
  new Set([
    'evidence',
    'cover',
    'message',
    'requirement',
    'avatar',
  ]);

/* ---------------------------------------------------------
   Helpers
   --------------------------------------------------------- */

function directUploadPath({
  purpose,
  projectId,
  userId,
  originalName,
  requirementField,
}) {
  const suffix =
    `${Date.now()}_` +
    `${crypto.randomUUID()}_` +
    `${cleanFileName(originalName)}`;

  if (purpose === 'avatar') {
    return `avatars/${userId}/${suffix}`;
  }

  if (
    purpose === 'requirement'
  ) {
    const field = String(
      requirementField ||
        'supporting',
    );

    if (field === 'logo') {
      return (
        `projects/${projectId}/` +
        `requirements/core/logo/${suffix}`
      );
    }

    if (field === 'brief') {
      return (
        `projects/${projectId}/` +
        `requirements/core/brief/${suffix}`
      );
    }

    if (
      field === 'supporting'
    ) {
      return (
        `projects/${projectId}/` +
        `requirements/supporting/${suffix}`
      );
    }

    if (
      field.startsWith(
        'page:',
      )
    ) {
      const pageName =
        cleanFileName(
          field.slice(5),
        )
          .replace(
            /\.+/g,
            '_',
          ) ||
        'page';

      return (
        `projects/${projectId}/` +
        `requirements/pages/` +
        `${pageName}/${suffix}`
      );
    }

    return '';
  }

  const now =
    new Date();

  const yyyy =
    now.getUTCFullYear();

  const mm = String(
    now.getUTCMonth() + 1,
  ).padStart(2, '0');

  return (
    `${projectFilePrefix(
      projectId,
      purpose,
    )}` +
    `${yyyy}/${mm}/${suffix}`
  );
}

function storage() {
  const provider =
    getStorageProvider();

  provider.ensureReady?.();

  return provider;
}

async function authorizeDirectUpload(
  req,
  res,
) {
  const purpose = String(
    req.body?.purpose ||
      '',
  ).toLowerCase();

  const projectId = String(
    req.body?.projectId ||
      '',
  );

  if (
    !DIRECT_UPLOAD_PURPOSES.has(
      purpose,
    )
  ) {
    res.status(400).json({
      error:
        'A supported upload purpose is required',
    });

    return null;
  }

  /*
   * Avatar is owned by the authenticated user and is not
   * project scoped.
   */
  if (
    purpose === 'avatar'
  ) {
    return {
      purpose,
      projectId: '',
      project: null,
    };
  }

  if (!projectId) {
    res.status(400).json({
      error:
        'projectId is required',
    });

    return null;
  }

  const project =
    await Project.findById(
      projectId,
    )
      .select(
        '_id client developer',
      )
      .lean();

  if (!project) {
    res.status(404).json({
      error:
        'Project not found',
    });

    return null;
  }

  const isAdmin =
    req.user?.role ===
    'admin';

  let allowed = false;

  if (
    purpose ===
    'requirement'
  ) {
    allowed =
      canReadProject(
        req.user,
        project,
      );
  } else if (
    [
      'invoice',
      'cover',
    ].includes(purpose)
  ) {
    allowed = isAdmin;
  } else if (
    purpose ===
    'evidence'
  ) {
    allowed =
      canWriteProject(
        req.user,
        project,
      );
  } else {
    allowed =
      canReadProject(
        req.user,
        project,
      );
  }

  if (!allowed) {
    projectAccessError(res);

    return null;
  }

  return {
    purpose,
    projectId,
    project,
  };
}

/* ---------------------------------------------------------
   Google Drive resumable upload

   The browser sends only metadata to this endpoint.
   The file body itself is uploaded directly to the private
   Google Drive resumable session.
   --------------------------------------------------------- */

router.post(
  '/files/upload-session',
  requireAuth,
  async (
    req,
    res,
    next,
  ) => {
    try {
      if (
        storageProviderName() !==
        'google-drive'
      ) {
        return res
          .status(409)
          .json({
            error:
              'Resumable uploads require Google Drive storage',
          });
      }

      const authorization =
        await authorizeDirectUpload(
          req,
          res,
        );

      if (
        !authorization
      ) {
        return;
      }

      const originalName =
        String(
          req.body?.name ||
            '',
        );

      const mimetype =
        String(
          req.body?.type ||
            '',
        ).toLowerCase();

      const size =
        Number(
          req.body?.size ||
            0,
        );

      const requirementField =
        String(
          req.body
            ?.requirementField ||
            '',
        );

      const verdict =
        validateUpload(
          {
            originalname:
              originalName,
            mimetype,
            size,
          },
          authorization.purpose,
        );

      if (!verdict.ok) {
        return res
          .status(415)
          .json({
            error:
              verdict.message,
          });
      }

      const userId =
        String(
          req.user?._id ||
            '',
        );

      const logicalPath =
        directUploadPath({
          purpose:
            authorization.purpose,

          projectId:
            authorization.projectId,

          userId,

          originalName,

          requirementField,
        });

      if (!logicalPath) {
        return res
          .status(400)
          .json({
            error:
              'Invalid requirement upload field',
          });
      }

      const fileStorage =
        storage();

      const metadata = {
        projectId:
          authorization.projectId,

        clientId:
          String(
            authorization.project
              ?.client ||
              (
                authorization.purpose ===
                'avatar'
                  ? userId
                  : ''
              ),
          ),

        userId,

        uploadedBy:
          userId,

        category:
          authorization.purpose ===
          'requirement'
            ? 'requirements'
            : authorization.purpose ===
                'avatar'
              ? 'profile'
              : authorization.purpose,

        originalName,

        mimeType:
          mimetype,

        size,

        isPublic:
          authorization.purpose ===
          'cover',
      };

      const session =
        await fileStorage.createResumableUpload(
          logicalPath,
          {
            mimetype,
            size,
          },
          metadata,
        );

      const completionToken =
        signDriveUploadCompletion(
          {
            ...metadata,

            purpose:
              authorization.purpose,

            requirementField,

            logicalPath,

            uploadNonce:
              session.uploadNonce,

            parentDriveFolderId:
              session.parentDriveFolderId,

            userId,
          },
        );

      return res.json({
        upload: {
          url:
            session.uploadUrl,

          method:
            'PUT',

          headers: {
            'Content-Type':
              mimetype,
          },

          completionToken,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* ---------------------------------------------------------
   Complete Google Drive resumable upload
   --------------------------------------------------------- */

router.post(
  '/files/upload-complete',
  requireAuth,
  async (
    req,
    res,
    next,
  ) => {
    try {
      if (
        storageProviderName() !==
        'google-drive'
      ) {
        return res
          .status(404)
          .json({
            error:
              'File not found',
          });
      }

      const claims =
        verifyDriveUploadCompletion(
          req.body
            ?.completionToken,
        );

      if (
        !claims ||
        String(
          claims.userId ||
            '',
        ) !==
          String(
            req.user?._id ||
              '',
          )
      ) {
        return res
          .status(403)
          .json({
            error:
              'Upload session is invalid or expired',
          });
      }

      const driveFileId =
        String(
          req.body
            ?.driveFileId ||
            '',
        );

      if (!driveFileId) {
        return res
          .status(400)
          .json({
            error:
              'driveFileId is required',
          });
      }

      /*
       * Re-check authorization at completion.
       *
       * This prevents a session created before a role or
       * project assignment change from remaining valid.
       */
      req.body = {
        purpose:
          claims.purpose,

        projectId:
          claims.projectId,
      };

      const authorization =
        await authorizeDirectUpload(
          req,
          res,
        );

      if (
        !authorization
      ) {
        return;
      }

      const fileStorage =
        storage();

      const uploaded =
        await fileStorage.finalizeResumableUpload(
          claims.logicalPath,
          driveFileId,
          claims,
        );

      /*
       * Retain avatar completion support for older clients.
       * New frontend avatar uploads use /users/me/avatar.
       */
      if (
        claims.purpose ===
        'avatar'
      ) {
        const user =
          await User.findById(
            req.user._id,
          );

        if (!user) {
          return res
            .status(404)
            .json({
              message:
                'User not found',
            });
        }

        const oldPath =
          String(
            user.avatarPath ||
              '',
          );

        user.avatarPath =
          uploaded.path;

        user.avatarUrl =
          uploaded.url;

        await user.save();

        let cleanupPending =
          false;

        if (
          oldPath &&
          oldPath !==
            uploaded.path
        ) {
          try {
            await fileStorage.removePath(
              oldPath,
            );
          } catch (error) {
            cleanupPending =
              true;

            console.warn(
              'Old avatar cleanup failed:',
              error?.code ||
                error?.message ||
                'unknown error',
            );
          }
        }

        return res.json({
          ok: true,

          avatarUrl:
            uploaded.url,

          avatarPath:
            uploaded.path,

          file:
            uploaded.file,

          cleanupPending,
        });
      }

      return res.json({
        file: {
          name:
            claims.originalName,

          type:
            claims.mimeType,

          size:
            Number(
              claims.size,
            ),

          path:
            uploaded.path,

          url:
            uploaded.url,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* ---------------------------------------------------------
   Small multipart file upload

   This endpoint remains for backward compatibility and for
   small files.

   IMPORTANT:
   It uses the configured Google Drive storage provider.

   Storage is resolved through getStorageProvider(), so
   production automatically uses GoogleDriveStorage.
   --------------------------------------------------------- */

router.post(
  '/files/upload',
  requireAuth,
  upload.single('file'),
  async (
    req,
    res,
    next,
  ) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({
            error:
              'file required',
          });
      }

      const purpose =
        String(
          req.body?.purpose ||
            '',
        ).toLowerCase();

      const projectId =
        String(
          req.body
            ?.projectId ||
            '',
        );

      if (
        ![
          'invoice',
          'evidence',
          'cover',
          'message',
        ].includes(
          purpose,
        ) ||
        !projectId
      ) {
        return res
          .status(400)
          .json({
            error:
              'purpose and projectId are required',
          });
      }

      const project =
        await Project.findById(
          projectId,
        )
          .select(
            '_id client developer',
          )
          .lean();

      if (!project) {
        return res
          .status(404)
          .json({
            error:
              'Project not found',
          });
      }

      const isAdmin =
        req.user?.role ===
        'admin';

      if (
        (
          [
            'invoice',
            'cover',
          ].includes(
            purpose,
          ) &&
          !isAdmin
        ) ||
        (
          purpose ===
            'evidence' &&
          !canWriteProject(
            req.user,
            project,
          )
        ) ||
        (
          purpose ===
            'message' &&
          !canReadProject(
            req.user,
            project,
          )
        )
      ) {
        return projectAccessError(
          res,
        );
      }

      const verdict =
        validateUpload(
          req.file,
          purpose,
        );

      if (!verdict.ok) {
        return res
          .status(415)
          .json({
            error:
              verdict.message,
          });
      }

      const {
        originalname,
        mimetype,
        size,
        buffer,
      } = req.file;

      const now =
        new Date();

      const yyyy =
        now.getUTCFullYear();

      const mm =
        String(
          now.getUTCMonth() +
            1,
        ).padStart(
          2,
          '0',
        );

      const clean =
        cleanFileName(
          originalname,
        );

      const logicalPath =
        `${projectFilePrefix(
          projectId,
          purpose,
        )}` +
        `${yyyy}/${mm}/` +
        `${Date.now()}_` +
        `${crypto.randomUUID()}_` +
        `${clean}`;

      const fileStorage =
        storage();

      const uploaded =
        await fileStorage.uploadBuffer(
          logicalPath,
          buffer,
          mimetype ||
            'application/octet-stream',
          {
            projectId,

            clientId:
              String(
                project.client ||
                  '',
              ),

            userId:
              String(
                req.user?._id ||
                  '',
              ),

            uploadedBy:
              String(
                req.user?._id ||
                  '',
              ),

            category:
              purpose,

            originalName:
              originalname,

            isPublic:
              purpose ===
              'cover',
          },
        );

      return res.json({
        file: {
          name:
            originalname,

          type:
            mimetype,

          size,

          path:
            uploaded.path ||
            logicalPath,

          url:
            uploaded.url,

          id:
            uploaded.file
              ?.id,

          driveFileId:
            uploaded.file
              ?.driveFileId,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* ---------------------------------------------------------
   Private Google Drive file proxy
   --------------------------------------------------------- */

router.get(
  '/files/drive/:driveFileId',
  optionalAuth,
  async (
    req,
    res,
    next,
  ) => {
    try {
      if (
        storageProviderName() !==
        'google-drive'
      ) {
        return res
          .status(404)
          .json({
            error:
              'File not found',
          });
      }

      const record =
        await findFileByDriveFileId(
          req.params
            .driveFileId,
        );

      if (!record) {
        return res
          .status(404)
          .json({
            error:
              'File not found',
          });
      }

      const signed =
        verifyDriveFileAccess(
          req.query?.token,
          record.driveFileId,
        );

      const isPublic =
        record.isPublic ===
          true ||
        record.isPublic ===
          'true';

      if (
        !signed &&
        !isPublic
      ) {
        if (!req.user) {
          return res
            .status(401)
            .json({
              error:
                'Unauthorized',
            });
        }

        if (
          req.user.role !==
          'admin'
        ) {
          if (
            record.projectId
          ) {
            const project =
              await Project.findById(
                record.projectId,
              )
                .select(
                  '_id client developer',
                )
                .lean();

            if (
              !project ||
              !canReadProject(
                req.user,
                project,
              )
            ) {
              return projectAccessError(
                res,
              );
            }
          } else if (
            String(
              record.userId ||
                record.clientId ||
                '',
            ) !==
            String(
              req.user._id,
            )
          ) {
            return res
              .status(403)
              .json({
                error:
                  'Forbidden',
              });
          }
        }
      }

      const fileStorage =
        storage();

      const metadata =
        await fileStorage.getMetadata(
          record.driveFileId,
        );

      const stream =
        await fileStorage.downloadStream(
          record.driveFileId,
        );

      res.setHeader(
        'Content-Type',
        metadata.mimeType ||
          record.mimeType ||
          'application/octet-stream',
      );

      const size =
        metadata.size ||
        record.size;

      if (size) {
        res.setHeader(
          'Content-Length',
          String(size),
        );
      }

      const downloadName =
        metadata.name ||
        record.originalName ||
        'download';

      res.setHeader(
        'Content-Disposition',
        `${req.query?.download === '1' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(
          downloadName,
        )}`,
      );

      /*
       * Private content should never be cached publicly.
       */
      res.setHeader(
        'Cache-Control',
        isPublic
          ? 'public, max-age=300'
          : 'private, no-store',
      );

      stream.on(
        'error',
        next,
      );

      return stream.pipe(
        res,
      );
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
