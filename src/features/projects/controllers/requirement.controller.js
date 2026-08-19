// backend/src/features/projects/controllers/requirement.controller.js
import multer from "multer";
import Requirement from "../../../models/Requirement.js";
import Project from "../../../models/Project.js";
import { signedURL as createSignedUrl, removeObjects as removePaths, putObject } from "../../../lib/storage.js";
import { cleanFileName, validateUpload } from "../../../lib/filePolicy.js";
import { cleanText } from "../../../lib/validation.js";
import {
  canManageRequirements,
  canReadProject,
  projectAccessError,
} from "../../../lib/projectAccess.js";
import { googleFilesRepository } from '../../../repositories/files.repository.js';
import { storageProviderName } from '../../../config/providers.js';

/**
 * Multer keeps legacy multipart files in memory before passing them to the configured storage provider.
 */
export const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 30 },
});

function filePaths(requirement) {
  if (!requirement) return [];
  return [
    requirement.logo?.path,
    requirement.brief?.path,
    ...(requirement.supporting || []).map((file) => file.path),
    ...(requirement.pages || []).flatMap((page) => (page.files || []).map((file) => file.path)),
  ].filter(Boolean);
}

async function refreshRef(file) {
  if (!file?.path) return file;
  try {
    file.url = await createSignedUrl(file.path);
  } catch {
    file.url = '';
  }
  return file;
}

async function presentRequirement(requirement) {
  if (!requirement) return null;
  await Promise.all([
    refreshRef(requirement.logo),
    refreshRef(requirement.brief),
    ...(requirement.supporting || []).map(refreshRef),
    ...(requirement.pages || []).flatMap((page) => (page.files || []).map(refreshRef)),
  ]);
  return requirement;
}

/**
 * GET /api/projects/:projectId/requirements
 */
export async function getRequirement(req, res) {
  const { projectId } = req.params;
  const project = await Project.findById(projectId).select("client developer").lean();
  if (!project) return res.status(404).json({ message: "Project not found" });
  if (!canReadProject(req.user, project)) return projectAccessError(res);
  const doc = await Requirement.findOne({ project: projectId }).lean();
  res.json({ ok: true, requirement: await presentRequirement(doc) });
}

/**
 * PUT /api/projects/:projectId/requirements
 *
 * Roles: admin, developer, client (router enforces).
 *
 * ADDITIVE UPSERT RULES:
 *  - Pages merge by name (case-insensitive). Files append; note only overwrites if provided.
 *  - Uploading logo/brief replaces only that field (not other fields).
 *  - Supporting docs append.
 *  - Absent fields are left untouched (no destructive wipe).
 *
 * Form-data:
 *  - logo (file)
 *  - brief (file)
 *  - supporting (files, multiple)
 *  - pages: JSON string: [{ name, note }]
 *  - pageFiles[Home][] (files...), pageFiles[Services][], etc.
 */
