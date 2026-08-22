import Project from '../models/Project.js';
import User from '../models/User.js';

import {
  isProtectedAccount,
} from './accountPolicy.js';

import {
  presentPresence,
} from './presence.js';
import { presentUser } from './presentUser.js';

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

async function presentPeer(user, presenter = presentUser) {
  const presented = await presenter(user);
  const presence = presented?.presence || presentPresence(presented || user);

  return {
    _id: presented?._id || presented?.id,
    name: presented?.name || '',
    email: presented?.email || '',
    role: presented?.role || '',
    roleLabel:
      presented?.role === 'admin' && isProtectedAccount(presented)
        ? 'Super Admin'
        : presented?.role === 'admin'
          ? 'Admin'
          : presented?.role === 'developer'
            ? 'Developer'
            : 'Client',
    avatarUrl: presented?.avatarUrl || '',
    lastSeenAt: presence.lastSeenAt,
    lastActivityAt: presence.lastActivityAt,
    presenceState: presence.state,
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
      '_id name email role status accountStatus avatarPath avatarUrl lastSeenAt lastActivityAt presenceState isSuperAdmin isProtected',
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

  const peers = selectAuthorizedDirectPeers({
    currentUser,
    users,
    projects,
  });

  return Promise.all(peers.map((peer) => presentPeer(peer)));
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
