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

const PartySchema = new mongoose.Schema(
  {
    businessName: { type: String, trim: true, default: "" },
    contactName: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    logoUrl: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const PaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, min: 0, required: true },
    date: { type: Date, default: Date.now },
    method: { type: String, trim: true, default: "Other" },
    reference: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const PaymentMethodSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, default: "other" },
    label: { type: String, trim: true, default: "Other" },
    enabled: { type: Boolean, default: true },
    instructions: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", index: true, required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true, default: null },
    kind: { type: String, enum: ["advance", "final", "other"], default: "other" },
    paymentStage: {
      type: String,
      enum: ["full", "advance", "remaining", "custom", "other"],
      default: "other",
      index: true,
    },
    paymentPercent: { type: Number, default: 0, min: 0, max: 100 },
    projectValue: { type: Number, default: 0, min: 0 },
    paymentTermsPreset: {
      type: String,
      enum: ["due_on_receipt", "net_7", "net_14", "net_30", "custom"],
      default: "custom",
    },
    sourceType: { type: String, enum: ["generated", "uploaded"], default: "uploaded" },
    status: {
      type: String,
      enum: ["draft", "sent", "uploaded", "partially_paid", "paid", "overdue", "cancelled", "archived"],
      default: "draft",
      index: true,
    },
    invoiceNumber: { type: String, trim: true, default: "", index: true },
    title: { type: String, trim: true, default: "" },
    issueDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    currency: { type: String, trim: true, default: "CAD" },
    lineItems: { type: [LineItemSchema], default: [] },
    sender: { type: PartySchema, default: () => ({}) },
    clientDetails: { type: PartySchema, default: () => ({}) },
    subtotal: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    chargeTax: { type: Boolean, default: false },
    taxLabel: { type: String, trim: true, default: "" },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0, min: 0 },
    taxRegistrationNumber: { type: String, trim: true, default: "" },
    taxNote: { type: String, trim: true, default: "" },
    total: { type: Number, default: 0, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    payments: { type: [PaymentSchema], default: [] },
    paymentTerms: { type: String, trim: true, default: "" },
    paymentNotice: { type: String, trim: true, default: "" },
    paymentReference: { type: String, trim: true, default: "" },
    paymentMethods: { type: [PaymentMethodSchema], default: [] },
    scopeTerms: { type: String, trim: true, default: "" },
    refundTerms: { type: String, trim: true, default: "" },
    closingMessage: { type: String, trim: true, default: "" },
    footerText: { type: String, trim: true, default: "" },
    showPageNumbers: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: "" },
    internalNotes: { type: String, trim: true, default: "" },
    pageSize: { type: String, enum: ["LETTER", "A4"], default: "LETTER" },
    isDemo: { type: Boolean, default: false, index: true },
    file: FileRef,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    paidAt: Date,
    sentAt: Date,
  },
  { timestamps: true }
);

InvoiceSchema.index({ project: 1, kind: 1, createdAt: -1 });

const Invoice = mongoose.model("Invoice", InvoiceSchema);
export default createProviderModel(Invoice, {
  modelName: 'Invoice', tab: 'Invoices', relations: { project: 'Project', client: 'User', uploadedBy: 'User' },
  defaults: {
    kind: 'other', paymentStage: 'other', paymentPercent: 0, projectValue: 0,
    paymentTermsPreset: 'custom', sourceType: 'uploaded', status: 'draft', currency: 'CAD', lineItems: [], sender: {}, clientDetails: {},
    subtotal: 0, discountAmount: 0, chargeTax: false, taxRate: 0, taxAmount: 0,
    total: 0, amountPaid: 0, balanceDue: 0, payments: [], paymentMethods: [],
    showPageNumbers: true, pageSize: 'LETTER', isDemo: false,
  },
});
