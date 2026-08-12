import mongoose from 'mongoose';

export const SITE_CONTENT_KINDS = ['service', 'pricing', 'proof'];

const SiteContentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: SITE_CONTENT_KINDS, required: true, index: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    published: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 999, index: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SiteContentSchema.index({ kind: 1, key: 1 }, { unique: true });
SiteContentSchema.index({ kind: 1, published: 1, displayOrder: 1 });

export default mongoose.model('SiteContent', SiteContentSchema);
