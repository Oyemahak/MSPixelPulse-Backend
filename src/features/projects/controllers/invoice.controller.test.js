import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getInvoiceSettings,
  invoiceUploadInternals,
  updateInvoiceSettings,
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

test('invoice metadata accepts payment workflow fields and discards unknown fields', () => {
  assert.deepEqual(
    invoiceUploadInternals.invoiceDetails({
      paymentStage: 'custom',
      paymentPercent: 25,
      projectValue: 2000,
      paymentTermsPreset: 'net_7',
      paymentMethods: [{ key: 'interac', label: 'Interac e-Transfer', enabled: true }],
      privateBankingSecret: 'discard-me',
    }),
    {
      paymentStage: 'custom',
      paymentPercent: 25,
      projectValue: 2000,
      paymentTermsPreset: 'net_7',
      paymentMethods: [{ key: 'interac', label: 'Interac e-Transfer', enabled: true, instructions: '' }],
    },
  );
});

test('legacy invoice kinds map safely to the expanded payment stages', () => {
  assert.equal(invoiceUploadInternals.normalizePaymentStage('', 'advance'), 'advance');
  assert.equal(invoiceUploadInternals.normalizePaymentStage('', 'final'), 'remaining');
  assert.equal(invoiceUploadInternals.normalizePaymentStage('', 'other'), 'other');
  assert.equal(invoiceUploadInternals.legacyKindForStage('remaining'), 'final');
  assert.equal(invoiceUploadInternals.legacyKindForStage('full'), 'other');
});

test('invoice terms presets and payment methods are strictly normalized', () => {
  assert.equal(invoiceUploadInternals.normalizePaymentTermsPreset('net_30'), 'net_30');
  assert.equal(invoiceUploadInternals.normalizePaymentTermsPreset('unsafe'), 'custom');
  assert.deepEqual(
    invoiceUploadInternals.normalizePaymentMethods([
      { key: 'bank', label: 'Bank transfer', enabled: true, instructions: 'Configured privately by Admin' },
      { key: 'bank', label: 'Duplicate', enabled: true },
      { key: 'unsupported', label: 'Alternate', enabled: false },
    ]),
    [
      { key: 'bank', label: 'Bank transfer', enabled: true, instructions: 'Configured privately by Admin' },
      { key: 'other', label: 'Alternate', enabled: false, instructions: '' },
    ],
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
  assert.equal(settings.defaultPaymentTermsPreset, 'net_14');
  assert.equal(settings.paymentMethods.every((method) => method.enabled === false), true);
  assert.match(settings.scopeTerms, /agreed project scope/i);
});

test('invoice settings endpoints reject non-admin roles before reading or writing storage', async () => {
  for (const handler of [getInvoiceSettings, updateInvoiceSettings]) {
    let statusCode = 200;
    let payload;
    const response = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(value) {
        payload = value;
        return this;
      },
    };

    await handler({ user: { role: 'client' }, body: {} }, response, (error) => {
      throw error;
    });
    assert.equal(statusCode, 403);
    assert.deepEqual(payload, { error: 'Admin only' });
  }
});
