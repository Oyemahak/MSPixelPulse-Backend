import assert from 'node:assert/strict';
import test from 'node:test';

import {
  directMessageAccessInternals,
  peerIdFromThread,
  selectAuthorizedDirectPeers,
} from './directMessageAccess.js';

const users = [
  { _id: 'owner', role: 'admin', status: 'active', accountStatus: 'active', isSuperAdmin: true },
  { _id: 'admin', role: 'admin', status: 'active', accountStatus: 'active' },
  { _id: 'dev-a', role: 'developer', status: 'active', accountStatus: 'active' },
  { _id: 'dev-b', role: 'developer', status: 'active', accountStatus: 'active' },
  { _id: 'client-a', role: 'client', status: 'active', accountStatus: 'active' },
  { _id: 'client-b', role: 'client', status: 'active', accountStatus: 'active' },
  { _id: 'suspended', role: 'client', status: 'active', accountStatus: 'suspended' },
];

const projects = [
  { _id: 'project-a', client: 'client-a', developer: 'dev-a' },
  { _id: 'project-b', client: 'client-b', developer: 'dev-b' },
];

function ids(currentUser) {
  return selectAuthorizedDirectPeers({ currentUser, users, projects })
    .map((user) => String(user._id))
    .sort();
}

test('admin can message active portal users but not suspended users', () => {
  assert.deepEqual(ids(users[1]), ['client-a', 'client-b', 'dev-a', 'dev-b', 'owner']);
});

test('client can message only the super admin and assigned developers', () => {
  assert.deepEqual(ids(users[4]), ['dev-a', 'owner']);
});

test('developer can message admins and clients assigned to their projects', () => {
  assert.deepEqual(ids(users[2]), ['admin', 'client-a', 'owner']);
});

test('peerIdFromThread returns the other participant', () => {
  assert.equal(
    peerIdFromThread({ participants: ['client-a', 'dev-a'] }, 'client-a'),
    'dev-a',
  );
});

test('peer presentation resolves durable avatar storage at response time', async () => {
  const peer = await directMessageAccessInternals.presentPeer(
    { _id: 'owner', name: 'Portal Admin', role: 'admin', avatarPath: 'avatars/admin/profile.jpg' },
    async (user) => ({ ...user, avatarUrl: 'https://signed.example/avatar.jpg' }),
  );

  assert.equal(peer.avatarUrl, 'https://signed.example/avatar.jpg');
  assert.equal(peer.roleLabel, 'Admin');
});