export async function upsertRequirement(req, res) {
  const { projectId } = req.params;
  const me = req.user;
  const now = Date.now();
  const targetProject = await Project.findById(projectId).select("client developer").lean();
  if (!targetProject) return res.status(404).json({ message: "Project not found" });
  if (!canManageRequirements(me, targetProject)) return projectAccessError(res);

  for (const file of Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()) {
    const verdict = validateUpload(file, 'requirement');
    if (!verdict.ok) return res.status(415).json({ message: verdict.message });
  }

  const filesByField = Array.isArray(req.files)
    ? req.files.reduce((acc, file) => {
        if (!acc[file.fieldname]) acc[file.fieldname] = [];
        acc[file.fieldname].push(file);
        return acc;
      }, {})
    : (req.files || {});

  let uploadedFiles = {};
  try {
    uploadedFiles = typeof req.body?.uploadedFiles === 'string'
      ? JSON.parse(req.body.uploadedFiles || '{}')
      : (req.body?.uploadedFiles || {});
  } catch {
    return res.status(400).json({ message: 'uploadedFiles must be valid JSON' });
  }

  async function verifiedDirectRef(ref) {
    if (!ref?.path || storageProviderName() !== 'google-drive') return null;
    const record = await googleFilesRepository.findOne({ logicalPath: String(ref.path) });
    if (
      !record ||
      String(record.projectId || '') !== String(projectId) ||
      String(record.uploadedBy || '') !== String(me?._id || '') ||
      String(record.category || '') !== 'requirements' ||
      !String(record.logicalPath || '').startsWith(`projects/${projectId}/requirements/`)
    ) return null;
    return {
      name: String(record.originalName || record.storedName || 'file'),
      type: String(record.mimeType || 'application/octet-stream'),
      size: Number(record.size || 0),
      path: String(record.logicalPath),
      url: await createSignedUrl(record.logicalPath),
    };
  }

  async function verifiedDirectList(list) {
    const output = [];
    for (const ref of Array.isArray(list) ? list : []) {
      const verified = await verifiedDirectRef(ref);
      if (!verified) return null;
      output.push(verified);
    }
    return output;
  }

  const direct = { pageFiles: {} };
  if (uploadedFiles.logo) direct.logo = await verifiedDirectRef(uploadedFiles.logo);
  if (uploadedFiles.brief) direct.brief = await verifiedDirectRef(uploadedFiles.brief);
  direct.supporting = await verifiedDirectList(uploadedFiles.supporting || []);
  if ((uploadedFiles.logo && !direct.logo) || (uploadedFiles.brief && !direct.brief) || direct.supporting === null) {
    return res.status(403).json({ message: 'One or more uploaded requirement files are not authorized' });
  }
  for (const [pageName, refs] of Object.entries(uploadedFiles.pageFiles || {})) {
    const verified = await verifiedDirectList(refs);
    if (verified === null) return res.status(403).json({ message: 'One or more uploaded requirement files are not authorized' });
    direct.pageFiles[pageName] = verified;
  }

  const norm = (s) => cleanText(s, 120);
  const keyOf = (s) => norm(s).toLowerCase();

  async function put(one, keyPath) {
    if (!one) return null;
    const original = cleanFileName(one.originalname || "file");
    const path = `projects/${projectId}/${keyPath}/${now}_${original}`;
    const { url } = await putObject({
      path,
      buffer: one.buffer,
      contentType: one.mimetype || "application/octet-stream",
      metadata: {
        projectId: String(projectId),
        clientId: String(targetProject.client || ''),
        userId: String(me?._id || ''),
        uploadedBy: String(me?._id || ''),
        category: 'requirements',
        originalName: original,
      },
    });
    return { name: original, type: one.mimetype, size: one.size, path, url };
  }

  // Parse incoming pages meta
  let pagesMeta = [];
  try {
    pagesMeta = Array.isArray(req.body.pages)
      ? req.body.pages
      : JSON.parse(String(req.body.pages || "[]"));
  } catch {
    pagesMeta = [];
  }

  // Load current doc or create new
  const current =
    (await Requirement.findOne({ project: projectId })) ||
    new Requirement({ project: projectId });

  const next = current.toObject();
  const replacedPaths = [];

  // Core uploads (replace field only)
  if (filesByField?.logo?.[0]) {
    if (next.logo?.path) replacedPaths.push(next.logo.path);
    next.logo = await put(filesByField.logo[0], "core/logo");
  } else if (direct.logo) {
    if (next.logo?.path) replacedPaths.push(next.logo.path);
    next.logo = direct.logo;
  }
  if (filesByField?.brief?.[0]) {
    if (next.brief?.path) replacedPaths.push(next.brief.path);
    next.brief = await put(filesByField.brief[0], "core/brief");
  } else if (direct.brief) {
    if (next.brief?.path) replacedPaths.push(next.brief.path);
    next.brief = direct.brief;
  }

  // Supporting docs (append)
  if (Array.isArray(filesByField?.supporting) && filesByField.supporting.length) {
    const uploaded = [];
    for (const f of filesByField.supporting) uploaded.push(await put(f, "supporting"));
    next.supporting = Array.isArray(next.supporting) ? [...next.supporting, ...uploaded] : uploaded;
  }
  if (direct.supporting?.length) {
    next.supporting = Array.isArray(next.supporting)
      ? [...next.supporting, ...direct.supporting]
      : direct.supporting;
  }

  // Per-page uploads keyed by field name pageFiles[<Name>]
  const perPageUploads = {};
  for (const field of Object.keys(filesByField || {})) {
    const m = field.match(/^pageFiles\[(.+)\]$/);
    if (!m) continue;
    const pageName = m[1];
    for (const f of filesByField[field]) {
      const ref = await put(f, `pages/${encodeURIComponent(pageName)}`);
      if (!perPageUploads[pageName]) perPageUploads[pageName] = [];
      perPageUploads[pageName].push(ref);
    }
  }
  for (const [pageName, refs] of Object.entries(direct.pageFiles)) {
    if (!perPageUploads[pageName]) perPageUploads[pageName] = [];
    perPageUploads[pageName].push(...refs);
  }

  // Build existing map (case-insensitive key)
  const map = new Map();
  for (const p of Array.isArray(next.pages) ? next.pages : []) {
    map.set(keyOf(p.name), { ...p, name: norm(p.name) });
  }

  const uploadsByPageKey = new Map();
  const uploadPageNames = new Map();
  for (const [name, refs] of Object.entries(perPageUploads)) {
    const key = keyOf(name);
    uploadsByPageKey.set(key, [...(uploadsByPageKey.get(key) || []), ...refs]);
    if (!uploadPageNames.has(key)) uploadPageNames.set(key, norm(name));
  }

  // Merge meta + uploads into existing pages
  for (const meta of pagesMeta) {
    const name = norm(meta?.name || "");
    if (!name) continue;
    const k = keyOf(name);
    const newFiles = uploadsByPageKey.get(k) || [];
    uploadsByPageKey.delete(k);

    if (map.has(k)) {
      const cur = map.get(k);
      map.set(k, {
        name,
        note: meta.note !== undefined ? cleanText(meta.note, 2000) : cur.note,
        files: [...(cur.files || []), ...newFiles],
      });
    } else {
      map.set(k, {
        name,
        note: cleanText(meta.note, 2000),
        files: newFiles,
      });
    }
  }

  // Handle uploads that came without a meta entry
  for (const [key, refs] of uploadsByPageKey) {
    if (map.has(key)) {
      const currentPage = map.get(key);
      map.set(key, { ...currentPage, files: [...(currentPage.files || []), ...refs] });
    } else {
      map.set(key, { name: uploadPageNames.get(key) || "Page", note: "", files: refs });
    }
  }

  next.pages = Array.from(map.values());
  next.client = targetProject.client || next.client || null;

  // Persist requirements
  current.set(next);
  const saved = await current.save();
  let cleanupPending = false;
  if (replacedPaths.length) {
    try {
      await removePaths(replacedPaths);
    } catch {
      cleanupPending = true;
    }
  }

  // If the updater is the client, auto-log a brief announcement so Admin/Dev see it
  if (me?.role === 'client') {
    const project = await Project.findById(projectId);
    if (project) {
      const short = `Client updated requirements (${new Date().toLocaleString()})`;
      project.announcements.unshift({
        title: short,
        body: 'New/updated files or notes were added by the client.',
        ts: Date.now(),
        author: me._id,
        authorName: cleanText(me.name || '', 120),
        authorRole: cleanText(me.role || '', 40),
      });
      await project.save();
    }
  }

  res.json({ ok: true, requirement: await presentRequirement(saved.toObject()), cleanupPending });
}

