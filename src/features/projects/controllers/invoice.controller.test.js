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

test('invoice totals are calculated from line items, discount, tax, and payments', () => {
  assert.deepEqual(
    invoiceUploadInternals.calculateInvoiceTotals({
      lineItems: [
        { description: 'Design', quantity: 2, unitPrice: 500, amount: 1000 },
        { description: 'Hosting setup', quantity: 1, unitPrice: 200, amount: 200 },
      ],
      discountAmount: 100,
      chargeTax: true,
      taxRate: 13,
      payments: [
        { amount: 500, method: 'Interac e-Transfer' },
      ],
    }),
    {
      lineItems: [
        { description: 'Design', quantity: 2, unitPrice: 500, amount: 1000 },
        { description: 'Hosting setup', quantity: 1, unitPrice: 200, amount: 200 },
      ],
      subtotal: 1200,
      discountAmount: 100,
      chargeTax: true,
      taxRate: 13,
      taxAmount: 143,
      total: 1243,
      payments: [
        { amount: 500, method: 'Interac e-Transfer' },
      ],
      amountPaid: 500,
      balanceDue: 743,
    },
  );
});

test('invoice status follows payments without overriding explicit cancellation', () => {
  assert.equal(
    invoiceUploadInternals.automaticStatus({
      total: 1000,
      amountPaid: 250,
      fallback: 'sent',
    }),
    'partially_paid',
  );
  assert.equal(
    invoiceUploadInternals.automaticStatus({
      requested: 'cancelled',
      total: 1000,
      amountPaid: 1000,
      fallback: 'sent',
    }),
    'cancelled',
  );
});

test('invoice settings keep tax optional and do not copy sample tax claims', () => {
  const settings = invoiceUploadInternals.normalizeInvoiceSettings({
    sender: { businessName: 'MSPixelPulse' },
    chargeTax: false,
    taxRate: 13,
  });

  assert.equal(settings.sender.businessName, 'MSPixelPulse');
  assert.equal(settings.chargeTax, false);
  assert.equal(settings.taxRate, 13);
  assert.equal(settings.taxNote, '');
});
