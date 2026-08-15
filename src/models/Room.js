import mongoose from 'mongoose';
import { createProviderModel } from '../providers/providerModel.js';
const { Schema, Types } = mongoose;

const RoomSchema = new Schema(
  {
    project: { type: Types.ObjectId, ref: 'Project', unique: true, index: true },
    lastMessageAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

const Room = mongoose.model('Room', RoomSchema);
export default createProviderModel(Room, {
  modelName: 'Room', tab: 'Rooms', relations: { project: 'Project' }, unique: [['project']],
  defaults: { lastMessageAt: null },
});
