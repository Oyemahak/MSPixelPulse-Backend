import assert from 'node:assert/strict';
import test from 'node:test';

import { receiptControllerInternals } from './receipt.controller.js';

test('payment and receipt identifiers share a concurrency-safe allocation sequence', () => {
  const payment = receiptControllerInternals.identifierForSequence('MSP-PAY', 42);
  const receipt = receiptControllerInternals.identifierForSequence('MSP-RCT', 42);
  assert.match(payment, /^MSP-PAY-\d{4}-000042$/);
  assert.match(receipt, /^MSP-RCT-\d{4}-000042$/);
});
