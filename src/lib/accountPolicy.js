// src/lib/accountPolicy.js

export const DEFAULT_SUPER_ADMIN_EMAIL =
  'mahakpateluiux@gmail.com';

export function normalizePolicyEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function strictBoolean(value) {
  if (value === true) {
    return true;
  }

  if (
    value === false ||
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return false;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes'
  );
}

export function primarySuperAdminEmail() {
  return normalizePolicyEmail(
    process.env.SUPER_ADMIN_EMAIL ||
      DEFAULT_SUPER_ADMIN_EMAIL,
  );
}

export function isPrimarySuperAdminEmail(email) {
  const target =
    primarySuperAdminEmail();

  const candidate =
    normalizePolicyEmail(email);

  return Boolean(
    target &&
    candidate &&
    candidate === target,
  );
}

export function isProtectedAccount(user) {
  if (!user) {
    return false;
  }

  return (
    isPrimarySuperAdminEmail(
      user.email,
    ) ||
    strictBoolean(
      user.isSuperAdmin,
    ) ||
    strictBoolean(
      user.isProtected,
    )
  );
}

function changed(before, after) {
  return (
    String(before ?? '') !==
    String(after ?? '')
  );
}

export function protectedAccountMutation(
  user,
  patch = {},
) {
  if (!user) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'role',
    ) &&
    changed(
      user.role,
      patch.role,
    )
  ) {
    return true;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'status',
    ) &&
    changed(
      user.status,
      patch.status,
    )
  ) {
    return true;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      patch,
      'email',
    ) &&
    changed(
      normalizePolicyEmail(
        user.email,
      ),
      normalizePolicyEmail(
        patch.email,
      ),
    )
  ) {
    return true;
  }

  return false;
}

export function accountAccessState(user) {
  if (!user) {
    return {
      allowed: false,
      reason: 'missing',
    };
  }

  if (
    user.status !== 'active' ||
    user.accountStatus !== 'active'
  ) {
    return {
      allowed: false,
      reason: 'inactive',
    };
  }

  if (
    user.role === 'client' &&
    user.accessApplication?.status !==
      'approved'
  ) {
    return {
      allowed: false,
      reason: 'unapproved',
    };
  }

  return {
    allowed: true,
    reason: 'active',
  };
}

export function isPortalAccountActive(user) {
  return accountAccessState(user)
    .allowed;
}

export function activeAccountPatch(
  user,
  decidedBy = null,
) {
  const patch = {
    status: 'active',
    accountStatus: 'active',
  };

  if (
    user?.role === 'client'
  ) {
    patch.accessApplication = {
      ...(
        user.accessApplication
          ?.toObject?.() ||
        user.accessApplication ||
        {}
      ),

      status: 'approved',
      requestedRole: 'client',

      decidedAt:
        new Date(),

      decidedBy:
        decidedBy ||
        user.accessApplication
          ?.decidedBy ||
        null,
    };
  }

  return patch;
}