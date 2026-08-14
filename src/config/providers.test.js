import test from 'node:test';
import assert from 'node:assert/strict';
import { dataProviderName, storageProviderName } from './providers.js';

function withEnv(name, value, operation) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try { return operation(); } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test('provider configuration keeps MongoDB and Supabase as defaults', () => {
  withEnv('DATA_PROVIDER', undefined, () => assert.equal(dataProviderName(), 'mongodb'));
  withEnv('STORAGE_PROVIDER', undefined, () => assert.equal(storageProviderName(), 'supabase'));
});

test('provider configuration accepts only explicit supported providers', () => {
  withEnv('DATA_PROVIDER', 'google', () => assert.equal(dataProviderName(), 'google'));
  withEnv('STORAGE_PROVIDER', 'google-drive', () => assert.equal(storageProviderName(), 'google-drive'));
  withEnv('DATA_PROVIDER', 'redis', () => assert.throws(dataProviderName, { code: 'INVALID_PROVIDER' }));
});

