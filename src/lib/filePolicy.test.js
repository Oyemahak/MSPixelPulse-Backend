import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFileName, pathBelongsToProjectPurpose, validateUpload } from './filePolicy.js';

test('invoice policy accepts supported documents and rejects executable content', () => {
  assert.equal(validateUpload({ originalname: 'invoice.pdf', mimetype: 'application/pdf', size: 2048 }, 'invoice').ok, true);
  assert.equal(validateUpload({ originalname: 'invoice.exe', mimetype: 'application/x-msdownload', size: 2048 }, 'invoice').ok, false);
  assert.equal(validateUpload({ originalname: 'invoice.exe', mimetype: 'application/pdf', size: 2048 }, 'invoice').ok, false);
});

test('cover policy accepts images only', () => {
  assert.equal(validateUpload({ originalname: 'cover.webp', mimetype: 'image/webp', size: 2048 }, 'cover').ok, true);
  assert.equal(validateUpload({ originalname: 'cover.pdf', mimetype: 'application/pdf', size: 2048 }, 'cover').ok, false);
});

test('message policy accepts safe project-room attachments', () => {
  assert.equal(validateUpload({ originalname: 'notes.txt', mimetype: 'text/plain', size: 120 }, 'message').ok, true);
  assert.equal(validateUpload({ originalname: 'payload.js', mimetype: 'text/javascript', size: 120 }, 'message').ok, false);
});

test('storage ownership is scoped to the project and purpose', () => {
  assert.equal(pathBelongsToProjectPurpose('projects/abc/invoices/one.pdf', 'abc', 'invoice'), true);
  assert.equal(pathBelongsToProjectPurpose('projects/other/invoices/one.pdf', 'abc', 'invoice'), false);
});

test('filenames cannot escape their storage directory', () => {
  assert.equal(cleanFileName('../../invoice final.pdf'), 'invoice_final.pdf');
});
