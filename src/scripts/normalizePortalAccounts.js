import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Invoice from '../models/Invoice.js';
import Project from '../models/Project.js';
import Requirement from '../models/Requirement.js';
import User from '../models/User.js';

const confirm = process.argv.includes('--confirm');

await connectDB();

try {
  const users = await User.find({}).select('_id role status accountStatus accessApplication').lean();
  const accountFixes = [];
  for (const user of users) {
    const patch = {};
    if (user.accountStatus !== user.status) patch.accountStatus = user.status;
    if (user.role === 'client' && user.status === 'active' && user.accessApplication?.status !== 'approved') {
      patch.accessApplication = {
        ...(user.accessApplication || {}),
        status: 'approved',
        requestedRole: 'client',
        decidedAt: user.accessApplication?.decidedAt || new Date(),
        decidedBy: user.accessApplication?.decidedBy || null,
      };
    }
    if (Object.keys(patch).length) accountFixes.push({ id: user._id, patch });
  }

  const projects = await Project.find({}).select('_id client').lean();
  const projectClients = new Map(projects.map((project) => [String(project._id), project.client || null]));
  const requirements = await Requirement.find({}).select('_id project client').lean();
  const invoices = await Invoice.find({}).select('_id project client').lean();
  const requirementFixes = requirements.filter((requirement) => (
    String(requirement.client || '') !== String(projectClients.get(String(requirement.project)) || '')
  ));
  const invoiceFixes = invoices.filter((invoice) => (
    String(invoice.client || '') !== String(projectClients.get(String(invoice.project)) || '')
  ));

  const summary = {
    confirm,
    accountFixes: accountFixes.length,
    requirementRelationshipFixes: requirementFixes.length,
    invoiceRelationshipFixes: invoiceFixes.length,
  };

  if (confirm) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const item of accountFixes) {
          await User.updateOne({ _id: item.id }, { $set: item.patch }, { session });
        }
        for (const requirement of requirementFixes) {
          await Requirement.updateOne(
            { _id: requirement._id },
            { $set: { client: projectClients.get(String(requirement.project)) || null } },
            { session }
          );
        }
        for (const invoice of invoiceFixes) {
          await Invoice.updateOne(
            { _id: invoice._id },
            { $set: { client: projectClients.get(String(invoice.project)) || null } },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }
  }

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await mongoose.disconnect();
}
