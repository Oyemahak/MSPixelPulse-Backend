import mongoose from 'mongoose';
import { migrateSupabaseStorage } from '../migration/supabaseToDrive.js';

if (!process.argv.includes('--confirm-production')) {
  throw new Error('Refusing production storage migration without --confirm-production');
}
for (const name of [
  'MONGO_URI',
  'GOOGLE_DATABASE_SPREADSHEET_ID',
  'GOOGLE_DRIVE_ROOT_FOLDER_ID',
  'GOOGLE_DRIVE_CLIENT_FILES_FOLDER_ID',
  'GOOGLE_DRIVE_PROJECT_FILES_FOLDER_ID',
]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
if (
  process.env.GOOGLE_DATABASE_SPREADSHEET_ID === process.env.GOOGLE_PHASE1_TEST_SPREADSHEET_ID
  || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID === process.env.GOOGLE_PHASE1_TEST_DRIVE_ROOT_FOLDER_ID
) throw new Error('Refusing to use isolated smoke-test resources for production migration');

process.env.GOOGLE_SHEETS_CACHE_TTL_MS = '300000';
process.env.GOOGLE_PHASE1_SMOKE_TEST = 'false';

let exitCode = 1;
try {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await migrateSupabaseStorage({ database: mongoose.connection.db });
  const passed = result.failures.length === 0
    && result.sourceFileCount === result.destinationFileCount
    && result.totalBytes === result.verifiedBytes;
  console.log(JSON.stringify({
    stage: 'supabase-to-drive',
    driveRootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    sourceFileCount: result.sourceFileCount,
    destinationFileCount: result.destinationFileCount,
    totalBytes: result.totalBytes,
    verifiedBytes: result.verifiedBytes,
    failures: result.failures,
    passed,
  }));
  if (!passed) throw new Error('Supabase to Google Drive verification failed');
  exitCode = 0;
} finally {
  await mongoose.disconnect().catch(() => {});
  process.exitCode = exitCode;
}
