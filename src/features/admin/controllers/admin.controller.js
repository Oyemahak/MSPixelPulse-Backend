// src/features/admin/controllers/admin.controller.js

import User from '../../../models/User.js';
import Project from '../../../models/Project.js';
import Lead from '../../../models/Lead.js';

import {
  cleanText,
  isValidEmail,
} from '../../../lib/validation.js';

import {
  activeAccountPatch,
  isPrimarySuperAdminEmail,
  isProtectedAccount,
  normalizePolicyEmail,
  protectedAccountMutation,
  strictBoolean,
} from '../../../lib/accountPolicy.js';

import {
  deleteUserPermanently,
} from '../../../lib/deleteUserPermanently.js';

import {
  presentPresence,
} from '../../../lib/presence.js';

const ADMIN_ONLY_FIELDS = [
  'isSuperAdmin',
  'isProtected',
  'accountStatus',
  'protectedReason',
];

const VALID_ROLES = [
  'admin',
  'developer',
  'client',
];

const VALID_ACCOUNT_STATUSES = [
  'pending',
  'active',
  'suspended',
];

const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'completed',
  'spam',
  'archived',
];

function normalizeEmail(email) {
  return normalizePolicyEmail(
    email,
  );
}

function hasForbiddenField(
  body,
  fields,
) {
  return fields.some(
    (field) =>
      Object.prototype
        .hasOwnProperty.call(
          body || {},
          field,
        ),
  );
}

function escapeRegex(
  value = '',
) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function safeAdminUser(user) {
  if (!user) {
    return user;
  }

  const value =
    typeof user.toObject ===
      'function'
      ? user.toObject()
      : {
          ...user,
        };

  delete value.password;
  delete value.passwordHash;

  const primary =
    isPrimarySuperAdminEmail(
      value.email,
    );

  const presence =
    presentPresence(value);

  return {
    ...value,

    lastSeenAt:
      presence.lastSeenAt,

    lastActivityAt:
      presence.lastActivityAt,

    presenceState:
      presence.state,

    presence,

    online:
      presence.online,

    isSuperAdmin:
      primary ||
      strictBoolean(
        value.isSuperAdmin,
      ),

    isProtected:
      isProtectedAccount(
        value,
      ),
  };
}

/* ---------------------------------------------------------
   Leads
   --------------------------------------------------------- */

export async function listLeads(
  req,
  res,
) {
  const cond = {};

  const status =
    cleanText(
      req.query.status,
      40,
    );

  const query =
    cleanText(
      req.query.q,
      120,
    );

  if (
    status &&
    LEAD_STATUSES.includes(
      status,
    )
  ) {
    cond.status =
      status;
  }

  if (query) {
    const rx = {
      $regex:
        escapeRegex(
          query,
        ),

      $options:
        'i',
    };

    cond.$or = [
      {
        name: rx,
      },
      {
        email: rx,
      },
      {
        businessName:
          rx,
      },
      {
        service: rx,
      },
      {
        message: rx,
      },
    ];
  }

  const leads =
    await Lead.find(
      cond,
    )
      .sort({
        createdAt:
          -1,
      })
      .limit(250);

  return res.json({
    leads,

    total:
      leads.length,
  });
}

export async function updateLead(
  req,
  res,
) {
  const status =
    cleanText(
      req.body?.status,
      40,
    );

  if (
    !LEAD_STATUSES.includes(
      status,
    )
  ) {
    return res
      .status(400)
      .json({
        message:
          'Invalid lead status',
      });
  }

  const lead =
    await Lead.findByIdAndUpdate(
      req.params.leadId,
      {
        status,
      },
      {
        new: true,
        runValidators:
          true,
      },
    );

  if (!lead) {
    return res
      .status(404)
      .json({
        message:
          'Lead not found',
      });
  }

  return res.json({
    lead,
  });
}

export async function archiveLead(
  req,
  res,
) {
  const lead =
    await Lead.findByIdAndUpdate(
      req.params.leadId,
      {
        status:
          'archived',
      },
      {
        new: true,
        runValidators:
          true,
      },
    );

  if (!lead) {
    return res
      .status(404)
      .json({
        message:
          'Lead not found',
      });
  }

  return res.json({
    ok: true,
    archived: true,
    lead,
  });
}

/* ---------------------------------------------------------
   Users
   --------------------------------------------------------- */

