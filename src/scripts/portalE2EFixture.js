import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
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

const action = process.argv.includes('--cleanup') ? 'cleanup' : 'create';
const marker = String(process.env.PORTAL_E2E_MARKER || '').trim().toLowerCase();
const password = String(process.env.PORTAL_E2E_PASSWORD || '');
if (!/^[a-z0-9-]{8,50}$/.test(marker)) throw new Error('PORTAL_E2E_MARKER is required');
if (action === 'create' && (password.length < 12 || password.length > 72)) {
  throw new Error('PORTAL_E2E_PASSWORD must be 12-72 characters');
}

const emails = {
  admin: `${marker}-admin@example.invalid`,
  clientA: `${marker}-client-a@example.invalid`,
  clientB: `${marker}-client-b@example.invalid`,
};

await connectDB();

try {
  if (action === 'cleanup') {
    const users = await User.find({ email: { $in: Object.values(emails) } }).select('_id').lean();
    const userIds = users.map((user) => user._id);
    const projects = await Project.find({ title: { $regex: `^${marker}:` } }).select('_id').lean();
    const projectIds = projects.map((project) => project._id);
    const rooms = await Room.find({ project: { $in: projectIds } }).select('_id').lean();
    const roomIds = rooms.map((room) => room._id);
    const threads = await Thread.find({ participants: { $in: userIds } }).select('_id').lean();
    const threadIds = threads.map((thread) => thread._id);

    await Message.deleteMany({
      $or: [
        { project: { $in: projectIds } },
        { room: { $in: roomIds } },
        { thread: { $in: threadIds } },
        { author: { $in: userIds } },
      ],
    });
    await Thread.deleteMany({ _id: { $in: threadIds } });
    await Requirement.deleteMany({ project: { $in: projectIds } });
    await Invoice.deleteMany({ project: { $in: projectIds } });
    await Task.deleteMany({ project: { $in: projectIds } });
    await File.deleteMany({ project: { $in: projectIds } });
    await Room.deleteMany({ project: { $in: projectIds } });
    await Project.deleteMany({ _id: { $in: projectIds } });
    await SupportTicket.deleteMany({
      $or: [
        { requester: { $in: userIds } },
        { subject: { $regex: `^${marker}` } },
      ],
    });
    await User.deleteMany({ _id: { $in: userIds } });
    console.log(JSON.stringify({ ok: true, action, users: userIds.length, projects: projectIds.length }));
  } else {
    const exists = await User.countDocuments({ email: { $in: Object.values(emails) } });
    if (exists) throw new Error('E2E fixture already exists');
    const [admin, clientA, clientB] = await User.create([
      {
        name: 'Portal E2E Admin',
        email: emails.admin,
        password,
        role: 'admin',
        status: 'active',
        accountStatus: 'active',
      },
      {
        name: 'Portal E2E Client A',
        email: emails.clientA,
        password,
        role: 'client',
        status: 'active',
        accountStatus: 'active',
        accessApplication: { status: 'approved', requestedRole: 'client' },
      },
      {
        name: 'Portal E2E Client B',
        email: emails.clientB,
        password,
        role: 'client',
        status: 'active',
        accountStatus: 'active',
        accessApplication: { status: 'approved', requestedRole: 'client' },
      },
    ]);
    const [projectA, projectB] = await Project.create([
      { title: `${marker}: Client A Project`, summary: 'Portal persistence fixture A', client: clientA._id, status: 'active' },
      { title: `${marker}: Client B Project`, summary: 'Portal authorization fixture B', client: clientB._id, status: 'active' },
    ]);
    await Invoice.create({
      project: projectA._id,
      client: clientA._id,
      uploadedBy: admin._id,
      kind: 'advance',
      status: 'sent',
      invoiceNumber: `${marker}-INV-1`,
      title: 'Portal test invoice',
      total: 100,
      currency: 'CAD',
      isDemo: true,
    });
    console.log(JSON.stringify({
      ok: true,
      action,
      emails,
      ids: {
        admin: String(admin._id),
        clientA: String(clientA._id),
        clientB: String(clientB._id),
        projectA: String(projectA._id),
        projectB: String(projectB._id),
      },
    }, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
