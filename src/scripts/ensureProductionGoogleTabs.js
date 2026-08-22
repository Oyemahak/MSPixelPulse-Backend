import 'dotenv/config';

import { ensureGoogleSheetTabs, GOOGLE_SHEET_TABS } from '../google/sheets.js';

if (!process.argv.includes('--confirm-production')) {
  throw new Error('Refusing to change Google Sheets without --confirm-production');
}

if (String(process.env.DATA_PROVIDER || '').trim().toLowerCase() !== 'google') {
  throw new Error('DATA_PROVIDER must be google');
}

const result = await ensureGoogleSheetTabs({
  tabs: Object.values(GOOGLE_SHEET_TABS),
  createMissing: true,
});

console.log(JSON.stringify({
  ok: true,
  spreadsheetId: result.spreadsheetId,
  requiredTabCount: Object.values(GOOGLE_SHEET_TABS).length,
  createdTabs: result.createdTabs,
  existingTabs: result.existingTabs,
}, null, 2));
