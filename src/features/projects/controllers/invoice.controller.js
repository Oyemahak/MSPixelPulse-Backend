// backend/src/features/projects/controllers/invoice.controller.js
import Invoice from "../../../models/Invoice.js";
import Project from "../../../models/Project.js";
import { createSignedUrl, removePath } from "../../../lib/supabase.js";
import { pathBelongsToProjectPurpose } from "../../../lib/filePolicy.js";
import { cleanText } from "../../../lib/validation.js";

const VALID_STATUSES = ["draft", "sent", "uploaded", "paid", "archived"];

function canRead(user, project) {
  if (!user || !project) return false;
  if (String(project.client) === String(user._id)) return true;
  if (String(project.developer) === String(user._id)) return true;
  return user.role === "admin";
}
function canWrite(user, project) {
  if (!user || !project) return false;
  return user.role === "admin";
}

function normalizeKind(value) {
  return ['advance', 'final', 'other'].includes(value) ? value : '';
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
    if (!canRead(req.user, project)) return res.status(403).json({ error: "Forbidden" });
    const filter = { project: projectId, status: { $ne: "archived" } };
    const rows = await Invoice.find(filter).sort({ createdAt: -1 }).lean();
    await Promise.all(rows.map(freshInvoiceFile));
    res.json({ invoices: rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/projects/:projectId/invoices
export async function createInvoice(req, res, next) {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId).lean();
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (!canWrite(req.user, project)) return res.status(403).json({ error: "Forbidden" });

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
