// src/google/sheets.js

import crypto from 'crypto';

import { getGoogleApis } from './auth.js';
import { guardPhase1SpreadsheetId } from './phase1SmokeSafety.js';
import { withGoogleRetry } from './retry.js';

const sharedRowsCache = new Map();

export const GOOGLE_SHEET_TABS = Object.freeze({
  users: 'Users',
  projects: 'Projects',
  projectMembers: 'ProjectMembers',
  requirements: 'Requirements',
  messages: 'Messages',
  rooms: 'Rooms',
  invoices: 'Invoices',
  leads: 'Leads',
  tasks: 'Tasks',
  notifications: 'Notifications',
  portalNotifications: 'PortalNotifications',
  receipts: 'Receipts',
  sequences: 'Sequences',
  files: 'Files',
  blogComments: 'BlogComments',
  blogReactions: 'BlogReactions',
  blogShares: 'BlogShares',
  blogSubscribers: 'BlogSubscribers',
  siteContent: 'SiteContent',
  threads: 'Threads',
  supportTickets: 'SupportTickets',
});

export async function allocateGoogleSequence({
  kind,
  reference = '',
  spreadsheet = spreadsheetId,
  sheetsApi,
} = {}) {
  const sequenceKind = String(kind || '').trim();
  if (!sequenceKind) {
    const error = new Error('A sequence kind is required');
    error.code = 'GOOGLE_SEQUENCE_KIND_REQUIRED';
    error.status = 400;
    throw error;
  }

  const targetSpreadsheetId = resolveSpreadsheetId(spreadsheet);
  const sheets = sheetsApi || (await getGoogleApis()).sheets;
  const response = await withGoogleRetry(() => sheets.spreadsheets.values.append({
    spreadsheetId: targetSpreadsheetId,
    range: `${quotedSheetName(GOOGLE_SHEET_TABS.sequences)}!A:C`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[sequenceKind, String(reference || '').trim(), new Date().toISOString()]],
    },
  }));
  const updatedRange = String(response?.data?.updates?.updatedRange || '');
  const rowMatch = updatedRange.match(/![A-Z]+(\d+):[A-Z]+\d+$/i);
  const sequence = Number(rowMatch?.[1]);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    const error = new Error('Google Sheets did not return a sequence row');
    error.code = 'GOOGLE_SEQUENCE_ALLOCATION_FAILED';
    error.status = 503;
    throw error;
  }
  return sequence;
}

function spreadsheetId() {
  const value = String(
    process.env.GOOGLE_DATABASE_SPREADSHEET_ID || '',
  ).trim();

  if (!value) {
    const error = new Error(
      'GOOGLE_DATABASE_SPREADSHEET_ID is required when DATA_PROVIDER=google',
    );

    error.code = 'GOOGLE_ENV_MISSING';
    error.status = 503;
    error.envName = 'GOOGLE_DATABASE_SPREADSHEET_ID';

    throw error;
  }

  return guardPhase1SpreadsheetId(value);
}

function resolveSpreadsheetId(source = spreadsheetId) {
  const value =
    typeof source === 'function'
      ? source()
      : source;

  const resolved = String(
    value || '',
  ).trim();

  if (!resolved) {
    const error = new Error(
      'A Google spreadsheet ID is required',
    );

    error.code = 'GOOGLE_ENV_MISSING';
    error.status = 503;

    throw error;
  }

  return guardPhase1SpreadsheetId(
    resolved,
  );
}

function rowCacheTtlMs() {
  const configured = Number(
    process.env.GOOGLE_SHEETS_CACHE_TTL_MS || 0,
  );

  if (
    !Number.isFinite(configured) ||
    configured <= 0
  ) {
    return 0;
  }

  return Math.min(
    10 * 60 * 1000,
    Math.floor(configured),
  );
}

function quotedSheetName(name) {
  return `'${String(name).replace(
    /'/g,
    "''",
  )}'`;
}

function columnName(index) {
  let value = index + 1;
  let name = '';

  while (value > 0) {
    const remainder =
      (value - 1) % 26;

    name =
      String.fromCharCode(
        65 + remainder,
      ) + name;

    value = Math.floor(
      (value - 1) / 26,
    );
  }

  return name;
}

