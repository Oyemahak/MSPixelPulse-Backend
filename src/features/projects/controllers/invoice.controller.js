// backend/src/features/projects/controllers/invoice.controller.js
import crypto from "crypto";

import Invoice from "../../../models/Invoice.js";
import Project from "../../../models/Project.js";
import SiteContent from "../../../models/SiteContent.js";
import { signedURL as createSignedUrl, removeObject as removePath } from "../../../lib/storage.js";
import {
  cleanFileName,
  pathBelongsToProjectPurpose,
  projectFilePrefix,
  validateUpload,
} from "../../../lib/filePolicy.js";
import { cleanText } from "../../../lib/validation.js";
import {
  canReadProject,
  projectAccessError,
  projectScopeFor,
} from "../../../lib/projectAccess.js";
import { storageProviderName } from "../../../config/providers.js";
import { getStorageProvider } from "../../../storage/provider.js";
import {
  openInvoiceUploadToken,
  sealInvoiceUploadToken,
} from "../../../lib/invoiceUploadToken.js";

const VALID_STATUSES = [
  "draft",
  "sent",
  "uploaded",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
  "archived",
];
const INVOICE_RELAY_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_INVOICE_AMOUNT = 100_000_000;
const MAX_LINE_ITEMS = 50;
const MAX_PAYMENTS = 50;
const PAYMENT_METHODS = new Set([
  "Interac e-Transfer",
  "Bank transfer",
  "Cash",
  "Cheque",
  "Remitly",
  "Other",
]);

const DEFAULT_INVOICE_SETTINGS = {
  sender: {
    businessName: "MSPixelPulse",
    contactName: "",
    address: "Toronto, Ontario, Canada",
    phone: "",
    email: "info@mspixelpulse.com",
    website: "https://mspixelpulse.com",
    logoUrl: "https://mspixelpulse.com/icon-light.svg",
  },
  currency: "CAD",
  pageSize: "LETTER",
  chargeTax: false,
  taxLabel: "HST",
  taxRate: 0,
  taxRegistrationNumber: "",
  taxNote: "",
  paymentTerms: "Payment is due by the date shown on this invoice.",
  defaultNotes: "Thank you for choosing MSPixelPulse.",
};

function storage() {
  const provider = getStorageProvider();
  provider.ensureReady?.();
  return provider;
}

function canWrite(user, project) {
  if (!user || !project) return false;
  return user.role === "admin";
}

function normalizeKind(value) {
  return ['advance', 'final', 'other'].includes(value) ? value : '';
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.min(Math.max(number, 0), MAX_INVOICE_AMOUNT) * 100) / 100;
}

function percent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.min(Math.max(number, 0), 100) * 1000) / 1000;
}

function cleanParty(value = {}) {
  const party = value && typeof value === "object" ? value : {};

  return {
    businessName: cleanText(party.businessName, 160),
    contactName: cleanText(party.contactName || party.name, 160),
    address: cleanText(party.address, 600),
    email: cleanText(party.email, 200).toLowerCase(),
    phone: cleanText(party.phone, 60),
    website: cleanText(party.website, 300),
    logoUrl: cleanText(party.logoUrl, 500),
  };
}

function normalizePayments(items = []) {
  if (!Array.isArray(items)) return [];

  return items.slice(0, MAX_PAYMENTS).map((item) => ({
    amount: money(item?.amount),
    date: item?.date || new Date().toISOString(),
    method: PAYMENT_METHODS.has(String(item?.method || ""))
      ? String(item.method)
      : "Other",
    reference: cleanText(item?.reference, 160),
    note: cleanText(item?.note, 500),
  })).filter((item) => item.amount > 0);
}

function normalizePageSize(value) {
  return String(value || "").toUpperCase() === "A4" ? "A4" : "LETTER";
}