export async function listUsers(
  req,
  res,
) {
  const q =
    cleanText(
      req.query.q,
      120,
    );

  const status =
    cleanText(
      req.query.status,
      40,
    );

  const cond = {};

  if (
    status &&
    VALID_ACCOUNT_STATUSES.includes(
      status,
    )
  ) {
    cond.status =
      status;
  }

  if (q) {
    cond.$or = [
      {
        name: {
          $regex:
            escapeRegex(q),

          $options:
            'i',
        },
      },
      {
        email: {
          $regex:
            escapeRegex(q),

          $options:
            'i',
        },
      },
    ];
  }

  const users =
    await User.find(
      cond,
    )
      .sort({
        createdAt:
          -1,
      })
      .select(
        '-password',
      );

  return res.json({
    users:
      users.map(
        safeAdminUser,
      ),
  });
}

export async function listPending(
  _req,
  res,
) {
  const users =
    await User.find({
      status:
        'pending',
    })
      .select(
        '-password',
      )
      .sort({
        createdAt:
          -1,
      });

  return res.json({
    users:
      users.map(
        safeAdminUser,
      ),
  });
}

export async function getUser(
  req,
  res,
) {
  const user =
    await User.findById(
      req.params.userId,
    ).select(
      '-password',
    );

  if (!user) {
    return res
      .status(404)
      .json({
        message:
          'User not found',
      });
  }

  const assignedProjects =
    await Project.find({
      $or: [
        {
          client:
            user._id,
        },
        {
          developer:
            user._id,
        },
      ],
    })
      .select(
        '_id title status client developer createdAt updatedAt',
      )
      .sort({
        updatedAt:
          -1,
      })
      .lean();

  return res.json({
    user: {
      ...safeAdminUser(
        user,
      ),

      passwordConfigured:
        true,

      assignedProjects,
    },
  });
}

export async function createUser(
  req,
  res,
) {
  if (
    hasForbiddenField(
      req.body,
      ADMIN_ONLY_FIELDS,
    )
  ) {
    return res
      .status(403)
      .json({
        message:
          'Protected account fields cannot be set from the admin UI',
      });
  }

  const {
    email,
    password,
    role = 'client',
    status = 'active',
  } =
    req.body || {};

  const name =
    cleanText(
      req.body?.name,
      120,
    );

  const normalizedEmail =
    normalizeEmail(
      email,
    );

  if (
    isPrimarySuperAdminEmail(
      normalizedEmail,
    )
  ) {
    return res
      .status(403)
      .json({
        message:
          'Primary super admin account is managed through the protected super admin setup',
      });
  }

  if (
    !name ||
    !isValidEmail(
      normalizedEmail,
    ) ||
    typeof password !==
      'string' ||
    password.length < 8 ||
    password.length > 72
  ) {
    return res
      .status(400)
      .json({
        message:
          'Name, a valid email, and an 8-72 character password are required',
      });
  }

  if (
    !VALID_ROLES.includes(
      role,
    )
  ) {
    return res
      .status(400)
      .json({
        message:
          'Invalid role',
      });
  }

  if (
    !VALID_ACCOUNT_STATUSES.includes(
      status,
    )
  ) {
    return res
      .status(400)
      .json({
        message:
          'Invalid status',
      });
  }

  const existing =
    await User.findOne({
      email:
        normalizedEmail,
    });

  if (existing) {
    return res
      .status(409)
      .json({
        message:
          'An account with this email already exists',
      });
  }

  const now =
    new Date();

  const user =
    await User.create({
      name,

      email:
        normalizedEmail,

      password,

      role,
      status,

      accountStatus:
        status,

      isSuperAdmin:
        false,

      isProtected:
        false,

      accessApplication: {
        status:
          status ===
            'active' &&
          role ===
            'client'
            ? 'approved'
            : 'pending',

        requestedRole:
          role ===
          'client'
            ? 'client'
            : role,

        submittedAt:
          now,

        decidedAt:
          status ===
            'active'
            ? now
            : null,

        decidedBy:
          status ===
            'active'
            ? req.user._id
            : null,
      },
    });

  const safe =
    await User.findById(
      user._id,
    ).select(
      '-password',
    );

  return res
    .status(201)
    .json({
      user:
        safeAdminUser(
          safe,
        ),
    });
}

