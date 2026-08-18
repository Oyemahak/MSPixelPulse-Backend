// backend/src/features/projects/controllers/invoice.controller.js
import crypto from "crypto";

import Invoice from "../../../models/Invoice.js";
import Project from "../../../models/Project.js";
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

const VALID_STATUSES = ["draft", "sent", "uploaded", "paid", "archived"];
const INVOICE_RELAY_CHUNK_BYTES = 2 * 1024 * 1024;

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

function invoiceDetails(body = {}) {
  const allowed = [
    'invoiceNumber',
    'title',
    'currency',
    'lineItems',
    'subtotal',
    'taxLabel',
    'taxAmount',
    'total',
    'notes',
    'isDemo',
    'issueDate',
    'dueDate',
    'status',
  ];

  return Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
      .map((key) => [key, body[key]]),
  );
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
    .map((item) => {
      const quantity = Number(item.quantity ?? 1);
      const unitPrice = Number(item.unitPrice ?? 0);
      const amount = Number(item.amount ?? quantity * unitPrice);
      return {
        description: String(item.description || "").trim(),
        quantity,
        unitPrice,
        amount,
      };
    })
    .filter((item) => item.description);
}

function buildInvoicePayload(body = {}, project, user, existing = {}) {
  const lineItems = "lineItems" in body ? normalizeLineItems(body.lineItems) : existing.lineItems;
  const subtotal =
    "subtotal" in body
      ? Number(body.subtotal || 0)
      : Array.isArray(lineItems)
        ? lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
        : existing.subtotal;
  const taxAmount = "taxAmount" in body ? Number(body.taxAmount || 0) : Number(existing.taxAmount || 0);
  const total = "total" in body ? Number(body.total || 0) : Number(subtotal || 0) + taxAmount;

  const payload = {
    client: project.client || existing.client || null,
    kind: body.kind || existing.kind || "advance",
    invoiceNumber: cleanText(body.invoiceNumber ?? existing.invoiceNumber ?? "", 80),
    title: cleanText(body.title ?? existing.title ?? "", 160),
    currency: body.currency ?? existing.currency ?? "CAD",
    lineItems,
    subtotal,
    taxLabel: body.taxLabel ?? existing.taxLabel ?? "",
    taxAmount,
    total,
    notes: cleanText(body.notes ?? existing.notes ?? "", 2000),
    isDemo: body.isDemo ?? existing.isDemo ?? false,
  };

  if ("issueDate" in body) payload.issueDate = body.issueDate ? new Date(body.issueDate) : null;
  if ("dueDate" in body) payload.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.file?.path) payload.file = body.file;
  if (user?._id && !existing.uploadedBy) payload.uploadedBy = user._id;
  return payload;
}

// GET /api/projects/:projectId/invoices
export async function listInvoices(req, res, next) {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!canReadProject(req.user, project)) return projectAccessError(res);
    const filter = { project: projectId, status: { $ne: "archived" } };
    const rows = await Invoice.find(filter).sort({ createdAt: -1 }).lean();
    await Promise.all(rows.map(freshInvoiceFile));
    res.json({ invoices: rows });
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
      status: { $ne: 'archived' },
    })
      .sort({ createdAt: -1 })
      .lean();

    await Promise.all(rows.map(freshInvoiceFile));

    return res.json({ invoices: rows });
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
    const kind = normalizeKind(req.body?.kind || 'advance');
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
    } else {
      existing = await Invoice.findOne({
        project: projectId,
        kind,
        status: { $ne: 'archived' },
      }).lean();

      if (existing) {
        return res.status(409).json({
          error: 'An active invoice already exists. Replace its file or delete it first.',
        });
      }
    }

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
      invoice: invoiceDetails(req.body?.invoice || {}),
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
      const requestedStatus = claims.invoice?.status;

      if (requestedStatus && VALID_STATUSES.includes(requestedStatus)) {
        patch.status = requestedStatus;
        patch.paidAt = requestedStatus === 'paid' ? new Date() : null;
      } else if (invoice.status === 'draft') {
        patch.status = 'uploaded';
      }

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
      const duplicate = await Invoice.findOne({
        project: projectId,
        kind: claims.kind,
        status: { $ne: 'archived' },
      }).select('_id').lean();

      if (duplicate) {
        await fileStorage.removePath(uploaded.path);
        uploadedPath = '';
        return res.status(409).json({
          error: 'An active invoice already exists. Replace its file or delete it first.',
        });
      }

      const requestedStatus = claims.invoice?.status;
      const status = requestedStatus && VALID_STATUSES.includes(requestedStatus)
        ? requestedStatus
        : 'uploaded';

      invoice = await Invoice.create({
        project: projectId,
        ...buildInvoicePayload(
          { ...claims.invoice, kind: claims.kind, file },
          project,
          req.user,
        ),
        status,
        paidAt: status === 'paid' ? new Date() : null,
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
    const kind = normalizeKind(body.kind || 'advance');
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

    const requestedStatus = req.user.role === "admin" ? body.status : null;
    const status = requestedStatus && VALID_STATUSES.includes(requestedStatus)
      ? requestedStatus
      : file?.path
        ? "uploaded"
        : "draft";

    const duplicate = await Invoice.findOne({ project: projectId, kind, status: { $ne: 'archived' } }).select('_id').lean();
    if (duplicate) return res.status(409).json({ error: 'Delete the current invoice before uploading a replacement' });

    const doc = await Invoice.create({
      project: projectId,
      ...buildInvoicePayload({ ...body, kind }, project, req.user),
      status,
      paidAt: status === "paid" ? new Date() : null,
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
    const patch = buildInvoicePayload(body, { client: doc.client }, req.user, doc.toObject());
    if (body.status) {
      if (!VALID_STATUSES.includes(body.status)) return res.status(400).json({ error: "Invalid status" });
      patch.status = body.status;
      patch.paidAt = body.status === "paid" ? new Date() : null;
    }

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
  invoiceDetails,
  uploadRange,
};
