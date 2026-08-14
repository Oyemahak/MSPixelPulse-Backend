import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableGoogleError, withGoogleRetry } from './retry.js';

test('Google retry only retries rate-limit and transient server failures', () => {
  assert.equal(isRetryableGoogleError({ code: 429 }), true);
  assert.equal(isRetryableGoogleError({ response: { status: 503 } }), true);
  assert.equal(isRetryableGoogleError({ code: 400 }), false);
});

test('Google retry retries then returns the successful operation result', async () => {
  let attempts = 0;
  const delays = [];
  const result = await withGoogleRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error('temporary');
      error.code = 503;
      throw error;
    }
    return 'ok';
  }, { baseDelayMs: 1, sleep: async (delay) => delays.push(delay) });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.equal(delays.length, 2);
});

