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

function attachmentPaths(messages = []) {
  return messages
    .flatMap((message) => message.attachments || [])
    .map((attachment) => attachment.path)
    .filter(Boolean);
}

export async function deleteUserPermanently(user) {
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
