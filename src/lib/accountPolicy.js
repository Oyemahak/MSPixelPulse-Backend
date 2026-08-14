export function accountAccessState(user) {
  if (!user) return { allowed: false, reason: 'missing' };
  if (user.status !== 'active' || user.accountStatus !== 'active') {
    return { allowed: false, reason: 'inactive' };
  }
  if (user.role === 'client' && user.accessApplication?.status !== 'approved') {
    return { allowed: false, reason: 'unapproved' };
  }
  return { allowed: true, reason: 'active' };
}

export function isPortalAccountActive(user) {
  return accountAccessState(user).allowed;
}

export function activeAccountPatch(user, decidedBy = null) {
  const patch = {
    status: 'active',
    accountStatus: 'active',
  };

  if (user?.role === 'client') {
    patch.accessApplication = {
      ...(user.accessApplication?.toObject?.() || user.accessApplication || {}),
      status: 'approved',
      requestedRole: 'client',
      decidedAt: new Date(),
      decidedBy: decidedBy || user.accessApplication?.decidedBy || null,
    };
  }

  return patch;
}
