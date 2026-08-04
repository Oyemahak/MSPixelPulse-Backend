// src/models/Lead.js
import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema(
  {
    inquiryType: { type: String, trim: true, default: "Website Inquiry" },
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true },
    message: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, default: "" },
    businessName: { type: String, trim: true, default: "" },
    service: { type: String, trim: true, default: "" },
    source: { type: String, trim: true, default: "public-contact" },
    sourceTitle: { type: String, trim: true, default: "" },
    sourceSlug: { type: String, trim: true, default: "" },
    sourceUrl: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "completed", "spam"],
      default: "new",
      index: true,
    },
    emailDeliveryStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "pending",
    },
    confirmationEmailStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "pending",
    },
    ip: { type: String, select: false },
    ua: { type: String, select: false },
  },
  { timestamps: true }
);

LeadSchema.index({ createdAt: -1 });
LeadSchema.index({ source: 1, status: 1 });

export default mongoose.model("Lead", LeadSchema);
