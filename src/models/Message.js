import mongoose from 'mongoose';
import { createProviderModel } from '../providers/providerModel.js';
const { Schema, Types } = mongoose;

const Attachment = new Schema(
  {
    name: String,
    url: String,
    mime: String,
    type: String,
    size: Number,
    path: String,
  },
  { _id: false }
);

const MessageSchema = new Schema(
  {
    kind: { type: String, enum: ['dm', 'room'], required: true, index: true },

    // DM
    thread: { type: Types.ObjectId, ref: 'Thread', index: true },

    // Room
    room: { type: Types.ObjectId, ref: 'Room', index: true },
    project: { type: Types.ObjectId, ref: 'Project', index: true },

    author: { type: Types.ObjectId, ref: 'User', default: null, index: true },
    authorNameAtSend: { type: String, trim: true, default: '' },
    authorEmailAtSend: { type: String, trim: true, lowercase: true, default: '', select: false },
    authorDeleted: { type: Boolean, default: false },
    authorRoleAtSend: { type: String, enum: ['admin', 'developer', 'client'], required: true },

    text: { type: String, default: '' },
    attachments: [Attachment],
    readBy: [{ type: Types.ObjectId, ref: 'User' }],
    sentAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

MessageSchema.index({ kind: 1, thread: 1, sentAt: 1 });
MessageSchema.index({ kind: 1, project: 1, sentAt: 1 });
MessageSchema.index({ author: 1, readBy: 1, sentAt: -1 });

const Message = mongoose.model('Message', MessageSchema);
export default createProviderModel(Message, {
  modelName: 'Message', tab: 'Messages',
  relations: { author: 'User', project: 'Project', room: 'Room', thread: 'Thread', readBy: 'User' },
  defaults: { text: '', attachments: [], readBy: [], authorDeleted: false, sentAt: () => new Date().toISOString() },
});
