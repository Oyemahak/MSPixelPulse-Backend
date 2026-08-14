import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import Thread from "../models/Thread.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { boundedMessageLimit, normalizeMessageBody } from "../lib/messagePolicy.js";

const router = express.Router();

// Direct messages are persisted for active portal accounts. Peer policy below
// keeps client access limited to Admin conversations.
router.use(requireAuth, requireRole(["admin", "developer", "client"]));

/** Create/ensure a DM thread with peer */
router.post("/open", async (req, res) => {
  const me = String(req.user._id);
  const { peerId } = req.body || {};

  const peerRoles = req.user.role === "admin"
    ? ["admin", "developer", "client"]
    : req.user.role === "developer"
      ? ["admin", "developer"]
      : ["admin"];
  const peer = await User.findOne({
    _id: peerId,
    role: { $in: peerRoles },
    status: "active",
    accountStatus: { $ne: "suspended" },
  }).select("_id role");
  if (!peer || String(peer._id) === me) {
    return res.status(400).json({ error: "invalid peer" });
  }

  const pair = [me, String(peer._id)].sort();
  const participantKey = pair.join(':');
  let thread = await Thread.findOne({ participantKey });
  if (!thread) {
    thread = await Thread.findOne({ participants: { $all: pair, $size: 2 } });
    if (thread) {
      thread.participantKey = participantKey;
      await thread.save();
    } else {
      thread = await Thread.findOneAndUpdate(
        { participantKey },
        { $setOnInsert: { participants: pair, participantKey } },
        { new: true, upsert: true, runValidators: true }
      );
    }
  }

  res.json({ threadId: thread._id });
});

/** List my threads (basic) */
router.get("/threads", async (req, res) => {
  const me = String(req.user._id);
  const threads = await Thread.find({ participants: me }).sort({
    lastMessageAt: -1,
  });
  res.json({ threads });
});

/** Get messages in a thread */
router.get("/threads/:id/messages", async (req, res) => {
  const me = String(req.user._id);
  const thread = await Thread.findById(req.params.id);
  if (!thread || !thread.participants.map(String).includes(me)) {
    return res.status(404).json({ error: "not found" });
  }

  const { before, limit = 50 } = req.query;
  const q = { kind: "dm", thread: thread._id };
  if (before) q.sentAt = { $lt: new Date(before) };

  const msgs = await Message.find(q)
    .sort({ sentAt: -1 })
    .limit(boundedMessageLimit(limit));

  if (msgs.length) {
    await Message.updateMany(
      { _id: { $in: msgs.map((message) => message._id) }, author: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
  }

  res.json({ messages: msgs.reverse() });
});

/** Send a message to a thread */
router.post("/threads/:id/messages", async (req, res) => {
  const me = req.user;
  const thread = await Thread.findById(req.params.id);
  if (!thread || !thread.participants.map(String).includes(String(me._id))) {
    return res.status(404).json({ error: "not found" });
  }

  const body = normalizeMessageBody(req.body || {});
  if (!body.ok) return res.status(400).json({ error: body.message });

  const msg = await Message.create({
    kind: "dm",
    thread: thread._id,
    author: me._id,
    authorNameAtSend: me.name || '',
    authorEmailAtSend: me.email || '',
    authorRoleAtSend: me.role,
    text: body.text,
    attachments: body.attachments,
    readBy: [me._id],
  });

  thread.lastMessageAt = msg.sentAt;
  await thread.save();

  // Realtime fanout (optional)
  req.app.get("io")?.to(`thread:${thread._id}`).emit("dm:new", {
    threadId: String(thread._id),
    message: msg,
  });

  res.json({ ok: true, message: msg });
});

export default router;
