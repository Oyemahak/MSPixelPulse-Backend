// src/routes/dm.js

import express from 'express';

import {
  requireAuth,
  requireRole,
} from '../middleware/auth.js';

import Thread from '../models/Thread.js';
import Message from '../models/Message.js';
import {
  boundedMessageLimit,
  normalizeMessageBody,
} from '../lib/messagePolicy.js';

import {
  messageTimestampFrom,
  normalizeMessageTimestamp,
  withCanonicalMessageTimestamp,
} from '../lib/messageTimestamp.js';

import {
  notifySuperAdminOfPortalMessage,
} from '../lib/portalMessageNotification.js';

import {
  listAuthorizedDirectPeers,
  peerIdFromThread,
} from '../lib/directMessageAccess.js';

const router =
  express.Router();

router.use(
  requireAuth,

  requireRole([
    'admin',
    'developer',
    'client',
  ]),
);

function plainObject(value) {
  if (!value) {
    return {};
  }

  return value?.toObject
    ? value.toObject()
    : {
        ...value,
      };
}

function presentDirectMessage(value) {
  return withCanonicalMessageTimestamp(
    plainObject(
      value,
    ),
  );
}

function previewText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function peerMap(peers = []) {
  return new Map(
    peers.map((peer) => [String(peer._id), peer]),
  );
}

async function authorizedThread(req, threadId) {
  const thread = await Thread.findById(threadId);

  if (!thread) return null;

  const me = String(req.user?._id || '');
  const participantIds = (thread.participants || []).map(String);

  if (!participantIds.includes(me)) return null;

  const peers = await listAuthorizedDirectPeers(req.user);
  const peer = peerMap(peers).get(peerIdFromThread(thread, me));

  return peer ? { thread, peer } : null;
}

async function sendDirectNotification({
  sender,
  recipient,
  message,
  thread,
}) {
  try {
    await notifySuperAdminOfPortalMessage({
      channel:
        'dm',

      sender,

      recipient,

      message,

      threadId:
        thread?._id ||
        thread?.id,
    });
  } catch (error) {
    console.warn(
      'Portal direct-message notification failed:',
      error?.code ||
        error?.message ||
        'unknown error',
    );
  }
}

/**
 * Create or ensure a DM thread with peer.
 */
