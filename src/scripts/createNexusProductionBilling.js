import 'dotenv/config';
import crypto from 'node:crypto';

import { dataProviderName, storageProviderName } from '../config/providers.js';
import Invoice from '../models/Invoice.js';
import Project from '../models/Project.js';
import Receipt from '../models/Receipt.js';
import User from '../models/User.js';
import { allocateGoogleSequence } from '../google/sheets.js';
import { emitPortalEvent } from '../lib/portalEvents.js';
import { generateInvoicePdf } from '../lib/invoicePdf.js';
import { generateReceiptPdf } from '../lib/receiptPdf.js';
import { putObject } from '../lib/storage.js';

const CONFIRMATION_FLAG = '--confirm-production';
const PROJECT_TITLE = 'Nexus Education Private School';
const CLIENT_NAME = 'Nexus Education Private School';
const CURRENCY = 'CAD';
const INVOICE_AMOUNT = 1_000;
const PAYMENT_AMOUNT = 500;
const RECEIPT_TOTAL = 1_000;
const PAYMENT_METHOD = 'Interac e-Transfer';
const RECEIPT_IDEMPOTENCY_KEY = 'nexus-education-2026-consolidated-receipt-v1';
const TARGETS = [
  { issueDate: '2026-08-10T00:00:00.000Z', marker: 'NEXUS-2026-08-10-CAD-1000' },
  { issueDate: '2026-08-25T00:00:00.000Z', marker: 'NEXUS-2026-08-25-CAD-1000' },
];

function idOf(value) {
  return String(value?._id || value?.id || value || '');
}

function identifier(prefix, sequence) {
  return `${prefix}-${new Date().getUTCFullYear()}-${String(sequence).padStart(6, '0')}`;
}

