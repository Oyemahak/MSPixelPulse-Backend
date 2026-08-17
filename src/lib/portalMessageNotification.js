// src/lib/portalMessageNotification.js

import {
  brandedEmail,
} from './mailer.js';

import {
  deliverNotification,
} from './notificationService.js';

import {
  messageTimestampFrom,
  normalizeMessageTimestamp,
} from './messageTimestamp.js';

const DEFAULT_NOTIFICATION_EMAIL =
  'mspixelpulse@gmail.com';

const DEFAULT_PORTAL_BASE_URL =
  'https://mspixelpulse.com';

const MAX_MESSAGE_PREVIEW =
  800;

function clean(value) {
  return String(
    value ?? '',
  ).trim();
}

function notificationEmail() {
  return (
    clean(
      process.env
        .PORTAL_MESSAGE_NOTIFICATION_EMAIL,
    ).toLowerCase() ||
    DEFAULT_NOTIFICATION_EMAIL
  );
}

function portalBaseUrl() {
  return clean(
    process.env
      .PORTAL_BASE_URL ||
    process.env
      .FRONTEND_URL ||
    process.env
      .PUBLIC_SITE_URL ||
    DEFAULT_PORTAL_BASE_URL,
  ).replace(
    /\/+$/,
    '',
  );
}

function safeRole(value) {
  const role =
    clean(value);

  if (!role) {
    return 'Portal user';
  }

  return (
    role.charAt(0)
      .toUpperCase() +
    role.slice(1)
  );
}

function boundedMessage(value) {
  const message =
    clean(value);

  if (
    message.length <=
    MAX_MESSAGE_PREVIEW
  ) {
    return message;
  }

  return (
    `${message.slice(
      0,
      MAX_MESSAGE_PREVIEW - 1,
    )}…`
  );
}

function personName(user) {
  return (
    clean(user?.name) ||
    clean(
      user?.authorNameAtSend,
    ) ||
    'Portal user'
  );
}

function personEmail(user) {
  return (
    clean(user?.email) ||
    clean(
      user?.authorEmailAtSend,
    )
  );
}

function personRole(user) {
  return safeRole(
    user?.role ||
    user?.authorRoleAtSend,
  );
}

function canonicalTime(message) {
  return (
    messageTimestampFrom(
      message,
    ) ||
    normalizeMessageTimestamp(
      new Date(),
    )
  );
}

function defaultRoomUrl(projectId) {
  const base =
    portalBaseUrl();

  /*
   * The frontend will later provide more specific
   * deep links when we update its routing.
   *
   * Until then this safely opens the portal.
   */
  const query =
    projectId
      ? `?project=${encodeURIComponent(
          String(projectId),
        )}`
      : '';

  return (
    `${base}/portal${query}`
  );
}

function defaultDirectUrl(threadId) {
  const base =
    portalBaseUrl();

  const query =
    threadId
      ? `?thread=${encodeURIComponent(
          String(threadId),
        )}`
      : '';

  return (
    `${base}/portal${query}`
  );
}

export function buildPortalMessageNotification({
  channel,
  sender,
  recipient,
  project,
  message,
  conversationUrl,
  threadId,
} = {}) {
  const type =
    channel === 'dm'
      ? 'dm'
      : 'room';

  const timestamp =
    canonicalTime(
      message || {},
    );

  const messageText =
    boundedMessage(
      message?.text ||
        '',
    );

  const senderName =
    personName(sender);

  const senderEmail =
    personEmail(sender);

  const senderRole =
    personRole(sender);

  const recipientName =
    recipient
      ? personName(
          recipient,
        )
      : '';

  const recipientEmail =
    recipient
      ? personEmail(
          recipient,
        )
      : '';

  const recipientRole =
    recipient
      ? personRole(
          recipient,
        )
      : '';

  const projectTitle =
    clean(
      project?.title ||
      project?.name,
    );

  const projectId =
    project?._id ||
    project?.id ||
    message?.project ||
    '';

  const finalUrl =
    clean(
      conversationUrl,
    ) ||
    (
      type === 'dm'
        ? defaultDirectUrl(
            threadId ||
            message?.thread,
          )
        : defaultRoomUrl(
            projectId,
          )
    );

  const subject =
    type === 'dm'
      ? (
          `New direct message · ${senderName}` +
          (
            recipientName
              ? ` → ${recipientName}`
              : ''
          )
        )
      : (
          `New portal message` +
          (
            projectTitle
              ? ` · ${projectTitle}`
              : ''
          )
        );

  const rows = [
    {
      label:
        'From',

      value:
        [
          senderName,
          senderEmail,
          senderRole,
        ]
          .filter(Boolean)
          .join('\n'),
    },

    ...(type === 'dm'
      ? [
          {
            label:
              'To',

            value:
              [
                recipientName,
                recipientEmail,
                recipientRole,
              ]
                .filter(Boolean)
                .join('\n'),
          },
        ]
      : [
          {
            label:
              'Channel',

            value:
              'Project Room',
          },
        ]),

    ...(projectTitle
      ? [
          {
            label:
              'Project',

            value:
              projectTitle,
          },
        ]
      : []),

    {
      label:
        'Message',

      value:
        messageText ||
        '(Attachment-only message)',
    },

    {
      label:
        'Sent',

      value:
        timestamp,
    },
  ];

  const content =
    brandedEmail({
      eyebrow:
        'MSPixelPulse Portal',

      heading:
        type === 'dm'
          ? 'New direct message'
          : 'New project room message',

      intro:
        type === 'dm'
          ? `${senderName} sent a direct portal message.`
          : `${senderName} posted a message in a project room.`,

      rows,

      button: {
        label:
          type === 'dm'
            ? 'Open Conversation'
            : 'Open Project Room',

        url:
          finalUrl,
      },

      footer:
        'MSPixelPulse · Portal activity notification',
    });

  return {
    recipient:
      notificationEmail(),

    type:
      type === 'dm'
        ? 'portal_direct_message'
        : 'portal_room_message',

    subject,

    html:
      content.html,

    text:
      content.text,

    metadata: {
      channel:
        type,

      senderName,
      senderEmail,
      senderRole,

      recipientName,
      recipientEmail,
      recipientRole,

      projectTitle,

      messagePreview:
        messageText,

      sentAt:
        timestamp,

      conversationUrl:
        finalUrl,
    },
  };
}

export async function notifySuperAdminOfPortalMessage(
  options = {},
) {
  const payload =
    buildPortalMessageNotification(
      options,
    );

  const messageId =
    options.message?._id ||
    options.message?.id ||
    '';

  const dedupeKey =
    messageId
      ? `portal-message:${String(
          messageId,
        )}`
      : undefined;

  return deliverNotification({
    type:
      payload.type,

    relatedEntityType:
      'Message',

    /*
     * NotificationLog historically uses an ObjectId-like
     * field here. Google message IDs can be UUIDs, so use
     * metadata + dedupeKey and leave relatedEntityId empty.
     */
    relatedEntityId:
      null,

    recipients: [
      payload.recipient,
    ],

    dedupeKey,

    metadata: {
      ...payload.metadata,

      messageId:
        messageId
          ? String(
              messageId,
            )
          : '',
    },

    message: {
      subject:
        payload.subject,

      html:
        payload.html,

      text:
        payload.text,

      replyTo:
        payload.metadata
          .senderEmail ||
        undefined,
    },
  });
}

export const portalMessageNotificationInternals = {
  notificationEmail,
  portalBaseUrl,
  boundedMessage,
  personName,
  personEmail,
  personRole,
};