/*
 * Google Sheets returns RAW values as strings for many cells.
 *
 * Do not blindly JSON.parse every scalar because IDs/phone numbers
 * such as "007" must remain strings.
 *
 * We explicitly restore booleans because account protection,
 * publication state, visibility flags, notification preferences,
 * and other permission-sensitive fields depend on true booleans.
 */
function parsedCellValue(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const raw = String(value);

  const normalized =
    raw.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  const looksLikeJson =
    (
      raw.startsWith('{') &&
      raw.endsWith('}')
    ) ||
    (
      raw.startsWith('[') &&
      raw.endsWith(']')
    );

  if (looksLikeJson) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  return raw;
}

function stableCellValue(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function recordFromRow(
  headers,
  row,
) {
  return headers.reduce(
    (
      record,
      header,
      index,
    ) => {
      if (header) {
        record[header] =
          parsedCellValue(
            row[index],
          );
      }

      return record;
    },
    {},
  );
}

function valuesForHeaders(
  headers,
  record,
) {
  return headers.map(
    (header) =>
      stableCellValue(
        record[header],
      ),
  );
}

function matchesFilter(
  record,
  filter = {},
) {
  if (
    typeof filter === 'function'
  ) {
    return Boolean(
      filter(record),
    );
  }

  return Object.entries(
    filter || {},
  ).every(
    ([key, expected]) => {
      const actual =
        record[key];

      if (
        Array.isArray(expected)
      ) {
        return expected
          .map(String)
          .includes(
            String(actual),
          );
      }

      if (
        expected &&
        typeof expected ===
          'object' &&
        '$in' in expected
      ) {
        return (
          expected.$in || []
        )
          .map(String)
          .includes(
            String(actual),
          );
      }

      return (
        String(actual ?? '') ===
        String(expected ?? '')
      );
    },
  );
}

function missingTabError(
  missingTabs,
) {
  const error = new Error(
    `Google test spreadsheet is missing required tabs: ${missingTabs.join(
      ', ',
    )}`,
  );

  error.code =
    'GOOGLE_SHEET_TABS_MISSING';

  error.status = 422;
  error.missingTabs =
    missingTabs;

  return error;
}

export async function ensureGoogleSheetTabs({
  tabs = Object.values(
    GOOGLE_SHEET_TABS,
  ),
  createMissing = false,
  spreadsheet = spreadsheetId,
  sheetsApi,
} = {}) {
  const targetSpreadsheetId =
    resolveSpreadsheetId(
      spreadsheet,
    );

  const requiredTabs = [
    ...new Set(
      (tabs || [])
        .map((tab) =>
          String(
            tab || '',
          ).trim(),
        )
        .filter(Boolean),
    ),
  ];

  const sheets =
    sheetsApi ||
    (await getGoogleApis())
      .sheets;

  const readMetadata =
    async () => {
      const response =
        await withGoogleRetry(
          () =>
            sheets.spreadsheets.get(
              {
                spreadsheetId:
                  targetSpreadsheetId,

                fields:
                  'spreadsheetId,sheets.properties(sheetId,title)',
              },
            ),
        );

      const actualSpreadsheetId =
        String(
          response.data
            .spreadsheetId ||
            '',
        );

      if (
        actualSpreadsheetId !==
        targetSpreadsheetId
      ) {
        const error =
          new Error(
            'Google Sheets returned metadata for an unexpected spreadsheet.',
          );

        error.code =
          'GOOGLE_SPREADSHEET_TARGET_MISMATCH';

        throw error;
      }

      const existingTabs =
        (
          response.data.sheets ||
          []
        )
          .map((sheet) =>
            String(
              sheet.properties
                ?.title || '',
            ).trim(),
          )
          .filter(Boolean);

      return {
        actualSpreadsheetId,
        existingTabs,
      };
    };

  let metadata =
    await readMetadata();

  const missingTabs =
    requiredTabs.filter(
      (tab) =>
        !metadata.existingTabs.includes(
          tab,
        ),
    );

  if (
    missingTabs.length &&
    !createMissing
  ) {
    throw missingTabError(
      missingTabs,
    );
  }

  if (missingTabs.length) {
    try {
      await withGoogleRetry(
        () =>
          sheets.spreadsheets.batchUpdate(
            {
              spreadsheetId:
                targetSpreadsheetId,

              requestBody: {
                requests:
                  missingTabs.map(
                    (title) => ({
                      addSheet: {
                        properties: {
                          title,
                        },
                      },
                    }),
                  ),
              },
            },
          ),
      );
    } catch (cause) {
      const error =
        missingTabError(
          missingTabs,
        );

      error.message =
        `Unable to initialize required Google test tabs. ${error.message}`;

      error.cause =
        cause;

      throw error;
    }

    metadata =
      await readMetadata();
  }

  const stillMissing =
    requiredTabs.filter(
      (tab) =>
        !metadata.existingTabs.includes(
          tab,
        ),
    );

  if (stillMissing.length) {
    throw missingTabError(
      stillMissing,
    );
  }

  return {
    spreadsheetId:
      metadata.actualSpreadsheetId,

    existingTabs:
      metadata.existingTabs,

    createdTabs:
      missingTabs,
  };
}

export class GoogleSheetsRepository {
  constructor(
    tab,
    {
      idField = 'id',
      spreadsheet = spreadsheetId,
    } = {},
  ) {
    this.tab = tab;
    this.idField = idField;
    this.spreadsheet =
      spreadsheet;
  }

  cacheKey(
    targetSpreadsheetId =
      this.resolveSpreadsheetId(),
  ) {
    return `${targetSpreadsheetId}:${this.tab}`;
  }

  resolveSpreadsheetId() {
    return resolveSpreadsheetId(
      this.spreadsheet,
    );
  }

  async valuesApi() {
    const { sheets } =
      await getGoogleApis();

    return sheets.spreadsheets
      .values;
  }

  async sheetApi() {
    const { sheets } =
      await getGoogleApis();

    return sheets.spreadsheets;
  }

  async readRows({
    fresh = false,
  } = {}) {
    const ttl =
      rowCacheTtlMs();

    const targetSpreadsheetId =
      this.resolveSpreadsheetId();

    const key =
      this.cacheKey(
        targetSpreadsheetId,
      );

    const cached =
      sharedRowsCache.get(key);

    if (
      !fresh &&
      ttl &&
      cached?.expiresAt >
        Date.now()
    ) {
      return cached.value;
    }

    if (
      !fresh &&
      cached
    ) {
      sharedRowsCache.delete(
        key,
      );
    }

    const values =
      await this.valuesApi();

    const response =
      await withGoogleRetry(
        () =>
          values.get({
            spreadsheetId:
              targetSpreadsheetId,

            range:
              `${quotedSheetName(
                this.tab,
              )}!A:ZZ`,

            majorDimension:
              'ROWS',
          }),
      );

    const rows =
      response.data.values ||
      [];

    const headers =
      (rows[0] || []).map(
        (header) =>
          String(
            header || '',
          ).trim(),
      );

    const records =
      rows
        .slice(1)
        .map(
          (
            row,
            index,
          ) => ({
            record:
              recordFromRow(
                headers,
                row,
              ),

            rowNumber:
              index + 2,
          }),
        )
        .filter(
          ({ record }) =>
            Object.values(
              record,
            ).some(
              (value) =>
                String(
                  value ?? '',
                ) !== '',
            ),
        );

    const value = {
      headers,
      records,
      nextRowNumber:
        Math.max(
          2,
          rows.length + 1,
        ),
    };

    this.cacheRows(
      value,
      targetSpreadsheetId,
    );

    return value;
  }

  cacheRows(
    value,
    targetSpreadsheetId =
      this.resolveSpreadsheetId(),
  ) {
    const ttl =
      rowCacheTtlMs();

    const key =
      this.cacheKey(
        targetSpreadsheetId,
      );

    if (ttl) {
      sharedRowsCache.set(
        key,
        {
          value,
          expiresAt:
            Date.now() + ttl,
        },
      );
    } else {
      sharedRowsCache.delete(
        key,
      );
    }

    return value;
  }

  invalidateCache(
    targetSpreadsheetId =
      this.resolveSpreadsheetId(),
  ) {
    sharedRowsCache.delete(
      this.cacheKey(
        targetSpreadsheetId,
      ),
    );
  }

  async ensureHeaders(
    additionalHeaders = [],
  ) {
    const current =
      await this.readRows();

    const requested = [
      this.idField,
      'createdAt',
      'updatedAt',
      ...additionalHeaders,
    ]
      .map((header) =>
        String(
          header || '',
        ).trim(),
      )
      .filter(Boolean);

    const headers = [
      ...new Set([
        ...current.headers.filter(
          Boolean,
        ),
        ...requested,
      ]),
    ];

    const unchanged =
      headers.length ===
        current.headers.length &&
      current.headers.every(
        (
          value,
          index,
        ) =>
          value ===
          headers[index],
      );

    if (unchanged) {
      return this.cacheRows({
        ...current,
        headers,
      });
    }

    const values =
      await this.valuesApi();

    await withGoogleRetry(
      () =>
        values.update({
          spreadsheetId:
            this.resolveSpreadsheetId(),

          range:
            `${quotedSheetName(
              this.tab,
            )}!A1:${columnName(
              Math.max(
                headers.length -
                  1,
                0,
              ),
            )}1`,

          valueInputOption:
            'RAW',

          requestBody: {
            values: [
              headers,
            ],
          },
        }),
    );

    return this.cacheRows({
      ...current,
      headers,
    });
  }

  async findById(
    id,
    {
      fresh = false,
    } = {},
  ) {
    if (!id) {
      return null;
    }

    const { records } =
      await this.readRows({
        fresh,
      });

    const found =
      records.find(
        ({ record }) =>
          String(
            record[
              this.idField
            ],
          ) === String(id),
      );

    return found?.record ||
      null;
  }

  async findOne(
    filter = {},
    {
      fresh = false,
    } = {},
  ) {
    const { records } =
      await this.readRows({
        fresh,
      });

    const found =
      records.find(
        ({ record }) =>
          matchesFilter(
            record,
            filter,
          ),
      );

    return found?.record ||
      null;
  }

  async list({
    filter = {},
    page = 1,
    limit = 100,
    sort,
    fresh = false,
  } = {}) {
    const safePage =
      Math.max(
        1,
        Number(page) || 1,
      );

    const safeLimit =
      Math.min(
        500,
        Math.max(
          1,
          Number(limit) || 100,
        ),
      );

    let items =
      (
        await this.readRows({ fresh })
      ).records
        .map(
          ({ record }) =>
            record,
        )
        .filter(
          (record) =>
            matchesFilter(
              record,
              filter,
            ),
        );

    if (
      typeof sort === 'function'
    ) {
      items =
        items.sort(sort);
    }

    const total =
      items.length;

    items =
      items.slice(
        (safePage - 1) *
          safeLimit,
        safePage *
          safeLimit,
      );

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore:
        safePage *
          safeLimit <
        total,
    };
  }

  async create(input = {}) {
    const now =
      new Date().toISOString();

    const record = {
      ...input,

      [this.idField]:
        String(
          input[this.idField] ||
            crypto.randomUUID(),
        ),

      createdAt:
        input.createdAt || now,

      updatedAt:
        input.updatedAt || now,
    };

    const existing =
      await this.findById(
        record[this.idField],
      );

    if (existing) {
      const error =
        new Error(
          `A ${this.tab} record already has id ${record[this.idField]}`,
        );

      error.code =
        'GOOGLE_RECORD_CONFLICT';

      error.status = 409;

      throw error;
    }

    const current =
      await this.ensureHeaders(
        Object.keys(record),
      );

    const { headers } =
      current;

    const values =
      await this.valuesApi();

    await withGoogleRetry(
      () =>
        values.append({
          spreadsheetId:
            this.resolveSpreadsheetId(),

          range:
            `${quotedSheetName(
              this.tab,
            )}!A:ZZ`,

          valueInputOption:
            'RAW',

          insertDataOption:
            'INSERT_ROWS',

          requestBody: {
            values: [
              valuesForHeaders(
                headers,
                record,
              ),
            ],
          },
        }),
    );

    this.cacheRows({
      headers,

      records: [
        ...current.records,

        {
          record,
          rowNumber:
            current.nextRowNumber,
        },
      ],

      nextRowNumber:
        current.nextRowNumber +
        1,
    });

    return record;
  }

  async createMany(
    records = [],
  ) {
    if (
      !Array.isArray(records) ||
      records.length === 0
    ) {
      return [];
    }

    const now =
      new Date().toISOString();

    const prepared =
      records.map(
        (input) => ({
          ...input,

          [this.idField]:
            String(
              input[
                this.idField
              ] ||
                crypto.randomUUID(),
            ),

          createdAt:
            input.createdAt ||
            now,

          updatedAt:
            input.updatedAt ||
            now,
        }),
      );

    const seen =
      new Set();

    for (
      const record of prepared
    ) {
      if (
        seen.has(
          record[this.idField],
        ) ||
        await this.findById(
          record[this.idField],
        )
      ) {
        const error =
          new Error(
            `Duplicate ${this.idField} in ${this.tab} batch`,
          );

        error.code =
          'GOOGLE_RECORD_CONFLICT';

        error.status = 409;

        throw error;
      }

      seen.add(
        record[this.idField],
      );
    }

    const current =
      await this.ensureHeaders(
        prepared.flatMap(
          Object.keys,
        ),
      );

    const { headers } =
      current;

    const values =
      await this.valuesApi();

    await withGoogleRetry(
      () =>
        values.append({
          spreadsheetId:
            this.resolveSpreadsheetId(),

          range:
            `${quotedSheetName(
              this.tab,
            )}!A:ZZ`,

          valueInputOption:
            'RAW',

          insertDataOption:
            'INSERT_ROWS',

          requestBody: {
            values:
              prepared.map(
                (record) =>
                  valuesForHeaders(
                    headers,
                    record,
                  ),
              ),
          },
        }),
    );

    this.cacheRows({
      headers,

      records: [
        ...current.records,

        ...prepared.map(
          (
            record,
            index,
          ) => ({
            record,

            rowNumber:
              current.nextRowNumber +
              index,
          }),
        ),
      ],

      nextRowNumber:
        current.nextRowNumber +
        prepared.length,
    });

    return prepared;
  }

  async upsertMany(
    records = [],
  ) {
    if (
      !Array.isArray(records) ||
      records.length === 0
    ) {
      return [];
    }

    const now =
      new Date().toISOString();

    const seen =
      new Set();

    const prepared =
      records.map(
        (input) => {
          const id =
            String(
              input?.[
                this.idField
              ] || '',
            ).trim();

          if (!id) {
            const error =
              new Error(
                `${this.idField} is required for ${this.tab} bulk upsert`,
              );

            error.code =
              'GOOGLE_RECORD_ID_REQUIRED';

            error.status = 400;

            throw error;
          }

          if (
            seen.has(id)
          ) {
            const error =
              new Error(
                `Duplicate ${this.idField} ${id} in ${this.tab} bulk upsert`,
              );

            error.code =
              'GOOGLE_RECORD_CONFLICT';

            error.status = 409;

            throw error;
          }

          seen.add(id);

          return {
            ...input,

            [this.idField]:
              id,

            createdAt:
              input.createdAt ||
              now,

            updatedAt:
              input.updatedAt ||
              now,
          };
        },
      );

    const before =
      await this.readRows();

    const currentById =
      new Map(
        before.records.map(
          (entry) => [
            String(
              entry.record[
                this.idField
              ],
            ),
            entry,
          ],
        ),
      );

    const merged =
      prepared.map(
        (record) => {
          const current =
            currentById.get(
              record[
                this.idField
              ],
            );

          return current
            ? {
                ...current.record,
                ...record,

                [this.idField]:
                  record[
                    this.idField
                  ],
              }
            : record;
        },
      );

    const withHeaders =
      await this.ensureHeaders(
        merged.flatMap(
          Object.keys,
        ),
      );

    const { headers } =
      withHeaders;

    const values =
      await this.valuesApi();

    const updates = [];
    const inserts = [];

    for (
      const record of merged
    ) {
      const current =
        currentById.get(
          record[this.idField],
        );

      if (current) {
        updates.push({
          range:
            `${quotedSheetName(
              this.tab,
            )}!A${current.rowNumber}:${columnName(
              headers.length - 1,
            )}${current.rowNumber}`,

          values: [
            valuesForHeaders(
              headers,
              record,
            ),
          ],
        });
      } else {
        inserts.push(
          record,
        );
      }
    }

    if (
      updates.length
    ) {
      await withGoogleRetry(
        () =>
          values.batchUpdate({
            spreadsheetId:
              this.resolveSpreadsheetId(),

            requestBody: {
              valueInputOption:
                'RAW',

              data:
                updates,
            },
          }),
      );
    }

    if (
      inserts.length
    ) {
      await withGoogleRetry(
        () =>
          values.append({
            spreadsheetId:
              this.resolveSpreadsheetId(),

            range:
              `${quotedSheetName(
                this.tab,
              )}!A:ZZ`,

            valueInputOption:
              'RAW',

            insertDataOption:
              'INSERT_ROWS',

            requestBody: {
              values:
                inserts.map(
                  (record) =>
                    valuesForHeaders(
                      headers,
                      record,
                    ),
                ),
            },
          }),
      );
    }

    const migratedById =
      new Map(
        merged.map(
          (record) => [
            record[
              this.idField
            ],
            record,
          ],
        ),
      );

    const existingRecords =
      withHeaders.records.map(
        (entry) => {
          const replacement =
            migratedById.get(
              String(
                entry.record[
                  this.idField
                ],
              ),
            );

          return replacement
            ? {
                ...entry,
                record:
                  replacement,
              }
            : entry;
        },
      );

    const nextRowNumber =
      withHeaders.nextRowNumber;

    this.cacheRows({
      headers,

      records: [
        ...existingRecords,

        ...inserts.map(
          (
            record,
            index,
          ) => ({
            record,

            rowNumber:
              nextRowNumber +
              index,
          }),
        ),
      ],

      nextRowNumber:
        nextRowNumber +
        inserts.length,
    });

    return merged;
  }

  async update(
    id,
    patch = {},
  ) {
    const {
      headers:
        existingHeaders,
      records,
    } =
      await this.readRows();

    const target =
      records.find(
        ({ record }) =>
          String(
            record[
              this.idField
            ],
          ) === String(id),
      );

    if (!target) {
      return null;
    }

    const record = {
      ...target.record,
      ...patch,

      [this.idField]:
        String(
          target.record[
            this.idField
          ],
        ),

      createdAt:
        target.record
          .createdAt ||
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString(),
    };

    const requestedHeaders =
      [
        ...new Set([
          ...existingHeaders.filter(
            Boolean,
          ),

          this.idField,
          'createdAt',
          'updatedAt',

          ...Object.keys(
            record,
          ),
        ]),
      ];

    let headers =
      existingHeaders;

    if (
      requestedHeaders.length !==
        existingHeaders.length ||
      requestedHeaders.some(
        (
          header,
          index,
        ) =>
          header !==
          existingHeaders[
            index
          ],
      )
    ) {
      ({
        headers,
      } =
        await this.ensureHeaders(
          requestedHeaders,
        ));
    }

    const values =
      await this.valuesApi();

    await withGoogleRetry(
      () =>
        values.update({
          spreadsheetId:
            this.resolveSpreadsheetId(),

          range:
            `${quotedSheetName(
              this.tab,
            )}!A${target.rowNumber}:${columnName(
              headers.length - 1,
            )}${target.rowNumber}`,

          valueInputOption:
            'RAW',

          requestBody: {
            values: [
              valuesForHeaders(
                headers,
                record,
              ),
            ],
          },
        }),
    );

    this.cacheRows({
      headers,

      records:
        records.map(
          (entry) =>
            entry.rowNumber ===
            target.rowNumber
              ? {
                  ...entry,
                  record,
                }
              : entry,
        ),

      nextRowNumber:
        Math.max(
          2,

          ...records.map(
            (entry) =>
              entry.rowNumber +
              1,
          ),
        ),
    });

    return record;
  }

  async delete(id) {
    const {
      records,
    } =
      await this.readRows();

    const target =
      records.find(
        ({ record }) =>
          String(
            record[
              this.idField
            ],
          ) === String(id),
      );

    if (!target) {
      return false;
    }

    const sheets =
      await this.sheetApi();

    const metadata =
      await withGoogleRetry(
        () =>
          sheets.get({
            spreadsheetId:
              this.resolveSpreadsheetId(),

            fields:
              'sheets.properties',
          }),
      );

    const sheet =
      (
        metadata.data.sheets ||
        []
      ).find(
        (item) =>
          item.properties
            ?.title ===
          this.tab,
      );

    if (!sheet) {
      const error =
        new Error(
          `Sheet tab ${this.tab} was not found`,
        );

      error.code =
        'GOOGLE_SHEET_TAB_NOT_FOUND';

      error.status = 404;

      throw error;
    }

    await withGoogleRetry(
      () =>
        sheets.batchUpdate({
          spreadsheetId:
            this.resolveSpreadsheetId(),

          requestBody: {
            requests: [
              {
                deleteDimension: {
                  range: {
                    sheetId:
                      sheet
                        .properties
                        .sheetId,

                    dimension:
                      'ROWS',

                    startIndex:
                      target.rowNumber -
                      1,

                    endIndex:
                      target.rowNumber,
                  },
                },
              },
            ],
          },
        }),
    );

    /*
     * Do not perform another Google read here.
     *
     * We already have the exact pre-delete row snapshot. Rebuild the
     * in-memory cache deterministically after the row deletion.
     */
    const remaining =
      records
        .filter(
          (entry) =>
            entry.rowNumber !==
            target.rowNumber,
        )
        .map(
          (entry) =>
            entry.rowNumber >
            target.rowNumber
              ? {
                  ...entry,
                  rowNumber:
                    entry.rowNumber -
                    1,
                }
              : entry,
        );

    this.cacheRows({
      headers:
        (
          await this.readRows({
            fresh: true,
          })
        ).headers,

      records:
        remaining,

      nextRowNumber:
        Math.max(
          2,
          remaining.length + 2,
        ),
    });

    return true;
  }

  async deleteMany(
    ids = [],
  ) {
    const wanted =
      new Set(
        (ids || [])
          .map(String)
          .filter(Boolean),
      );

    if (!wanted.size) {
      return 0;
    }

    const {
      records,
    } =
      await this.readRows();

    const targets =
      records
        .filter(
          ({ record }) =>
            wanted.has(
              String(
                record[
                  this.idField
                ],
              ),
            ),
        )
        .sort(
          (
            left,
            right,
          ) =>
            right.rowNumber -
            left.rowNumber,
        );

    if (
      !targets.length
    ) {
      return 0;
    }

    const sheets =
      await this.sheetApi();

    const metadata =
      await withGoogleRetry(
        () =>
          sheets.get({
            spreadsheetId:
              this.resolveSpreadsheetId(),

            fields:
              'sheets.properties',
          }),
      );

    const sheet =
      (
        metadata.data.sheets ||
        []
      ).find(
        (item) =>
          item.properties
            ?.title ===
          this.tab,
      );

    if (!sheet) {
      const error =
        new Error(
          `Sheet tab ${this.tab} was not found`,
        );

      error.code =
        'GOOGLE_SHEET_TAB_NOT_FOUND';

      error.status = 404;

      throw error;
    }

    await withGoogleRetry(
      () =>
        sheets.batchUpdate({
          spreadsheetId:
            this.resolveSpreadsheetId(),

          requestBody: {
            requests:
              targets.map(
                (target) => ({
                  deleteDimension: {
                    range: {
                      sheetId:
                        sheet
                          .properties
                          .sheetId,

                      dimension:
                        'ROWS',

                      startIndex:
                        target.rowNumber -
                        1,

                      endIndex:
                        target.rowNumber,
                    },
                  },
                }),
              ),
          },
        }),
    );

    this.invalidateCache();

    return targets.length;
  }
}

export const sheetsInternals = {
  columnName,
  parsedCellValue,
  stableCellValue,
  matchesFilter,
  resolveSpreadsheetId,
  rowCacheTtlMs,
};
