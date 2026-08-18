import mongoose from 'mongoose';
import { createProviderModel } from '../providers/providerModel.js';

export const PUBLIC_SITE_CONTENT_KINDS = ['service', 'pricing', 'proof'];
export const SITE_CONTENT_KINDS = [...PUBLIC_SITE_CONTENT_KINDS, 'invoice-settings'];

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

const SiteContent = mongoose.model('SiteContent', SiteContentSchema);
export default createProviderModel(SiteContent, {
  modelName: 'SiteContent', tab: 'SiteContent', unique: [['kind', 'key']],
  defaults: { payload: {}, published: true, displayOrder: 999, archivedAt: null },
});
