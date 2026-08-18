import Project from '../models/Project.js';
import User from '../models/User.js';

import {
  isProtectedAccount,
} from './accountPolicy.js';

import {
  presentPresence,
} from './presence.js';

function idOf(value) {
  if (!value) return '';
  return String(value._id || value.id || value);
}

function activePeer(user) {
  return Boolean(
    user &&
    user.status === 'active' &&
    user.accountStatus !== 'suspended',
  );
}

export function selectAuthorizedDirectPeers({
  currentUser,
  users = [],
  projects = [],
}) {
  const me = idOf(currentUser);

  if (!me) return [];

  const candidates = users.filter(
    (user) => activePeer(user) && idOf(user) !== me,
  );

  if (currentUser.role === 'admin') {
    return candidates.filter((user) =>
      ['admin', 'developer', 'client'].includes(user.role),
    );
  }

  if (currentUser.role === 'client') {
    const developerIds = new Set(
      projects
        .filter((project) => idOf(project.client) === me)
        .map((project) => idOf(project.developer))
        .filter(Boolean),
    );

    return candidates.filter((user) =>
      (
        user.role === 'admin' &&
        isProtectedAccount(user)
      ) || (
        user.role === 'developer' &&
        developerIds.has(idOf(user))
      ),
    );
  }

  if (currentUser.role === 'developer') {
    const clientIds = new Set(
      projects
        .filter((project) => idOf(project.developer) === me)
        .map((project) => idOf(project.client))
        .filter(Boolean),
    );

    return candidates.filter((user) =>
      user.role === 'admin' ||
      (
        user.role === 'client' &&
        clientIds.has(idOf(user))
      ),
    );
  }

  return [];
}

function presentPeer(user) {
  const presence = presentPresence(user);

  return {
    _id: user._id || user.id,
    name: user.name || '',
    email: user.email || '',
    role: user.role || '',
    roleLabel:
      user.role === 'admin' && isProtectedAccount(user)
        ? 'Super Admin'
        : user.role === 'admin'
          ? 'Admin'
          : user.role === 'developer'
            ? 'Developer'
            : 'Client',
    avatarUrl: user.avatarUrl || '',
    lastSeenAt: presence.lastSeenAt,
    presence,
    online: presence.online,
  };
}

export async function listAuthorizedDirectPeers(currentUser) {
  if (!currentUser?._id || !currentUser?.role) return [];

  const userQuery = User.find({
    status: 'active',
    accountStatus: { $ne: 'suspended' },
  })
    .select(
      '_id name email role status accountStatus avatarUrl lastSeenAt isSuperAdmin isProtected',
    )
    .sort({ role: 1, name: 1 })
    .lean();

  const projectQuery = currentUser.role === 'admin'
    ? Promise.resolve([])
    : Project.find(
      currentUser.role === 'client'
        ? { client: currentUser._id }
        : { developer: currentUser._id },
    )
      .select('_id client developer')
      .lean();

  const [users, projects] = await Promise.all([
    userQuery,
    projectQuery,
  ]);

  return selectAuthorizedDirectPeers({
    currentUser,
    users,
    projects,
  }).map(presentPeer);
}

export function peerIdFromThread(thread, currentUserId) {
  const me = idOf(currentUserId);

  return (thread?.participants || [])
    .map(idOf)
    .find((participantId) => participantId && participantId !== me) || '';
}

export const directMessageAccessInternals = {
  activePeer,
  idOf,
  presentPeer,
};
