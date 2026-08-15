import mongoose from "mongoose";
import { createProviderModel } from '../providers/providerModel.js';

const BlogShareSchema = new mongoose.Schema(
  {
    blogSlug: { type: String, required: true, trim: true, index: true },
    blogTitle: { type: String, required: true, trim: true },
    blogUrl: { type: String, required: true, trim: true },
    platform: {
      type: String,
      enum: ["copy_link", "linkedin", "facebook", "whatsapp", "email", "native"],
      required: true,
    },
    eventType: {
      type: String,
      enum: ["share_option_selected", "native_share_completed"],
      required: true,
    },
    identityHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

BlogShareSchema.index({ blogSlug: 1, createdAt: -1 });

const BlogShare = mongoose.model("BlogShare", BlogShareSchema);
export default createProviderModel(BlogShare, { modelName: 'BlogShare', tab: 'BlogShares' });
