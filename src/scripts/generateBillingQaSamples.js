import fs from 'node:fs/promises';
import path from 'node:path';

import { generateInvoicePdf } from '../lib/invoicePdf.js';
import { generateReceiptPdf } from '../lib/receiptPdf.js';

const outputDirectory = path.resolve(process.cwd(), 'tmp/pdfs');
const sender = {
  businessName: 'MSPixelPulse',
  address: 'Toronto, Ontario, Canada',
  email: 'info@mspixelpulse.com',
  website: 'https://mspixelpulse.com',
};
const client = { businessName: 'Nexus Education Private School' };

await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(outputDirectory, { recursive: true });

const invoice = {
  invoiceNumber: 'MSP-2026-0001',
  status: 'partially_paid',
  title: 'Nexus Education Private School website services',
  projectTitle: 'Nexus Education Private School',
  issueDate: '2026-08-10T00:00:00.000Z',
  dueDate: null,
  currency: 'CAD',
  sender,
  clientDetails: client,
  lineItems: [{ description: 'Website engineering, content architecture, responsive QA, SEO structure', quantity: 1, unitPrice: 1000, amount: 1000 }],
  subtotal: 1000,
  chargeTax: false,
  taxAmount: 0,
  total: 1000,
  amountPaid: 500,
  balanceDue: 500,
  notes: 'Professional website services for Nexus Education Private School.',
  pageSize: 'LETTER',
};

const receipt = {
  receiptNumber: 'MSP-RCT-2026-000003',
  receiptType: 'consolidated',
  invoiceNumber: 'MSP-2026-0001',
  invoiceNumbers: ['MSP-2026-0001', 'MSP-2026-0002'],
  paymentId: 'MSP-SUM-2026-000003',
  paymentIds: ['MSP-PAY-2026-000001', 'MSP-PAY-2026-000002'],
  paymentDate: null,
  receiptDate: '2026-08-22T12:00:00.000Z',
  issuedAt: '2026-08-22T12:00:00.000Z',
  amount: 1000,
  currency: 'CAD',
  method: 'Interac e-Transfer',
  paymentReference: '',
  hidePaymentMethod: true,
  senderSnapshot: sender,
  clientSnapshot: client,
  projectTitleSnapshot: 'Nexus Education Private School',
  serviceDescriptionSnapshot: 'Website engineering, content architecture, responsive QA, SEO structure',
  invoiceTotalSnapshot: 2000,
  previouslyPaidSnapshot: 0,
  paymentAmountSnapshot: 1000,
  totalPaidSnapshot: 1000,
  balanceRemainingSnapshot: 1000,
  taxApplied: false,
  taxAmount: 0,
  status: 'issued',
};

await Promise.all([
  fs.writeFile(path.join(outputDirectory, 'nexus-invoice.pdf'), await generateInvoicePdf(invoice)),
  fs.writeFile(path.join(outputDirectory, 'nexus-consolidated-receipt.pdf'), await generateReceiptPdf(receipt)),
]);

console.log(`Generated invoice and consolidated receipt QA samples in ${outputDirectory}`);
