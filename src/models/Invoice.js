// backend/src/models/Invoice.js
import mongoose from "mongoose";
import { createProviderModel } from '../providers/providerModel.js';

const FileRef = new mongoose.Schema(
  { name: String, type: String, size: Number, url: String, path: String },
  { _id: false }
);

const LineItemSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true, required: true },
    quantity: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", index: true, required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, default: null },
    kind: { type: String, enum: ["advance", "final", "other"], default: "advance" },
    status: { type: String, enum: ["draft", "sent", "uploaded", "paid", "archived"], default: "draft", index: true },
    invoiceNumber: { type: String, trim: true, default: "", index: true },
    title: { type: String, trim: true, default: "" },
    issueDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    currency: { type: String, trim: true, default: "CAD" },
    lineItems: { type: [LineItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
    taxLabel: { type: String, trim: true, default: "" },
    taxAmount: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, default: "" },
    isDemo: { type: Boolean, default: false, index: true },
    file: FileRef,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    paidAt: Date,
  },
  { timestamps: true }
);

InvoiceSchema.index({ project: 1, kind: 1, createdAt: -1 });

const Invoice = mongoose.model("Invoice", InvoiceSchema);
export default createProviderModel(Invoice, {
  modelName: 'Invoice', tab: 'Invoices', relations: { project: 'Project', client: 'User', uploadedBy: 'User' },
  defaults: { kind: 'advance', status: 'draft', currency: 'CAD', lineItems: [], subtotal: 0, taxAmount: 0, total: 0, isDemo: false },
});
