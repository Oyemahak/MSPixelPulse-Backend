import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetsInternals } from './sheets.js';

test('Google Sheets helper uses spreadsheet row positions only internally and preserves structured cells', () => {
  assert.equal(sheetsInternals.columnName(0), 'A');
  assert.equal(sheetsInternals.columnName(25), 'Z');
  assert.equal(sheetsInternals.columnName(26), 'AA');
  const object = { projectId: '507f1f77bcf86cd799439011', files: ['brief.pdf'] };
  assert.deepEqual(sheetsInternals.parsedCellValue(sheetsInternals.stableCellValue(object)), object);
  assert.equal(sheetsInternals.stableCellValue('007'), '007');
});

test('Google Sheets filter supports stable relationship values', () => {
  const record = { id: 'abc', projectId: 'project-1', userId: 'user-1' };
  assert.equal(sheetsInternals.matchesFilter(record, { projectId: 'project-1' }), true);
  assert.equal(sheetsInternals.matchesFilter(record, { projectId: { $in: ['project-1'] } }), true);
  assert.equal(sheetsInternals.matchesFilter(record, { userId: 'user-2' }), false);
});

