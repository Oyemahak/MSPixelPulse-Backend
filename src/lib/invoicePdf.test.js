import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

import { generateInvoicePdf, invoicePdfInternals } from './invoicePdf.js';

test('generated production invoice is a valid one-page PDF', async () => {
  const bytes = await generateInvoicePdf({
    invoiceNumber: 'MSP-2026-0001',
    status: 'partially_paid',
    issueDate: '2026-08-10T00:00:00.000Z',
    currency: 'CAD',
    projectTitle: 'Nexus Education Private School',
    sender: { businessName: 'MSPixelPulse', address: 'Toronto, Ontario, Canada' },
    clientDetails: { businessName: 'Nexus Education Private School' },
    lineItems: [{ description: 'Website design and development', quantity: 1, unitPrice: 1000, amount: 1000 }],
    subtotal: 1000, total: 1000, amountPaid: 500, balanceDue: 500,
    chargeTax: false,
  });
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  assert.ok(bytes.length > 1500);
});

test('invoice money and date helpers use stable Canadian formatting', () => {
  assert.equal(invoicePdfInternals.formatMoney(1000, 'CAD'), '$1,000.00');
  assert.match(invoicePdfInternals.formatDate('2026-08-25T00:00:00.000Z'), /Aug/);
  assert.equal(invoicePdfInternals.formatDate(null), '');
});
