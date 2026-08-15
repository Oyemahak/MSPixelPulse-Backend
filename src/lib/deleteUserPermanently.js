import mongoose from 'mongoose';
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
import { removePaths } from './supabase.js';
import { dataProviderName } from '../config/providers.js';
import { GOOGLE_SHEET_TABS, GoogleSheetsRepository } from '../google/sheets.js';

function attachmentPaths(messages = []) {
  return messages
    .flatMap((message) => message.attachments || [])
    .map((attachment) => attachment.path)
    .filter(Boolean);
}

export async function deleteUserPermanently(user) {
  if (dataProviderName() === 'google') return deleteGoogleUserPermanently(user);
  const userId = user._id;
  const session = await mongoose.startSession();
  let deletedDirectMessages = 0;
  let detachedProjects = 0;
  let anonymizedRoomMessages = 0;
  let storagePaths = user.avatarPath ? [user.avatarPath] : [];

  try {
    await session.withTransaction(async () => {
      const threads = await Thread.find({ participants: userId }).select('_id').session(session).lean();
      const threadIds = threads.map((thread) => thread._id);
      const directMessages = threadIds.length
        ? await Message.find({ kind: 'dm', thread: { $in: threadIds } })
          .select('_id attachments')
          .session(session)
          .lean()
        : [];
      storagePaths = [...storagePaths, ...attachmentPaths(directMessages)];

      if (threadIds.length) {
        const removedMessages = await Message.deleteMany(
          { kind: 'dm', thread: { $in: threadIds } },
          { session }
        );
        deletedDirectMessages = removedMessages.deletedCount || 0;
        await Thread.deleteMany({ _id: { $in: threadIds } }, { session });
      }

      const clientProjects = await Project.updateMany(
        { client: userId },
        { $set: { client: null } },
        { session }
      );
      const developerProjects = await Project.updateMany(
        { developer: userId },
        { $set: { developer: null } },
        { session }
      );
      detachedProjects = (clientProjects.modifiedCount || 0) + (developerProjects.modifiedCount || 0);

      await Project.updateMany(
        { 'evidence.author': userId },
        { $set: { 'evidence.$[entry].author': null } },
        { arrayFilters: [{ 'entry.author': userId }], session }
      );
      await Project.updateMany(
        { 'announcements.author': userId },
        { $set: { 'announcements.$[entry].author': null } },
        { arrayFilters: [{ 'entry.author': userId }], session }
      );

      const messageResult = await Message.updateMany(
        { author: userId },
        {
          $set: {
            author: null,
            authorDeleted: true,
            authorNameAtSend: 'Deleted user',
            authorEmailAtSend: '',
          },
        },
        { session }
      );
      anonymizedRoomMessages = messageResult.modifiedCount || 0;
      await Message.updateMany({ readBy: userId }, { $pull: { readBy: userId } }, { session });

      await Requirement.updateMany({ client: userId }, { $set: { client: null } }, { session });
      await Invoice.updateMany({ client: userId }, { $set: { client: null } }, { session });
      await Invoice.updateMany({ uploadedBy: userId }, { $set: { uploadedBy: null } }, { session });
      await Task.updateMany({ assignee: userId }, { $set: { assignee: null } }, { session });
      await File.updateMany(
        { uploader: userId },
        { $set: { uploader: null, uploaderName: 'Deleted user' } },
        { session }
      );
      await BlogReaction.updateMany({ user: userId }, { $set: { user: null } }, { session });
      await User.updateMany(
        { 'accessApplication.decidedBy': userId },
        { $set: { 'accessApplication.decidedBy': null } },
        { session }
      );
      await SupportTicket.updateMany(
        { requester: userId },
        {
          $set: {
            requester: null,
            requesterName: 'Deleted user',
            requesterEmail: '',
          },
        },
        { session }
      );
      await SupportTicket.updateMany(
        { 'replies.author': userId },
        {
          $set: {
            'replies.$[reply].author': null,
            'replies.$[reply].authorNameAtSend': 'Deleted user',
          },
        },
        { arrayFilters: [{ 'reply.author': userId }], session }
      );

      const deleted = await User.deleteOne({ _id: userId }, { session });
      if (deleted.deletedCount !== 1) throw new Error('User deletion did not complete');
    });
  } finally {
    await session.endSession();
  }

  let cleanupPending = false;
  try {
    await removePaths(storagePaths);
  } catch {
    cleanupPending = storagePaths.length > 0;
  }

  return {
    deletedUserId: String(userId),
    detachedProjects,
    deletedDirectMessages,
    anonymizedRoomMessages,
    cleanupPending,
  };
}

