import mongoose from 'mongoose';
import { createProviderModel } from '../providers/providerModel.js';

const FileRefSchema = new mongoose.Schema(
  { name: String, type: String, size: Number, url: String, path: String },
  { _id: false },
);

const PartySnapshotSchema = new mongoose.Schema(
  {
    businessName: { type: String, trim: true, default: '' },
    contactName: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const PaymentBreakdownSchema = new mongoose.Schema(
  {
    paymentId: { type: String, trim: true, required: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNumber: { type: String, trim: true, required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: null },
    method: { type: String, trim: true, default: 'Other' },
    reference: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const ReceiptSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, trim: true, unique: true, index: true },
    receiptType: { type: String, enum: ['payment', 'consolidated'], default: 'payment', index: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    invoiceNumber: { type: String, trim: true, required: true },
    invoices: { type: [mongoose.Schema.Types.ObjectId], ref: 'Invoice', default: [] },
    invoiceNumbers: { type: [String], default: [] },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    paymentId: { type: String, required: true, trim: true, unique: true, index: true },
    paymentIds: { type: [String], default: [] },
    paymentBreakdown: { type: [PaymentBreakdownSchema], default: [] },
    idempotencyKey: { type: String, required: true, trim: true, unique: true, index: true },
    paymentDate: { type: Date, default: null },
    receiptDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, trim: true, default: 'CAD' },
    method: { type: String, trim: true, default: 'Other' },
    paymentReference: { type: String, trim: true, default: '' },
    paymentNote: { type: String, trim: true, default: '' },
    paymentStage: { type: String, trim: true, default: 'other' },
    hidePaymentMethod: { type: Boolean, default: false },
    senderSnapshot: { type: PartySnapshotSchema, default: () => ({}) },
    clientSnapshot: { type: PartySnapshotSchema, default: () => ({}) },
    projectTitleSnapshot: { type: String, trim: true, default: '' },
    serviceDescriptionSnapshot: { type: String, trim: true, default: '' },
    invoiceTotalSnapshot: { type: Number, min: 0, default: 0 },
    previouslyPaidSnapshot: { type: Number, min: 0, default: 0 },
    paymentAmountSnapshot: { type: Number, min: 0, default: 0 },
    totalPaidSnapshot: { type: Number, min: 0, default: 0 },
    balanceRemainingSnapshot: { type: Number, min: 0, default: 0 },
    taxApplied: { type: Boolean, default: false },
    taxLabel: { type: String, trim: true, default: '' },
    taxRate: { type: Number, min: 0, default: 0 },
    taxAmount: { type: Number, min: 0, default: 0 },
    taxRegistrationNumber: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['issued', 'void'], default: 'issued', index: true },
    file: { type: FileRefSchema, default: null },
    issuedAt: { type: Date, required: true },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, trim: true, default: '' },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

ReceiptSchema.index({ project: 1, createdAt: -1 });
ReceiptSchema.index({ client: 1, createdAt: -1 });
ReceiptSchema.index({ invoice: 1, createdAt: -1 });

const Receipt = mongoose.model('Receipt', ReceiptSchema);

export default createProviderModel(Receipt, {
  modelName: 'Receipt',
  tab: 'Receipts',
  relations: { invoice: 'Invoice', invoices: 'Invoice', project: 'Project', client: 'User', createdBy: 'User', voidedBy: 'User' },
  unique: [['receiptNumber'], ['paymentId'], ['idempotencyKey']],
  defaults: {
    receiptType: 'payment', invoices: [], invoiceNumbers: [], paymentIds: [], paymentBreakdown: [],
    currency: 'CAD', method: 'Other', paymentReference: '', paymentNote: '', paymentStage: 'other', hidePaymentMethod: false,
    senderSnapshot: {}, clientSnapshot: {}, invoiceTotalSnapshot: 0, previouslyPaidSnapshot: 0,
    paymentAmountSnapshot: 0, totalPaidSnapshot: 0, balanceRemainingSnapshot: 0,
    taxApplied: false, taxLabel: '', taxRate: 0, taxAmount: 0, taxRegistrationNumber: '',
    status: 'issued', voidedAt: null, voidReason: '', voidedBy: null,
  },
});
