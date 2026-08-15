import mongoose from "mongoose";
import { createProviderModel } from '../providers/providerModel.js';

const NotificationLogSchema = new mongoose.Schema(
  {
    notificationType: { type: String, required: true, index: true },
    relatedEntityType: { type: String, required: true },
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    recipients: [{ type: String, required: true }],
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "pending",
      index: true,
    },
    attemptCount: { type: Number, default: 0 },
    lastError: { type: String, default: "" },
    sentAt: { type: Date, default: null },
    dedupeKey: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

NotificationLogSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
NotificationLogSchema.index({ createdAt: -1 });

const NotificationLog = mongoose.model("NotificationLog", NotificationLogSchema);
export default createProviderModel(NotificationLog, {
  modelName: 'NotificationLog', tab: 'Notifications', unique: [['dedupeKey']],
  defaults: { recipients: [], status: 'pending', attemptCount: 0, lastError: '', metadata: {} },
});
