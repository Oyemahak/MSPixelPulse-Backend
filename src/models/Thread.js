import mongoose from "mongoose";
import { createProviderModel } from '../providers/providerModel.js';
const { Schema, Types } = mongoose;

const ThreadSchema = new Schema(
  {
    type: { type: String, enum: ["dm"], default: "dm" },
    // Do NOT also set { index: true } here if you’re adding schema.index(...) below.
    participants: [{ type: Types.ObjectId, ref: "User" }], // exactly two users
    participantKey: { type: String, trim: true, unique: true, sparse: true, index: true },
    lastMessageAt: { type: Date, default: null, index: true },
    lastMessagePreview: { type: String, trim: true, default: '' },
    lastMessageAuthor: { type: Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Single composite index; remove any duplicate definitions elsewhere.
ThreadSchema.index({ participants: 1 });

const Thread = mongoose.model("Thread", ThreadSchema);
export default createProviderModel(Thread, {
  modelName: 'Thread', tab: 'Threads', relations: { participants: 'User', lastMessageAuthor: 'User' }, unique: [['participantKey']],
  defaults: { type: 'dm', participants: [], lastMessageAt: null, lastMessagePreview: '', lastMessageAuthor: null },
});
