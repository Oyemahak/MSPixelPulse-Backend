// src/features/users/controllers/profile.controller.js

import multer from 'multer';

import User from '../../../models/User.js';

import {
  cleanFileName,
  validateUpload,
} from '../../../lib/filePolicy.js';

import {
  cleanPublicUrl,
  cleanText,
} from '../../../lib/validation.js';

import {
  presentUser,
} from '../../../lib/presentUser.js';

import {
  presentPresence,
} from '../../../lib/presence.js';

import {
  usersRepository,
} from '../../../repositories/users.repository.js';

import {
  getStorageProvider,
} from '../../../storage/provider.js';

const AVATAR_MAX_BYTES =
  4 * 1024 * 1024;

export const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        AVATAR_MAX_BYTES,

      files: 1,
    },
  });

const PROFILE_FIELDS = [
  'name',
  'phone',
  'companyName',
  'businessName',
  'businessWebsite',
  'industry',
  'jobTitle',
  'timezone',
  'preferredContactMethod',
  'bio',
  'specialties',
  'technologies',
  'availability',
  'projectContactPreference',
  'notificationPreferences',
  'themePreference',
];

function cleanList(
  value,
) {
  if (
    Array.isArray(value)
  ) {
    return value
      .map(
        (item) =>
          String(
            item ||
              '',
          ).trim(),
      )
      .filter(Boolean)
      .slice(
        0,
        20,
      );
  }

  if (
    typeof value ===
    'string'
  ) {
    return value
      .split(',')
      .map(
        (item) =>
          item.trim(),
      )
      .filter(Boolean)
      .slice(
        0,
        20,
      );
  }

  return [];
}

function cleanProfilePatch(
  body = {},
) {
  const patch = {};

  for (
    const key of
    PROFILE_FIELDS
  ) {
    if (!(key in body)) {
      continue;
    }

    if (
      key ===
        'specialties' ||
      key ===
        'technologies'
    ) {
      patch[key] =
        cleanList(
          body[key],
        );

      continue;
    }

    if (
      key ===
      'notificationPreferences'
    ) {
      const prefs =
        body[key] ||
        {};

      patch[key] = {
        portalUpdates:
          prefs.portalUpdates !==
          false,

        emailUpdates:
          prefs.emailUpdates !==
          false,

        billingAlerts:
          prefs.billingAlerts !==
          false,
      };

      continue;
    }

    if (
      key ===
      'themePreference'
    ) {
      if (
        [
          'light',
          'dark',
        ].includes(
          body[key],
        )
      ) {
        patch[key] =
          body[key];
      }

      continue;
    }

    if (
      key ===
      'businessWebsite'
    ) {
      patch[key] =
        body[key]
          ? cleanPublicUrl(
              body[key],
            )
          : '';

      continue;
    }

    const maxLength =
      key === 'bio'
        ? 2000
        : key ===
            'projectContactPreference'
          ? 500
          : 180;

    patch[key] =
      cleanText(
        body[key],
        maxLength,
      );
  }

  return patch;
}

function storage() {
  const provider =
    getStorageProvider();

  provider.ensureReady?.();

  return provider;
}

// GET /api/users/me
export async function getMyProfile(
  req,
  res,
) {
  const user =
    await User.findById(
      req.user?._id,
    )
      .select(
        '-password',
      )
      .lean();

  if (!user) {
    return res
      .status(404)
      .json({
        message:
          'User not found',
      });
  }

  return res.json({
    user:
      await presentUser(
        user,
      ),
  });
}

// PATCH /api/users/me
export async function updateMyProfile(
  req,
  res,
) {
  if (
    req.body
      ?.businessWebsite &&
    !cleanPublicUrl(
      req.body
        .businessWebsite,
    )
  ) {
    return res
      .status(400)
      .json({
        message:
          'Website must be a valid http or https URL',
      });
  }

  const patch =
    cleanProfilePatch(
      req.body ||
        {},
    );

  const user =
    await User.findByIdAndUpdate(
      req.user?._id,
      patch,
      {
        new: true,
        runValidators:
          true,
      },
    ).select(
      '-password',
    );

  if (!user) {
    return res
      .status(404)
      .json({
        message:
          'User not found',
      });
  }

  return res.json({
    user:
      await presentUser(
        user,
      ),
  });
}

