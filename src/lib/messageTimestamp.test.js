// src/lib/messageTimestamp.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  messageTimestampFrom,
  normalizeMessageTimestamp,
  timestampFromObjectId,
  withCanonicalMessageTimestamp,
} from './messageTimestamp.js';

test(
  'normalizes ISO timestamps',
  () => {
    assert.equal(
      normalizeMessageTimestamp(
        '2026-08-16T20:00:00.000Z',
      ),
      '2026-08-16T20:00:00.000Z',
    );
  },
);

test(
  'normalizes Date objects',
  () => {
    assert.equal(
      normalizeMessageTimestamp(
        new Date(
          '2026-08-16T20:00:00.000Z',
        ),
      ),
      '2026-08-16T20:00:00.000Z',
    );
  },
);

test(
  'supports Unix seconds',
  () => {
    const seconds =
      1786910400;

    assert.equal(
      normalizeMessageTimestamp(
        seconds,
      ),
      new Date(
        seconds * 1000,
      ).toISOString(),
    );
  },
);

test(
  'malformed timestamps safely return null',
  () => {
    assert.equal(
      normalizeMessageTimestamp(
        'not-a-date',
      ),
      null,
    );

    assert.equal(
      normalizeMessageTimestamp(
        '',
      ),
      null,
    );

    assert.equal(
      normalizeMessageTimestamp(
        null,
      ),
      null,
    );
  },
);

test(
  'message timestamp prefers sentAt',
  () => {
    assert.equal(
      messageTimestampFrom({
        sentAt:
          '2026-08-16T20:00:00.000Z',

        createdAt:
          '2026-08-16T19:00:00.000Z',
      }),
      '2026-08-16T20:00:00.000Z',
    );
  },
);

test(
  'message timestamp falls back to createdAt',
  () => {
    assert.equal(
      messageTimestampFrom({
        sentAt:
          'invalid',

        createdAt:
          '2026-08-16T19:00:00.000Z',
      }),
      '2026-08-16T19:00:00.000Z',
    );
  },
);

test(
  'recovers a factual creation time from legacy Mongo ObjectIds',
  () => {
    assert.equal(
      timestampFromObjectId(
        '6a7f4b88c8a17a19595292f0',
      ),
      '2026-08-14T17:08:24.000Z',
    );

    assert.equal(
      messageTimestampFrom({
        _id:
          '6a7f4b88c8a17a19595292f0',

        sentAt: {},
        createdAt: {},
      }),
      '2026-08-14T17:08:24.000Z',
    );

    assert.equal(
      timestampFromObjectId(
        'd02cea4b-71a6-4f76-ac90-095fe95b5fa5',
      ),
      null,
    );
  },
);

test(
  'missing historical timestamps return null',
  () => {
    assert.equal(
      messageTimestampFrom({}),
      null,
    );
  },
);

test(
  'new message receives canonical current timestamp',
  () => {
    const record =
      withCanonicalMessageTimestamp(
        {
          text:
            'hello',
        },
        {
          createIfMissing:
            true,
        },
      );

    assert.equal(
      typeof record.sentAt,
      'string',
    );

    assert.equal(
      Number.isNaN(
        new Date(
          record.sentAt,
        ).getTime(),
      ),
      false,
    );
  },
);

test(
  'historical record does not invent time unless requested',
  () => {
    const record =
      withCanonicalMessageTimestamp({
        text:
          'legacy',
      });

    assert.equal(
      record.sentAt,
      null,
    );
  },
);
