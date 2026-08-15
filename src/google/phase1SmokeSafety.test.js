import test from 'node:test';
import assert from 'node:assert/strict';
import { assertIsolatedGoogleResource } from './phase1SmokeSafety.js';

const productionSpreadsheet = '1SUH7tssx4NFj61RzWhXikbDtdLwEuWhkwd4KXeMxVrE';
const productionDriveRoot = '1HarWTMAiRV-4cOP0BErX2--H6Iv16rRe';
const replacementProductionSpreadsheet = '1HYhsvei9ya9YiKais0eco5LzCPAK7yKhnRPWER932o8';
const replacementProductionDriveRoot = '1MbxPvlPawZfxGGa2ThO7eFcnFN4cTSss';

test('Phase 1 guard accepts only an exact isolated target match', () => {
  assert.equal(assertIsolatedGoogleResource({
    effectiveName: 'EFFECTIVE',
    effectiveValue: 'isolated-test-id',
    testName: 'TEST',
    testValue: 'isolated-test-id',
    productionValues: [productionSpreadsheet],
  }), 'isolated-test-id');

  assert.throws(() => assertIsolatedGoogleResource({
    effectiveName: 'EFFECTIVE',
    effectiveValue: 'wrong-id',
    testName: 'TEST',
    testValue: 'isolated-test-id',
    productionValues: [productionSpreadsheet],
  }), { code: 'GOOGLE_PHASE1_TEST_TARGET_MISMATCH' });
});

test('Phase 1 guard blocks the production spreadsheet and Drive root variants', () => {
  for (const candidate of [productionSpreadsheet, replacementProductionSpreadsheet]) {
    assert.throws(() => assertIsolatedGoogleResource({
      effectiveName: 'GOOGLE_DATABASE_SPREADSHEET_ID',
      effectiveValue: candidate,
      testName: 'GOOGLE_PHASE1_TEST_SPREADSHEET_ID',
      testValue: candidate,
      productionValues: [productionSpreadsheet, replacementProductionSpreadsheet],
    }), { code: 'GOOGLE_PHASE1_PRODUCTION_RESOURCE_BLOCKED' });
  }

  for (const candidate of [
    productionDriveRoot,
    '1HarWTMAiRV-4cOP0BErX2-H6Iv16rRe',
    '1HarWTMAiRV-4cOP0BErX2–H6Iv16rRe',
    replacementProductionDriveRoot,
  ]) {
    assert.throws(() => assertIsolatedGoogleResource({
      effectiveName: 'GOOGLE_DRIVE_ROOT_FOLDER_ID',
      effectiveValue: candidate,
      testName: 'GOOGLE_PHASE1_TEST_DRIVE_ROOT_FOLDER_ID',
      testValue: candidate,
      productionValues: [productionDriveRoot, replacementProductionDriveRoot],
    }), { code: 'GOOGLE_PHASE1_PRODUCTION_RESOURCE_BLOCKED' });
  }
});
