import test from 'node:test';
import assert from 'node:assert/strict';
import { inferFileReference, supabaseToDriveInternals } from './supabaseToDrive.js';

test('Supabase migration normalizes signed and public storage URLs', () => {
  assert.equal(supabaseToDriveInternals.normalizedStoragePath(
    'https://example.supabase.co/storage/v1/object/sign/uploads/projects/p1/brief.pdf?token=secret',
    'uploads',
  ), 'projects/p1/brief.pdf');
});

test('Supabase migration infers project hierarchy from stable IDs', () => {
  const context = {
    bucket: 'uploads',
    references: new Map(),
    projectsById: new Map([['507f1f77bcf86cd799439011', { client: 'user-1' }]]),
    userIds: new Set(['user-1']),
  };
  const details = inferFileReference('projects/507f1f77bcf86cd799439011/invoices/invoice.pdf', context);
  assert.equal(details.projectId, '507f1f77bcf86cd799439011');
  assert.equal(details.clientId, 'user-1');
  assert.equal(details.category, 'invoices');
});
