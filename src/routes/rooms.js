import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import Room from "../models/Room.js";
import Project from "../models/Project.js";
import Message from "../models/Message.js";
import { boundedMessageLimit, normalizeMessageBody } from "../lib/messagePolicy.js";
import { canReadProject, projectAccessError } from "../lib/projectAccess.js";
import { createSignedUrl } from "../lib/supabase.js";

const router = express.Router();

async function presentRoomMessage(value) {
  const message = value?.toObject ? value.toObject() : value;
  return {
    ...message,
    attachments: await Promise.all((message.attachments || []).map(async (attachment) => {
      if (!attachment.path) return attachment;
      try {
        return { ...attachment, url: await createSignedUrl(attachment.path) };
      } catch {
        return { ...attachment, url: '' };
      }
    })),
  };
}

/** Get messages in a project room */
router.get(
  "/:projectId/messages",
  requireAuth,
  requireRole(["admin", "developer", "client"]),
  async (req, res) => {
    const { projectId } = req.params;

    const project = await Project.findById(projectId).select("_id client developer").lean();

    if (!project) return res.status(404).json({ error: "project not found" });

    if (!canReadProject(req.user, project)) return projectAccessError(res);

    let room = await Room.findOne({ project: project._id });
    if (!room) room = await Room.create({ project: project._id });

    const { before, limit = 50 } = req.query;
    const q = { kind: "room", project: project._id };
    if (before) q.sentAt = { $lt: new Date(before) };

    const rows = await Message.find(q)
      .sort({ sentAt: -1 })
      .limit(boundedMessageLimit(limit))
      .lean();

    if (rows.length) {
      await Message.updateMany(
        { _id: { $in: rows.map((message) => message._id) }, author: { $ne: req.user._id } },
        { $addToSet: { readBy: req.user._id } }
      );
    }

    const messages = await Promise.all(rows.reverse().map(presentRoomMessage));
    res.json({ roomId: room._id, messages });
  }
);

/** Send to a project room */
router.post(
  "/:projectId/messages",
  requireAuth,
  requireRole(["admin", "developer", "client"]),
  async (req, res) => {
    const { projectId } = req.params;
    const body = normalizeMessageBody(req.body || {}, { projectId });
    if (!body.ok) return res.status(400).json({ error: body.message });

    const project = await Project.findById(projectId).select("_id client developer").lean();

    if (!project) return res.status(404).json({ error: "project not found" });

    if (!canReadProject(req.user, project)) return projectAccessError(res);

    let room = await Room.findOne({ project: project._id });
    if (!room) room = await Room.create({ project: project._id });

    const msg = await Message.create({
      kind: "room",
      room: room._id,
      project: project._id,
      author: req.user._id,
      authorNameAtSend: req.user.name || '',
      authorEmailAtSend: req.user.email || '',
      authorRoleAtSend: req.user.role,
      text: body.text,
      attachments: body.attachments,
      readBy: [req.user._id],
    });

    room.lastMessageAt = msg.sentAt;
    await room.save();

    const message = await presentRoomMessage(msg);

    req.app.get("io")?.to(`room:${room._id}`).emit("room:new", {
      projectId: String(project._id),
      message,
    });

    res.json({ ok: true, message });
  }
);

export default router;
