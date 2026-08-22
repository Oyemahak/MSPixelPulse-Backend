import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GMAIL_LABELS,
  desiredFilters,
  filterMatches,
  managedFilterQuery,
} from './setupGmailNotificationLabels.js';

test('Gmail setup maps every operational category to a nested MSPixelPulse label', () => {
  assert.equal(GMAIL_LABELS.length, 10);
  assert.ok(GMAIL_LABELS.every(([, label]) => label.startsWith('MSPixelPulse/')));
  assert.equal(managedFilterQuery('BILLING'), 'to:(mspixelpulse@gmail.com) subject:"[MSP:BILLING]"');
});

test('Gmail desired filters apply category label and skip Inbox', () => {
  const ids = new Map(GMAIL_LABELS.map(([, label], index) => [label, `Label_${index}`]));
  const filters = desiredFilters(ids);
  assert.equal(filters.length, 10);
  assert.deepEqual(filters[0].action.removeLabelIds, ['INBOX']);
  assert.equal(filters[0].action.addLabelIds.length, 1);
});

test('Gmail filter comparison is idempotent and detects drift', () => {
  const desired = {
    criteria: { query: managedFilterQuery('PROJECT') },
    action: { addLabelIds: ['Label_1'], removeLabelIds: ['INBOX'] },
  };
  assert.equal(filterMatches(structuredClone(desired), desired), true);
  assert.equal(filterMatches({ ...structuredClone(desired), action: { addLabelIds: ['Label_2'], removeLabelIds: ['INBOX'] } }, desired), false);
});
