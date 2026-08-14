import test from 'node:test';
import assert from 'node:assert/strict';
import { accountAccessState, activeAccountPatch } from './accountPolicy.js';

test('client portal access requires active account and approved application', () => {
  assert.equal(accountAccessState({
    role: 'client',
    status: 'active',
    accountStatus: 'active',
    accessApplication: { status: 'approved' },
  }).allowed, true);
  assert.equal(accountAccessState({
    role: 'client',
    status: 'active',
    accountStatus: 'active',
    accessApplication: { status: 'pending' },
  }).allowed, false);
  assert.equal(accountAccessState({
    role: 'client',
    status: 'suspended',
    accountStatus: 'suspended',
    accessApplication: { status: 'approved' },
  }).allowed, false);
});

test('activation restores approved client access', () => {
  const patch = activeAccountPatch({ role: 'client', accessApplication: { status: 'approved' } }, 'admin-a');
  assert.equal(patch.status, 'active');
  assert.equal(patch.accountStatus, 'active');
  assert.equal(patch.accessApplication.status, 'approved');
  assert.equal(patch.accessApplication.decidedBy, 'admin-a');
});
