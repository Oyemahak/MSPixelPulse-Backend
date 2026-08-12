import 'dotenv/config';
import connectDB from '../config/db.js';
import Project from '../models/Project.js';
import { portfolioProjects } from '../data/portfolioProjects.js';

const FORCE = process.env.PORTFOLIO_FORCE === 'true';
const EXCLUDED_REPOSITORIES = new Set([
  'mspixelpulseagency/mahak-job-agent',
  'mspixelpulseagency/applypulse-ai',
]);

const mutableFields = [
  'slug',
  'title',
  'summary',
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
  'status',
  'seoTitle',
  'seoDescription',
  'imageAltText',
];

function isUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function validate(project) {
  const errors = [];
  if (!project.slug) errors.push('missing slug');
  if (!project.title) errors.push('missing title');
  for (const key of ['liveUrl', 'repositoryUrl', 'thumbnail']) {
    if (!isUrl(project[key])) errors.push(`invalid ${key}`);
  }
  if (project.published && !project.liveUrl && !project.repositoryUrl) {
    errors.push('published project requires a live or repository URL');
  }
  if (project.repositoryFullName && EXCLUDED_REPOSITORIES.has(project.repositoryFullName.toLowerCase())) {
    errors.push('repository is excluded by policy');
  }
  return errors;
}

function buildPatch(existing, project) {
  const patch = {};
  for (const key of mutableFields) {
    if (!(key in project)) continue;
    const incoming = project[key];
    const current = existing?.[key];
    const emptyCurrent =
      current === undefined ||
      current === null ||
      current === '' ||
      (Array.isArray(current) && current.length === 0);
    const incomingHasValue =
      incoming !== undefined &&
      incoming !== null &&
      incoming !== '' &&
      (!Array.isArray(incoming) || incoming.length > 0);

    if (FORCE || (emptyCurrent && incomingHasValue) || (key === 'slug' && current !== incoming)) {
      patch[key] = incoming;
    }
  }
  return patch;
}

async function run() {
  await connectDB();
  await Project.createIndexes();

  const report = {
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    items: [],
  };

  for (const project of portfolioProjects) {
    const errors = validate(project);
    if (errors.length) {
      report.failed += 1;
      report.items.push({ slug: project.slug || project.title, status: 'failed', errors });
      continue;
    }

    try {
      const existing = await Project.findOne({
        $or: [
          ...(project.repositoryFullName ? [{ repositoryFullName: project.repositoryFullName.toLowerCase() }] : []),
          { slug: project.slug },
          { title: project.title },
        ],
      });
      if (!existing) {
        await Project.create(project);
        report.imported += 1;
        report.items.push({ slug: project.slug, status: 'imported', published: project.published });
        continue;
      }

      const patch = buildPatch(existing.toObject(), project);
      if (!Object.keys(patch).length) {
        report.skipped += 1;
        report.items.push({ slug: project.slug, status: 'skipped' });
        continue;
      }

      await Project.updateOne({ _id: existing._id }, { $set: patch }, { runValidators: true });
      report.updated += 1;
      report.items.push({ slug: project.slug, status: 'updated', fields: Object.keys(patch) });
    } catch (error) {
      report.failed += 1;
      report.items.push({
        slug: project.slug,
        status: 'failed',
        errors: [error.message || 'unknown error'],
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await Project.db.close();
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
