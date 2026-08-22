import mongoose from 'mongoose';
import { createProviderModel } from '../providers/providerModel.js';

const PortalNotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipientRole: { type: String, enum: ['admin', 'developer', 'client'], required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: ['', 'admin', 'developer', 'client', 'system'], default: '' },
    type: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    relatedEntityType: { type: String, trim: true, default: '' },
    relatedEntityId: { type: String, trim: true, default: '' },
    actionUrl: { type: String, trim: true, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null, index: true },
    emailStatus: { type: String, enum: ['', 'pending', 'sent', 'failed', 'skipped'], default: '' },
    dedupeKey: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

PortalNotificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
PortalNotificationSchema.index({ recipient: 1, createdAt: -1 });
PortalNotificationSchema.index({ project: 1, createdAt: -1 });
PortalNotificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

const PortalNotification = mongoose.model('PortalNotification', PortalNotificationSchema);

export default createProviderModel(PortalNotification, {
  modelName: 'PortalNotification',
  tab: 'PortalNotifications',
  relations: { recipient: 'User', actor: 'User', project: 'Project' },
  unique: [['dedupeKey']],
  defaults: { actorRole: '', relatedEntityType: '', relatedEntityId: '', actionUrl: '', metadata: {}, readAt: null, emailStatus: '', dedupeKey: '' },
});