function invoiceDetails(body = {}) {
  const allowed = [
    'invoiceNumber',
    'sourceType',
    'title',
    'currency',
    'lineItems',
    'sender',
    'clientDetails',
    'subtotal',
    'discountAmount',
    'chargeTax',
    'taxLabel',
    'taxRate',
    'taxAmount',
    'taxRegistrationNumber',
    'taxNote',
    'total',
    'amountPaid',
    'balanceDue',
    'payments',
    'paymentTerms',
    'notes',
    'internalNotes',
    'pageSize',
    'isDemo',
    'issueDate',
    'dueDate',
    'status',
  ];

  const details = Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
      .map((key) => [key, body[key]]),
  );

  if ('lineItems' in details) details.lineItems = normalizeLineItems(details.lineItems);
  if ('payments' in details) details.payments = normalizePayments(details.payments);
  if ('sender' in details) details.sender = cleanParty(details.sender);
  if ('clientDetails' in details) details.clientDetails = cleanParty(details.clientDetails);
  if ('subtotal' in details) details.subtotal = money(details.subtotal);
  if ('discountAmount' in details) details.discountAmount = money(details.discountAmount);
  if ('taxRate' in details) details.taxRate = percent(details.taxRate);
  if ('taxAmount' in details) details.taxAmount = money(details.taxAmount);
  if ('total' in details) details.total = money(details.total);
  if ('amountPaid' in details) details.amountPaid = money(details.amountPaid);
  if ('balanceDue' in details) details.balanceDue = money(details.balanceDue);
  if ('pageSize' in details) details.pageSize = normalizePageSize(details.pageSize);

  return details;
}

function uploadRange(value, bufferLength, expectedTotal) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(value || '').trim());

  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start < 0 ||
    end < start ||
    total !== Number(expectedTotal) ||
    end - start + 1 !== Number(bufferLength)
  ) {
    return null;
  }

  return { start, end, total };
}

function nextUploadOffset(response, fallback) {
  const match = /bytes=(\d+)-(\d+)/i.exec(response.headers.get('range') || '');
  return match ? Number(match[2]) + 1 : fallback;
}

function relayUploadPath(projectId, originalName) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

  return (
    `${projectFilePrefix(projectId, 'invoice')}` +
    `${yyyy}/${mm}/` +
    `${Date.now()}_${crypto.randomUUID()}_${cleanFileName(originalName)}`
  );
}

async function freshInvoiceFile(invoice) {
  if (!invoice?.file?.path) return invoice;
  try {
    invoice.file.url = await createSignedUrl(invoice.file.path);
  } catch {
    invoice.file.url = '';
  }
  return invoice;
}

function normalizeLineItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, MAX_LINE_ITEMS)
    .map((item) => {
      const quantity = Math.max(Number(item.quantity ?? 1) || 0, 0);
      const unitPrice = money(item.unitPrice ?? item.rate ?? 0);
      const amount = money(quantity * unitPrice);
      return {
        description: cleanText(item.description, 500),
        quantity,
        unitPrice,
        amount,
      };
    })
    .filter((item) => item.description);
}

function calculateInvoiceTotals(details = {}, existing = {}) {
  const lineItems = Array.isArray(details.lineItems)
    ? details.lineItems
    : Array.isArray(existing.lineItems)
      ? normalizeLineItems(existing.lineItems)
      : [];
  const lineSubtotal = money(
    lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
  );
  const suppliedSubtotal = money(details.subtotal ?? existing.subtotal ?? details.total ?? existing.total);
  const subtotal = lineItems.length ? lineSubtotal : suppliedSubtotal;
  const discountAmount = Math.min(
    money(details.discountAmount ?? existing.discountAmount),
    subtotal,
  );
  const chargeTax = 'chargeTax' in details
    ? Boolean(details.chargeTax)
    : Boolean(existing.chargeTax);
  const taxRate = chargeTax
    ? percent(details.taxRate ?? existing.taxRate)
    : 0;
  const taxable = money(subtotal - discountAmount);
  const calculatedTax = money(taxable * taxRate / 100);
  const taxAmount = chargeTax ? calculatedTax : 0;
  const calculatedTotal = money(taxable + taxAmount);
  const suppliedTotal = money(details.total ?? existing.total);
  const total = lineItems.length || chargeTax || discountAmount > 0
    ? calculatedTotal
    : suppliedTotal || calculatedTotal;
  const payments = Array.isArray(details.payments)
    ? details.payments
    : normalizePayments(existing.payments || []);
  const recordedPayments = money(
    payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  );
  const amountPaid = payments.length
    ? recordedPayments
    : money(details.amountPaid ?? existing.amountPaid);

  return {
    lineItems,
    subtotal,
    discountAmount,
    chargeTax,
    taxRate,
    taxAmount,
    total,
    payments,
    amountPaid,
    balanceDue: money(Math.max(total - amountPaid, 0)),
  };
}

