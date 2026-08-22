import crypto from 'node:crypto';

import Invoice from '../../../models/Invoice.js';
import Project from '../../../models/Project.js';
import Receipt from '../../../models/Receipt.js';
import { emitPortalEvent } from '../../../lib/portalEvents.js';
import { generateReceiptPdf } from '../../../lib/receiptPdf.js';
import { putObject, removeObject, signedURL } from '../../../lib/storage.js';
import { cleanText } from '../../../lib/validation.js';
import { projectScopeFor } from '../../../lib/projectAccess.js';
import { allocateGoogleSequence } from '../../../google/sheets.js';
import { receiptsRepository } from '../../../repositories/receipts.repository.js';

const PAYMENT_METHODS = new Set(['Interac e-Transfer', 'Bank transfer', 'Cash', 'Cheque', 'Remitly', 'Other']);
const MAX_AMOUNT = 100_000_000;

function idOf(value) {
  return String(value?._id || value?.id || value || '');
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Math.round(number * 100) / 100;
}

function partySnapshot(value = {}) {
  return {
    businessName: cleanText(value.businessName, 160),
    contactName: cleanText(value.contactName || value.name, 160),
    address: cleanText(value.address, 600),
    email: cleanText(value.email, 200).toLowerCase(),
    phone: cleanText(value.phone, 60),
    website: cleanText(value.website, 300),
  };
}

function serviceDescription(invoice) {
  const descriptions = (invoice.lineItems || []).map((item) => cleanText(item?.description, 220)).filter(Boolean);
  return cleanText(descriptions.join('; ') || invoice.title || 'Professional web design and digital services', 900);
}

function identifierForSequence(prefixRoot, sequence) {
  const year = new Date().getUTCFullYear();
  return `${prefixRoot}-${year}-${String(sequence).padStart(6, '0')}`;
}

function receiptPath(projectId, receiptNumber) {
  const now = new Date();
  return `projects/${projectId}/receipts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}_${receiptNumber}.pdf`;
}

async function withFreshFile(receipt) {
  const value = receipt?.toObject?.() || { ...receipt };
  if (value.file?.path) value.file.url = await signedURL(value.file.path).catch(() => '');
  return value;
}

async function receiptForIdempotencyKey(idempotencyKey) {
  const result = await receiptsRepository.list({
    filter: { idempotencyKey },
    limit: 100,
    fresh: true,
  });
  return [...(result.items || [])].sort((left, right) =>
    String(left.receiptNumber || '').localeCompare(String(right.receiptNumber || '')),
  )[0] || null;
}

async function reconcileInvoicePayment(invoice, receipt) {
  if (!invoice || !receipt) return null;
  const existingPayments = Array.isArray(invoice.payments) ? invoice.payments : [];
  let payment = existingPayments.find((item) => item.idempotencyKey === receipt.idempotencyKey);
  if (payment) return payment;
  payment = {
    paymentId: receipt.paymentId,
    receipt: idOf(receipt),
    idempotencyKey: receipt.idempotencyKey,
    amount: Number(receipt.paymentAmountSnapshot || receipt.amount || 0),
    date: receipt.paymentDate,
    method: receipt.method,
    reference: receipt.paymentReference || '',
    note: receipt.paymentNote || '',
    paymentStage: receipt.paymentStage || 'other',
  };
  invoice.payments = [...existingPayments, payment];
  invoice.amountPaid = Number(receipt.totalPaidSnapshot || 0);
  invoice.balanceDue = Number(receipt.balanceRemainingSnapshot || 0);
  invoice.status = invoice.balanceDue <= 0.005 ? 'paid' : 'partially_paid';
  invoice.paidAt = invoice.status === 'paid' ? receipt.issuedAt : null;
  await invoice.save();
  return payment;
}

function clientSafeReceipt(receipt) {
  const value = receipt?.toObject?.() || { ...receipt };
  delete value.idempotencyKey;
  return value;
}

export async function listAuthorizedReceipts(req, res, next) {
  try {
    if (!['admin', 'client'].includes(req.user?.role)) return res.status(403).json({ error: 'Receipt access is not available for this role' });
    const projects = await Project.find(projectScopeFor(req.user)).select('_id').lean();
    const projectIds = projects.map((project) => idOf(project));
    if (!projectIds.length) return res.json({ receipts: [] });
    const rows = await Receipt.find({ project: { $in: projectIds } }).sort({ createdAt: -1 }).lean();
    const receipts = await Promise.all(rows.map(withFreshFile));
    return res.json({ receipts: receipts.map(clientSafeReceipt) });
  } catch (error) {
    return next(error);
  }
}