export async function updateUser(
  req,
  res,
) {
  const {
    userId,
  } =
    req.params;

  const allowed = [
    'name',
    'role',
    'status',
    'email',
    'phone',
    'companyName',
    'businessName',
    'businessWebsite',
    'industry',
    'jobTitle',
    'timezone',
    'preferredContactMethod',
    'bio',
    'specialties',
    'technologies',
    'availability',
    'projectContactPreference',
    'notificationPreferences',
    'avatarUrl',
    'avatarPath',
  ];

  const patch = {};

  for (
    const key of allowed
  ) {
    if (
      Object.prototype
        .hasOwnProperty.call(
          req.body || {},
          key,
        )
    ) {
      patch[key] =
        req.body[key];
    }
  }

  const user =
    await User.findById(
      userId,
    );

  if (!user) {
    return res
      .status(404)
      .json({
        message:
          'User not found',
      });
  }

  if (
    hasForbiddenField(
      req.body,
      ADMIN_ONLY_FIELDS,
    )
  ) {
    return res
      .status(403)
      .json({
        message:
          'Protected account fields cannot be changed from the admin UI',
      });
  }

  if (
    Object.prototype
      .hasOwnProperty.call(
        patch,
        'name',
      )
  ) {
    patch.name =
      cleanText(
        patch.name,
        120,
      );

    if (!patch.name) {
      return res
        .status(400)
        .json({
          message:
            'Name is required',
        });
    }
  }

  if (
    Object.prototype
      .hasOwnProperty.call(
        patch,
        'email',
      )
  ) {
    patch.email =
      normalizeEmail(
        patch.email,
      );

    if (
      !isValidEmail(
        patch.email,
      )
    ) {
      return res
        .status(400)
        .json({
          message:
            'A valid email is required',
        });
    }

    const duplicate =
      await User.findOne({
        email:
          patch.email,
      });

    if (
      duplicate &&
      String(
        duplicate._id,
      ) !==
        String(
          user._id,
        )
    ) {
      return res
        .status(409)
        .json({
          message:
            'An account with this email already exists',
        });
    }
  }

  if (
    patch.role &&
    !VALID_ROLES.includes(
      patch.role,
    )
  ) {
    return res
      .status(400)
      .json({
        message:
          'Invalid role',
      });
  }

  if (
    patch.status &&
    !VALID_ACCOUNT_STATUSES.includes(
      patch.status,
    )
  ) {
    return res
      .status(400)
      .json({
        message:
          'Invalid status',
      });
  }

  if (
    isProtectedAccount(
      user,
    ) &&
    protectedAccountMutation(
      user,
      patch,
    )
  ) {
    return res
      .status(403)
      .json({
        message:
          'Primary protected super admin account cannot be demoted, disabled, or assigned a different email',
      });
  }

  const requestedStatus =
    patch.status;

  delete patch.status;

  Object.assign(
    user,
    patch,
  );

  if (
    requestedStatus ===
    'active'
  ) {
    Object.assign(
      user,
      activeAccountPatch(
        user,
        req.user._id,
      ),
    );
  } else if (
    requestedStatus
  ) {
    user.status =
      requestedStatus;

    user.accountStatus =
      requestedStatus;

    if (
      requestedStatus ===
        'pending' &&
      user.role ===
        'client'
    ) {
      user.accessApplication = {
        ...(
          user
            .accessApplication
            ?.toObject?.() ||
          user
            .accessApplication ||
          {}
        ),

        status:
          'pending',

        requestedRole:
          'client',
      };
    }
  }

  await user.save();

  const safe =
    await User.findById(
      userId,
    ).select(
      '-password',
    );

  return res.json({
    user:
      safeAdminUser(
        safe,
      ),
  });
}

export async function deleteUser(
  req,
  res,
) {
  const {
    userId,
  } =
    req.params;

  const user =
    await User.findById(
      userId,
    );

  if (!user) {
    return res
      .status(404)
      .json({
        message:
          'User not found',
      });
  }

  if (
    isProtectedAccount(
      user,
    )
  ) {
    return res
      .status(403)
      .json({
        message:
          'Primary protected super admin account cannot be deleted',
      });
  }

  if (
    String(
      user._id,
    ) ===
    String(
      req.user._id,
    )
  ) {
    return res
      .status(400)
      .json({
        message:
          'You cannot delete the account currently signed in',
      });
  }

  const result =
    await deleteUserPermanently(
      user,
    );

  return res.json({
    ok: true,
    ...result,
  });
}

