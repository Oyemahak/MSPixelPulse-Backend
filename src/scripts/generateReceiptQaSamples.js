import fs from 'node:fs/promises';
import path from 'node:path';

import { generateReceiptPdf } from '../lib/receiptPdf.js';

const outputDirectory = path.resolve(process.cwd(), 'tmp/pdfs');

const baseReceipt = {
  receiptNumber: 'MSP-RCT-2026-000001',
  invoiceNumber: 'MSP-2026-0001',
  paymentId: 'MSP-PAY-2026-000001',
  paymentDate: '2026-08-22T12:00:00.000Z',
  receiptDate: '2026-08-22T12:00:00.000Z',
  issuedAt: '2026-08-22T12:00:00.000Z',
  amount: 2_500,
  currency: 'CAD',
  method: 'Interac e-Transfer',
  paymentReference: 'MSP-DEMO-REFERENCE-001',
  paymentStage: 'full',
  senderSnapshot: {
    businessName: 'MSPixelPulse',
    address: 'Toronto, Ontario, Canada',
    email: 'info@mspixelpulse.com',
    website: 'https://mspixelpulse.com',
  },
  clientSnapshot: {
    businessName: 'Example Client Inc.',
    contactName: 'Jordan Example',
    address: '100 Example Street, Toronto, Ontario, Canada',
    email: 'accounts@example-client.test',
  },
  projectTitleSnapshot: 'Responsive website design and development',
  serviceDescriptionSnapshot: 'UX strategy, responsive interface design, application development, testing, and production deployment.',
  invoiceTotalSnapshot: 2_500,
  previouslyPaidSnapshot: 0,
  paymentAmountSnapshot: 2_500,
  totalPaidSnapshot: 2_500,
  balanceRemainingSnapshot: 0,
  taxApplied: false,
  taxLabel: '',
  taxRate: 0,
  taxAmount: 0,
  taxRegistrationNumber: '',
  status: 'issued',
};

const samples = [
  ['01-full-payment-letter', {}, 'LETTER'],
  ['02-fifty-percent-deposit', {
    receiptNumber: 'MSP-RCT-2026-000002', paymentId: 'MSP-PAY-2026-000002', paymentStage: 'deposit',
    amount: 1_250, paymentAmountSnapshot: 1_250, totalPaidSnapshot: 1_250, balanceRemainingSnapshot: 1_250,
  }, 'LETTER'],
  ['03-final-balance', {
    receiptNumber: 'MSP-RCT-2026-000003', paymentId: 'MSP-PAY-2026-000003', paymentStage: 'final',
    amount: 1_250, previouslyPaidSnapshot: 1_250, paymentAmountSnapshot: 1_250, totalPaidSnapshot: 2_500, balanceRemainingSnapshot: 0,
  }, 'LETTER'],
  ['04-tax-disabled', {
    receiptNumber: 'MSP-RCT-2026-000004', paymentId: 'MSP-PAY-2026-000004', taxApplied: false,
  }, 'LETTER'],
  ['05-tax-enabled', {
    receiptNumber: 'MSP-RCT-2026-000005', paymentId: 'MSP-PAY-2026-000005',
    invoiceTotalSnapshot: 2_825, amount: 2_825, paymentAmountSnapshot: 2_825, totalPaidSnapshot: 2_825,
    taxApplied: true, taxLabel: 'HST', taxRate: 13, taxAmount: 325, taxRegistrationNumber: 'DEMO-REGISTRATION-NOT-A-REAL-NUMBER',
  }, 'LETTER'],
  ['06-long-business-name', {
    receiptNumber: 'MSP-RCT-2026-000006', paymentId: 'MSP-PAY-2026-000006',
    clientSnapshot: { ...baseReceipt.clientSnapshot, businessName: 'Example Canadian Professional Services and Digital Operations Incorporated' },
  }, 'LETTER'],
  ['07-long-address', {
    receiptNumber: 'MSP-RCT-2026-000007', paymentId: 'MSP-PAY-2026-000007',
    clientSnapshot: { ...baseReceipt.clientSnapshot, address: '12345 Very Long Example Business Address, Building C, Suite 900, Toronto, Ontario, Canada M5V 3A8' },
  }, 'LETTER'],
  ['08-payment-reference', {
    receiptNumber: 'MSP-RCT-2026-000008', paymentId: 'MSP-PAY-2026-000008',
    paymentReference: 'BANK-TRANSFER-CONFIRMATION-2026-08-22-EXAMPLE-938475', method: 'Bank transfer',
  }, 'LETTER'],
  ['09-letter-page', {
    receiptNumber: 'MSP-RCT-2026-000009', paymentId: 'MSP-PAY-2026-000009',
  }, 'LETTER'],
  ['10-a4-page', {
    receiptNumber: 'MSP-RCT-2026-000010', paymentId: 'MSP-PAY-2026-000010',
  }, 'A4'],
];

await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(outputDirectory, { recursive: true });

for (const [name, overrides, pageSize] of samples) {
  const receipt = {
    ...baseReceipt,
    ...overrides,
    senderSnapshot: overrides.senderSnapshot || baseReceipt.senderSnapshot,
    clientSnapshot: overrides.clientSnapshot || baseReceipt.clientSnapshot,
  };
  const pdf = await generateReceiptPdf(receipt, { pageSize });
  await fs.writeFile(path.join(outputDirectory, `${name}.pdf`), pdf);
}

console.log(`Generated ${samples.length} one-page receipt samples in ${outputDirectory}`);