export async function recordPayment(req, res, next) {
  let uploadedPath = '';
  let createdReceipt = null;
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { projectId, invoiceId } = req.params;
    const idempotencyKey = cleanText(req.body?.idempotencyKey, 160);
    if (!idempotencyKey) return res.status(400).json({ error: 'A payment idempotency key is required' });

    const duplicate = await receiptForIdempotencyKey(idempotencyKey);
    if (duplicate) {
      if (idOf(duplicate.invoice) !== String(invoiceId)) return res.status(409).json({ error: 'Payment idempotency key is already in use' });
      const invoice = await Invoice.findById(invoiceId);
      const payment = await reconcileInvoicePayment(invoice, duplicate);
      return res.json({ ok: true, duplicate: true, invoice, payment, receipt: clientSafeReceipt(await withFreshFile(duplicate)) });
    }

    const [invoice, project] = await Promise.all([
      Invoice.findOne({ _id: invoiceId, project: projectId }),
      Project.findById(projectId).lean(),
    ]);
    if (!invoice || !project) return res.status(404).json({ error: 'Invoice not found' });

    const amount = money(req.body?.amount);
    const total = money(invoice.total || 0);
    const existingPayments = Array.isArray(invoice.payments) ? invoice.payments : [];
    const previouslyPaid = money(existingPayments.reduce((sum, item) => sum + Number(item?.amount || 0), 0));
    const balance = money(Math.max(total - previouslyPaid, 0));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    if (amount > balance + 0.005) return res.status(409).json({ error: 'Payment amount exceeds the remaining invoice balance', balanceDue: balance });

    const paymentDate = req.body?.date ? new Date(req.body.date) : new Date();
    if (Number.isNaN(paymentDate.getTime())) return res.status(400).json({ error: 'Payment date is invalid' });
    const method = PAYMENT_METHODS.has(String(req.body?.method || '')) ? String(req.body.method) : 'Other';
    const sequence = await allocateGoogleSequence({ kind: 'payment-receipt', reference: idempotencyKey });
    const paymentId = identifierForSequence('MSP-PAY', sequence);
    const receiptNumber = identifierForSequence('MSP-RCT', sequence);
    const receiptId = crypto.randomUUID();
    const issuedAt = new Date();
    const totalPaid = money(previouslyPaid + amount);
    const balanceRemaining = money(Math.max(total - totalPaid, 0));
    const payment = {
      paymentId,
      receipt: receiptId,
      idempotencyKey,
      amount,
      date: paymentDate,
      method,
      reference: cleanText(req.body?.reference, 160),
      note: cleanText(req.body?.note, 500),
      paymentStage: cleanText(req.body?.paymentStage || invoice.paymentStage || 'other', 40),
    };
    const snapshot = {
      _id: receiptId,
      receiptNumber,
      invoice: invoiceId,
      invoiceNumber: cleanText(invoice.invoiceNumber || 'Invoice', 80),
      project: projectId,
      client: idOf(invoice.client || project.client) || null,
      paymentId,
      idempotencyKey,
      paymentDate,
      receiptDate: issuedAt,
      amount,
      currency: cleanText(invoice.currency || 'CAD', 3).toUpperCase(),
      method,
      paymentReference: payment.reference,
      paymentNote: payment.note,
      paymentStage: payment.paymentStage,
      senderSnapshot: partySnapshot(invoice.sender),
      clientSnapshot: partySnapshot(invoice.clientDetails || project.client),
      projectTitleSnapshot: cleanText(project.title, 240),
      serviceDescriptionSnapshot: serviceDescription(invoice),
      invoiceTotalSnapshot: total,
      previouslyPaidSnapshot: previouslyPaid,
      paymentAmountSnapshot: amount,
      totalPaidSnapshot: totalPaid,
      balanceRemainingSnapshot: balanceRemaining,
      taxApplied: Boolean(invoice.chargeTax),
      taxLabel: invoice.chargeTax ? cleanText(invoice.taxLabel, 80) : '',
      taxRate: invoice.chargeTax ? Number(invoice.taxRate || 0) : 0,
      taxAmount: invoice.chargeTax ? Number(invoice.taxAmount || 0) : 0,
      taxRegistrationNumber: invoice.chargeTax ? cleanText(invoice.taxRegistrationNumber, 120) : '',
      status: 'issued',
      issuedAt,
      createdBy: req.user._id,
    };

    const pdf = await generateReceiptPdf(snapshot, { pageSize: invoice.pageSize });
    uploadedPath = receiptPath(projectId, receiptNumber);
    const stored = await putObject({
      path: uploadedPath,
      buffer: pdf,
      contentType: 'application/pdf',
      metadata: {
        projectId, clientId: idOf(invoice.client || project.client), userId: idOf(req.user), uploadedBy: idOf(req.user),
        category: 'receipt', originalName: `${receiptNumber}.pdf`, isPublic: false,
      },
    });
    snapshot.file = { name: `${receiptNumber}.pdf`, type: 'application/pdf', size: pdf.length, path: uploadedPath, url: stored.url };
    createdReceipt = await Receipt.create(snapshot);

    const canonicalReceipt = await receiptForIdempotencyKey(idempotencyKey);
    if (canonicalReceipt && idOf(canonicalReceipt) !== idOf(createdReceipt)) {
      await createdReceipt.deleteOne().catch(() => undefined);
      createdReceipt = null;
      await removeObject(uploadedPath).catch(() => undefined);
      uploadedPath = '';
      const canonicalInvoice = await Invoice.findById(invoiceId);
      const canonicalPayment = await reconcileInvoicePayment(canonicalInvoice, canonicalReceipt);
      return res.json({
        ok: true,
        duplicate: true,
        invoice: canonicalInvoice,
        payment: canonicalPayment,
        receipt: clientSafeReceipt(await withFreshFile(canonicalReceipt)),
      });
    }

    invoice.payments = [...existingPayments, payment];
    invoice.amountPaid = totalPaid;
    invoice.balanceDue = balanceRemaining;
    invoice.status = balanceRemaining <= 0.005 ? 'paid' : 'partially_paid';
    invoice.paidAt = invoice.status === 'paid' ? issuedAt : null;
    await invoice.save();

    await emitPortalEvent({
      type: invoice.status === 'paid' ? 'invoice_paid' : 'payment_recorded', category: 'billing',
      title: `${invoice.status === 'paid' ? 'Invoice paid' : 'Payment recorded'} - ${invoice.invoiceNumber || 'Invoice'}`,
      message: `${receiptNumber} confirms ${amount.toFixed(2)} ${invoice.currency || 'CAD'} received.`,
      actor: req.user, project, relatedEntityType: 'Receipt', relatedEntityId: receiptId,
      actionUrl: '/admin/billing', actionUrlByRole: { client: '/client/billing' },
      targets: { admins: true, client: true }, dedupeKey: `receipt-issued:${receiptId}`,
      metadata: { invoiceNumber: invoice.invoiceNumber, receiptNumber, paymentId },
    });

    uploadedPath = '';
    return res.status(201).json({ ok: true, invoice, payment, receipt: clientSafeReceipt(await withFreshFile(createdReceipt)) });
  } catch (error) {
    if (createdReceipt) await createdReceipt.deleteOne().catch(() => undefined);
    if (uploadedPath) await removeObject(uploadedPath).catch(() => undefined);
    if (error?.code === 11000 && req.body?.idempotencyKey) {
      const duplicate = await receiptForIdempotencyKey(cleanText(req.body.idempotencyKey, 160)).catch(() => null);
      if (duplicate && idOf(duplicate.invoice) === String(req.params.invoiceId)) {
        const invoice = await Invoice.findById(req.params.invoiceId).catch(() => null);
        const payment = await reconcileInvoicePayment(invoice, duplicate).catch(() => null);
        if (invoice && payment) return res.json({
          ok: true,
          duplicate: true,
          invoice,
          payment,
          receipt: clientSafeReceipt(await withFreshFile(duplicate)),
        });
      }
    }
    return next(error);
  }
}

