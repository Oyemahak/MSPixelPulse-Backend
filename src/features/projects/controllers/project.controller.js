// backend/src/features/projects/controllers/project.controller.js
import Project from '../../../models/Project.js';
import Requirement from '../../../models/Requirement.js';
import { cleanPublicUrl, cleanText } from '../../../lib/validation.js';
import { signedURL as createSignedUrl, removeObject as removePath } from '../../../lib/storage.js';
import { pathBelongsToProjectPurpose } from '../../../lib/filePolicy.js';
import {
  canReadProject,
  canWriteProject,
  projectAccessError,
  projectScopeFor,
} from '../../../lib/projectAccess.js';
import { emitPortalEvent } from '../../../lib/portalEvents.js';

/* Populate user refs consistently */
const POP = [
  { path: 'client', select: 'name email role status' },
  { path: 'developer', select: 'name email role status' },
];

const PORTFOLIO_FIELDS = [
  'shortDescription',
  'fullDescription',
  'projectClassification',
  'industry',
  'websiteType',
  'platform',
  'technologies',
  'repositoryUrl',
  'repositoryFullName',
  'repositoryId',
  'repositoryUpdatedAt',
  'sourceImportedAt',
  'coverSource',
  'categories',
  'liveUrl',
  'thumbnail',
  'coverImage',
  'mockupImages',
  'galleryImages',
  'featured',
  'published',
  'displayOrder',
  'completionDate',
  'clientName',
  'projectOverview',
  'challenge',
  'solution',
  'keyFeatures',
  'responsiveHighlights',
  'servicesProvided',
  'resultSummary',
  'seoTitle',
  'seoDescription',
  'imageAltText',
];

const PUBLIC_SELECT = [
  'title',
  'slug',
  'summary',
  ...PORTFOLIO_FIELDS,
].join(' ');

