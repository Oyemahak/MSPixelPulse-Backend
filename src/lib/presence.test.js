// src/lib/presence.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRESENCE_ONLINE_WINDOW_MS,
  isUserOnline,
  normalizePresenceTimestamp,
  presentPresence,
} from './presence.js';

const NOW =
  new Date(
    '2026-08-16T22:00:00.000Z',
  );

test(
  'presence timestamp normalizes Date objects',
  () => {
    assert.equal(
      normalizePresenceTimestamp(
        new Date(
          '2026-08-16T21:59:00.000Z',
        ),
      ),
      '2026-08-16T21:59:00.000Z',
    );
  },
);

test(
  'presence timestamp normalizes ISO strings',
  () => {
    assert.equal(
      normalizePresenceTimestamp(
        '2026-08-16T21:59:00.000Z',
      ),
      '2026-08-16T21:59:00.000Z',
    );
  },
);

test(
  'presence timestamp safely rejects malformed values',
  () => {
    assert.equal(
      normalizePresenceTimestamp(
        'definitely-not-a-date',
      ),
      null,
    );

    assert.equal(
      normalizePresenceTimestamp(
        '',
      ),
      null,
    );

    assert.equal(
      normalizePresenceTimestamp(
        null,
      ),
      null,
    );
  },
);

test(
  'recent presence is online',
  () => {
    assert.equal(
      isUserOnline(
        {
          lastSeenAt:
            new Date(
              NOW.getTime() -
                30_000,
            ).toISOString(),
        },
        NOW,
      ),
      true,
    );
  },
);

test(
  'presence older than online window is offline',
  () => {
    assert.equal(
      isUserOnline(
        {
          lastSeenAt:
            new Date(
              NOW.getTime() -
                PRESENCE_ONLINE_WINDOW_MS -
                1,
            ).toISOString(),
        },
        NOW,
      ),
      false,
    );
  },
);

test(
  'presence exactly at online boundary is online',
  () => {
    assert.equal(
      isUserOnline(
        {
          lastSeenAt:
            new Date(
              NOW.getTime() -
                PRESENCE_ONLINE_WINDOW_MS,
            ).toISOString(),
        },
        NOW,
      ),
      true,
    );
  },
);

test(
  'missing and invalid presence is safely offline',
  () => {
    assert.equal(
      isUserOnline(
        null,
        NOW,
      ),
      false,
    );

    assert.equal(
      isUserOnline(
        {
          lastSeenAt:
            'invalid',
        },
        NOW,
      ),
      false,
    );
  },
);

test(
  'presentPresence returns normalized durable shape',
  () => {
    assert.deepEqual(
      presentPresence(
        {
          lastSeenAt:
            '2026-08-16T21:59:30.000Z',
        },
        NOW,
      ),
      {
        online: true,
        state:
          'online',
        lastSeenAt:
          '2026-08-16T21:59:30.000Z',
        lastActivityAt:
          '2026-08-16T21:59:30.000Z',
      },
    );

    assert.deepEqual(
      presentPresence(
        {
          lastSeenAt:
            'invalid',
        },
        NOW,
      ),
      {
        online: false,
        state:
          'offline',
        lastSeenAt:
          null,
        lastActivityAt:
          null,
      },
    );

    assert.deepEqual(
      presentPresence(
        {
          lastActivityAt:
            '2026-08-16T21:59:30.000Z',
          presenceState:
            'offline',
        },
        NOW,
      ),
      {
        online: false,
        state:
          'offline',
        lastSeenAt:
          '2026-08-16T21:59:30.000Z',
        lastActivityAt:
          '2026-08-16T21:59:30.000Z',
      },
    );
  },
);

test(
  'numeric Unix timestamps are supported',
  () => {
    assert.equal(
      normalizePresenceTimestamp(
        1786917600,
      ),
      new Date(
        1786917600 * 1000,
      ).toISOString(),
    );
  },
);
