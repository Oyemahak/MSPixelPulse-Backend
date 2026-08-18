import assert from 'node:assert/strict';
import test from 'node:test';

import {
  invoiceUploadInternals,
} from './invoice.controller.js';

test('invoice relay validates bounded content ranges', () => {
  assert.deepEqual(
    invoiceUploadInternals.uploadRange('bytes 0-1023/4096', 1024, 4096),
    { start: 0, end: 1023, total: 4096 },
  );
  assert.equal(
    invoiceUploadInternals.uploadRange('bytes 0-1024/4096', 1024, 4096),
    null,
  );
  assert.equal(
    invoiceUploadInternals.uploadRange('bytes 0-1023/9999', 1024, 4096),
    null,
  );
});

test('invoice relay keeps only supported metadata fields', () => {
  assert.deepEqual(
    invoiceUploadInternals.invoiceDetails({
      title: 'Invoice title',
      total: 1200,
      secret: 'discard-me',
    }),
    { title: 'Invoice title', total: 1200 },
  );
});
