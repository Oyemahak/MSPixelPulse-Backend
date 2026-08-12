// backend/src/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: true },
    role: { type: String, enum: ['admin', 'developer', 'client'], default: 'client' },
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
    accountStatus: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
    isSuperAdmin: { type: Boolean, default: false, index: true },
    isProtected: { type: Boolean, default: false, index: true },
    protectedReason: { type: String, trim: true, default: '' },
    accessApplication: {
      status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
      requestedRole: { type: String, enum: ['client'], default: 'client' },
      submittedAt: { type: Date, default: Date.now },
      decidedAt: { type: Date, default: null },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      decisionNote: { type: String, trim: true, default: '' },
    },

    // NEW: avatar fields
    avatarUrl: { type: String, trim: true, default: '' },  // public URL for header
    avatarPath: { type: String, trim: true, default: '' }, // storage path for clean deletes

    phone: { type: String, trim: true, default: '' },
    companyName: { type: String, trim: true, default: '' },
    businessName: { type: String, trim: true, default: '' },
    businessWebsite: { type: String, trim: true, default: '' },
    industry: { type: String, trim: true, default: '' },
    jobTitle: { type: String, trim: true, default: '' },
    timezone: { type: String, trim: true, default: 'America/Toronto' },
    preferredContactMethod: {
      type: String,
      enum: ['email', 'phone', 'whatsapp', 'portal'],
      default: 'email',
    },
    bio: { type: String, trim: true, default: '' },
    specialties: [{ type: String, trim: true }],
    technologies: [{ type: String, trim: true }],
    availability: { type: String, trim: true, default: '' },
    projectContactPreference: { type: String, trim: true, default: '' },
    notificationPreferences: {
      portalUpdates: { type: Boolean, default: true },
      emailUpdates: { type: Boolean, default: true },
      billingAlerts: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.index({ status: 1, createdAt: -1 });

UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.model('User', UserSchema);
