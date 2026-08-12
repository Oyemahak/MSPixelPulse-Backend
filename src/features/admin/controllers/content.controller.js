import SiteContent, { SITE_CONTENT_KINDS } from '../../../models/SiteContent.js';
import { cleanText } from '../../../lib/validation.js';
import slugify from '../../../utils/slugify.js';

function validKind(value) {
  return SITE_CONTENT_KINDS.includes(String(value || ''));
}

function contentPatch(body = {}, { creating = false } = {}) {
  const patch = {};
  if (creating || 'title' in body) patch.title = cleanText(body.title, 180);
  if (creating || 'key' in body) patch.key = slugify(cleanText(body.key || body.title, 180));
  if ('payload' in body) patch.payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
  if ('published' in body) patch.published = Boolean(body.published);
  if ('displayOrder' in body) patch.displayOrder = Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 999;
  return patch;
}

export async function listContent(req, res) {
  if (!validKind(req.params.kind)) return res.status(404).json({ message: 'Content type not found' });
  const items = await SiteContent.find({ kind: req.params.kind }).sort({ displayOrder: 1, createdAt: 1 });
  res.json({ items });
}

export async function createContent(req, res) {
  if (!validKind(req.params.kind)) return res.status(404).json({ message: 'Content type not found' });
  const patch = contentPatch(req.body, { creating: true });
  if (!patch.title || !patch.key) return res.status(400).json({ message: 'Title and key are required' });
  const item = await SiteContent.create({ kind: req.params.kind, ...patch });
  res.status(201).json({ item });
}

export async function updateContent(req, res) {
  if (!validKind(req.params.kind)) return res.status(404).json({ message: 'Content type not found' });
  const patch = contentPatch(req.body);
  if ('title' in patch && !patch.title) return res.status(400).json({ message: 'Title is required' });
  if ('key' in patch && !patch.key) return res.status(400).json({ message: 'Key is required' });
  const item = await SiteContent.findOneAndUpdate(
    { _id: req.params.contentId, kind: req.params.kind },
    patch,
    { new: true, runValidators: true }
  );
  if (!item) return res.status(404).json({ message: 'Content record not found' });
  res.json({ item });
}

export async function archiveContent(req, res) {
  if (!validKind(req.params.kind)) return res.status(404).json({ message: 'Content type not found' });
  const item = await SiteContent.findOneAndUpdate(
    { _id: req.params.contentId, kind: req.params.kind },
    { published: false, archivedAt: new Date() },
    { new: true, runValidators: true }
  );
  if (!item) return res.status(404).json({ message: 'Content record not found' });
  res.json({ ok: true, archived: true, item });
}
