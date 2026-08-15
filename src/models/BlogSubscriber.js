import mongoose from "mongoose";
import { createProviderModel } from '../providers/providerModel.js';

const BlogSubscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "active", "unsubscribed"],
      default: "pending",
      index: true,
    },
    sourceBlogSlug: { type: String, required: true, trim: true },
    sourceBlogTitle: { type: String, required: true, trim: true },
    sourceBlogUrl: { type: String, required: true, trim: true },
    confirmationTokenHash: { type: String, default: null, select: false },
    confirmationExpiresAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    unsubscribeTokenHash: { type: String, required: true, select: false },
    unsubscribedAt: { type: Date, default: null },
    confirmationEmailStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "pending",
    },
    notificationEmailStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "pending",
    },
  },
  { timestamps: true },
);

BlogSubscriberSchema.index({ status: 1, createdAt: -1 });

const BlogSubscriber = mongoose.model("BlogSubscriber", BlogSubscriberSchema);
export default createProviderModel(BlogSubscriber, {
  modelName: 'BlogSubscriber', tab: 'BlogSubscribers', unique: [['email']],
  defaults: { status: 'pending', confirmationEmailStatus: 'pending', notificationEmailStatus: 'pending' },
});
