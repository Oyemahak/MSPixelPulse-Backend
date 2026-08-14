import test from 'node:test';
import assert from 'node:assert/strict';
import { signDriveFileAccess, verifyDriveFileAccess } from './fileAccessToken.js';

test('Drive proxy token is scoped to exactly one Drive file', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-only';
  try {
    const token = signDriveFileAccess('drive-file-a', 60);
    assert.equal(verifyDriveFileAccess(token, 'drive-file-a'), true);
    assert.equal(verifyDriveFileAccess(token, 'drive-file-b'), false);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

