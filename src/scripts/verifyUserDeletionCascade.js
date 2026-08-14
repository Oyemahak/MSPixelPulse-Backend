import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import BlogReaction from '../models/BlogReaction.js';
import File from '../models/File.js';
import Invoice from '../models/Invoice.js';
import Message from '../models/Message.js';
import Project from '../models/Project.js';
import Requirement from '../models/Requirement.js';
import Room from '../models/Room.js';
import SupportTicket from '../models/SupportTicket.js';
import Task from '../models/Task.js';
import Thread from '../models/Thread.js';
import User from '../models/User.js';
import { deleteUserPermanently } from '../lib/deleteUserPermanently.js';

const marker = `codex-delete-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
await connectDB();

let user;
let peer;
let project;
let room;
let ticket;

try {
  user = await User.create({
    name: 'Cascade Test User',
    email: `${marker}@example.invalid`,
    password: crypto.randomBytes(18).toString('base64url'),
    role: 'client',
    status: 'active',
    accountStatus: 'active',
    accessApplication: { status: 'approved', requestedRole: 'client' },
  });
  peer = await User.create({
    name: 'Cascade Test Peer',
    email: `${marker}-peer@example.invalid`,
    password: crypto.randomBytes(18).toString('base64url'),
    role: 'developer',
    status: 'active',
    accountStatus: 'active',
  });
  project = await Project.create({ title: marker, client: user._id, developer: peer._id, status: 'active' });
  room = await Room.create({ project: project._id });
  await Requirement.create({ project: project._id, client: user._id, pages: [{ name: 'Home', note: marker }] });
  await Invoice.create({ project: project._id, client: user._id, uploadedBy: user._id, kind: 'other', title: marker });
  await Task.create({ project: project._id, title: marker, assignee: user._id });
  await File.create({ project: project._id, uploader: user._id, filename: `${marker}.txt` });
  await Message.create({
    kind: 'room',
    room: room._id,
    project: project._id,
    author: user._id,
    authorRoleAtSend: 'client',
    text: marker,
    readBy: [user._id, peer._id],
  });
  const thread = await Thread.create({
    participants: [user._id, peer._id],
    participantKey: [String(user._id), String(peer._id)].sort().join(':'),
  });
  await Message.create({
    kind: 'dm',
    thread: thread._id,
    author: user._id,
    authorRoleAtSend: 'client',
    text: marker,
  });
  await BlogReaction.create({
    blogSlug: marker,
    blogTitle: marker,
    blogUrl: `https://example.invalid/${marker}`,
    reactionType: 'like',
    identityHash: crypto.createHash('sha256').update(marker).digest('hex'),
    user: user._id,
  });
  ticket = await SupportTicket.create({
    requester: user._id,
    requesterName: user.name,
    requesterEmail: user.email,
    subject: marker,
    replies: [{ author: user._id, authorNameAtSend: user.name, authorRoleAtSend: 'client', body: marker }],
  });

  await deleteUserPermanently(user);

  const [savedProject, requirement, invoice, task, file, roomMessage, savedTicket] = await Promise.all([
    Project.findById(project._id).lean(),
    Requirement.findOne({ project: project._id }).lean(),
    Invoice.findOne({ project: project._id }).lean(),
    Task.findOne({ project: project._id }).lean(),
    File.findOne({ project: project._id }).lean(),
    Message.findOne({ kind: 'room', project: project._id }).select('+authorEmailAtSend').lean(),
    SupportTicket.findById(ticket._id).select('+requesterEmail').lean(),
  ]);

  assert.equal(await User.exists({ _id: user._id }), null);
  assert.equal(String(savedProject.developer), String(peer._id));
  assert.equal(savedProject.client, null);
  assert.equal(requirement.client, null);
  assert.equal(invoice.client, null);
  assert.equal(invoice.uploadedBy, null);
  assert.equal(task.assignee, null);
  assert.equal(file.uploader, null);
  assert.equal(file.uploaderName, 'Deleted user');
  assert.equal(roomMessage.author, null);
  assert.equal(roomMessage.authorDeleted, true);
  assert.equal(roomMessage.authorNameAtSend, 'Deleted user');
  assert.equal(roomMessage.authorEmailAtSend, '');
  assert.equal(roomMessage.readBy.map(String).includes(String(user._id)), false);
  assert.equal(await Thread.exists({ participants: user._id }), null);
  assert.equal(await Message.exists({ kind: 'dm', text: marker }), null);
  assert.equal(savedTicket.requester, null);
  assert.equal(savedTicket.requesterName, 'Deleted user');
  assert.equal(savedTicket.requesterEmail, '');
  assert.equal(savedTicket.replies[0].author, null);
  assert.equal(savedTicket.replies[0].authorNameAtSend, 'Deleted user');

  console.log(JSON.stringify({ ok: true, cascadeVerified: true }));
} finally {
  const projectId = project?._id;
  if (projectId) {
    await Promise.all([
      Message.deleteMany({ project: projectId }),
      Requirement.deleteMany({ project: projectId }),
      Invoice.deleteMany({ project: projectId }),
      Task.deleteMany({ project: projectId }),
      File.deleteMany({ project: projectId }),
      Room.deleteMany({ project: projectId }),
      Project.deleteMany({ _id: projectId }),
    ]);
  }
  if (ticket?._id) await SupportTicket.deleteMany({ _id: ticket._id });
  await BlogReaction.deleteMany({ blogSlug: marker });
  await Thread.deleteMany({ participantKey: { $regex: marker } });
  await Message.deleteMany({ text: marker });
  if (user?._id) await User.deleteMany({ _id: user._id });
  if (peer?._id) await User.deleteMany({ _id: peer._id });
  await mongoose.disconnect();
}
