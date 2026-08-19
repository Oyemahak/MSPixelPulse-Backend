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

test('Drive resumable sessions are bound to the validated browser origin', () => {
  const headers = driveInternals.resumableUploadHeaders({
    accessToken: 'token',
    mimeType: 'application/pdf',
    size: 2048,
    origin: 'https://mspixelpulse.com',
  });

  assert.equal(headers.Origin, 'https://mspixelpulse.com');
  assert.equal(headers['X-Upload-Content-Type'], 'application/pdf');
  assert.equal(headers['X-Upload-Content-Length'], '2048');
});

test('server-side Drive resumable sessions do not invent a browser origin', () => {
  const headers = driveInternals.resumableUploadHeaders({
    accessToken: 'token',
    mimeType: 'text/plain',
    size: 8,
  });

  assert.equal('Origin' in headers, false);
});