function automaticStatus({ requested, fallback = 'draft', total, amountPaid, dueDate }) {
  if (requested && VALID_STATUSES.includes(requested)) return requested;
  if (total > 0 && amountPaid >= total) return 'paid';
  if (amountPaid > 0) return 'partially_paid';

  const due = dueDate ? new Date(dueDate) : null;
  if (
    due &&
    !Number.isNaN(due.getTime()) &&
    due.getTime() < Date.now() &&
    !['draft', 'cancelled', 'archived'].includes(fallback)
  ) {
    return 'overdue';
  }

  return VALID_STATUSES.includes(fallback) ? fallback : 'draft';
}

function buildInvoicePayload(body = {}, project, user, existing = {}) {
  const details = invoiceDetails(body);
  const totals = calculateInvoiceTotals(details, existing);

  const payload = {
    client: project.client || existing.client || null,
    kind: body.kind || existing.kind || "other",
    sourceType: ['generated', 'uploaded'].includes(details.sourceType)
      ? details.sourceType
      : existing.sourceType || 'uploaded',
    invoiceNumber: cleanText(details.invoiceNumber ?? existing.invoiceNumber ?? "", 80),
    title: cleanText(details.title ?? existing.title ?? "", 160),
    currency: cleanText(details.currency ?? existing.currency ?? "CAD", 3).toUpperCase() || "CAD",
    sender: details.sender ?? existing.sender ?? {},
    clientDetails: details.clientDetails ?? existing.clientDetails ?? {},
    ...totals,
    taxLabel: cleanText(details.taxLabel ?? existing.taxLabel ?? "", 80),
    taxRegistrationNumber: cleanText(details.taxRegistrationNumber ?? existing.taxRegistrationNumber ?? "", 120),
    taxNote: cleanText(details.taxNote ?? existing.taxNote ?? "", 600),
    paymentTerms: cleanText(details.paymentTerms ?? existing.paymentTerms ?? "", 1000),
    notes: cleanText(details.notes ?? existing.notes ?? "", 2000),
    internalNotes: cleanText(details.internalNotes ?? existing.internalNotes ?? "", 2000),
    pageSize: normalizePageSize(details.pageSize ?? existing.pageSize),
    isDemo: Boolean(details.isDemo ?? existing.isDemo ?? false),
  };

  if ("issueDate" in details) payload.issueDate = details.issueDate ? new Date(details.issueDate) : null;
  if ("dueDate" in details) payload.dueDate = details.dueDate ? new Date(details.dueDate) : null;
  if (body.file?.path) payload.file = body.file;
  if (user?._id && !existing.uploadedBy) payload.uploadedBy = user._id;
  return payload;
}

function normalizeInvoiceSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};

  return {
    sender: cleanParty({
      ...DEFAULT_INVOICE_SETTINGS.sender,
      ...(source.sender || {}),
    }),
    currency: cleanText(source.currency || DEFAULT_INVOICE_SETTINGS.currency, 3).toUpperCase() || 'CAD',
    pageSize: normalizePageSize(source.pageSize || DEFAULT_INVOICE_SETTINGS.pageSize),
    chargeTax: Boolean(source.chargeTax),
    taxLabel: cleanText(source.taxLabel || DEFAULT_INVOICE_SETTINGS.taxLabel, 80),
    taxRate: percent(source.taxRate),
    taxRegistrationNumber: cleanText(source.taxRegistrationNumber, 120),
    taxNote: cleanText(source.taxNote, 600),
    paymentTerms: cleanText(source.paymentTerms || DEFAULT_INVOICE_SETTINGS.paymentTerms, 1000),
    defaultNotes: cleanText(source.defaultNotes || DEFAULT_INVOICE_SETTINGS.defaultNotes, 2000),
  };
}

async function nextInvoiceNumber() {
  const year = new Date().getUTCFullYear();
  const prefix = `MSP-${year}-`;
  const rows = await Invoice.find({
    invoiceNumber: {
      $regex: `^${prefix}\\d+$`,
      $options: 'i',
    },
  }).select('invoiceNumber').lean();
  const highest = rows.reduce((max, row) => {
    const value = Number(String(row.invoiceNumber || '').slice(prefix.length));
    return Number.isSafeInteger(value) ? Math.max(max, value) : max;
  }, 0);

  return `${prefix}${String(highest + 1).padStart(4, '0')}`;
}