export async function voidReceipt(req, res, next) {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const reason = cleanText(req.body?.reason, 500);
    if (reason.length < 3) return res.status(400).json({ error: 'A void reason is required' });
    const receipt = await Receipt.findById(req.params.receiptId);
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    if (receipt.status === 'void') return res.json({ ok: true, receipt: clientSafeReceipt(await withFreshFile(receipt)) });
    const project = await Project.findById(idOf(receipt.project)).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const voidedAt = new Date();
    const updated = { ...receipt.toObject(), status: 'void', voidedAt, voidReason: reason, voidedBy: idOf(req.user) };
    const invoice = await Invoice.findById(idOf(receipt.invoice)).lean();
    const pdf = await generateReceiptPdf(updated, { pageSize: invoice?.pageSize || 'LETTER' });
    const stored = await putObject({
      path: receipt.file.path,
      buffer: pdf,
      contentType: 'application/pdf',
      metadata: {
        projectId: idOf(receipt.project), clientId: idOf(receipt.client), userId: idOf(req.user), uploadedBy: idOf(req.user),
        category: 'receipt', originalName: receipt.file.name || `${receipt.receiptNumber}.pdf`, isPublic: false,
      },
    });
    receipt.status = 'void';
    receipt.voidedAt = voidedAt;
    receipt.voidReason = reason;
    receipt.voidedBy = req.user._id;
    receipt.file = { ...receipt.file, size: pdf.length, url: stored.url };
    await receipt.save();

    await emitPortalEvent({
      type: 'receipt_voided', category: 'billing', title: `Receipt voided - ${receipt.receiptNumber}`,
      message: 'An issued receipt was voided by an Administrator. The original number remains reserved.',
      actor: req.user, project, relatedEntityType: 'Receipt', relatedEntityId: idOf(receipt),
      actionUrl: '/admin/billing', actionUrlByRole: { client: '/client/billing' }, targets: { admins: true, client: true },
      dedupeKey: `receipt-voided:${idOf(receipt)}:${voidedAt.toISOString()}`,
      metadata: { receiptNumber: receipt.receiptNumber, invoiceNumber: receipt.invoiceNumber },
    });

    return res.json({ ok: true, receipt: clientSafeReceipt(await withFreshFile(receipt)) });
  } catch (error) {
    return next(error);
  }
}

export const receiptControllerInternals = { identifierForSequence, money, partySnapshot, serviceDescription };