function dateKey(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function invoiceMarker(marker) {
  return `[billing-id:${marker}]`;
}

function nextInvoiceNumbers(existingNumbers, count) {
  const prefix = `MSP-${new Date().getUTCFullYear()}-`;
  const used = new Set(existingNumbers.filter(Boolean));
  let sequence = existingNumbers.reduce((highest, value) => {
    if (!String(value).startsWith(prefix)) return highest;
    const numeric = Number(String(value).slice(prefix.length));
    return Number.isSafeInteger(numeric) ? Math.max(highest, numeric) : highest;
  }, 0);
  const output = [];
  while (output.length < count) {
    sequence += 1;
    const candidate = `${prefix}${String(sequence).padStart(4, '0')}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      output.push(candidate);
    }
  }
  return output;
}

function serviceDescription(project) {
  const verifiedServices = Array.isArray(project.services)
    ? project.services.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  return verifiedServices.length
    ? verifiedServices.join(', ')
    : `${PROJECT_TITLE} website services`;
}

function sellerSnapshot() {
  return {
    businessName: 'MSPixelPulse',
    address: 'Toronto, Ontario, Canada',
    email: 'info@mspixelpulse.com',
    website: 'https://mspixelpulse.com',
  };
}

function assertInvoice(invoice, target) {
  if (idOf(invoice.project) === '' || dateKey(invoice.issueDate) !== dateKey(target.issueDate)) {
    throw new Error(`Existing ${target.marker} invoice has an unexpected project or issue date`);
  }
  if (Number(invoice.total || 0) !== INVOICE_AMOUNT || String(invoice.currency || '').toUpperCase() !== CURRENCY) {
    throw new Error(`Existing ${target.marker} invoice has an unexpected amount or currency`);
  }
  if (invoice.chargeTax || Number(invoice.taxAmount || 0) !== 0) {
    throw new Error(`Existing ${target.marker} invoice unexpectedly contains tax`);
  }
}

async function findOrCreateInvoices(project) {
  const projectInvoices = await Invoice.find({ project: project._id }).lean();
  const allInvoices = await Invoice.find({}).select('invoiceNumber').lean();
  const numbers = nextInvoiceNumbers(allInvoices.map((invoice) => invoice.invoiceNumber), TARGETS.length);
  const resolved = [];

  for (const [index, target] of TARGETS.entries()) {
    const marker = invoiceMarker(target.marker);
    const byMarker = projectInvoices.filter((invoice) => String(invoice.internalNotes || '').includes(marker));
    const byFacts = projectInvoices.filter((invoice) =>
      dateKey(invoice.issueDate) === dateKey(target.issueDate)
      && Number(invoice.total || 0) === INVOICE_AMOUNT
      && String(invoice.currency || '').toUpperCase() === CURRENCY,
    );
    const candidates = [...new Map([...byMarker, ...byFacts].map((invoice) => [idOf(invoice), invoice])).values()];
    if (candidates.length > 1) throw new Error(`Duplicate Nexus invoice candidates exist for ${dateKey(target.issueDate)}`);

    let invoice = candidates[0] ? await Invoice.findById(idOf(candidates[0])) : null;
    if (invoice) {
      assertInvoice(invoice, target);
      if (!String(invoice.internalNotes || '').includes(marker)) {
        invoice.internalNotes = [invoice.internalNotes, marker].filter(Boolean).join('\n');
        await invoice.save();
      }
      resolved.push(invoice);
      continue;
    }

    const description = serviceDescription(project);
    invoice = await Invoice.create({
      project: project._id,
      client: project.client || null,
      kind: 'other',
      paymentStage: 'custom',
      paymentPercent: 50,
      projectValue: INVOICE_AMOUNT * TARGETS.length,
      paymentTermsPreset: 'custom',
      sourceType: 'generated',
      status: 'sent',
      invoiceNumber: numbers[index],
      title: `${PROJECT_TITLE} website services`,
      issueDate: new Date(target.issueDate),
      dueDate: null,
      currency: CURRENCY,
      lineItems: [{ description, quantity: 1, unitPrice: INVOICE_AMOUNT, amount: INVOICE_AMOUNT }],
      sender: sellerSnapshot(),
      clientDetails: { businessName: CLIENT_NAME },
      subtotal: INVOICE_AMOUNT,
      discountAmount: 0,
      chargeTax: false,
      taxLabel: '',
      taxRate: 0,
      taxAmount: 0,
      taxRegistrationNumber: '',
      total: INVOICE_AMOUNT,
      amountPaid: 0,
      balanceDue: INVOICE_AMOUNT,
      payments: [],
      paymentTerms: '',
      paymentNotice: '',
      paymentReference: '',
      paymentMethods: [],
      notes: 'Professional website services for Nexus Education Private School.',
      internalNotes: marker,
      pageSize: 'LETTER',
      isDemo: false,
      sentAt: null,
    });
    resolved.push(invoice);
  }

  return resolved;
}

async function reconcileInvoice(invoice, payment, receiptId) {
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const existing = payments.find((item) => item.idempotencyKey === payment.idempotencyKey);
  if (existing && (Number(existing.amount) !== PAYMENT_AMOUNT || existing.method !== PAYMENT_METHOD)) {
    throw new Error(`Existing payment audit record conflicts for ${invoice.invoiceNumber}`);
  }
  if (!existing) {
    invoice.payments = [...payments, { ...payment, receipt: receiptId }];
  }
  const paid = invoice.payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  invoice.amountPaid = Math.round(paid * 100) / 100;
  invoice.balanceDue = Math.round(Math.max(Number(invoice.total || 0) - paid, 0) * 100) / 100;
  invoice.status = invoice.balanceDue <= 0.005 ? 'paid' : 'partially_paid';
  invoice.paidAt = invoice.status === 'paid' ? new Date() : null;
  await invoice.save();
}

async function createOrReconcileReceipt({ project, invoices, admin }) {
  let receipt = await Receipt.findOne({ idempotencyKey: RECEIPT_IDEMPOTENCY_KEY });
  if (receipt) {
    if (receipt.receiptType !== 'consolidated' || Number(receipt.amount || 0) !== RECEIPT_TOTAL) {
      throw new Error('Existing consolidated receipt conflicts with the requested Nexus total');
    }
    const breakdown = receipt.paymentBreakdown || [];
    if (breakdown.length !== 2 || breakdown.some((payment) => Number(payment.amount) !== PAYMENT_AMOUNT)) {
      throw new Error('Existing consolidated receipt does not preserve two CAD 500 payment records');
    }
    for (const [index, invoice] of invoices.entries()) {
      const payment = breakdown.find((item) => idOf(item.invoice) === idOf(invoice)) || breakdown[index];
      await reconcileInvoice(invoice, {
        paymentId: payment.paymentId,
        idempotencyKey: `${RECEIPT_IDEMPOTENCY_KEY}:payment-${index + 1}`,
        amount: PAYMENT_AMOUNT,
        date: null,
        method: PAYMENT_METHOD,
        reference: '',
        note: 'Payment date and transaction reference were not independently verified.',
        paymentStage: 'custom',
      }, idOf(receipt));
    }
    return receipt;
  }

  const paymentSequences = await Promise.all(TARGETS.map((target, index) => allocateGoogleSequence({
    kind: 'nexus-payment', reference: `${target.marker}:payment-${index + 1}`,
  })));
  const receiptSequence = await allocateGoogleSequence({
    kind: 'nexus-consolidated-receipt', reference: RECEIPT_IDEMPOTENCY_KEY,
  });
  const paymentIds = paymentSequences.map((sequence) => identifier('MSP-PAY', sequence));
  const receiptNumber = identifier('MSP-RCT', receiptSequence);
  const summaryPaymentId = identifier('MSP-SUM', receiptSequence);
  const receiptId = crypto.randomUUID();
  const now = new Date();
  const payments = invoices.map((invoice, index) => ({
    paymentId: paymentIds[index],
    invoice: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    amount: PAYMENT_AMOUNT,
    date: null,
    method: PAYMENT_METHOD,
    reference: '',
    note: 'Payment date and transaction reference were not independently verified.',
  }));
  const snapshot = {
    _id: receiptId,
    receiptNumber,
    receiptType: 'consolidated',
    invoice: invoices[0]._id,
    invoiceNumber: invoices[0].invoiceNumber,
    invoices: invoices.map((invoice) => invoice._id),
    invoiceNumbers: invoices.map((invoice) => invoice.invoiceNumber),
    project: project._id,
    client: project.client || null,
    paymentId: summaryPaymentId,
    paymentIds,
    paymentBreakdown: payments,
    idempotencyKey: RECEIPT_IDEMPOTENCY_KEY,
    paymentDate: null,
    receiptDate: now,
    amount: RECEIPT_TOTAL,
    currency: CURRENCY,
    method: PAYMENT_METHOD,
    paymentReference: '',
    paymentNote: 'Consolidated client document backed by two independently auditable CAD 500 payment records.',
    paymentStage: 'custom',
    hidePaymentMethod: true,
    senderSnapshot: sellerSnapshot(),
    clientSnapshot: { businessName: CLIENT_NAME },
    projectTitleSnapshot: project.title,
    serviceDescriptionSnapshot: serviceDescription(project),
    invoiceTotalSnapshot: INVOICE_AMOUNT * invoices.length,
    previouslyPaidSnapshot: 0,
    paymentAmountSnapshot: RECEIPT_TOTAL,
    totalPaidSnapshot: RECEIPT_TOTAL,
    balanceRemainingSnapshot: INVOICE_AMOUNT * invoices.length - RECEIPT_TOTAL,
    taxApplied: false,
    taxLabel: '',
    taxRate: 0,
    taxAmount: 0,
    taxRegistrationNumber: '',
    status: 'issued',
    issuedAt: now,
    createdBy: admin._id,
  };
  const pdf = await generateReceiptPdf(snapshot, { pageSize: 'LETTER' });
  const path = `projects/${idOf(project)}/receipts/2026/08/${receiptNumber}.pdf`;
  const stored = await putObject({
    path,
    buffer: pdf,
    contentType: 'application/pdf',
    metadata: {
      projectId: idOf(project), clientId: idOf(project.client), userId: idOf(admin), uploadedBy: idOf(admin),
      category: 'receipt', originalName: `${receiptNumber}.pdf`, isPublic: false,
    },
  });
  snapshot.file = { name: `${receiptNumber}.pdf`, type: 'application/pdf', size: pdf.length, path, url: stored.url };
  receipt = await Receipt.create(snapshot);

  for (const [index, invoice] of invoices.entries()) {
    await reconcileInvoice(invoice, {
      paymentId: paymentIds[index],
      idempotencyKey: `${RECEIPT_IDEMPOTENCY_KEY}:payment-${index + 1}`,
      amount: PAYMENT_AMOUNT,
      date: null,
      method: PAYMENT_METHOD,
      reference: '',
      note: 'Payment date and transaction reference were not independently verified.',
      paymentStage: 'custom',
    }, idOf(receipt));
  }
  return receipt;
}

async function refreshInvoiceFiles({ project, invoices, admin }) {
  for (const invoice of invoices) {
    const current = await Invoice.findById(idOf(invoice));
    const pdf = await generateInvoicePdf({
      ...current.toObject(),
      projectTitle: project.title,
    }, { pageSize: current.pageSize || 'LETTER' });
    const path = `projects/${idOf(project)}/invoices/2026/08/${current.invoiceNumber}.pdf`;
    const stored = await putObject({
      path,
      buffer: pdf,
      contentType: 'application/pdf',
      metadata: {
        projectId: idOf(project), clientId: idOf(project.client), userId: idOf(admin), uploadedBy: idOf(admin),
        category: 'invoice', originalName: `${current.invoiceNumber}.pdf`, isPublic: false,
      },
    });
    current.file = { name: `${current.invoiceNumber}.pdf`, type: 'application/pdf', size: pdf.length, path, url: stored.url };
    await current.save();
  }
}

async function run() {
  if (!process.argv.includes(CONFIRMATION_FLAG)) throw new Error(`Production billing creation requires ${CONFIRMATION_FLAG}`);
  if (dataProviderName() !== 'google' || storageProviderName() !== 'google-drive') {
    throw new Error('Production Nexus billing requires Google Sheets and Google Drive providers');
  }

  const projects = await Project.find({ title: PROJECT_TITLE });
  if (projects.length !== 1) throw new Error(`Expected exactly one project titled ${PROJECT_TITLE}; found ${projects.length}`);
  const project = projects[0];
  if (String(project.clientName || '').trim() !== CLIENT_NAME) throw new Error('Verified Nexus client-name snapshot is missing from the project');

  const admins = await User.find({ role: 'admin', status: 'active', accountStatus: { $ne: 'suspended' } }).lean();
  const admin = admins.find((user) => user.isProtected || user.isSuperAdmin) || admins[0];
  if (!admin) throw new Error('No active production Administrator exists for the receipt audit record');

  const invoices = await findOrCreateInvoices(project);
  const receipt = await createOrReconcileReceipt({ project, invoices, admin });
  await refreshInvoiceFiles({ project, invoices, admin });

  await emitPortalEvent({
    type: 'nexus_consolidated_receipt_issued',
    category: 'billing',
    title: `Payment receipt issued - ${receipt.receiptNumber}`,
    message: `${receipt.receiptNumber} confirms ${RECEIPT_TOTAL.toFixed(2)} ${CURRENCY} received across two recorded payments.`,
    actor: admin,
    project,
    relatedEntityType: 'Receipt',
    relatedEntityId: idOf(receipt),
    actionUrl: '/admin/billing',
    actionUrlByRole: { client: '/client/billing' },
    targets: { admins: true, client: true },
    dedupeKey: `receipt-issued:${idOf(receipt)}`,
    metadata: { receiptNumber: receipt.receiptNumber, invoiceNumber: invoices.map((invoice) => invoice.invoiceNumber).join(', ') },
  });

  console.log(JSON.stringify({
    ok: true,
    project: { id: idOf(project), title: project.title, clientAccountLinked: Boolean(project.client) },
    invoices: invoices.map((invoice) => ({ id: idOf(invoice), invoiceNumber: invoice.invoiceNumber, issueDate: dateKey(invoice.issueDate), total: Number(invoice.total), amountPaid: PAYMENT_AMOUNT, balanceDue: INVOICE_AMOUNT - PAYMENT_AMOUNT })),
    receipt: { id: idOf(receipt), receiptNumber: receipt.receiptNumber, total: Number(receipt.amount), paymentIds: receipt.paymentIds, paymentCount: receipt.paymentBreakdown?.length, methodHiddenFromClientDocument: Boolean(receipt.hidePaymentMethod) },
  }, null, 2));
}

run().catch((error) => {
  console.error(error?.stack || error?.message || 'Nexus production billing creation failed');
  process.exitCode = 1;
});
