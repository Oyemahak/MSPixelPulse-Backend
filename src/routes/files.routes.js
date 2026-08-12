// backend/src/routes/files.routes.js
import { Router } from "express";
import multer from "multer";
import { uploadBuffer } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import Project from "../models/Project.js";
import { cleanFileName, projectFilePrefix, validateUpload } from "../lib/filePolicy.js";

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
      if (!['invoice', 'evidence', 'cover'].includes(purpose) || !projectId) {
        return res.status(400).json({ error: 'purpose and projectId are required' });
      }

      const project = await Project.findById(projectId).select('_id developer').lean();
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const isAdmin = req.user?.role === 'admin';
      const isAssignedDeveloper = req.user?.role === 'developer' && String(project.developer || '') === String(req.user._id);
      if (
        (['invoice', 'cover'].includes(purpose) && !isAdmin) ||
        (purpose === 'evidence' && !isAdmin && !isAssignedDeveloper)
      ) {
        return res.status(403).json({ error: 'Forbidden' });
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

      const { url } = await uploadBuffer(path, buffer, mimetype);

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

export default router;