function parseBool(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

function sortSpec(value = '') {
  const sorts = {
    newest: { updatedAt: -1, createdAt: -1 },
    oldest: { createdAt: 1 },
    title: { title: 1 },
    display: { featured: -1, displayOrder: 1, updatedAt: -1 },
    completed: { completionDate: -1, updatedAt: -1 },
  };
  return sorts[value] || sorts.newest;
}

function addRegexFilter(cond, field, value) {
  if (value) cond[field] = { $regex: escapeRegex(cleanText(value, 120)), $options: 'i' };
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function portfolioValidationError(source = {}) {
  for (const key of ['repositoryUrl', 'liveUrl', 'thumbnail']) {
    if (source[key] && !cleanPublicUrl(source[key])) return `${key} must be a valid http or https URL`;
  }
  if (
    source.coverImage?.path &&
    !pathBelongsToProjectPurpose(source.coverImage.path, source._id || source.projectId, 'cover')
  ) {
    return 'coverImage must belong to this project';
  }
  return '';
}

async function refreshStoredFile(file) {
  if (!file?.path) return file;
  try {
    file.url = await createSignedUrl(file.path);
  } catch {
    file.url = '';
  }
  return file;
}

async function presentProject(project) {
  if (!project) return project;
  const value = typeof project.toObject === 'function' ? project.toObject() : project;
  if (value.coverImage?.path) {
    await refreshStoredFile(value.coverImage);
    value.thumbnail = value.coverImage.url || '';
  }
  await Promise.all(
    (value.evidence || []).flatMap((entry) => (entry.images || []).map(refreshStoredFile))
  );
  return value;
}

/** GET /api/projects?status=&q=&classification=&industry=&published=&featured=&sort= */
export async function listProjects(req, res) {
  const {
    q = '',
    status,
    classification,
    industry,
    websiteType,
    platform,
    client,
    developer,
    sort = 'newest',
  } = req.query;
  const published = parseBool(req.query.published);
  const featured = parseBool(req.query.featured);

  const cond = projectScopeFor(req.user);
  if (status) cond.status = status;
  if (classification) cond.projectClassification = classification;
  if (published !== undefined) cond.published = published;
  if (featured !== undefined) cond.featured = featured;
  if (req.user?.role === 'admin' && client) cond.client = client;
  if (req.user?.role === 'admin' && developer) cond.developer = developer;
  addRegexFilter(cond, 'industry', industry);
  addRegexFilter(cond, 'websiteType', websiteType);
  addRegexFilter(cond, 'platform', platform);

  if (q) {
    const rx = { $regex: escapeRegex(cleanText(q, 120)), $options: 'i' };
    cond.$or = [
      { title: rx },
      { slug: rx },
      { summary: rx },
      { shortDescription: rx },
      { clientName: rx },
      { industry: rx },
      { websiteType: rx },
      { platform: rx },
      { technologies: rx },
      { servicesProvided: rx },
    ];
  }

  const rows = await Project.find(cond).sort(sortSpec(sort)).populate(POP);
  const requirementRows = rows.length
    ? await Requirement.find({ project: { $in: rows.map((row) => row._id) } })
      .select('project updatedAt')
      .lean()
    : [];
  const requirementMap = new Map(
    requirementRows.map((requirement) => [String(requirement.project), requirement.updatedAt])
  );
  const projects = await Promise.all(rows.map(async (row) => {
    const project = await presentProject(row);
    const requirementsUpdatedAt = requirementMap.get(String(row._id)) || null;
    return {
      ...project,
      hasRequirements: Boolean(requirementsUpdatedAt),
      requirementsUpdatedAt,
    };
  }));
  res.json({ projects, total: projects.length });
}

/** GET /api/public/projects?industry=&classification=&q= */
export async function listPublicProjects(req, res) {
  const { q = '', industry, classification, websiteType } = req.query;

  const cond = { published: true };
  if (industry) cond.industry = industry;
  if (classification) cond.projectClassification = classification;
  if (websiteType) cond.websiteType = websiteType;
  if (q) {
    const rx = { $regex: escapeRegex(cleanText(q, 120)), $options: 'i' };
    cond.$or = [
      { title: rx },
      { summary: rx },
      { shortDescription: rx },
      { fullDescription: rx },
      { industry: rx },
      { websiteType: rx },
      { platform: rx },
      { technologies: rx },
      { servicesProvided: rx },
    ];
  }

  const projects = await Project.find(cond)
    .select(PUBLIC_SELECT)
    .sort({ featured: -1, displayOrder: 1, completionDate: -1, createdAt: -1 })
    .lean();

  res.json({ projects: await Promise.all(projects.map(presentProject)) });
}

/** GET /api/public/projects/:slug */
export async function getPublicProject(req, res) {
  const { slug } = req.params;
  const project = await Project.findOne({ slug, published: true }).select(PUBLIC_SELECT).lean();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json({ project: await presentProject(project) });
}

/** GET /api/projects/:projectId */
export async function getProject(req, res) {
  const { projectId } = req.params;
  const project = await Project.findById(projectId).populate(POP);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  if (!canReadProject(req.user, project)) return projectAccessError(res);
  res.json({ project: await presentProject(project) });
}

/** POST /api/projects  (admin) */
export async function createProject(req, res) {
  const {
    title,
    summary = '',
    status = 'draft',
    client = null,
    developer = null,
    ...rest
  } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ message: 'Title is required' });
  const validationError = portfolioValidationError({ ...rest, projectId: rest._id });
  if (validationError) return res.status(400).json({ message: validationError });

  const portfolioPatch = {};
  for (const key of PORTFOLIO_FIELDS) {
    if (key in rest) portfolioPatch[key] = rest[key];
  }

  const created = await Project.create({
    title: title.trim(),
    summary: summary.trim?.() || '',
    status,
    client: client || null,
    developer: developer || null,
    ...portfolioPatch,
  });

  const project = await Project.findById(created._id).populate(POP);
  await emitPortalEvent({
    type: 'project_created', category: 'projects', title: `Project created - ${project.title}`,
    message: 'A new project workspace was created and assigned participants can now access it.',
    actor: req.user, project, relatedEntityType: 'Project', relatedEntityId: String(project._id),
    actionUrl: `/admin/projects/${project._id}`,
    actionUrlByRole: { client: `/client/projects/${project._id}`, developer: `/dev/projects/${project._id}` },
    targets: { admins: true, client: true, developer: true }, dedupeKey: `project-created:${project._id}`,
  });
  res.status(201).json({ project: await presentProject(project) });
}

/**
 * PATCH /api/projects/:projectId
 *
 * Admin: may patch title, summary, status, client, developer, evidence, announcements
 * Developer: may patch ONLY evidence (not announcements – use POST endpoints)
 */
