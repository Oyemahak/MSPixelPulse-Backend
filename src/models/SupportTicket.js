import mongoose from 'mongoose';

const AttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    type: { type: String, trim: true, default: '' },
    size: { type: Number, min: 0, default: 0 },
    path: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const ReplySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    authorNameAtSend: { type: String, trim: true, default: '' },
    authorRoleAtSend: { type: String, enum: ['admin', 'developer', 'client'], required: true },
    body: { type: String, trim: true, required: true },
    attachments: { type: [AttachmentSchema], default: [] },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const SupportTicketSchema = new mongoose.Schema(
  {
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    requesterName: { type: String, trim: true, default: '' },
    requesterEmail: { type: String, trim: true, lowercase: true, default: '', select: false },
    subject: { type: String, trim: true, required: true },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
    replies: { type: [ReplySchema], default: [] },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

SupportTicketSchema.index({ requester: 1, lastActivityAt: -1 });

export default mongoose.model('SupportTicket', SupportTicketSchema);
