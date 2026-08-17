// src/routes/dm.js

import express from 'express';

import {
  requireAuth,
  requireRole,
} from '../middleware/auth.js';

import Thread from '../models/Thread.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

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

function peerRolesFor(role) {
  if (
    role === 'admin'
  ) {
    return [
      'admin',
      'developer',
      'client',
    ];
  }

  if (
    role ===
    'developer'
  ) {
    return [
      'admin',
      'developer',
    ];
  }

  return [
    'admin',
  ];
}

async function findPeerForThread(
  thread,
  currentUserId,
) {
  const peerId =
    (
      thread.participants ||
      []
    )
      .map(String)
      .find(
        (participantId) =>
          participantId !==
          String(
            currentUserId,
          ),
      );

  if (!peerId) {
    return null;
  }

  return User.findById(
    peerId,
  )
    .select(
      '_id name email role status accountStatus lastSeenAt',
    )
    .lean();
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

      const peerRoles =
        peerRolesFor(
          req.user.role,
        );

      const peer =
        await User.findOne({
          _id:
            peerId,

          role: {
            $in:
              peerRoles,
          },

          status:
            'active',

          accountStatus: {
            $ne:
              'suspended',
          },
        }).select(
          '_id role',
        );

      if (
        !peer ||
        String(
          peer._id,
        ) === me
      ) {
        return res
          .status(400)
          .json({
            error:
              'invalid peer',
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

      const threads =
        await Thread.find({
          participants:
            me,
        })
          .sort({
            lastMessageAt:
              -1,
          })
          .lean();

      const presented =
        threads.map(
          (thread) => ({
            ...thread,

            lastMessageAt:
              normalizeMessageTimestamp(
                thread
                  .lastMessageAt,
              ),
          }),
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
      const me =
        String(
          req.user._id,
        );

      const thread =
        await Thread.findById(
          req.params.id,
        );

      if (
        !thread ||
        !(
          thread.participants ||
          []
        )
          .map(String)
          .includes(me)
      ) {
        return res
          .status(404)
          .json({
            error:
              'not found',
          });
      }

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

      const thread =
        await Thread.findById(
          req.params.id,
        );

      if (
        !thread ||
        !(
          thread.participants ||
          []
        )
          .map(String)
          .includes(
            String(
              me._id,
            ),
          )
      ) {
        return res
          .status(404)
          .json({
            error:
              'not found',
          });
      }

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

      await thread.save();

      const message =
        presentDirectMessage(
          messageRecord,
        );

      const recipient =
        await findPeerForThread(
          thread,
          me._id,
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