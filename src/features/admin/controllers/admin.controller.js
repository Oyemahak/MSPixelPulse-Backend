// src/features/admin/controllers/admin.controller.js
import User from '../../../models/User.js';
import Project from '../../../models/Project.js';
import Invoice from '../../../models/Invoice.js';
import Message from '../../../models/Message.js';
import Thread from '../../../models/Thread.js';
import Lead from '../../../models/Lead.js';
import { cleanText, isValidEmail } from '../../../lib/validation.js';

const ADMIN_ONLY_FIELDS = ['isSuperAdmin', 'isProtected', 'accountStatus', 'protectedReason'];
const PROTECTED_MUTATION_FIELDS = ['role', 'status', 'email', 'password', ...ADMIN_ONLY_FIELDS];
const VALID_ROLES = ['admin', 'developer', 'client'];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isProtectedAccount(user) {
  return Boolean(user?.isSuperAdmin || user?.isProtected);
}

function hasForbiddenField(body, fields) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(body || {}, field));
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'completed', 'spam', 'archived'];

export async function listLeads(req, res) {
  const cond = {};
  const status = cleanText(req.query.status, 40);
  const query = cleanText(req.query.q, 120);
  if (status && LEAD_STATUSES.includes(status)) cond.status = status;
  if (query) {
    const rx = { $regex: escapeRegex(query), $options: 'i' };
    cond.$or = [{ name: rx }, { email: rx }, { businessName: rx }, { service: rx }, { message: rx }];
  }
  const leads = await Lead.find(cond).sort({ createdAt: -1 }).limit(250);
  res.json({ leads, total: leads.length });
}

