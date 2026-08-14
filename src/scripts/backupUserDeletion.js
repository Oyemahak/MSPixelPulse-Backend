import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import BlogReaction from '../models/BlogReaction.js';
import File from '../models/File.js';
import Invoice from '../models/Invoice.js';
import Message from '../models/Message.js';
import Project from '../models/Project.js';
import Requirement from '../models/Requirement.js';
import SupportTicket from '../models/SupportTicket.js';
import Task from '../models/Task.js';
import Thread from '../models/Thread.js';
import User from '../models/User.js';

const emailArg = process.argv.find((value) => value.startsWith('--email='));
const email = String(emailArg?.slice('--email='.length) || '').trim().toLowerCase();
if (!email) throw new Error('--email is required');

await connectDB();

try {
  const matches = await User.find({ email }).select('+password +authVersion').lean();
  if (matches.length !== 1) throw new Error(`Expected exactly one user, found ${matches.length}`);
  const user = matches[0];
  const userId = user._id;
  const projects = await Project.find({ $or: [{ client: userId }, { developer: userId }] }).lean();
  const projectIds = projects.map((project) => project._id);
  const threads = await Thread.find({ participants: userId }).lean();
  const threadIds = threads.map((thread) => thread._id);

  const backup = {
    createdAt: new Date().toISOString(),
    email,
    user,
    projects,
    requirements: await Requirement.find({ $or: [{ client: userId }, { project: { $in: projectIds } }] }).lean(),
    invoices: await Invoice.find({ $or: [{ client: userId }, { uploadedBy: userId }, { project: { $in: projectIds } }] }).lean(),
    messages: await Message.find({ $or: [{ author: userId }, { readBy: userId }, { thread: { $in: threadIds } }] }).select('+authorEmailAtSend').lean(),
    threads,
    tasks: await Task.find({ assignee: userId }).lean(),
    files: await File.find({ uploader: userId }).lean(),
    reactions: await BlogReaction.find({ user: userId }).select('+identityHash').lean(),
    supportTickets: await SupportTicket.find({ $or: [{ requester: userId }, { 'replies.author': userId }] }).select('+requesterEmail').lean(),
    decisions: await User.find({ 'accessApplication.decidedBy': userId }).select('_id accessApplication').lean(),
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = `/private/tmp/mspixelpulse-user-deletion-backup-${stamp}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({
    ok: true,
    outputPath,
    counts: Object.fromEntries(
      Object.entries(backup)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, value.length])
    ),
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
