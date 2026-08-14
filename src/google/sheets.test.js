import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureGoogleSheetTabs, GoogleSheetsRepository, sheetsInternals } from './sheets.js';

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

test('Google Sheets repositories resolve the spreadsheet environment at request time', () => {
  const original = process.env.GOOGLE_DATABASE_SPREADSHEET_ID;
  try {
    process.env.GOOGLE_DATABASE_SPREADSHEET_ID = 'phase1-test-sheet-a';
    const repository = new GoogleSheetsRepository('Users');
    assert.equal(repository.resolveSpreadsheetId(), 'phase1-test-sheet-a');
    process.env.GOOGLE_DATABASE_SPREADSHEET_ID = 'phase1-test-sheet-b';
    assert.equal(repository.resolveSpreadsheetId(), 'phase1-test-sheet-b');
  } finally {
    if (original === undefined) delete process.env.GOOGLE_DATABASE_SPREADSHEET_ID;
    else process.env.GOOGLE_DATABASE_SPREADSHEET_ID = original;
  }
});

test('blank test spreadsheets initialize required tabs against only the injected target', async () => {
  const targetSpreadsheetId = 'isolated-phase1-sheet';
  const requiredTabs = ['Users', 'Projects'];
  const calls = [];
  let existingTabs = ['Sheet1'];
  const sheetsApi = {
    spreadsheets: {
      async get(input) {
        calls.push({ operation: 'get', ...input });
        return {
          data: {
            spreadsheetId: targetSpreadsheetId,
            sheets: existingTabs.map((title, sheetId) => ({ properties: { sheetId, title } })),
          },
        };
      },
      async batchUpdate(input) {
        calls.push({ operation: 'batchUpdate', ...input });
        existingTabs = [
          ...existingTabs,
          ...input.requestBody.requests.map((request) => request.addSheet.properties.title),
        ];
        return { data: {} };
      },
    },
  };

  const result = await ensureGoogleSheetTabs({
    tabs: requiredTabs,
    createMissing: true,
    spreadsheet: targetSpreadsheetId,
    sheetsApi,
  });

  assert.deepEqual(result.createdTabs, requiredTabs);
  assert.deepEqual(requiredTabs.every((tab) => result.existingTabs.includes(tab)), true);
  assert.deepEqual(calls.map((call) => call.operation), ['get', 'batchUpdate', 'get']);
  assert.deepEqual(calls.every((call) => call.spreadsheetId === targetSpreadsheetId), true);
});
