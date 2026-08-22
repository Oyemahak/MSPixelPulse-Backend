import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

import { generateReceiptPdf, receiptPdfInternals } from './receiptPdf.js';

function receipt(overrides = {}) {
  return {
    receiptNumber: 'MSP-RCT-2026-000001', invoiceNumber: 'MSP-2026-0001', paymentId: 'MSP-PAY-2026-000001',
    paymentDate: '2026-08-22T12:00:00.000Z', receiptDate: '2026-08-22T12:00:00.000Z', issuedAt: '2026-08-22T12:00:00.000Z',
    amount: 1250, currency: 'CAD', method: 'Interac e-Transfer', paymentReference: 'REFERENCE-123', paymentStage: 'advance',
    senderSnapshot: { businessName: 'MSPixelPulse', address: 'Toronto, Ontario, Canada', email: 'info@mspixelpulse.com', website: 'https://mspixelpulse.com' },
    clientSnapshot: { businessName: 'Example Client Inc.', contactName: 'Example Contact', address: '100 Example Street, Toronto, Ontario, Canada', email: 'client@example.com' },
    projectTitleSnapshot: 'Professional website design and development', serviceDescriptionSnapshot: 'UX strategy, responsive interface design, application development, testing, and production deployment',
    invoiceTotalSnapshot: 2500, previouslyPaidSnapshot: 0, paymentAmountSnapshot: 1250, totalPaidSnapshot: 1250, balanceRemainingSnapshot: 1250,
    taxApplied: false, taxLabel: '', taxRate: 0, taxAmount: 0, taxRegistrationNumber: '', status: 'issued',
    ...overrides,
  };
}

for (const pageSize of ['LETTER', 'A4']) {
  test(`normal ${pageSize} receipt is a valid one-page PDF`, async () => {
    const bytes = await generateReceiptPdf(receipt(), { pageSize });
    assert.ok(bytes.length > 3000);
    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPageCount(), 1);
  });
}

test('long names, addresses, tax details, and void state stay on one page', async () => {
  const bytes = await generateReceiptPdf(receipt({
    clientSnapshot: {
      businessName: 'Example Canadian Professional Services and Digital Operations Incorporated',
      contactName: 'Alexandra Example-Surname',
      address: '12345 Very Long Business Address, Suite 900, Toronto, Ontario, Canada M5V 3A8',
      email: 'accounts-payable-and-finance@example-professional-services.ca',
    },
    projectTitleSnapshot: 'A very long project name covering a multi-phase responsive website, secure client portal, content migration, integrations, and production support',
    taxApplied: true, taxLabel: 'HST', taxRate: 13, taxAmount: 143.81, taxRegistrationNumber: 'CONFIGURED-ONLY-FOR-TEST',
    status: 'void', voidReason: 'Duplicate bank transaction entry reversed after reconciliation.',
  }));
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
});

test('receipt money and date formatting is stable for Canadian records', () => {
  assert.equal(receiptPdfInternals.formatMoney(1250, 'CAD'), '$1,250.00');
  assert.match(receiptPdfInternals.formatDate('2026-08-22T00:00:00.000Z'), /Aug/);
});
