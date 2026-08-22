import express from "express";

import {
  requireAuth,
  requireRole,
} from "../middleware/auth.js";

import Room from "../models/Room.js";
import Project from "../models/Project.js";
import Message from "../models/Message.js";

import {
  boundedMessageLimit,
  normalizeMessageBody,
} from "../lib/messagePolicy.js";

import {
  normalizeMessageTimestamp,
  withCanonicalMessageTimestamp,
} from "../lib/messageTimestamp.js";

import {
  canReadProject,
  projectAccessError,
} from "../lib/projectAccess.js";

import {
  signedURL,
} from "../lib/storage.js";
import { emitPortalEvent } from "../lib/portalEvents.js";

const router = express.Router();

async function presentRoomMessage(value) {
  const message =
    value?.toObject
      ? value.toObject()
      : value;

  return withCanonicalMessageTimestamp({
    ...message,

    attachments:
      await Promise.all(
        (
          message.attachments ||
          []
        ).map(
          async (attachment) => {
            if (
              !attachment.path
            ) {
              return attachment;
            }

            try {
              return {
                ...attachment,

                url:
                  await signedURL(
                    attachment.path,
                  ),
              };
            } catch (error) {
              console.warn(
                "Unable to sign room attachment:",
                error?.code ||
                  error?.message ||
                  "unknown error",
              );

              return {
                ...attachment,
                url: "",
              };
            }
          },
        ),
      ),
  });
}

/**
 * Get messages in a project room.
 */
router.get(
  "/:projectId/messages",

  requireAuth,

  requireRole([
    "admin",
    "developer",
    "client",
  ]),

  async (req, res) => {
    const { projectId } =
      req.params;

    const project =
      await Project.findById(
        projectId,
      )
        .select(
          "_id title client developer",
        )
        .lean();

    if (!project) {
      return res
        .status(404)
        .json({
          error:
            "project not found",
        });
    }

    if (
      !canReadProject(
        req.user,
        project,
      )
    ) {
      return projectAccessError(
        res,
      );
    }

    let room =
      await Room.findOne({
        project:
          project._id,
      });

    if (!room) {
      room =
        await Room.create({
          project:
            project._id,
        });
    }

    const {
      before,
      limit = 50,
    } = req.query;

    const query = {
      kind: "room",

      project:
        project._id,
    };

    if (before) {
      const normalizedBefore =
        normalizeMessageTimestamp(
          before,
        );

      if (!normalizedBefore) {
        return res
          .status(400)
          .json({
            error:
              "Invalid before timestamp",
          });
      }

      query.sentAt = {
        $lt:
          new Date(
            normalizedBefore,
          ),
      };
    }

    const rows =
      await Message.find(
        query,
      )
        .sort({
          sentAt: -1,
        })
        .limit(
          boundedMessageLimit(
            limit,
          ),
        )
        .lean();

    if (rows.length) {
      await Message.updateMany(
        {
          _id: {
            $in:
              rows.map(
                (message) =>
                  message._id,
              ),
          },

          author: {
            $ne:
              req.user._id,
          },
        },
        {
          $addToSet: {
            readBy:
              req.user._id,
          },
        },
      );
    }

    const messages =
      await Promise.all(
        rows
          .reverse()
          .map(
            presentRoomMessage,
          ),
      );

    return res.json({
      roomId:
        room._id,

      messages,
    });
  },
);

/**
 * Send a message to a project room.
 */
router.post(
  "/:projectId/messages",

  requireAuth,

  requireRole([
    "admin",
    "developer",
    "client",
  ]),

  async (req, res) => {
    const { projectId } =
      req.params;

    const body =
      normalizeMessageBody(
        req.body || {},
        {
          projectId,
        },
      );

    if (!body.ok) {
      return res
        .status(400)
        .json({
          error:
            body.message,
        });
    }

    const project =
      await Project.findById(
        projectId,
      )
        .select(
          "_id title client developer",
        )
        .lean();

    if (!project) {
      return res
        .status(404)
        .json({
          error:
            "project not found",
        });
    }

    if (
      !canReadProject(
        req.user,
        project,
      )
    ) {
      return projectAccessError(
        res,
      );
    }

    let room =
      await Room.findOne({
        project:
          project._id,
      });

    if (!room) {
      room =
        await Room.create({
          project:
            project._id,
        });
    }

    const sentAt =
      new Date()
        .toISOString();

    const messageRecord =
      await Message.create({
        kind: "room",

        room:
          room._id,

        project:
          project._id,

        author:
          req.user._id,

        authorNameAtSend:
          req.user.name ||
          "",

        authorEmailAtSend:
          req.user.email ||
          "",

        authorRoleAtSend:
          req.user.role,

        text:
          body.text,

        attachments:
          body.attachments,

        readBy: [
          req.user._id,
        ],

        sentAt,
      });

    room.lastMessageAt =
      sentAt;

    await room.save();

    const message =
      await presentRoomMessage(
        messageRecord,
      );

    req.app
      .get("io")
      ?.to(
        `room:${room._id}`,
      )
      .emit(
        "room:new",
        {
          projectId:
            String(
              project._id,
            ),

          message,
        },
      );

    await emitPortalEvent({
      type: 'project_room_message',
      category: 'messages',
      title: `New project-room message - ${project.title || 'Project'}`,
      message: body.text || 'A new attachment was posted in the project room.',
      actor: req.user,
      project,
      relatedEntityType: 'Message',
      relatedEntityId: String(messageRecord._id),
      actionUrl: `/admin/discussions/${projectId}`,
      actionUrlByRole: { client: `/client/discussions/${projectId}`, developer: `/dev/discussions/${projectId}` },
      targets: { admins: true, client: true, developer: true, excludeActor: true },
      dedupeKey: `room-message:${String(messageRecord._id)}`,
    });

    return res.json({
      ok: true,
      message,
    });
  },
);

export default router;
