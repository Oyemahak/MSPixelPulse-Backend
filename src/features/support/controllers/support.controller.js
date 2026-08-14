import SupportTicket from '../../../models/SupportTicket.js';
import { cleanText } from '../../../lib/validation.js';

const CLIENT_STATUSES = new Set(['open', 'closed']);
const ADMIN_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);

function ownsTicket(user, ticket) {
  if (user?.role === 'admin') return true;
  return String(ticket?.requester?._id || ticket?.requester || '') === String(user?._id || '');
}

function forbidden(res) {
  return res.status(403).json({ message: "You don't have access to this support request." });
}

export async function listTickets(req, res) {
  const filter = req.user.role === 'admin' ? {} : { requester: req.user._id };
  const tickets = await SupportTicket.find(filter)
    .select('-requesterEmail')
    .populate('requester', 'name email role status')
    .sort({ lastActivityAt: -1 })
    .limit(200)
    .lean();
  res.json({ tickets });
}

export async function getTicket(req, res) {
  const ticket = await SupportTicket.findById(req.params.ticketId)
    .select('-requesterEmail')
    .populate('requester', 'name email role status')
    .lean();
  if (!ticket) return res.status(404).json({ message: 'Support request not found.' });
  if (!ownsTicket(req.user, ticket)) return forbidden(res);
  res.json({ ticket });
}

export async function createTicket(req, res) {
  const subject = cleanText(req.body?.subject, 180);
  const body = cleanText(req.body?.message || req.body?.body, 5000);
  if (!subject || !body) {
    return res.status(400).json({ message: 'A subject and message are required.' });
  }

  const ticket = await SupportTicket.create({
    requester: req.user._id,
    requesterName: req.user.name || '',
    requesterEmail: req.user.email || '',
    subject,
    status: 'open',
    lastActivityAt: new Date(),
    replies: [{
      author: req.user._id,
      authorNameAtSend: req.user.name || '',
      authorRoleAtSend: req.user.role,
      body,
      sentAt: new Date(),
    }],
  });
  res.status(201).json({ ticket });
}

export async function replyToTicket(req, res) {
  const ticket = await SupportTicket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ message: 'Support request not found.' });
  if (!ownsTicket(req.user, ticket)) return forbidden(res);

  const body = cleanText(req.body?.message || req.body?.body, 5000);
  if (!body) return res.status(400).json({ message: 'A reply is required.' });

  ticket.replies.push({
    author: req.user._id,
    authorNameAtSend: req.user.name || '',
    authorRoleAtSend: req.user.role,
    body,
    sentAt: new Date(),
  });
  ticket.lastActivityAt = new Date();
  if (req.user.role === 'client' && ticket.status !== 'open') ticket.status = 'open';
  if (req.user.role === 'admin' && ticket.status === 'open') ticket.status = 'in_progress';
  await ticket.save();
  res.json({ ticket });
}

export async function updateTicket(req, res) {
  const ticket = await SupportTicket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ message: 'Support request not found.' });
  if (!ownsTicket(req.user, ticket)) return forbidden(res);

  const status = cleanText(req.body?.status, 40);
  const allowed = req.user.role === 'admin' ? ADMIN_STATUSES : CLIENT_STATUSES;
  if (!allowed.has(status)) return res.status(400).json({ message: 'Invalid support status.' });

  ticket.status = status;
  ticket.lastActivityAt = new Date();
  await ticket.save();
  res.json({ ticket });
}
