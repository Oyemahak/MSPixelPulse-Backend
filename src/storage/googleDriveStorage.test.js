import test from 'node:test';
import assert from 'node:assert/strict';
import { googleDriveStorageInternals } from './googleDriveStorage.js';

test('Google Drive storage routes migrated metadata into client and project hierarchies', () => {
  assert.equal(googleDriveStorageInternals.logicalFileDetails('legacy/file.pdf', {
    projectId: 'project-1', category: 'invoice',
  }).kind, 'project');
  assert.equal(googleDriveStorageInternals.logicalFileDetails('legacy/avatar.png', {
    userId: 'user-1', category: 'profile',
  }).kind, 'client');
  assert.equal(googleDriveStorageInternals.clientFolderRole('profile'), 'Profile');
  assert.equal(googleDriveStorageInternals.clientFolderRole('documents'), 'Documents');
  assert.equal(googleDriveStorageInternals.projectFolderRole('message-attachments'), 'Message Attachments');
});
