// src/google/sheets.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allocateGoogleSequence,
  ensureGoogleSheetTabs,
  GoogleSheetsRepository,
  sheetsInternals,
} from './sheets.js';

test('Google sequence allocation uses the atomic append row returned by Sheets', async () => {
  let request;
  const sheetsApi = {
    spreadsheets: {
      values: {
        append: async (input) => {
          request = input;
          return { data: { updates: { updatedRange: "'Sequences'!A42:C42" } } };
        },
      },
    },
  };
  const sequence = await allocateGoogleSequence({
    kind: 'receipt',
    reference: 'idem-example',
    spreadsheet: 'test-spreadsheet',
    sheetsApi,
  });
  assert.equal(sequence, 42);
  assert.equal(request.range, "'Sequences'!A:C");
  assert.deepEqual(request.requestBody.values[0].slice(0, 2), ['receipt', 'idem-example']);
});

test(
  'Google Sheets helper uses spreadsheet row positions only internally and preserves structured cells',
  () => {
    assert.equal(
      sheetsInternals.columnName(
        0,
      ),
      'A',
    );

    assert.equal(
      sheetsInternals.columnName(
        25,
      ),
      'Z',
    );

    assert.equal(
      sheetsInternals.columnName(
        26,
      ),
      'AA',
    );

    const object = {
      projectId:
        '507f1f77bcf86cd799439011',

      files: [
        'brief.pdf',
      ],
    };

    assert.deepEqual(
      sheetsInternals.parsedCellValue(
        sheetsInternals.stableCellValue(
          object,
        ),
      ),
      object,
    );

    assert.equal(
      sheetsInternals.stableCellValue(
        '007',
      ),
      '007',
    );
  },
);

test(
  'Google Sheets restores boolean cell values without converting identifier-like strings',
  () => {
    assert.equal(
      sheetsInternals.parsedCellValue(
        'true',
      ),
      true,
    );

    assert.equal(
      sheetsInternals.parsedCellValue(
        'TRUE',
      ),
      true,
    );

    assert.equal(
      sheetsInternals.parsedCellValue(
        'false',
      ),
      false,
    );

    assert.equal(
      sheetsInternals.parsedCellValue(
        'FALSE',
      ),
      false,
    );

    assert.equal(
      sheetsInternals.parsedCellValue(
        true,
      ),
      true,
    );

    assert.equal(
      sheetsInternals.parsedCellValue(
        false,
      ),
      false,
    );

    assert.equal(
      sheetsInternals.parsedCellValue(
        '007',
      ),
      '007',
    );

    assert.equal(
      sheetsInternals.parsedCellValue(
        '1',
      ),
      '1',
    );
  },
);

test(
  'Google Sheets filter supports stable relationship values',
  () => {
    const record = {
      id: 'abc',
      projectId:
        'project-1',
      userId:
        'user-1',
    };

    assert.equal(
      sheetsInternals.matchesFilter(
        record,
        {
          projectId:
            'project-1',
        },
      ),
      true,
    );

    assert.equal(
      sheetsInternals.matchesFilter(
        record,
        {
          projectId: {
            $in: [
              'project-1',
            ],
          },
        },
      ),
      true,
    );

    assert.equal(
      sheetsInternals.matchesFilter(
        record,
        {
          userId:
            'user-2',
        },
      ),
      false,
    );
  },
);

test(
  'Google Sheets repositories resolve the spreadsheet environment at request time',
  () => {
    const original =
      process.env
        .GOOGLE_DATABASE_SPREADSHEET_ID;

    try {
      process.env
        .GOOGLE_DATABASE_SPREADSHEET_ID =
        'phase1-test-sheet-a';

      const repository =
        new GoogleSheetsRepository(
          'Users',
        );

      assert.equal(
        repository.resolveSpreadsheetId(),
        'phase1-test-sheet-a',
      );

      process.env
        .GOOGLE_DATABASE_SPREADSHEET_ID =
        'phase1-test-sheet-b';

      assert.equal(
        repository.resolveSpreadsheetId(),
        'phase1-test-sheet-b',
      );
    } finally {
      if (
        original ===
        undefined
      ) {
        delete process.env
          .GOOGLE_DATABASE_SPREADSHEET_ID;
      } else {
        process.env
          .GOOGLE_DATABASE_SPREADSHEET_ID =
          original;
      }
    }
  },
);

