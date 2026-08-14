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

test('message attachments must belong to the selected project', () => {
  const valid = normalizeMessageBody(
    {
      text: '',
      attachments: [{
        name: 'brief.pdf',
        type: 'application/pdf',
        size: 2048,
        path: 'projects/project-a/messages/2026/08/brief.pdf',
        url: 'https://example.test/signed',
      }],
    },
    { projectId: 'project-a' }
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.attachments.length, 1);
  assert.equal(valid.attachments[0].url, '');

  const crossProject = normalizeMessageBody(
    {
      attachments: [{
        name: 'brief.pdf',
        path: 'projects/project-b/messages/2026/08/brief.pdf',
      }],
    },
    { projectId: 'project-a' }
  );
  assert.equal(crossProject.ok, false);
});
