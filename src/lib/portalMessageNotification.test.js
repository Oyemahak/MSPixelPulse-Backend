// src/lib/portalMessageNotification.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPortalMessageNotification,
} from './portalMessageNotification.js';

test(
  'room notification contains sender and project',
  () => {
    const result =
      buildPortalMessageNotification({
        channel:
          'room',

        sender: {
          name:
            'Client Example',

          email:
            'client@example.com',

          role:
            'client',
        },

        project: {
          _id:
            'project-1',

          title:
            'Example Website',
        },

        message: {
          _id:
            'message-1',

          text:
            'Please update the homepage.',

          sentAt:
            '2026-08-16T22:00:00.000Z',
        },
      });

    assert.equal(
      result.type,
      'portal_room_message',
    );

    assert.match(
      result.subject,
      /Example Website/,
    );

    assert.match(
      result.text,
      /Client Example/,
    );

    assert.match(
      result.text,
      /Please update the homepage/,
    );
  },
);

test(
  'direct notification contains sender and recipient',
  () => {
    const result =
      buildPortalMessageNotification({
        channel:
          'dm',

        sender: {
          name:
            'Developer Example',

          email:
            'developer@example.com',

          role:
            'developer',
        },

        recipient: {
          name:
            'Admin Example',

          email:
            'admin@example.com',

          role:
            'admin',
        },

        message: {
          text:
            'Hi Admin',

          sentAt:
            '2026-08-16T22:00:00.000Z',
        },

        threadId:
          'thread-1',
      });

    assert.equal(
      result.type,
      'portal_direct_message',
    );

    assert.match(
      result.subject,
      /Developer Example/,
    );

    assert.match(
      result.subject,
      /Admin Example/,
    );

    assert.match(
      result.text,
      /developer@example.com/,
    );

    assert.match(
      result.text,
      /admin@example.com/,
    );
  },
);

test(
  'notification defaults to MSPixelPulse Gmail recipient',
  () => {
    const previous =
      process.env
        .PORTAL_MESSAGE_NOTIFICATION_EMAIL;

    delete process.env
      .PORTAL_MESSAGE_NOTIFICATION_EMAIL;

    try {
      const result =
        buildPortalMessageNotification({
          channel:
            'room',

          sender: {
            name:
              'Client',
          },

          message: {
            text:
              'Hello',
          },
        });

      assert.equal(
        result.recipient,
        'mspixelpulse@gmail.com',
      );
    } finally {
      if (
        previous ===
        undefined
      ) {
        delete process.env
          .PORTAL_MESSAGE_NOTIFICATION_EMAIL;
      } else {
        process.env
          .PORTAL_MESSAGE_NOTIFICATION_EMAIL =
          previous;
      }
    }
  },
);

test(
  'message preview is bounded',
  () => {
    const result =
      buildPortalMessageNotification({
        channel:
          'room',

        sender: {
          name:
            'Client',
        },

        message: {
          text:
            'x'.repeat(
              5000,
            ),
        },
      });

    assert.ok(
      result.metadata
        .messagePreview.length <=
        800,
    );
  },
);

test(
  'malformed message timestamp does not crash notification generation',
  () => {
    const result =
      buildPortalMessageNotification({
        channel:
          'room',

        sender: {
          name:
            'Client',
        },

        message: {
          text:
            'Hello',

          sentAt:
            'invalid-date',
        },
      });

    assert.equal(
      Number.isNaN(
        new Date(
          result.metadata
            .sentAt,
        ).getTime(),
      ),
      false,
    );
  },
);

test(
  'notification output never includes password or token properties',
  () => {
    const result =
      buildPortalMessageNotification({
        channel:
          'dm',

        sender: {
          name:
            'Client',

          email:
            'client@example.com',

          role:
            'client',

          password:
            'DO_NOT_INCLUDE',

          token:
            'DO_NOT_INCLUDE',
        },

        recipient: {
          name:
            'Admin',

          email:
            'admin@example.com',

          role:
            'admin',

          password:
            'DO_NOT_INCLUDE',
        },

        message: {
          text:
            'Hello',
        },
      });

    assert.equal(
      result.text.includes(
        'DO_NOT_INCLUDE',
      ),
      false,
    );

    assert.equal(
      result.html.includes(
        'DO_NOT_INCLUDE',
      ),
      false,
    );
  },
);