import mongoose from "mongoose";

const BlogCommentSchema = new mongoose.Schema(
  {
    blogSlug: { type: String, required: true, trim: true, index: true },
    blogTitle: { type: String, required: true, trim: true },
    blogUrl: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, select: false },
    comment: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "spam"],
      default: "pending",
      index: true,
    },
    emailDeliveryStatus: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "pending",
    },
  },
  { timestamps: true },
);

BlogCommentSchema.index({ blogSlug: 1, status: 1, createdAt: -1 });

export default mongoose.model("BlogComment", BlogCommentSchema);