export async function setUserPassword(
  req,
  res,
) {
  const {
    userId,
  } =
    req.params;

  const password =
    req.body?.password;

  if (
    typeof password !==
      'string' ||
    password.length < 8 ||
    password.length > 72
  ) {
    return res
      .status(400)
      .json({
        message:
          'Password must be 8-72 characters',
      });
  }

  const user =
    await User.findById(
      userId,
    ).select(
      '+password +authVersion',
    );

  if (!user) {
    return res
      .status(404)
      .json({
        message:
          'User not found',
      });
  }

  if (
    isProtectedAccount(
      user,
    ) &&
    String(
      user._id,
    ) !==
      String(
        req.user._id,
      )
  ) {
    return res
      .status(403)
      .json({
        message:
          'Primary protected super admin credentials cannot be reset by another administrator',
      });
  }

  user.password =
    password;

  user.authVersion =
    Number(
      user.authVersion ||
        0,
    ) + 1;

  user.passwordChangedAt =
    new Date();

  await user.save();

  return res.json({
    ok: true,

    passwordChangedAt:
      user.passwordChangedAt,

    sessionsInvalidated:
      true,
  });
}

export async function approveUser(
  req,
  res,
) {
  const {
    userId,
  } =
    req.params;

  const user =
    await User.findById(
      userId,
    ).select(
      '-password',
    );

  if (!user) {
    return res
      .status(404)
      .json({
        message:
          'User not found',
      });
  }

  Object.assign(
    user,
    activeAccountPatch(
      user,
      req.user._id,
    ),
  );

  await user.save();

  return res.json({
    user:
      safeAdminUser(
        user,
      ),
  });
}

export async function rejectUser(
  req,
  res,
) {
  const {
    userId,
  } =
    req.params;

  const user =
    await User.findById(
      userId,
    );

  if (!user) {
    return res
      .status(404)
      .json({
        message:
          'User not found',
      });
  }

  if (
    isProtectedAccount(
      user,
    )
  ) {
    return res
      .status(403)
      .json({
        message:
          'Primary protected super admin account cannot be rejected',
      });
  }

  if (
    user.status !==
    'pending'
  ) {
    return res
      .status(400)
      .json({
        message:
          'Only pending users can be rejected',
      });
  }

  user.status =
    'suspended';

  user.accountStatus =
    'suspended';

  user.accessApplication = {
    ...(
      user
        .accessApplication
        ?.toObject?.() ||
      user
        .accessApplication ||
      {}
    ),

    status:
      'declined',

    requestedRole:
      'client',

    decidedAt:
      new Date(),

    decidedBy:
      req.user._id,
  };

  await user.save();

  const safe =
    await User.findById(
      userId,
    ).select(
      '-password',
    );

  return res.json({
    ok: true,

    user:
      safeAdminUser(
        safe,
      ),
  });
}

export async function updateRole(
  req,
  res,
) {
  const {
    userId,
  } =
    req.params;

  const {
    role,
  } =
    req.body || {};

  if (
    !VALID_ROLES.includes(
      role,
    )
  ) {
    return res
      .status(400)
      .json({
        message:
          'Invalid role',
      });
  }

  const user =
    await User.findById(
      userId,
    ).select(
      '-password',
    );

  if (!user) {
    return res
      .status(404)
      .json({
        message:
          'User not found',
      });
  }

  if (
    isProtectedAccount(
      user,
    ) &&
    role !==
      user.role
  ) {
    return res
      .status(403)
      .json({
        message:
          'Primary protected super admin account cannot be demoted',
      });
  }

  user.role =
    role;

  if (
    role ===
      'client' &&
    user.status ===
      'active'
  ) {
    Object.assign(
      user,
      activeAccountPatch(
        user,
        req.user._id,
      ),
    );
  }

  await user.save();

  return res.json({
    user:
      safeAdminUser(
        user,
      ),
  });
}

export const adminControllerInternals = {
  strictBoolean,
  isProtectedAccount,
  protectedAccountMutation,
  normalizeEmail,
  isPrimarySuperAdminEmail,
  safeAdminUser,
};
