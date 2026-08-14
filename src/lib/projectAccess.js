function refId(value) {
  if (!value) return '';
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
}

export function sameId(left, right) {
  const a = refId(left);
  const b = refId(right);
  return Boolean(a && b && a === b);
}

export function canReadProject(user, project) {
  if (!user || !project) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'developer') return sameId(project.developer, user);
  if (user.role === 'client') return sameId(project.client, user);
  return false;
}

export function canWriteProject(user, project) {
  if (!user || !project) return false;
  if (user.role === 'admin') return true;
  return user.role === 'developer' && sameId(project.developer, user);
}

export function canManageRequirements(user, project) {
  if (!user || !project) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'developer') return sameId(project.developer, user);
  if (user.role === 'client') return sameId(project.client, user);
  return false;
}

export function projectScopeFor(user) {
  if (!user || user.role === 'admin') return {};
  if (user.role === 'developer') return { developer: user._id };
  if (user.role === 'client') return { client: user._id };
  return { _id: null };
}

export function projectAccessError(res) {
  return res.status(403).json({
    code: 'PROJECT_FORBIDDEN',
    message: "You don't have access to this project.",
  });
}
