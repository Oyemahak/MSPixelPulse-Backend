import assert from 'node:assert/strict';
import test from 'node:test';

import {
  openInvoiceUploadToken,
  sealInvoiceUploadToken,
} from './invoiceUploadToken.js';

test('invoice upload relay token round-trips encrypted claims', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-invoice-upload-secret';

  try {
    const token = sealInvoiceUploadToken(
      { projectId: 'project-1', uploadUrl: 'https://upload.example/private' },
      { now: 1_000, ttlMs: 5_000 },
    );
    const claims = openInvoiceUploadToken(token, { now: 2_000 });

    assert.equal(claims.projectId, 'project-1');
    assert.equal(claims.uploadUrl, 'https://upload.example/private');
    assert.equal(token.includes('upload.example'), false);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test('invoice upload relay token rejects tampering and expiry', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-invoice-upload-secret';

  try {
    const token = sealInvoiceUploadToken(
      { projectId: 'project-1' },
      { now: 1_000, ttlMs: 1_000 },
    );

    assert.throws(
      () => openInvoiceUploadToken(`${token}x`, { now: 1_500 }),
      { code: 'INVOICE_UPLOAD_TOKEN_INVALID' },
    );
    assert.throws(
      () => openInvoiceUploadToken(token, { now: 2_001 }),
      { code: 'INVOICE_UPLOAD_TOKEN_INVALID' },
    );
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
