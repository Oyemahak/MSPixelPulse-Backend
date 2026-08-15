// src/lib/deleteUserPermanently.js

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

import {
  GOOGLE_SHEET_TABS,
  GoogleSheetsRepository,
} from '../google/sheets.js';

import {
  removeObjects,
} from './storage.js';

function attachmentPaths(
  messages = [],
) {
  return messages
    .flatMap(
      (message) =>
        message.attachments ||
        [],
    )
    .map(
      (attachment) =>
        attachment.path,
    )
    .filter(Boolean);
}

async function cleanupStoragePaths(
  paths = [],
) {
  const uniquePaths = [
    ...new Set(
      (paths || []).filter(
        Boolean,
      ),
    ),
  ];

  if (!uniquePaths.length) {
    return false;
  }

  try {
    await removeObjects(
      uniquePaths,
    );

    return false;
  } catch (error) {
    console.warn(
      'User storage cleanup failed:',
      error?.code ||
        error?.message ||
        'unknown error',
    );

    return true;
  }
}

export async function deleteUserPermanently(
  user,
) {
  const userId =
    String(
      user?._id ||
        user?.id ||
        '',
    );

  if (!userId) {
    throw new Error(
      'User id is required',
    );
  }

  let deletedDirectMessages = 0;
  let detachedProjects = 0;
  let anonymizedRoomMessages = 0;

  const storagePaths =
    user.avatarPath
      ? [user.avatarPath]
      : [];

  /*
   * Remove direct-message threads owned by the deleted user.
   */
  const threads =
    await Thread.find({
      participants:
        userId,
    }).lean();

  const threadIds =
    threads.map(
      (thread) =>
        String(
          thread._id,
        ),
    );

  if (threadIds.length) {
    const directMessages =
      await Message.find({
        kind: 'dm',

        thread: {
          $in:
            threadIds,
        },
      }).lean();

    storagePaths.push(
      ...attachmentPaths(
        directMessages,
      ),
    );

    const result =
      await Message.deleteMany({
        kind: 'dm',

        thread: {
          $in:
            threadIds,
        },
      });

    deletedDirectMessages =
      result.deletedCount ||
      0;

    await Thread.deleteMany({
      _id: {
        $in:
          threadIds,
      },
    });
  }

  /*
   * Detach the account from projects while preserving
   * the historical project records.
   */
  const projects =
    (
      await Project.find({})
    ).filter(
      (project) =>
        String(
          project.client ||
            '',
        ) === userId ||
        String(
          project.developer ||
            '',
        ) === userId ||
        (
          project.evidence ||
          []
        ).some(
          (entry) =>
            String(
              entry.author ||
                '',
            ) === userId,
        ) ||
        (
          project.announcements ||
          []
        ).some(
          (entry) =>
            String(
              entry.author ||
                '',
            ) === userId,
        ),
    );

  for (
    const project of
    projects
  ) {
    if (
      String(
        project.client ||
          '',
      ) === userId
    ) {
      project.client =
        null;

      project.clientId =
        '';

      detachedProjects +=
        1;
    }

    if (
      String(
        project.developer ||
          '',
      ) === userId
    ) {
      project.developer =
        null;

      project.developerId =
        '';

      detachedProjects +=
        1;
    }

    project.evidence =
      (
        project.evidence ||
        []
      ).map(
        (entry) => ({
          ...entry,

          author:
            String(
              entry.author ||
                '',
            ) === userId
              ? null
              : entry.author,
        }),
      );

    project.announcements =
      (
        project.announcements ||
        []
      ).map(
        (entry) => ({
          ...entry,

          author:
            String(
              entry.author ||
                '',
            ) === userId
              ? null
              : entry.author,
        }),
      );

    await project.save();
  }

  /*
   * Keep project-room history but anonymize the author.
   */
  const authoredMessages =
    await Message.find({
      author:
        userId,
    });

  for (
    const message of
    authoredMessages
  ) {
    message.author =
      null;

    message.authorDeleted =
      true;

    message.authorNameAtSend =
      'Deleted user';

    message.authorEmailAtSend =
      '';

    await message.save();

    anonymizedRoomMessages +=
      1;
  }

  const readMessages =
    await Message.find({
      readBy:
        userId,
    });

  for (
    const message of
    readMessages
  ) {
    message.readBy =
      (
        message.readBy ||
        []
      ).filter(
        (reader) =>
          String(
            reader?._id ||
              reader?.id ||
              reader,
          ) !== userId,
      );

    await message.save();
  }

  await Requirement.updateMany(
    {
      client:
        userId,
    },
    {
      $set: {
        client:
          null,

        clientId:
          '',
      },
    },
  );

  await Invoice.updateMany(
    {
      client:
        userId,
    },
    {
      $set: {
        client:
          null,

        clientId:
          '',
      },
    },
  );

  await Invoice.updateMany(
    {
      uploadedBy:
        userId,
    },
    {
      $set: {
        uploadedBy:
          null,

        uploadedById:
          '',

        userId:
          '',
      },
    },
  );

  await Task.updateMany(
    {
      assignee:
        userId,
    },
    {
      $set: {
        assignee:
          null,

        assigneeId:
          '',

        userId:
          '',
      },
    },
  );

  const uploadedFiles =
    await File.find({
      $or: [
        {
          uploader:
            userId,
        },
        {
          userId,
        },
        {
          uploadedBy:
            userId,
        },
      ],
    });

  for (
    const file of
    uploadedFiles
  ) {
    file.uploader =
      null;

    file.uploaderName =
      'Deleted user';

    file.userId =
      '';

    file.uploadedBy =
      '';

    await file.save();
  }

  await BlogReaction.updateMany(
    {
      user:
        userId,
    },
    {
      $set: {
        user:
          null,

        userId:
          '',
      },
    },
  );

  await User.updateMany(
    {
      'accessApplication.decidedBy':
        userId,
    },
    {
      $set: {
        'accessApplication.decidedBy':
          null,
      },
    },
  );

  const tickets =
    (
      await SupportTicket.find(
        {},
      )
    ).filter(
      (ticket) =>
        String(
          ticket.requester ||
            '',
        ) === userId ||
        (
          ticket.replies ||
          []
        ).some(
          (reply) =>
            String(
              reply.author ||
                '',
            ) === userId,
        ),
    );

  for (
    const ticket of
    tickets
  ) {
    if (
      String(
        ticket.requester ||
          '',
      ) === userId
    ) {
      ticket.requester =
        null;

      ticket.requesterId =
        '';

      ticket.userId =
        '';

      ticket.requesterName =
        'Deleted user';

      ticket.requesterEmail =
        '';
    }

    ticket.replies =
      (
        ticket.replies ||
        []
      ).map(
        (reply) =>
          String(
            reply.author ||
              '',
          ) === userId
            ? {
                ...reply,

                author:
                  null,

                authorNameAtSend:
                  'Deleted user',
              }
            : reply,
      );

    await ticket.save();
  }

  /*
   * Project membership is stored independently in Sheets.
   */
  const members =
    new GoogleSheetsRepository(
      GOOGLE_SHEET_TABS.projectMembers,
    );

  const assigned =
    await members.list({
      filter: {
        userId,
      },

      limit: 500,
    });

  if (
    assigned.items.length
  ) {
    await members.deleteMany(
      assigned.items.map(
        (member) =>
          member.id,
      ),
    );
  }

  const deleted =
    await User.deleteOne({
      _id:
        userId,
    });

  if (
    deleted.deletedCount !==
    1
  ) {
    throw new Error(
      'User deletion did not complete',
    );
  }

  const cleanupPending =
    await cleanupStoragePaths(
      storagePaths,
    );

  return {
    deletedUserId:
      userId,

    detachedProjects,

    deletedDirectMessages,

    anonymizedRoomMessages,

    cleanupPending,
  };
}