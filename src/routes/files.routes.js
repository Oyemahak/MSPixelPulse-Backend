// backend/src/routes/files.routes.js
import { Router } from "express";
import multer from "multer";
import { uploadBuffer } from "../lib/supabase.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import Project from "../models/Project.js";
import { cleanFileName, projectFilePrefix, validateUpload } from "../lib/filePolicy.js";
import { canReadProject, canWriteProject, projectAccessError } from "../lib/projectAccess.js";
import { storageProviderName } from '../config/providers.js';
import { findFileByDriveFileId } from '../repositories/files.repository.js';
import { getStorageProvider } from '../storage/provider.js';
import { verifyDriveFileAccess } from '../storage/fileAccessToken.js';

const router = Router();

// Keep files in memory; we send buffers to Supabase
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
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