// POST /api/users/me/presence
export async function heartbeatPresence(
  req,
  res,
) {
  try {
    const userId =
      String(
        req.user?._id ||
          req.user?.id ||
          '',
      );

    if (!userId) {
      return res
        .status(401)
        .json({
          message:
            'Unauthorized',
        });
    }

    const lastSeenAt =
      new Date()
        .toISOString();

    /*
     * Deliberately ignore the request body.
     * A heartbeat may only update the authenticated
     * user's own lastSeenAt field.
     */
    const user =
      await usersRepository
        .updatePresence(
          userId,
          {
            lastSeenAt,
            lastActivityAt:
              lastSeenAt,
            presenceState:
              'online',
          },
        );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            'User not found',
        });
    }

    return res.json({
      ok: true,

      presence:
        presentPresence(
          {
            lastSeenAt,
          },
        ),
    });
  } catch (error) {
    console.error(
      'heartbeatPresence error:',
      error?.code ||
        error?.message ||
        error,
    );

    const status =
      Number(
        error?.status ||
          500,
      );

    return res
      .status(status)
      .json({
        message:
          status === 503
            ? 'Presence service is temporarily unavailable'
            : 'Presence could not be updated',

        code:
          error?.code ||
          'PRESENCE_UPDATE_FAILED',
      });
  }
}

// POST /api/users/me/avatar
export async function setMyAvatar(
  req,
  res,
) {
  try {
    const file =
      req.file;

    if (!file) {
      return res
        .status(400)
        .json({
          message:
            'Avatar file is required',
        });
    }

    const verdict =
      validateUpload(
        file,
        'avatar',
      );

    if (!verdict.ok) {
      return res
        .status(415)
        .json({
          message:
            verdict.message,
        });
    }

    const user =
      await User.findById(
        req.user?._id,
      );

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            'User not found',
        });
    }

    const safeName =
      cleanFileName(
        file.originalname ||
          'avatar',
      );

    const storePath =
      `avatars/${String(
        user._id,
      )}/` +
      `${Date.now()}-${safeName}`;

    const contentType =
      file.mimetype ||
      'image/png';

    const fileStorage =
      storage();

    const uploaded =
      await fileStorage
        .uploadBuffer(
          storePath,
          file.buffer,
          contentType,
          {
            userId:
              String(
                user._id,
              ),

            clientId:
              String(
                user._id,
              ),

            uploadedBy:
              String(
                user._id,
              ),

            category:
              'profile',

            originalName:
              file.originalname ||
              safeName,

            isPublic:
              false,
          },
        );

    const oldPath =
      String(
        user.avatarPath ||
          '',
      );

    user.avatarUrl =
      uploaded.url;

    user.avatarPath =
      uploaded.path ||
      storePath;

    await user.save();

    let cleanupPending =
      false;

    if (
      oldPath &&
      oldPath !==
        String(
          user.avatarPath ||
            '',
        )
    ) {
      try {
        await fileStorage
          .removePath(
            oldPath,
          );
      } catch (
        error
      ) {
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
        user.avatarUrl,

      avatarPath:
        user.avatarPath,

      file:
        uploaded.file ||
        null,

      cleanupPending,

      user:
        await presentUser(
          user,
        ),
    });
  } catch (error) {
    console.error(
      'setMyAvatar error:',
      error?.code ||
        error?.message ||
        error,
    );

    const status =
      Number(
        error?.status ||
          500,
      );

    return res
      .status(status)
      .json({
        message:
          status === 503
            ? 'File storage is unavailable'
            : 'Avatar upload failed',

        code:
          error?.code ||
          'AVATAR_UPLOAD_FAILED',
      });
  }
}

// DELETE /api/users/me/avatar
export async function deleteMyAvatar(
  req,
  res,
) {
  try {
    const user =
      await User.findById(
        req.user?._id,
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

    user.avatarUrl =
      '';

    user.avatarPath =
      '';

    await user.save();

    let cleanupPending =
      false;

    if (oldPath) {
      try {
        const fileStorage =
          storage();

        await fileStorage
          .removePath(
            oldPath,
          );
      } catch (
        error
      ) {
        cleanupPending =
          true;

        console.warn(
          'Avatar delete cleanup failed:',
          error?.code ||
            error?.message ||
            'unknown error',
        );
      }
    }

    return res.json({
      ok: true,

      cleanupPending,

      user:
        await presentUser(
          user,
        ),
    });
  } catch (error) {
    console.error(
      'deleteMyAvatar error:',
      error?.code ||
        error?.message ||
        error,
    );

    const status =
      Number(
        error?.status ||
          500,
      );

    return res
      .status(status)
      .json({
        message:
          status === 503
            ? 'File storage is unavailable'
            : 'Avatar removal failed',

        code:
          error?.code ||
          'AVATAR_REMOVE_FAILED',
      });
  }
}
