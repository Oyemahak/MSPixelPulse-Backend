// backend/src/models/Project.js
import mongoose from 'mongoose';
import slugify from '../utils/slugify.js';
import { createProviderModel } from '../providers/providerModel.js';

// ─────────────────────────────────────────────────────────────
// Evidence (unchanged from your current shape)
// ─────────────────────────────────────────────────────────────
const EvidenceImageSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    type: { type: String, trim: true },
    size: { type: Number, min: 0 },
    path: { type: String, trim: true },
    url:  { type: String, trim: true, required: true },
  },
  { _id: false }
);

const EvidenceEntrySchema = new mongoose.Schema(
  {
    title:  { type: String, trim: true, default: '' },
    links:  [{ type: String, trim: true }],
    images: [EvidenceImageSchema],
    ts:     { type: Number, default: () => Date.now() },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who added it
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────
 // NEW: Announcements (persisted timeline; visible to all, created by Admin/Dev)
// ─────────────────────────────────────────────────────────────
const AnnouncementEntrySchema = new mongoose.Schema(
  {
    title:  { type: String, required: true, trim: true },
    body:   { type: String, default: '', trim: true },
    ts:     { type: Number, default: () => Date.now() },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who posted
  },
  { _id: false }
);

const ProjectImageSchema = new mongoose.Schema(
  {
    url: { type: String, trim: true },
    alt: { type: String, trim: true, default: '' },
    caption: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const StoredFileSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    type: { type: String, trim: true, default: '' },
    size: { type: Number, min: 0, default: 0 },
    path: { type: String, trim: true, required: true },
    url: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────
// Project
// ─────────────────────────────────────────────────────────────
const ProjectSchema = new mongoose.Schema(
  {
    title:     { type: String, required: true, trim: true },
    slug:      { type: String, unique: true, index: true },
    summary:   { type: String, default: '', trim: true },
    status:    { type: String, enum: ['draft', 'active', 'completed', 'archived'], default: 'draft', index: true },

    client:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    developer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Evidence timeline (Admin/Dev create)
    evidence:       { type: [EvidenceEntrySchema],      default: [] },

    // NEW: Announcements timeline (Admin/Dev create)
    announcements:  { type: [AnnouncementEntrySchema],  default: [] },

    // Public portfolio metadata. All fields are optional so existing portal
    // projects remain backwards-compatible.
    shortDescription: { type: String, default: '', trim: true },
    fullDescription: { type: String, default: '', trim: true },
    projectClassification: {
      type: String,
      enum: ['live', 'demo', 'technical', 'concept'],
      default: 'demo',
      index: true,
    },
    industry: { type: String, default: '', trim: true, index: true },
    websiteType: { type: String, default: '', trim: true, index: true },
    platform: { type: String, default: '', trim: true },
    technologies: [{ type: String, trim: true }],
    repositoryUrl: { type: String, default: '', trim: true },
    repositoryFullName: { type: String, default: '', trim: true, lowercase: true },
    repositoryId: { type: String, default: '', trim: true },
    repositoryUpdatedAt: { type: Date, default: null },
    sourceImportedAt: { type: Date, default: null },
    coverSource: { type: String, enum: ['', 'site-screenshot', 'repository-asset', 'branded-cover', 'fallback'], default: '' },
    categories: [{ type: String, trim: true }],
    liveUrl: { type: String, default: '', trim: true },
    thumbnail: { type: String, default: '', trim: true },
    coverImage: { type: StoredFileSchema, default: null },
    mockupImages: { type: [ProjectImageSchema], default: [] },
    galleryImages: { type: [ProjectImageSchema], default: [] },
    featured: { type: Boolean, default: false, index: true },
    published: { type: Boolean, default: false, index: true },
    displayOrder: { type: Number, default: 999, index: true },
    completionDate: { type: Date, default: null },
    clientName: { type: String, default: '', trim: true },
    projectOverview: { type: String, default: '', trim: true },
    challenge: { type: String, default: '', trim: true },
    solution: { type: String, default: '', trim: true },
    keyFeatures: [{ type: String, trim: true }],
    responsiveHighlights: [{ type: String, trim: true }],
    servicesProvided: [{ type: String, trim: true }],
    resultSummary: { type: String, default: '', trim: true },
    seoTitle: { type: String, default: '', trim: true },
    seoDescription: { type: String, default: '', trim: true },
    imageAltText: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

ProjectSchema.index(
  { repositoryFullName: 1 },
  { unique: true, partialFilterExpression: { repositoryFullName: { $type: 'string', $gt: '' } } }
);
ProjectSchema.index({ published: 1, featured: -1, displayOrder: 1, completionDate: -1 });
ProjectSchema.index({ client: 1, status: 1 });
ProjectSchema.index({ developer: 1, status: 1 });

// Produce a stable unique slug. If a seed/admin payload provides a slug, keep it.
ProjectSchema.pre('validate', async function (next) {
  if (this.slug && !this.isModified('slug')) return next();

  const base = slugify(this.slug || this.title || '').slice(0, 80) || `project-${Date.now()}`;
  let candidate = base;
  let n = 1;

  const exists = async (s) => {
    const q = { slug: s };
    if (this._id) q._id = { $ne: this._id };
    const c = await this.constructor.countDocuments(q);
    return c > 0;
  };

  while (await exists(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  this.slug = candidate;
  next();
});

const Project = mongoose.model('Project', ProjectSchema);
export default createProviderModel(Project, {
  modelName: 'Project',
  tab: 'Projects',
  relations: { client: 'User', developer: 'User' },
  unique: [['slug'], ['repositoryFullName']],
  defaults: {
    summary: '', status: 'draft', evidence: [], announcements: [], projectClassification: 'demo',
    technologies: [], categories: [], mockupImages: [], galleryImages: [], keyFeatures: [],
    responsiveHighlights: [], servicesProvided: [], featured: false, published: false, displayOrder: 999,
  },
});
