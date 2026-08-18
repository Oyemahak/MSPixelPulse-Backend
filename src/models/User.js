// src/models/User.js

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import {
  createProviderModel,
} from '../providers/providerModel.js';

const UserSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        trim: true,
      },

      email: {
        type: String,
        unique: true,
        required: true,
        lowercase: true,
        trim: true,
      },

      password: {
        type: String,
        required: true,
        select: false,
      },

      passwordChangedAt: {
        type: Date,
        default: null,
      },

      authVersion: {
        type: Number,
        default: 0,
        min: 0,
        select: false,
      },

      role: {
        type: String,
        enum: [
          'admin',
          'developer',
          'client',
        ],
        default:
          'client',
      },

      status: {
        type: String,
        enum: [
          'pending',
          'active',
          'suspended',
        ],
        default:
          'pending',
      },

      accountStatus: {
        type: String,
        enum: [
          'pending',
          'active',
          'suspended',
        ],
        default:
          'pending',
      },

      isSuperAdmin: {
        type: Boolean,
        default: false,
        index: true,
      },

      isProtected: {
        type: Boolean,
        default: false,
        index: true,
      },

      protectedReason: {
        type: String,
        trim: true,
        default: '',
      },

      accessApplication: {
        status: {
          type: String,
          enum: [
            'pending',
            'approved',
            'declined',
          ],
          default:
            'pending',
        },

        requestedRole: {
          type: String,
          enum: [
            'client',
          ],
          default:
            'client',
        },

        submittedAt: {
          type: Date,
          default:
            Date.now,
        },

        decidedAt: {
          type: Date,
          default: null,
        },

        decidedBy: {
          type:
            mongoose.Schema
              .Types.ObjectId,

          ref:
            'User',

          default:
            null,
        },

        decisionNote: {
          type: String,
          trim: true,
          default: '',
        },
      },

      avatarUrl: {
        type: String,
        trim: true,
        default: '',
      },

      avatarPath: {
        type: String,
        trim: true,
        default: '',
      },

      phone: {
        type: String,
        trim: true,
        default: '',
      },

      companyName: {
        type: String,
        trim: true,
        default: '',
      },

      businessName: {
        type: String,
        trim: true,
        default: '',
      },

      businessWebsite: {
        type: String,
        trim: true,
        default: '',
      },

      industry: {
        type: String,
        trim: true,
        default: '',
      },

      jobTitle: {
        type: String,
        trim: true,
        default: '',
      },

      timezone: {
        type: String,
        trim: true,
        default:
          'America/Toronto',
      },

      preferredContactMethod: {
        type: String,
        enum: [
          'email',
          'phone',
          'whatsapp',
          'portal',
        ],
        default:
          'email',
      },

      bio: {
        type: String,
        trim: true,
        default: '',
      },

      specialties: [
        {
          type: String,
          trim: true,
        },
      ],

      technologies: [
        {
          type: String,
          trim: true,
        },
      ],

      availability: {
        type: String,
        trim: true,
        default: '',
      },

      projectContactPreference: {
        type: String,
        trim: true,
        default: '',
      },

      notificationPreferences: {
        portalUpdates: {
          type: Boolean,
          default: true,
        },

        emailUpdates: {
          type: Boolean,
          default: true,
        },

        billingAlerts: {
          type: Boolean,
          default: true,
        },
      },

      themePreference: {
        type: String,
        enum: [
          'light',
          'dark',
        ],
        default:
          'dark',
      },

      /*
       * Durable portal presence.
       *
       * Production runs on Vercel, so online state must not
       * depend on process memory. The frontend periodically
       * refreshes this timestamp through the authenticated
       * heartbeat endpoint.
       */
      lastSeenAt: {
        type: Date,
        default: null,
        index: true,
      },

      lastActivityAt: {
        type: Date,
        default: null,
        index: true,
      },

      presenceState: {
        type: String,
        enum: [
          'online',
          'offline',
        ],
        default:
          'offline',
      },
    },
    {
      timestamps: true,
    },
  );

UserSchema.pre(
  'save',
  async function (
    next,
  ) {
    if (
      !this.isModified(
        'password',
      )
    ) {
      return next();
    }

    this.password =
      await bcrypt.hash(
        this.password,
        10,
      );

    this.passwordChangedAt =
      new Date();

    return next();
  },
);

UserSchema.index({
  status: 1,
  createdAt: -1,
});

UserSchema.methods
  .comparePassword =
  function (
    plain,
  ) {
    return bcrypt.compare(
      plain,
      this.password,
    );
  };

const User =
  mongoose.model(
    'User',
    UserSchema,
  );

export default createProviderModel(
  User,
  {
    modelName:
      'User',

    tab:
      'Users',

    unique: [
      [
        'email',
      ],
    ],

    defaults: {
      role:
        'client',

      status:
        'pending',

      accountStatus:
        'pending',

      authVersion:
        0,

      accessApplication: {
        status:
          'pending',

        requestedRole:
          'client',
      },

      notificationPreferences: {
        portalUpdates:
          true,

        emailUpdates:
          true,

        billingAlerts:
          true,
      },

      themePreference:
        'dark',

      lastSeenAt:
        '',

      lastActivityAt:
        '',

      presenceState:
        'offline',
    },
  },
);
