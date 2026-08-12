import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedMessageLimit, normalizeMessageBody } from './messagePolicy.js';

test('message text is required and bounded', () => {
  assert.equal(normalizeMessageBody({ text: '   ' }).ok, false);
  assert.equal(normalizeMessageBody({ text: 'hello' }).text, 'hello');
  assert.equal(normalizeMessageBody({ text: 'a'.repeat(5000) }).text.length, 4000);
});

test('message pagination cannot exceed 100 rows', () => {
  assert.equal(boundedMessageLimit('999'), 100);
  assert.equal(boundedMessageLimit('-2'), 1);
});

