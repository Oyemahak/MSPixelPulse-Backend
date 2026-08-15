import mongoose from 'mongoose';
import { createProviderModel } from '../providers/providerModel.js';

const taskSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['todo', 'in-progress', 'done'], default: 'todo' },
    notes: String
  },
  { timestamps: true }
);

const Task = mongoose.model('Task', taskSchema);
export default createProviderModel(Task, {
  modelName: 'Task', tab: 'Tasks', relations: { project: 'Project', assignee: 'User' }, defaults: { status: 'todo' },
});