router.post(
  '/open',

  async (
    req,
    res,
    next,
  ) => {
    try {
      const me =
        String(
          req.user._id,
        );

      const {
        peerId,
      } =
        req.body ||
        {};

      const peers =
        await listAuthorizedDirectPeers(
          req.user,
        );

      const peer =
        peers.find(
          (candidate) =>
            String(candidate._id) ===
            String(peerId || ''),
        );

      if (
        !peer ||
        String(
          peer._id,
        ) === me
      ) {
        return res
          .status(404)
          .json({
            error:
              'not found',
          });
      }

      const pair = [
        me,
        String(
          peer._id,
        ),
      ].sort();

      const participantKey =
        pair.join(
          ':',
        );

      let thread =
        await Thread.findOne({
          participantKey,
        });

      if (!thread) {
        thread =
          await Thread.findOne({
            participants: {
              $all:
                pair,

              $size:
                2,
            },
          });

        if (thread) {
          thread.participantKey =
            participantKey;

          await thread.save();
        } else {
          thread =
            await Thread.findOneAndUpdate(
              {
                participantKey,
              },

              {
                $setOnInsert: {
                  participants:
                    pair,

                  participantKey,
                },
              },

              {
                new:
                  true,

                upsert:
                  true,

                runValidators:
                  true,
              },
            );
        }
      }

      return res.json({
        threadId:
          thread._id,

        peer,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * List current user's threads.
 */
router.get(
  '/threads',

  async (
    req,
    res,
    next,
  ) => {
    try {
      const me =
        String(
          req.user._id,
        );

      const [threads, peers] =
        await Promise.all([
          Thread.find({
            participants:
              me,
          })
            .sort({
              lastMessageAt:
                -1,
            })
            .lean(),

          listAuthorizedDirectPeers(
            req.user,
          ),
        ]);

      const peersById =
        peerMap(peers);

      const authorizedThreads =
        threads.filter((thread) =>
          peersById.has(
            peerIdFromThread(
              thread,
              me,
            ),
          ),
        );

      const threadIds =
        authorizedThreads.map(
          (thread) =>
            String(thread._id),
        );

      const latestByThread =
        new Map();

      if (threadIds.length) {
        const recentMessages =
          await Message.find({
            kind: 'dm',
            thread: {
              $in: threadIds,
            },
          })
            .sort({ sentAt: -1 })
            .lean();

        for (const message of recentMessages) {
          const key = String(message.thread || '');

          if (!latestByThread.has(key)) {
            latestByThread.set(key, message);
          }
        }
      }

      const presented =
        authorizedThreads
          .map((thread) => {
            const threadId = String(thread._id);
            const latest = latestByThread.get(threadId);
            const lastMessageAt =
              normalizeMessageTimestamp(
                thread.lastMessageAt,
              ) ||
              messageTimestampFrom(latest);
            const peer = peersById.get(
              peerIdFromThread(thread, me),
            );

            return {
              ...thread,
              peer,
              lastMessageAt,
              latestMessagePreview:
                previewText(
                  thread.lastMessagePreview ||
                  latest?.text,
                ),
              latestMessageAuthor:
                thread.lastMessageAuthor ||
                latest?.author ||
                null,
            };
          })
          .sort((left, right) =>
            new Date(right.lastMessageAt || 0).getTime() -
            new Date(left.lastMessageAt || 0).getTime(),
          );

      return res.json({
        threads:
          presented,
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * Get messages in a thread.
 */
router.get(
  '/threads/:id/messages',

  async (
    req,
    res,
    next,
  ) => {
    try {
      const context =
        await authorizedThread(
          req,
          req.params.id,
        );

      if (!context) {
        return res
          .status(404)
          .json({
            error:
              'not found',
          });
      }

      const { thread } = context;

      const {
        before,
        limit = 50,
      } =
        req.query;

      const query = {
        kind:
          'dm',

        thread:
          thread._id,
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
                'Invalid before timestamp',
            });
        }

        query.sentAt = {
          $lt:
            new Date(
              normalizedBefore,
            ),
        };
      }

      const messages =
        await Message.find(
          query,
        )
          .sort({
            sentAt:
              -1,
          })
          .limit(
            boundedMessageLimit(
              limit,
            ),
          );

      if (
        messages.length
      ) {
        await Message.updateMany(
          {
            _id: {
              $in:
                messages.map(
                  (
                    message,
                  ) =>
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

      return res.json({
        messages:
          messages
            .reverse()
            .map(
              presentDirectMessage,
            ),
      });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * Send a message to a thread.
 */
router.post(
  '/threads/:id/messages',

  async (
    req,
    res,
    next,
  ) => {
    try {
      const me =
        req.user;

      const context =
        await authorizedThread(
          req,
          req.params.id,
        );

      if (!context) {
        return res
          .status(404)
          .json({
            error:
              'not found',
          });
      }

      const {
        thread,
        peer: recipient,
      } = context;

      const body =
        normalizeMessageBody(
          req.body ||
            {},
        );

      if (!body.ok) {
        return res
          .status(400)
          .json({
            error:
              body.message,
          });
      }

      const sentAt =
        new Date()
          .toISOString();

      const messageRecord =
        await Message.create({
          kind:
            'dm',

          thread:
            thread._id,

          author:
            me._id,

          authorNameAtSend:
            me.name ||
            '',

          authorEmailAtSend:
            me.email ||
            '',

          authorRoleAtSend:
            me.role,

          text:
            body.text,

          attachments:
            body.attachments,

          readBy: [
            me._id,
          ],

          sentAt,
        });

      const canonicalSentAt =
        messageTimestampFrom(
          messageRecord,
        ) ||
        sentAt;

      thread.lastMessageAt =
        canonicalSentAt;

      thread.lastMessagePreview =
        previewText(body.text);

      thread.lastMessageAuthor =
        me._id;

      await thread.save();

      const message =
        presentDirectMessage(
          messageRecord,
        );

      req.app
        .get('io')
        ?.to(
          `thread:${thread._id}`,
        )
        .emit(
          'dm:new',
          {
            threadId:
              String(
                thread._id,
              ),

            message,
          },
        );

      void sendDirectNotification({
        sender:
          me,

        recipient,

        message,

        thread,
      });

      return res.json({
        ok:
          true,

        message,
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