/**
 * PATCH /api/projects/:projectId/requirements/review
 * Roles: admin or developer
 */
export async function setReview(req, res) {
  const { projectId } = req.params;
  const { reviewed = true } = req.body || {};
  const project = await Project.findById(projectId).select("client developer").lean();
  if (!project) return res.status(404).json({ message: "Project not found" });
  if (!canReadProject(req.user, project)) return projectAccessError(res);
  const doc = await Requirement.findOneAndUpdate(
    { project: projectId },
    { $set: { reviewedByDev: !!reviewed, reviewedAt: reviewed ? new Date() : null } },
    { new: true, upsert: true }
  ).lean();
  res.json({ ok: true, requirement: await presentRequirement(doc) });
}

/**
 * DELETE /api/projects/:projectId/requirements
 * Role: admin — removes the requirements document and its exact storage objects.
 */
export async function deleteRequirement(req, res) {
  const { projectId } = req.params;
  const project = await Project.findById(projectId).select("_id").lean();
  if (!project) return res.status(404).json({ message: "Project not found" });
  const requirement = await Requirement.findOne({ project: projectId }).lean();
  if (requirement) {
    await removePaths(filePaths(requirement));
    await Requirement.deleteOne({ _id: requirement._id });
  }
  res.json({ ok: true });
}