export async function updateProject(req, res) {
  const { projectId } = req.params;

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ message: 'Project not found' });

  const isAdmin = req.user?.role === 'admin';
  const isAssignedDev = req.user?.role === 'developer' && canWriteProject(req.user, project);

  if (!isAdmin && !isAssignedDev) {
    return projectAccessError(res);
  }

  const validationError = portfolioValidationError({ ...(req.body || {}), projectId });
  if (validationError) return res.status(400).json({ message: validationError });

  // Build patch based on role
  const adminAllowed = [
    'title',
    'summary',
    'status',
    'client',
    'developer',
    'evidence',
    'announcements',
    ...PORTFOLIO_FIELDS,
  ];
  const devAllowed   = ['evidence'];

  const allowedKeys = isAdmin ? adminAllowed : devAllowed;
  const patch = {};
  for (const k of allowedKeys) {
    if (k in req.body) patch[k] = req.body[k];
  }

  // If developer is attempting to change anything other than evidence, block
  if (!isAdmin) {
    const keys = Object.keys(req.body || {});
    const illegal = keys.filter((k) => !devAllowed.includes(k));
    if (illegal.length) {
      return projectAccessError(res);
    }
  }

  const previousCoverPath = project.coverImage?.path || '';
  const previousStatus = project.status;
  const previousClient = String(project.client || '');
  const previousDeveloper = String(project.developer || '');
  const updated = await Project.findByIdAndUpdate(projectId, patch, {
    new: true,
    runValidators: true,
  }).populate(POP);

  let cleanupPending = false;
  const nextCoverPath = updated?.coverImage?.path || '';
  if (previousCoverPath && nextCoverPath && previousCoverPath !== nextCoverPath) {
    try {
      await removePath(previousCoverPath);
    } catch {
      cleanupPending = true;
    }
  }

  const changed = [];
  if ('status' in patch && patch.status !== previousStatus) changed.push(`status changed to ${patch.status}`);
  if ('client' in patch && String(patch.client || '') !== previousClient) changed.push('client assignment changed');
  if ('developer' in patch && String(patch.developer || '') !== previousDeveloper) changed.push('developer assignment changed');
  if (changed.length) {
    await emitPortalEvent({
      type: changed.some((item) => item.includes('assignment')) ? 'project_assignment_changed' : 'project_status_changed',
      category: 'projects', title: `Project updated - ${updated.title}`,
      message: changed.join('; '), actor: req.user, project: updated,
      relatedEntityType: 'Project', relatedEntityId: projectId,
      actionUrl: `/admin/projects/${projectId}`,
      actionUrlByRole: { client: `/client/projects/${projectId}`, developer: `/dev/projects/${projectId}` },
      targets: { admins: true, client: true, developer: true },
      dedupeKey: `project-update:${projectId}:${String(updated.updatedAt || Date.now())}`,
    });
  }

  res.json({ project: await presentProject(updated), cleanupPending });
}

/** DELETE /api/projects/:projectId/cover (admin) */
export async function deleteProjectCover(req, res) {
  const { projectId } = req.params;
  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const storagePath = project.coverImage?.path || '';
  if (storagePath) {
    if (!pathBelongsToProjectPurpose(storagePath, projectId, 'cover')) {
      return res.status(409).json({ message: 'Stored cover path is outside this project' });
    }
    await removePath(storagePath);
  }
  project.coverImage = undefined;
  project.thumbnail = '';
  await project.save();
  res.json({ ok: true, project: await presentProject(project) });
}

/** DELETE /api/projects/:projectId (admin)
 * Kept for backward compatibility, but archives instead of hard-deleting.
 */
export async function deleteProject(req, res) {
  const { projectId } = req.params;
  const doc = await Project.findByIdAndUpdate(
    projectId,
    { status: 'archived', published: false, featured: false },
    { new: true, runValidators: true }
  ).populate(POP);
  if (!doc) return res.status(404).json({ message: 'Project not found' });
  res.json({ ok: true, archived: true, project: doc });
}

export const removeProject = deleteProject;

export async function archiveProject(req, res) {
  const { projectId } = req.params;
  const project = await Project.findByIdAndUpdate(
    projectId,
    { status: 'archived', published: false, featured: false },
    { new: true, runValidators: true }
  ).populate(POP);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json({ ok: true, project });
}

export async function publishProject(req, res) {
  const { projectId } = req.params;
  const published = parseBool(req.body?.published);
  const project = await Project.findByIdAndUpdate(
    projectId,
    { published: published !== undefined ? published : true },
    { new: true, runValidators: true }
  ).populate(POP);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json({ ok: true, project });
}

export async function featureProject(req, res) {
  const { projectId } = req.params;
  const featured = parseBool(req.body?.featured);
  const project = await Project.findByIdAndUpdate(
    projectId,
    { featured: featured !== undefined ? featured : true },
    { new: true, runValidators: true }
  ).populate(POP);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json({ ok: true, project });
}

