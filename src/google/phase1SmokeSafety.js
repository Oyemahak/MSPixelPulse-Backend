const PRODUCTION_SPREADSHEET_IDS = [
  '1SUH7tssx4NFj61RzWhXikbDtdLwEuWhkwd4KXeMxVrE',
  '1HYhsvei9ya9YiKais0eco5LzCPAK7yKhnRPWER932o8',
];

const PRODUCTION_DRIVE_ROOT_IDS = [
  '1HarWTMAiRV-4cOP0BErX2--H6Iv16rRe',
  '1HarWTMAiRV-4cOP0BErX2-H6Iv16rRe',
  '1HarWTMAiRV-4cOP0BErX2–H6Iv16rRe',
  '1MbxPvlPawZfxGGa2ThO7eFcnFN4cTSss',
];

function normalizedResourceId(value) {
  return String(value || '')
    .trim()
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/-+/g, '-');
}

function requiredValue(name, value) {
  const resolved = String(value || '').trim();
  if (!resolved) {
    const error = new Error(`${name} is required for the Phase 1 Google provider smoke test.`);
    error.code = 'GOOGLE_PHASE1_TEST_ENV_MISSING';
    error.envName = name;
    throw error;
  }
  return resolved;
}

export function assertIsolatedGoogleResource({
  effectiveName,
  effectiveValue,
  testName,
  testValue,
  productionValues,
}) {
  const effective = requiredValue(effectiveName, effectiveValue);
  const expected = requiredValue(testName, testValue);
  const normalizedEffective = normalizedResourceId(effective);
  const isProduction = productionValues
    .map(normalizedResourceId)
    .includes(normalizedEffective);

  if (isProduction) {
    const error = new Error(
      `Refusing Phase 1 smoke-test access: ${effectiveName} points to a known production resource.`,
    );
    error.code = 'GOOGLE_PHASE1_PRODUCTION_RESOURCE_BLOCKED';
    error.envName = effectiveName;
    throw error;
  }

  if (effective !== expected) {
    const error = new Error(
      `Refusing Phase 1 smoke-test access: ${effectiveName} does not match ${testName}.`,
    );
    error.code = 'GOOGLE_PHASE1_TEST_TARGET_MISMATCH';
    error.envName = effectiveName;
    throw error;
  }

  return effective;
}

export function guardPhase1SpreadsheetId(value) {
  if (process.env.GOOGLE_PHASE1_SMOKE_TEST !== 'true') return value;
  return assertIsolatedGoogleResource({
    effectiveName: 'GOOGLE_DATABASE_SPREADSHEET_ID',
    effectiveValue: value,
    testName: 'GOOGLE_PHASE1_TEST_SPREADSHEET_ID',
    testValue: process.env.GOOGLE_PHASE1_TEST_SPREADSHEET_ID,
    productionValues: PRODUCTION_SPREADSHEET_IDS,
  });
}

export function guardPhase1DriveRootId(name, value) {
  if (process.env.GOOGLE_PHASE1_SMOKE_TEST !== 'true') return value;
  return assertIsolatedGoogleResource({
    effectiveName: name,
    effectiveValue: value,
    testName: 'GOOGLE_PHASE1_TEST_DRIVE_ROOT_FOLDER_ID',
    testValue: process.env.GOOGLE_PHASE1_TEST_DRIVE_ROOT_FOLDER_ID,
    productionValues: PRODUCTION_DRIVE_ROOT_IDS,
  });
}

export function assertPhase1GoogleTargets() {
  const spreadsheetId = guardPhase1SpreadsheetId(process.env.GOOGLE_DATABASE_SPREADSHEET_ID);
  const driveRootFolderId = guardPhase1DriveRootId(
    'GOOGLE_DRIVE_ROOT_FOLDER_ID',
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
  );
  guardPhase1DriveRootId(
    'GOOGLE_DRIVE_CLIENT_FILES_FOLDER_ID',
    process.env.GOOGLE_DRIVE_CLIENT_FILES_FOLDER_ID,
  );
  guardPhase1DriveRootId(
    'GOOGLE_DRIVE_PROJECT_FILES_FOLDER_ID',
    process.env.GOOGLE_DRIVE_PROJECT_FILES_FOLDER_ID,
  );
  return { spreadsheetId, driveRootFolderId };
}

export const phase1SmokeSafetyInternals = {
  normalizedResourceId,
  productionSpreadsheetIds: PRODUCTION_SPREADSHEET_IDS,
  productionDriveRootIds: PRODUCTION_DRIVE_ROOT_IDS,
};