async function invoiceNumberFor(requested, excludeId = '') {
  const value = cleanText(requested, 80) || await nextInvoiceNumber();
  const duplicate = await Invoice.findOne({
    invoiceNumber: value,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).select('_id').lean();

  if (duplicate) {
    const error = new Error('Invoice number is already in use');
    error.status = 409;
    error.code = 'INVOICE_NUMBER_CONFLICT';
    throw error;
  }

  return value;
}

function clientSafeInvoice(invoice, role) {
  const value = invoice?.toObject?.() || { ...invoice };
  if (role !== 'admin') delete value.internalNotes;
  return value;
}

// GET /api/invoice-settings
export async function getInvoiceSettings(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const record = await SiteContent.findOne({
      kind: 'invoice-settings',
      key: 'default',
    }).lean();

    return res.json({
      settings: normalizeInvoiceSettings(record?.payload || DEFAULT_INVOICE_SETTINGS),
    });
  } catch (error) {
    return next(error);
  }
}

// PATCH /api/invoice-settings
export async function updateInvoiceSettings(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const settings = normalizeInvoiceSettings(req.body || {});
    let record = await SiteContent.findOne({
      kind: 'invoice-settings',
      key: 'default',
    });

    if (record) {
      record.payload = settings;
      record.title = 'Invoice defaults';
      record.published = false;
      await record.save();
    } else {
      record = await SiteContent.create({
        kind: 'invoice-settings',
        key: 'default',
        title: 'Invoice defaults',
        payload: settings,
        published: false,
        displayOrder: 0,
      });
    }

    return res.json({ ok: true, settings });
  } catch (error) {
    return next(error);
  }
}