// ─────────────────────────────────────────────────────────────
// Evidence – explicit endpoint to add one entry (Admin/Dev)
// POST /api/projects/:projectId/evidence  body: { title, links[], images[] }
// ─────────────────────────────────────────────────────────────
export async function addEvidence(req, res) {
  const { projectId } = req.params;
  const me = req.user;

  if (!['admin', 'developer'].includes(me.role)) {
    return projectAccessError(res);
  }

  const { title = 'Update', links = [], images = [] } = req.body || {};
  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  if (!canWriteProject(me, project)) return projectAccessError(res);

  const cleanImages = Array.isArray(images) ? images.slice(0, 20) : [];
  if (cleanImages.some((image) => !image?.path || !pathBelongsToProjectPurpose(image.path, projectId, 'evidence'))) {
    return res.status(400).json({ message: 'Evidence files must belong to this project' });
  }
  const cleanLinks = Array.isArray(links)
    ? links.slice(0, 20).map(cleanPublicUrl).filter(Boolean)
    : [];

  project.evidence.unshift({
    title: String(title || 'Update'),
    links: cleanLinks,
    images: cleanImages,
    ts: Date.now(),
    author: me._id,
    authorName: cleanText(me.name || '', 120),
    authorRole: cleanText(me.role || '', 40),
  });

  await project.save();
  const populated = await Project.findById(projectId).populate(POP);
  await emitPortalEvent({
    type: 'evidence_uploaded', category: 'evidence', title: `Evidence uploaded - ${project.title}`,
    message: `${cleanText(title, 160) || 'Project evidence'} was added to the delivery record.`,
    actor: me, project, relatedEntityType: 'ProjectEvidence', relatedEntityId: `${projectId}:${project.evidence[0]?.ts || Date.now()}`,
    actionUrl: `/admin/projects/${projectId}`, actionUrlByRole: { client: `/client/projects/${projectId}`, developer: `/dev/projects/${projectId}` },
    targets: { admins: true, client: true, developer: true },
    dedupeKey: `evidence:${projectId}:${project.evidence[0]?.ts || Date.now()}`,
  });
  res.status(201).json({ ok: true, project: await presentProject(populated) });
}

// ─────────────────────────────────────────────────────────────
// Announcements – visible to all; create by Admin/Dev
// ─────────────────────────────────────────────────────────────
/** GET /api/projects/:projectId/announcements */
export async function listAnnouncements(req, res) {
  const { projectId } = req.params;
  const project = await Project.findById(projectId).select('announcements client developer').lean();
  if (!project) return res.status(404).json({ message: 'Project not found' });
  if (!canReadProject(req.user, project)) return projectAccessError(res);
  const items = [...(project.announcements || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  res.json({ ok: true, items });
}

/** POST /api/projects/:projectId/announcements  (admin/dev) */
export async function createAnnouncement(req, res) {
  const { projectId } = req.params;
  const me = req.user;

  if (!['admin', 'developer'].includes(me.role)) {
    return projectAccessError(res);
  }

  const { title = '', body = '' } = req.body || {};
  if (!title.trim()) return res.status(400).json({ message: 'Title is required' });

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  if (!canWriteProject(me, project)) return projectAccessError(res);

  const entry = {
    title: cleanText(title, 160),
    body: cleanText(body, 4000),
    ts: Date.now(),
    author: me._id,
    authorName: cleanText(me.name || '', 120),
    authorRole: cleanText(me.role || '', 40),
  };
  project.announcements.unshift(entry);
  await project.save();

  await emitPortalEvent({
    type: 'announcement_created', category: 'announcements', title: `New announcement - ${entry.title}`,
    message: entry.body || `A new announcement was posted for ${project.title}.`,
    actor: me, project, relatedEntityType: 'ProjectAnnouncement', relatedEntityId: `${projectId}:${entry.ts}`,
    actionUrl: `/admin/projects/${projectId}`, actionUrlByRole: { client: `/client/projects/${projectId}`, developer: `/dev/projects/${projectId}` },
    targets: { admins: true, client: true, developer: true }, dedupeKey: `announcement:${projectId}:${entry.ts}`,
  });

  const populated = await Project.findById(projectId).populate(POP);
  res.status(201).json({ ok: true, announcement: entry, project: populated });
}

/** DELETE /api/projects/:projectId/announcements/:idx  (admin) */
export async function deleteAnnouncement(req, res) {
  const { projectId, idx } = req.params;
  const me = req.user;

  if (me.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

  const project = await Project.findById(projectId);
  if (!project) return res.status(404).json({ message: 'Project not found' });

  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= project.announcements.length) {
    return res.status(400).json({ message: 'Invalid index' });
  }
  project.announcements.splice(i, 1);
  await project.save();

  const populated = await Project.findById(projectId).populate(POP);
  res.json({ ok: true, project: populated });
}
