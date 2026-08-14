import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageRequirements,
  canReadProject,
  canWriteProject,
  projectScopeFor,
  sameId,
} from './projectAccess.js';

const client = { _id: 'client-a', role: 'client' };
const otherClient = { _id: 'client-b', role: 'client' };
const developer = { _id: 'developer-a', role: 'developer' };
const admin = { _id: 'admin-a', role: 'admin' };

test('project access treats populated references and raw ids consistently', () => {
  const populated = {
    client: { _id: 'client-a', name: 'Client' },
    developer: { _id: 'developer-a', name: 'Developer' },
  };
  assert.equal(sameId(populated.client, client), true);
  assert.equal(canReadProject(client, populated), true);
  assert.equal(canReadProject(otherClient, populated), false);
  assert.equal(canReadProject(developer, populated), true);
  assert.equal(canReadProject(admin, populated), true);
});

test('write and requirement permissions preserve role boundaries', () => {
  const project = { client: 'client-a', developer: 'developer-a' };
  assert.equal(canWriteProject(client, project), false);
  assert.equal(canWriteProject(developer, project), true);
  assert.equal(canManageRequirements(client, project), true);
  assert.equal(canManageRequirements(otherClient, project), false);
  assert.deepEqual(projectScopeFor(client), { client: client._id });
});
