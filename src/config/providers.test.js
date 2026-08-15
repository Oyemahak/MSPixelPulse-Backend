// src/config/providers.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dataProviderName,
  storageProviderName,
  providerStatus,
} from './providers.js';

function withEnv(
  name,
  value,
  callback,
) {
  const previous =
    process.env[name];

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] =
      value;
  }

  try {
    return callback();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] =
        previous;
    }
  }
}

test(
  'provider configuration defaults to Google Sheets and Google Drive',
  () => {
    withEnv(
      'DATA_PROVIDER',
      undefined,
      () => {
        withEnv(
          'STORAGE_PROVIDER',
          undefined,
          () => {
            assert.equal(
              dataProviderName(),
              'google',
            );

            assert.equal(
              storageProviderName(),
              'google-drive',
            );

            assert.deepEqual(
              providerStatus(),
              {
                data: 'google',
                storage: 'google-drive',
              },
            );
          },
        );
      },
    );
  },
);

test(
  'provider configuration accepts Google production providers',
  () => {
    withEnv(
      'DATA_PROVIDER',
      'google',
      () => {
        withEnv(
          'STORAGE_PROVIDER',
          'google-drive',
          () => {
            assert.equal(
              dataProviderName(),
              'google',
            );

            assert.equal(
              storageProviderName(),
              'google-drive',
            );

            assert.deepEqual(
              providerStatus(),
              {
                data: 'google',
                storage: 'google-drive',
              },
            );
          },
        );
      },
    );
  },
);

test(
  'provider configuration rejects unsupported data providers',
  () => {
    withEnv(
      'DATA_PROVIDER',
      'unsupported-data-provider',
      () => {
        assert.throws(
          () =>
            dataProviderName(),
          {
            code:
              'INVALID_PROVIDER',
          },
        );
      },
    );
  },
);

test(
  'provider configuration rejects unsupported storage providers',
  () => {
    withEnv(
      'STORAGE_PROVIDER',
      'unsupported-storage-provider',
      () => {
        assert.throws(
          () =>
            storageProviderName(),
          {
            code:
              'INVALID_PROVIDER',
          },
        );
      },
    );
  },
);

test(
  'provider configuration normalizes provider values',
  () => {
    withEnv(
      'DATA_PROVIDER',
      ' GOOGLE ',
      () => {
        withEnv(
          'STORAGE_PROVIDER',
          ' GOOGLE-DRIVE ',
          () => {
            assert.equal(
              dataProviderName(),
              'google',
            );

            assert.equal(
              storageProviderName(),
              'google-drive',
            );
          },
        );
      },
    );
  },
);