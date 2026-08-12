import mongoose from 'mongoose';
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

    author: { type: Types.ObjectId, ref: 'User', required: true, index: true },
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

export default mongoose.model('Message', MessageSchema);
