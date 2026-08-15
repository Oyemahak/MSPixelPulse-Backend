import test from 'node:test';
import assert from 'node:assert/strict';
import { driveInternals } from './drive.js';

test('Google Drive multipart media converts buffers into readable streams', async () => {
  const chunks = [];
  const stream = driveInternals.mediaBody(Buffer.from('phase1'));
  assert.equal(typeof stream.pipe, 'function');
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  assert.equal(Buffer.concat(chunks).toString('utf8'), 'phase1');
});