test(
  'Google Sheets row caching is opt-in and bounded',
  () => {
    const original =
      process.env
        .GOOGLE_SHEETS_CACHE_TTL_MS;

    try {
      delete process.env
        .GOOGLE_SHEETS_CACHE_TTL_MS;

      assert.equal(
        sheetsInternals.rowCacheTtlMs(),
        0,
      );

      process.env
        .GOOGLE_SHEETS_CACHE_TTL_MS =
        '300000';

      assert.equal(
        sheetsInternals.rowCacheTtlMs(),
        300000,
      );

      process.env
        .GOOGLE_SHEETS_CACHE_TTL_MS =
        '999999999';

      assert.equal(
        sheetsInternals.rowCacheTtlMs(),
        600000,
      );
    } finally {
      if (
        original ===
        undefined
      ) {
        delete process.env
          .GOOGLE_SHEETS_CACHE_TTL_MS;
      } else {
        process.env
          .GOOGLE_SHEETS_CACHE_TTL_MS =
          original;
      }
    }
  },
);

test(
  'blank test spreadsheets initialize required tabs against only the injected target',
  async () => {
    const targetSpreadsheetId =
      'isolated-phase1-sheet';

    const requiredTabs = [
      'Users',
      'Projects',
    ];

    const calls = [];

    let existingTabs = [
      'Sheet1',
    ];

    const sheetsApi = {
      spreadsheets: {
        async get(input) {
          calls.push({
            operation:
              'get',

            ...input,
          });

          return {
            data: {
              spreadsheetId:
                targetSpreadsheetId,

              sheets:
                existingTabs.map(
                  (
                    title,
                    sheetId,
                  ) => ({
                    properties: {
                      sheetId,
                      title,
                    },
                  }),
                ),
            },
          };
        },

        async batchUpdate(
          input,
        ) {
          calls.push({
            operation:
              'batchUpdate',

            ...input,
          });

          existingTabs = [
            ...existingTabs,

            ...input
              .requestBody
              .requests
              .map(
                (request) =>
                  request
                    .addSheet
                    .properties
                    .title,
              ),
          ];

          return {
            data: {},
          };
        },
      },
    };

    const result =
      await ensureGoogleSheetTabs({
        tabs:
          requiredTabs,

        createMissing:
          true,

        spreadsheet:
          targetSpreadsheetId,

        sheetsApi,
      });

    assert.deepEqual(
      result.createdTabs,
      requiredTabs,
    );

    assert.equal(
      requiredTabs.every(
        (tab) =>
          result.existingTabs.includes(
            tab,
          ),
      ),
      true,
    );

    assert.deepEqual(
      calls.map(
        (call) =>
          call.operation,
      ),
      [
        'get',
        'batchUpdate',
        'get',
      ],
    );

    assert.equal(
      calls.every(
        (call) =>
          call.spreadsheetId ===
          targetSpreadsheetId,
      ),
      true,
    );
  },
);

test(
  'bulk upsert updates existing stable IDs and appends new IDs without per-record reads',
  async () => {
    const calls = [];

    const repository =
      new GoogleSheetsRepository(
        'Users',
        {
          spreadsheet:
            'migration-sheet',
        },
      );

    const current = {
      headers: [
        'id',
        'createdAt',
        'updatedAt',
        'name',
      ],

      records: [
        {
          rowNumber:
            2,

          record: {
            id:
              'existing',

            createdAt:
              '2026-01-01',

            updatedAt:
              '2026-01-01',

            name:
              'Before',
          },
        },
      ],

      nextRowNumber:
        3,
    };

    repository.readRows =
      async () =>
        current;

    repository.ensureHeaders =
      async () =>
        current;

    repository.valuesApi =
      async () => ({
        async batchUpdate(
          input,
        ) {
          calls.push({
            operation:
              'batchUpdate',

            input,
          });
        },

        async append(
          input,
        ) {
          calls.push({
            operation:
              'append',

            input,
          });
        },
      });

    repository.cacheRows =
      (value) =>
        value;

    const result =
      await repository.upsertMany(
        [
          {
            id:
              'existing',

            createdAt:
              '2026-01-01',

            updatedAt:
              '2026-02-01',

            name:
              'After',
          },

          {
            id:
              'new',

            createdAt:
              '2026-02-01',

            updatedAt:
              '2026-02-01',

            name:
              'New',
          },
        ],
      );

    assert.deepEqual(
      result.map(
        (record) =>
          record.id,
      ),
      [
        'existing',
        'new',
      ],
    );

    assert.equal(
      calls.length,
      2,
    );

    assert.equal(
      calls[0].operation,
      'batchUpdate',
    );

    assert.equal(
      calls[0]
        .input
        .requestBody
        .data[0]
        .range,
      "'Users'!A2:D2",
    );

    assert.equal(
      calls[1].operation,
      'append',
    );

    assert.equal(
      calls[1]
        .input
        .requestBody
        .values
        .length,
      1,
    );
  },
);
