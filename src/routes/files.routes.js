// backend/src/routes/files.routes.js
import { Router } from "express";
import multer from "multer";
import crypto from 'crypto';
import { uploadBuffer } from "../lib/supabase.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import Project from "../models/Project.js";
import { cleanFileName, projectFilePrefix, validateUpload } from "../lib/filePolicy.js";
import { canReadProject, canWriteProject, projectAccessError } from "../lib/projectAccess.js";
import { storageProviderName } from '../config/providers.js';
import { findFileByDriveFileId } from '../repositories/files.repository.js';
import { getStorageProvider } from '../storage/provider.js';
import { verifyDriveFileAccess } from '../storage/fileAccessToken.js';
import { signDriveUploadCompletion, verifyDriveUploadCompletion } from '../storage/fileAccessToken.js';
import User from '../models/User.js';

const router = Router();

// Keep files in memory; we send buffers to Supabase
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const DIRECT_UPLOAD_PURPOSES = new Set(['invoice', 'evidence', 'cover', 'message', 'requirement', 'avatar']);

function directUploadPath({ purpose, projectId, userId, originalName, requirementField }) {
  const suffix = `${Date.now()}_${crypto.randomUUID()}_${cleanFileName(originalName)}`;
  if (purpose === 'avatar') return `avatars/${userId}/${suffix}`;
  if (purpose === 'requirement') {
    const field = String(requirementField || 'supporting');
    if (field === 'logo') return `projects/${projectId}/requirements/core/logo/${suffix}`;
    if (field === 'brief') return `projects/${projectId}/requirements/core/brief/${suffix}`;
    if (field === 'supporting') return `projects/${projectId}/requirements/supporting/${suffix}`;
    if (field.startsWith('page:')) {
      const pageName = cleanFileName(field.slice(5)).replace(/\.+/g, '_') || 'page';
      return `projects/${projectId}/requirements/pages/${pageName}/${suffix}`;
    }
    return '';
  }
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${projectFilePrefix(projectId, purpose)}${yyyy}/${mm}/${suffix}`;
}

async function authorizeDirectUpload(req, res) {
  const purpose = String(req.body?.purpose || '').toLowerCase();
  const projectId = String(req.body?.projectId || '');
  if (!DIRECT_UPLOAD_PURPOSES.has(purpose)) {
    res.status(400).json({ error: 'A supported upload purpose is required' });
    return null;
  }
  if (purpose === 'avatar') return { purpose, projectId: '', project: null };
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return null;
  }
  const project = await Project.findById(projectId).select('_id client developer').lean();
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  const isAdmin = req.user?.role === 'admin';
  const allowed = purpose === 'requirement'
    ? canReadProject(req.user, project)
    : ['invoice', 'cover'].includes(purpose)
      ? isAdmin
      : purpose === 'evidence'
        ? canWriteProject(req.user, project)
        : canReadProject(req.user, project);
  if (!allowed) {
    projectAccessError(res);
    return null;
  }
  return { purpose, projectId, project };
}

/**
 * Start a private Google Drive resumable upload. Only the small JSON handshake
 * passes through Vercel; the browser sends the file bytes to Google directly.
 */
router.post('/files/upload-session', requireAuth, async (req, res, next) => {
  try {
    if (storageProviderName() !== 'google-drive') {
      return res.status(409).json({ error: 'Direct uploads require Google Drive storage' });
    }
    const authorization = await authorizeDirectUpload(req, res);
    if (!authorization) return;
    const originalName = String(req.body?.name || '');
    const mimetype = String(req.body?.type || '').toLowerCase();
    const size = Number(req.body?.size || 0);
    const requirementField = String(req.body?.requirementField || '');
    const verdict = validateUpload({ originalname: originalName, mimetype, size }, authorization.purpose);
    if (!verdict.ok) return res.status(415).json({ error: verdict.message });
    const userId = String(req.user?._id || '');
    const logicalPath = directUploadPath({
      purpose: authorization.purpose,
      projectId: authorization.projectId,
      userId,
      originalName,
      requirementField,
    });
    if (!logicalPath) return res.status(400).json({ error: 'Invalid requirement upload field' });
    const storage = getStorageProvider();
    const metadata = {
      projectId: authorization.projectId,
      clientId: String(authorization.project?.client || (authorization.purpose === 'avatar' ? userId : '')),
      userId,
      uploadedBy: userId,
      category: authorization.purpose === 'requirement' ? 'requirements' : authorization.purpose === 'avatar' ? 'profile' : authorization.purpose,
      originalName,
      mimeType: mimetype,
      size,
      isPublic: authorization.purpose === 'cover',
    };
    const session = await storage.createResumableUpload(logicalPath, { mimetype, size }, metadata);
    const completionToken = signDriveUploadCompletion({
      ...metadata,
      purpose: authorization.purpose,
      requirementField,
      logicalPath,
      uploadNonce: session.uploadNonce,
      parentDriveFolderId: session.parentDriveFolderId,
      userId,
    });
    return res.json({
      upload: {
        url: session.uploadUrl,
        method: 'PUT',
        headers: { 'Content-Type': mimetype },
        completionToken,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/files/upload-complete', requireAuth, async (req, res, next) => {
  try {
    if (storageProviderName() !== 'google-drive') return res.status(404).json({ error: 'File not found' });
    const claims = verifyDriveUploadCompletion(req.body?.completionToken);
    if (!claims || String(claims.userId || '') !== String(req.user?._id || '')) {
      return res.status(403).json({ error: 'Upload session is invalid or expired' });
    }
    const driveFileId = String(req.body?.driveFileId || '');
    if (!driveFileId) return res.status(400).json({ error: 'driveFileId is required' });

    // Re-check project authorization at completion so a stale upload session
    // cannot outlive a role or assignment change.
    req.body = { purpose: claims.purpose, projectId: claims.projectId };
    const authorization = await authorizeDirectUpload(req, res);
    if (!authorization) return;

    const storage = getStorageProvider();
    const uploaded = await storage.finalizeResumableUpload(claims.logicalPath, driveFileId, claims);
    if (claims.purpose === 'avatar') {
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const oldPath = user.avatarPath;
      user.avatarPath = uploaded.path;
      user.avatarUrl = uploaded.url;
      await user.save();
      let cleanupPending = false;
      if (oldPath && oldPath !== uploaded.path) {
        try {
          await storage.removePath(oldPath);
        } catch {
          cleanupPending = true;
        }
      }
      return res.json({ ok: true, avatarUrl: uploaded.url, file: uploaded.file, cleanupPending });
    }
    return res.json({
      file: {
        name: claims.originalName,
        type: claims.mimeType,
        size: Number(claims.size),
        path: uploaded.path,
        url: uploaded.url,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/files/upload
router.post(
  "/files/upload",
  requireAuth,
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "file required" });

      const purpose = String(req.body?.purpose || "");
      const projectId = String(req.body?.projectId || "");
      if (!['invoice', 'evidence', 'cover', 'message'].includes(purpose) || !projectId) {
        return res.status(400).json({ error: 'purpose and projectId are required' });
      }

      const project = await Project.findById(projectId).select('_id client developer').lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const isAdmin = req.user?.role === 'admin';
      if (
        (['invoice', 'cover'].includes(purpose) && !isAdmin) ||
        (purpose === 'evidence' && !canWriteProject(req.user, project)) ||
        (purpose === 'message' && !canReadProject(req.user, project))
      ) {
        return projectAccessError(res);
      }

      const verdict = validateUpload(req.file, purpose);
      if (!verdict.ok) return res.status(415).json({ error: verdict.message });

      const { originalname, mimetype, size, buffer } = req.file;

      // safe-ish path: /uploads/YYYY/MM/<ts>_<clean-name>
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const clean = cleanFileName(originalname);
      const path = `${projectFilePrefix(projectId, purpose)}${yyyy}/${mm}/${Date.now()}_${clean}`;

      const { url } = await uploadBuffer(path, buffer, mimetype, {
        projectId,
        clientId: String(project.client || ''),
        userId: String(req.user?._id || ''),
        uploadedBy: String(req.user?._id || ''),
        category: purpose,
        originalName: originalname,
        isPublic: purpose === 'cover',
      });

      res.json({
        file: {
          name: originalname,
          type: mimetype,
          size,
          path,
          url,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Google Drive objects stay private. The storage service emits a short-lived
 * JWT URL compatible with existing <img>/<a> consumers; authenticated users
 * may also download an object after normal project access is checked.
 */
router.get('/files/drive/:driveFileId', optionalAuth, async (req, res, next) => {
  try {
    if (storageProviderName() !== 'google-drive') return res.status(404).json({ error: 'File not found' });
    const record = await findFileByDriveFileId(req.params.driveFileId);
    if (!record) return res.status(404).json({ error: 'File not found' });

    const signed = verifyDriveFileAccess(req.query?.token, record.driveFileId);
    const isPublic = record.isPublic === true || record.isPublic === 'true';
    if (!signed && !isPublic) {
      if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
      if (req.user.role !== 'admin') {
        if (record.projectId) {
          const project = await Project.findById(record.projectId).select('_id client developer').lean();
          if (!project || !canReadProject(req.user, project)) return projectAccessError(res);
        } else if (String(record.userId || record.clientId || '') !== String(req.user._id)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
    }

    const storage = getStorageProvider();
    const metadata = await storage.getMetadata(record.driveFileId);
    const stream = await storage.downloadStream(record.driveFileId);
    res.setHeader('Content-Type', metadata.mimeType || record.mimeType || 'application/octet-stream');
    const size = metadata.size || record.size;
    if (size) res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(metadata.name || record.originalName || 'download')}`);
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

export default router;
