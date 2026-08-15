import mongoose from "mongoose";
import { createProviderModel } from '../providers/providerModel.js';

const BlogReactionSchema = new mongoose.Schema(
  {
    blogSlug: { type: String, required: true, trim: true, index: true },
    blogTitle: { type: String, required: true, trim: true },
    blogUrl: { type: String, required: true, trim: true },
    reactionType: { type: String, enum: ["like", "dislike"], required: true },
    identityHash: { type: String, required: true, select: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

BlogReactionSchema.index({ blogSlug: 1, identityHash: 1 }, { unique: true });

const BlogReaction = mongoose.model("BlogReaction", BlogReactionSchema);
export default createProviderModel(BlogReaction, {
  modelName: 'BlogReaction', tab: 'BlogReactions', relations: { user: 'User' }, unique: [['blogSlug', 'identityHash']],
});