async function deleteGoogleUserPermanently(user) {
  const userId = String(user._id || user.id);
  let deletedDirectMessages = 0;
  let detachedProjects = 0;
  let anonymizedRoomMessages = 0;
  const storagePaths = user.avatarPath ? [user.avatarPath] : [];

  const threads = await Thread.find({ participants: userId }).lean();
  const threadIds = threads.map((thread) => String(thread._id));
  if (threadIds.length) {
    const directMessages = await Message.find({ kind: 'dm', thread: { $in: threadIds } }).lean();
    storagePaths.push(...attachmentPaths(directMessages));
    const result = await Message.deleteMany({ kind: 'dm', thread: { $in: threadIds } });
    deletedDirectMessages = result.deletedCount || 0;
    await Thread.deleteMany({ _id: { $in: threadIds } });
  }

  const projects = (await Project.find({})).filter((project) => (
    String(project.client || '') === userId
    || String(project.developer || '') === userId
    || (project.evidence || []).some((entry) => String(entry.author || '') === userId)
    || (project.announcements || []).some((entry) => String(entry.author || '') === userId)
  ));
  for (const project of projects) {
    if (String(project.client || '') === userId) {
      project.client = null;
      detachedProjects += 1;
    }
    if (String(project.developer || '') === userId) {
      project.developer = null;
      detachedProjects += 1;
    }
    project.evidence = (project.evidence || []).map((entry) => ({
      ...entry,
      author: String(entry.author || '') === userId ? null : entry.author,
    }));
    project.announcements = (project.announcements || []).map((entry) => ({
      ...entry,
      author: String(entry.author || '') === userId ? null : entry.author,
    }));
    await project.save();
  }

  const authoredMessages = await Message.find({ author: userId });
  for (const message of authoredMessages) {
    message.author = null;
    message.authorDeleted = true;
    message.authorNameAtSend = 'Deleted user';
    message.authorEmailAtSend = '';
    await message.save();
    anonymizedRoomMessages += 1;
  }
  const readMessages = await Message.find({ readBy: userId });
  for (const message of readMessages) {
    message.readBy = (message.readBy || []).filter((reader) => String(reader?._id || reader?.id || reader) !== userId);
    await message.save();
  }

  await Requirement.updateMany({ client: userId }, { $set: { client: null, clientId: '' } });
  await Invoice.updateMany({ client: userId }, { $set: { client: null, clientId: '' } });
  await Invoice.updateMany({ uploadedBy: userId }, { $set: { uploadedBy: null, uploadedById: '', userId: '' } });
  await Task.updateMany({ assignee: userId }, { $set: { assignee: null, assigneeId: '', userId: '' } });
  const uploadedFiles = await File.find({ $or: [{ uploader: userId }, { userId }, { uploadedBy: userId }] });
  for (const file of uploadedFiles) {
    file.uploader = null;
    file.uploaderName = 'Deleted user';
    file.userId = '';
    file.uploadedBy = '';
    await file.save();
  }
  await BlogReaction.updateMany({ user: userId }, { $set: { user: null, userId: '' } });
  await User.updateMany({ 'accessApplication.decidedBy': userId }, { $set: { 'accessApplication.decidedBy': null } });

  const tickets = (await SupportTicket.find({})).filter((ticket) => (
    String(ticket.requester || '') === userId
    || (ticket.replies || []).some((reply) => String(reply.author || '') === userId)
  ));
  for (const ticket of tickets) {
    if (String(ticket.requester || '') === userId) {
      ticket.requester = null;
      ticket.requesterId = '';
      ticket.userId = '';
      ticket.requesterName = 'Deleted user';
      ticket.requesterEmail = '';
    }
    ticket.replies = (ticket.replies || []).map((reply) => String(reply.author || '') === userId
      ? { ...reply, author: null, authorNameAtSend: 'Deleted user' }
      : reply);
    await ticket.save();
  }

  const members = new GoogleSheetsRepository(GOOGLE_SHEET_TABS.projectMembers);
  const assigned = await members.list({ filter: { userId }, limit: 500 });
  for (const member of assigned.items) await members.delete(member.id);

  const deleted = await User.deleteOne({ _id: userId });
  if (deleted.deletedCount !== 1) throw new Error('User deletion did not complete');

  let cleanupPending = false;
  try {
    await removePaths(storagePaths);
  } catch {
    cleanupPending = storagePaths.length > 0;
  }
  return {
    deletedUserId: userId,
    detachedProjects,
    deletedDirectMessages,
    anonymizedRoomMessages,
    cleanupPending,
  };
}
