// backend/src/routes/invoice.routes.js
import { Router, raw } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  listInvoices,
  listAuthorizedInvoices,
  getInvoiceSettings,
  updateInvoiceSettings,
  getNextInvoiceNumber,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  startInvoiceUpload,
  relayInvoiceUploadChunk,
} from "../features/projects/controllers/invoice.controller.js";
import {
  listAuthorizedReceipts,
  recordPayment,
  voidReceipt,
} from "../features/projects/controllers/receipt.controller.js";

const router = Router();

// GET /api/invoices (role-scoped batch read)
router.get("/invoices", requireAuth, listAuthorizedInvoices);
router.get("/receipts", requireAuth, listAuthorizedReceipts);
router.get("/invoices/next-number", requireAuth, getNextInvoiceNumber);
router.get("/invoice-settings", requireAuth, getInvoiceSettings);
router.patch("/invoice-settings", requireAuth, updateInvoiceSettings);

// Server-controlled chunk relay keeps the Google resumable URL out of the browser.
router.post(
  "/projects/:projectId/invoices/upload-session",
  requireAuth,
  startInvoiceUpload,
);
router.post(
  "/projects/:projectId/invoices/upload-chunk",
  requireAuth,
  raw({ type: "application/octet-stream", limit: "3mb" }),
  relayInvoiceUploadChunk,
);

// GET   /api/projects/:projectId/invoices
router.get("/projects/:projectId/invoices", requireAuth, listInvoices);

// POST  /api/projects/:projectId/invoices
router.post("/projects/:projectId/invoices", requireAuth, createInvoice);

// PATCH /api/projects/:projectId/invoices/:invoiceId
router.patch(
  "/projects/:projectId/invoices/:invoiceId",
  requireAuth,
  updateInvoice
);

router.post(
  "/projects/:projectId/invoices/:invoiceId/payments",
  requireAuth,
  recordPayment,
);

router.patch("/receipts/:receiptId/void", requireAuth, voidReceipt);

// DELETE /api/projects/:projectId/invoices/:invoiceId
router.delete(
  "/projects/:projectId/invoices/:invoiceId",
  requireAuth,
  deleteInvoice
);

export default router;