// GET /api/invoices/next-number
export async function getNextInvoiceNumber(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    return res.json({ invoiceNumber: await nextInvoiceNumber() });
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/invoices
export async function listInvoices(req, res, next) {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!canReadProject(req.user, project)) return projectAccessError(res);
    const filter = {
      project: projectId,
      status: req.user?.role === 'client'
        ? { $nin: ['archived', 'draft'] }
        : { $ne: 'archived' },
    };
    const rows = await Invoice.find(filter).sort({ createdAt: -1 }).lean();
    await Promise.all(rows.map(freshInvoiceFile));
    res.json({
      invoices: rows.map((invoice) => clientSafeInvoice(invoice, req.user?.role)),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/invoices
export async function listAuthorizedInvoices(req, res, next) {
  try {
    if (!['admin', 'client'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'Billing access is not available for this role' });
    }

    const projects = await Project.find(projectScopeFor(req.user))
      .select('_id')
      .lean();
    const projectIds = projects.map((project) => String(project._id));

    if (!projectIds.length) {
      return res.json({ invoices: [] });
    }

    const rows = await Invoice.find({
      project: { $in: projectIds },
      status: req.user?.role === 'client'
        ? { $nin: ['archived', 'draft'] }
        : { $ne: 'archived' },
    })
      .sort({ createdAt: -1 })
      .lean();

    await Promise.all(rows.map(freshInvoiceFile));

    return res.json({
      invoices: rows.map((invoice) => clientSafeInvoice(invoice, req.user?.role)),
    });
  } catch (error) {
    return next(error);
  }
}

// POST /api/projects/:projectId/invoices/upload-session
export async function startInvoiceUpload(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    if (storageProviderName() !== 'google-drive') {
      return res.status(503).json({ error: 'Invoice storage is unavailable' });
    }

    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const originalName = String(req.body?.name || '');
    const mimetype = String(req.body?.type || '').toLowerCase();
    const size = Number(req.body?.size || 0);
    const kind = normalizeKind(req.body?.kind || 'other');
    const invoiceId = String(req.body?.invoiceId || '');
    const verdict = validateUpload(
      { originalname: originalName, mimetype, size },
      'invoice',
    );

    if (!kind) return res.status(400).json({ error: 'Invalid invoice kind' });
    if (!verdict.ok) return res.status(415).json({ error: verdict.message });

    let existing = null;

    if (invoiceId) {
      existing = await Invoice.findOne({ _id: invoiceId, project: projectId }).lean();
      if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceDetails(req.body?.invoice || {});
    invoice.invoiceNumber = await invoiceNumberFor(
      invoice.invoiceNumber || existing?.invoiceNumber,
      invoiceId,
    );

    const logicalPath = relayUploadPath(projectId, originalName);
    const userId = String(req.user._id);
    const metadata = {
      projectId,
      clientId: String(project.client || ''),
      userId,
      uploadedBy: userId,
      category: 'invoice',
      originalName,
      mimeType: mimetype,
      size,
      isPublic: false,
    };
    const fileStorage = storage();
    const session = await fileStorage.createResumableUpload(
      logicalPath,
      { mimetype, size },
      metadata,
    );
    const uploadToken = sealInvoiceUploadToken({
      ...metadata,
      purpose: 'invoice',
      kind,
      invoiceId,
      invoice,
      logicalPath,
      uploadUrl: session.uploadUrl,
      uploadNonce: session.uploadNonce,
      parentDriveFolderId: session.parentDriveFolderId,
    });

    return res.json({
      upload: {
        token: uploadToken,
        chunkSize: INVOICE_RELAY_CHUNK_BYTES,
        size,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// POST /api/projects/:projectId/invoices/upload-chunk
export async function relayInvoiceUploadChunk(req, res, next) {
  let uploadedPath = '';

  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const claims = openInvoiceUploadToken(req.get('x-upload-token'));
    const projectId = String(req.params.projectId || '');
    const userId = String(req.user?._id || '');

    if (
      String(claims.projectId || '') !== projectId ||
      String(claims.userId || '') !== userId ||
      claims.purpose !== 'invoice'
    ) {
      return res.status(403).json({ error: 'Invoice upload session is invalid or expired' });
    }

    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: 'Invoice upload chunk is required' });
    }

    const range = uploadRange(
      req.get('content-range'),
      req.body.length,
      claims.size,
    );

    if (!range || req.body.length > INVOICE_RELAY_CHUNK_BYTES) {
      return res.status(400).json({ error: 'Invoice upload chunk range is invalid' });
    }

    const upstream = await fetch(claims.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': claims.mimeType,
        'Content-Length': String(req.body.length),
        'Content-Range': `bytes ${range.start}-${range.end}/${range.total}`,
      },
      body: req.body,
    });

    if (upstream.status === 308) {
      return res.status(202).json({
        complete: false,
        nextOffset: nextUploadOffset(upstream, range.end + 1),
      });
    }

    const driveFile = await upstream.json().catch(() => ({}));

    if (!upstream.ok || !driveFile?.id) {
      const error = new Error('Google Drive could not accept the invoice upload');
      error.status = 502;
      error.code = 'INVOICE_UPLOAD_RELAY_FAILED';
      throw error;
    }

    const fileStorage = storage();
    const uploaded = await fileStorage.finalizeResumableUpload(
      claims.logicalPath,
      driveFile.id,
      claims,
    );
    uploadedPath = uploaded.path;
    const file = {
      name: claims.originalName,
      type: claims.mimeType,
      size: Number(claims.size),
      path: uploaded.path,
      url: uploaded.url,
    };

    let invoice;

    if (claims.invoiceId) {
      invoice = await Invoice.findOne({
        _id: claims.invoiceId,
        project: projectId,
      });

      if (!invoice) {
        await fileStorage.removePath(uploaded.path);
        uploadedPath = '';
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const previousFile = invoice.file?.toObject?.() || invoice.file || null;
      const patch = buildInvoicePayload(
        { ...claims.invoice, kind: claims.kind, file },
        project,
        req.user,
        invoice.toObject(),
      );
      patch.status = automaticStatus({
        requested: claims.invoice?.status,
        fallback: invoice.status === 'draft' ? 'uploaded' : invoice.status,
        total: patch.total,
        amountPaid: patch.amountPaid,
        dueDate: patch.dueDate || invoice.dueDate,
      });
      patch.paidAt = patch.status === 'paid' ? invoice.paidAt || new Date() : null;
      patch.sentAt = patch.status === 'sent' ? invoice.sentAt || new Date() : invoice.sentAt;

      Object.assign(invoice, patch);
      await invoice.save();

      if (previousFile?.path && previousFile.path !== uploaded.path) {
        try {
          await fileStorage.removePath(previousFile.path);
        } catch (cleanupError) {
          invoice.file = previousFile;
          await invoice.save();
          await fileStorage.removePath(uploaded.path).catch(() => undefined);
          uploadedPath = '';
          cleanupError.status = Number(cleanupError.status || 502);
          throw cleanupError;
        }
      }
    } else {
      claims.invoice.invoiceNumber = await invoiceNumberFor(
        claims.invoice?.invoiceNumber,
      );
      const payload = buildInvoicePayload(
        { ...claims.invoice, kind: claims.kind, file },
        project,
        req.user,
      );
      const status = automaticStatus({
        requested: claims.invoice?.status,
        fallback: 'uploaded',
        total: payload.total,
        amountPaid: payload.amountPaid,
        dueDate: payload.dueDate,
      });

      invoice = await Invoice.create({
        project: projectId,
        ...payload,
        status,
        paidAt: status === 'paid' ? new Date() : null,
        sentAt: status === 'sent' ? new Date() : null,
      });
    }

    uploadedPath = '';

    return res.status(201).json({
      complete: true,
      invoice: await freshInvoiceFile(
        invoice?.toObject?.() || invoice,
      ),
    });
  } catch (error) {
    if (uploadedPath) {
      await removePath(uploadedPath).catch(() => undefined);
    }
    return next(error);
  }
}

// POST /api/projects/:projectId/invoices
export async function createInvoice(req, res, next) {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!canWrite(req.user, project)) return projectAccessError(res);

    const body = req.body || {};
    const file = body.file;
    const kind = normalizeKind(body.kind || 'other');
    if (!kind) return res.status(400).json({ error: 'Invalid invoice kind' });
    const hasInvoiceDetails =
      body.invoiceNumber ||
      body.title ||
      (Array.isArray(body.lineItems) && body.lineItems.length > 0) ||
      body.dueDate;

    if (file?.path && !pathBelongsToProjectPurpose(file.path, projectId, 'invoice')) {
      return res.status(400).json({ error: 'Invoice file does not belong to this project' });
    }
    if (!file?.path && !hasInvoiceDetails) {
      return res.status(400).json({ error: "Invoice details or file {path,url,name,type,size} required" });
    }

    body.invoiceNumber = await invoiceNumberFor(body.invoiceNumber);
    const payload = buildInvoicePayload({ ...body, kind }, project, req.user);
    const status = automaticStatus({
      requested: req.user.role === 'admin' ? body.status : null,
      fallback: file?.path ? 'uploaded' : 'draft',
      total: payload.total,
      amountPaid: payload.amountPaid,
      dueDate: payload.dueDate,
    });

    const doc = await Invoice.create({
      project: projectId,
      ...payload,
      status,
      paidAt: status === "paid" ? new Date() : null,
      sentAt: status === "sent" ? new Date() : null,
    });
    res.status(201).json({ ok: true, invoice: doc });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/projects/:projectId/invoices/:invoiceId
export async function updateInvoice(req, res, next) {
  try {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
    const { projectId, invoiceId } = req.params;
    const body = req.body || {};
    const doc = await Invoice.findOne({ _id: invoiceId, project: projectId });
    if (!doc) return res.status(404).json({ error: "Invoice not found" });

    if (body.file) return res.status(400).json({ error: 'Use delete and re-upload to replace an invoice file' });
    if (body.invoiceNumber) {
      body.invoiceNumber = await invoiceNumberFor(body.invoiceNumber, invoiceId);
    }
    const patch = buildInvoicePayload(body, { client: doc.client }, req.user, doc.toObject());
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    patch.status = automaticStatus({
      requested: body.status,
      fallback: doc.status,
      total: patch.total,
      amountPaid: patch.amountPaid,
      dueDate: patch.dueDate || doc.dueDate,
    });
    patch.paidAt = patch.status === "paid" ? doc.paidAt || new Date() : null;
    patch.sentAt = patch.status === "sent" ? doc.sentAt || new Date() : doc.sentAt;

    Object.assign(doc, patch);
    await doc.save();
    res.json({ ok: true, invoice: doc });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/projects/:projectId/invoices/:invoiceId
export async function deleteInvoice(req, res, next) {
  try {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
    const { projectId, invoiceId } = req.params;
    const doc = await Invoice.findOne({ _id: invoiceId, project: projectId });
    if (!doc) return res.status(404).json({ error: "Invoice not found" });
    if (doc.file?.path) {
      if (!pathBelongsToProjectPurpose(doc.file.path, projectId, 'invoice')) {
        return res.status(409).json({ error: 'Stored file path is outside this project; deletion stopped' });
      }
      await removePath(doc.file.path);
    }
    await doc.deleteOne();
    res.json({ ok: true, deletedId: String(doc._id) });
  } catch (err) {
    next(err);
  }
}

export const invoiceUploadInternals = {
  INVOICE_RELAY_CHUNK_BYTES,
  VALID_STATUSES,
  automaticStatus,
  calculateInvoiceTotals,
  invoiceDetails,
  normalizeInvoiceSettings,
  uploadRange,
};
