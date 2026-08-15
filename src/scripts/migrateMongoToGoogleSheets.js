import mongoose from 'mongoose';
import { ensureGoogleSheetTabs, GOOGLE_SHEET_TABS } from '../google/sheets.js';
import {
  loadMongoSheetDataset,
  migrateDatasetToSheets,
  migrationPassed,
  recoverHistoricalReferences,
} from '../migration/mongoToSheets.js';

if (!process.argv.includes('--confirm-production')) {
  throw new Error('Refusing production migration without --confirm-production');
}
if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
if (!process.env.GOOGLE_DATABASE_SPREADSHEET_ID) throw new Error('GOOGLE_DATABASE_SPREADSHEET_ID is required');
if (process.env.GOOGLE_DATABASE_SPREADSHEET_ID === process.env.GOOGLE_PHASE1_TEST_SPREADSHEET_ID) {
  throw new Error('Refusing to use the isolated smoke-test spreadsheet for production migration');
}

process.env.GOOGLE_SHEETS_CACHE_TTL_MS = '300000';
process.env.GOOGLE_PHASE1_SMOKE_TEST = 'false';

let exitCode = 1;
try {
  await mongoose.connect(process.env.MONGO_URI);
  const dataset = await loadMongoSheetDataset(mongoose.connection.db);
  const recovery = recoverHistoricalReferences(dataset);
  const orphaned = recovery.unresolved;
  if (orphaned.length) {
    console.error(JSON.stringify({ stage: 'source-validation', passed: false, orphanCount: orphaned.length, orphaned }));
    throw new Error('Source relationship validation failed; migration was not started');
  }
  await ensureGoogleSheetTabs({ tabs: Object.values(GOOGLE_SHEET_TABS), createMissing: true });
  const results = await migrateDatasetToSheets(dataset);
  const passed = migrationPassed(results, orphaned);
  console.log(JSON.stringify({
    stage: 'mongo-to-sheets',
    spreadsheetId: process.env.GOOGLE_DATABASE_SPREADSHEET_ID,
    passed,
    tabs: results,
    orphanCount: orphaned.length,
    recoveredHistoricalReferences: {
      users: recovery.recoveredUsers.length,
      projects: recovery.recoveredProjects.length,
    },
  }));
  if (!passed) throw new Error('MongoDB to Google Sheets verification failed');
  exitCode = 0;
} finally {
  await mongoose.disconnect().catch(() => {});
  process.exitCode = exitCode;
}
