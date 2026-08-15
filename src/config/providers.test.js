import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dataProviderName,
  storageProviderName,
} from './providers.js';

function withEnv(
  name,
  value,
  operation,
) {
  const previous =
    process.env[name];

  if (
    value === undefined
  ) {
    delete process.env[name];
  } else {
    process.env[name] =
      value;
  }

  try {
    return operation();
  } finally {
    if (
      previous === undefined
    ) {
      delete process.env[name];
    } else {
      process.env[name] =
        previous;
    }
  }
}

test(
  'provider configuration keeps MongoDB as temporary data fallback and Google Drive as storage default',
  () => {
    withEnv(
      'DATA_PROVIDER',
      undefined,
      () =>
        assert.equal(
          dataProviderName(),
          'mongodb',
        ),
    );

    withEnv(
      'STORAGE_PROVIDER',
      undefined,
      () =>
        assert.equal(
          storageProviderName(),
          'google-drive',
        ),
    );
  },
);

test(
  'provider configuration accepts Google runtime providers',
  () => {
    withEnv(
      'DATA_PROVIDER',
      'google',
      () =>
        assert.equal(
          dataProviderName(),
          'google',
        ),
    );

    withEnv(
      'STORAGE_PROVIDER',
      'google-drive',
      () =>
        assert.equal(
          storageProviderName(),
          'google-drive',
        ),
    );
  },
);

test(
  'provider configuration rejects unsupported storage providers',
  () => {
    withEnv(
      'STORAGE_PROVIDER',
      'supabase',
      () =>
        assert.throws(
          storageProviderName,
          {
            code:
              'INVALID_PROVIDER',
          },
        ),
    );
  },
);