export async function updateLead(req, res) {
  const status = cleanText(req.body?.status, 40);
  if (!LEAD_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid lead status' });
  const lead = await Lead.findByIdAndUpdate(
    req.params.leadId,
    { status },
    { new: true, runValidators: true }
  );
  if (!lead) return res.status(404).json({ message: 'Lead not found' });
  res.json({ lead });
}

export async function archiveLead(req, res) {
  const lead = await Lead.findByIdAndUpdate(
    req.params.leadId,
    { status: 'archived' },
    { new: true, runValidators: true }
  );
  if (!lead) return res.status(404).json({ message: 'Lead not found' });
  res.json({ ok: true, archived: true, lead });
}

/** GET /admin/users?status=&q= */
export async function listUsers(req, res) {
  const q = cleanText(req.query.q, 120);
  const status = cleanText(req.query.status, 40);
  const cond = {};
  if (status && ['pending', 'active', 'suspended'].includes(status)) cond.status = status;
  if (q) cond.$or = [
    { name:   { $regex: escapeRegex(q), $options: 'i' } },
    { email:  { $regex: escapeRegex(q), $options: 'i' } },
  ];
  const users = await User.find(cond).sort({ createdAt: -1 }).select('-password');
  res.json({ users });
}

export async function listPending(_req, res) {
  const users = await User.find({ status: 'pending' }).select('-password').sort({ createdAt: -1 });
  res.json({ users });
}

export async function getUser(req, res) {
  const user = await User.findById(req.params.userId).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
}

export async function createUser(req, res) {
  if (hasForbiddenField(req.body, ADMIN_ONLY_FIELDS)) {
    return res.status(403).json({ message: 'Protected account fields cannot be set from the admin UI' });
  }

  const { email, password, role = 'client', status = 'active' } = req.body || {};
  const name = cleanText(req.body?.name, 120);
  const normalizedEmail = normalizeEmail(email);
  if (!name || !isValidEmail(normalizedEmail) || typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({ message: 'Name, a valid email, and an 8-72 character password are required' });
  }
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' });
  if (!['pending', 'active', 'suspended'].includes(status)) return res.status(400).json({ message: 'Invalid status' });

  const u = await User.create({
    name,
    email: normalizedEmail,
    password,
    role,
    status,
    accountStatus: status,
  });
  const user = await User.findById(u._id).select('-password');
  res.status(201).json({ user });
}

export async function updateUser(req, res) {
  const { userId } = req.params;
  const allowed = [
    'name',
    'role',
    'status',
    'email',
    'password',
    'phone',
    'companyName',
    'businessName',
    'businessWebsite',
    'industry',
    'jobTitle',
    'timezone',
    'preferredContactMethod',
    'bio',
    'specialties',
    'technologies',
    'availability',
    'projectContactPreference',
    'notificationPreferences',
    'avatarUrl',
    'avatarPath',
  ];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

  const user = await User.findById(userId).select('+password');
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (hasForbiddenField(req.body, ADMIN_ONLY_FIELDS)) {
    return res.status(403).json({ message: 'Protected account fields cannot be changed from the admin UI' });
  }

  if ('name' in patch) patch.name = cleanText(patch.name, 120);
  if (patch.email) {
    patch.email = normalizeEmail(patch.email);
    if (!isValidEmail(patch.email)) return res.status(400).json({ message: 'A valid email is required' });
  }
  if ('password' in patch && (typeof patch.password !== 'string' || patch.password.length < 8 || patch.password.length > 72)) {
    return res.status(400).json({ message: 'Password must be 8-72 characters' });
  }
  if (patch.role && !VALID_ROLES.includes(patch.role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  if (patch.status && !['pending', 'active', 'suspended'].includes(patch.status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  if (isProtectedAccount(user)) {
    const attemptsProtectedMutation = hasForbiddenField(patch, PROTECTED_MUTATION_FIELDS);
    if (attemptsProtectedMutation) {
      return res.status(403).json({ message: 'Protected super admin account cannot be demoted, disabled, deleted, or credential-modified here' });
    }
  }

  if (patch.status) patch.accountStatus = patch.status;
  Object.assign(user, patch);
  await user.save();

  const safe = await User.findById(userId).select('-password');
  res.json({ user: safe });
}

export async function deleteUser(req, res) {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (isProtectedAccount(user)) {
    return res.status(403).json({ message: 'Protected super admin account cannot be deleted' });
  }
  const [projectCount, invoiceCount, messageCount, threadCount] = await Promise.all([
    Project.countDocuments({ $or: [{ client: userId }, { developer: userId }] }),
    Invoice.countDocuments({ $or: [{ client: userId }, { uploadedBy: userId }] }),
    Message.countDocuments({ author: userId }),
    Thread.countDocuments({ participants: userId }),
  ]);
  if (projectCount || invoiceCount || messageCount || threadCount) {
    return res.status(409).json({
      message: 'This account has related workspace history. Suspend it instead of deleting it.',
    });
  }
  await user.deleteOne();
  res.json({ ok: true });
}

export async function approveUser(req, res) {
  const { userId } = req.params;
  const user = await User.findById(userId).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.status = 'active';
  user.accountStatus = 'active';
  user.accessApplication = {
    ...(user.accessApplication?.toObject?.() || user.accessApplication || {}),
    status: 'approved',
    requestedRole: 'client',
    decidedAt: new Date(),
    decidedBy: req.user._id,
  };
  await user.save();
  res.json({ user });
}

// Reject semantics: retain an auditable applicant decision.
export async function rejectUser(req, res) {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (isProtectedAccount(user)) {
    return res.status(403).json({ message: 'Protected super admin account cannot be rejected' });
  }
  if (user.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending users can be rejected' });
  }
  user.status = 'suspended';
  user.accountStatus = 'suspended';
  user.accessApplication = {
    ...(user.accessApplication?.toObject?.() || user.accessApplication || {}),
    status: 'declined',
    requestedRole: 'client',
    decidedAt: new Date(),
    decidedBy: req.user._id,
  };
  await user.save();
  const safe = await User.findById(userId).select('-password');
  res.json({ ok: true, user: safe });
}

export async function updateRole(req, res) {
  const { userId } = req.params;
  const { role } = req.body;
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' });

  const user = await User.findById(userId).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (isProtectedAccount(user)) {
    return res.status(403).json({ message: 'Protected super admin account cannot be demoted' });
  }
  user.role = role;
  await user.save();
  res.json({ user });
}
