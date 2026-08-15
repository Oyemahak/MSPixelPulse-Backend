import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTabRecords,
  deriveProjectMembers,
  mongoDocumentToSheetRecord,
  recoverHistoricalReferences,
  validateDatasetRelationships,
} from './mongoToSheets.js';
import { GOOGLE_SHEET_TABS } from '../google/sheets.js';

test('Mongo migration preserves IDs, aliases, timestamps, and password hashes', () => {
  const user = mongoDocumentToSheetRecord('users', {
    _id: { _bsontype: 'ObjectId', toHexString: () => '507f1f77bcf86cd799439011' },
    email: ' USER@EXAMPLE.COM ',
    password: '$2b$10$hash',
    status: 'active',
    accessApplication: { status: 'approved' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.equal(user.id, '507f1f77bcf86cd799439011');
  assert.equal(user._id, '507f1f77bcf86cd799439011');
  assert.equal(user.email, 'user@example.com');
  assert.equal(user.passwordHash, '$2b$10$hash');
  assert.equal('password' in user, false);
  assert.equal(user.applicationStatus, 'approved');
  assert.equal(user.createdAt, '2026-01-01T00:00:00.000Z');
});

test('project membership derivation is stable and idempotent', () => {
  const members = deriveProjectMembers([{ id: 'p1', client: 'u1', developer: 'u2' }]);
  assert.deepEqual(members.map((member) => member.id), ['p1:u1:client', 'p1:u2:developer']);
  assert.deepEqual(deriveProjectMembers([{ id: 'p1', client: 'u1', developer: 'u2' }]), members);
});

test('migration comparison detects missing, extra, and duplicate IDs', () => {
  assert.deepEqual(compareTabRecords([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'c' }, { id: 'c' }]), {
    sourceCount: 2,
    destinationCount: 3,
    missingIds: ['b'],
    extraIds: ['c'],
    duplicateSourceIds: [],
    duplicateDestinationIds: ['c'],
  });
});

test('relationship validation detects cross-table orphans', () => {
  const dataset = new Map(Object.values(GOOGLE_SHEET_TABS).map((tab) => [tab, []]));
  dataset.set(GOOGLE_SHEET_TABS.users, [{ id: 'u1' }]);
  dataset.set(GOOGLE_SHEET_TABS.projects, [{ id: 'p1', clientId: 'missing-user' }]);
  const orphaned = validateDatasetRelationships(dataset);
  assert.equal(orphaned.length, 1);
  assert.equal(orphaned[0].targetId, 'missing-user');
});

test('historical relationship recovery creates suspended user and archived project tombstones', () => {
  const dataset = new Map(Object.values(GOOGLE_SHEET_TABS).map((tab) => [tab, []]));
  dataset.set(GOOGLE_SHEET_TABS.users, [{ id: 'u1' }]);
  dataset.set(GOOGLE_SHEET_TABS.projects, [{ id: 'p1' }]);
  dataset.set(GOOGLE_SHEET_TABS.messages, [{
    id: 'm1', projectId: 'deleted-project', authorId: 'deleted-user',
  }]);
  const recovery = recoverHistoricalReferences(dataset);
  assert.deepEqual(recovery.recoveredUsers, ['deleted-user']);
  assert.deepEqual(recovery.recoveredProjects, ['deleted-project']);
  assert.equal(recovery.unresolved.length, 0);
  assert.equal(dataset.get(GOOGLE_SHEET_TABS.users).at(-1).status, 'suspended');
  assert.equal(dataset.get(GOOGLE_SHEET_TABS.users).at(-1).passwordHash, '');
  assert.equal(dataset.get(GOOGLE_SHEET_TABS.projects).at(-1).status, 'archived');
});
