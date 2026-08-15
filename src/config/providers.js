// src/config/providers.js

const DATA_PROVIDERS = new Set([
  'google',
]);

const STORAGE_PROVIDERS = new Set([
  'google-drive',
]);

function configured(
  value,
  fallback,
  supported,
  envName,
) {
  const normalized = String(
    value || fallback,
  )
    .trim()
    .toLowerCase();

  if (!supported.has(normalized)) {
    const error = new Error(
      `${envName} must be one of: ${[
        ...supported,
      ].join(', ')}`,
    );

    error.code = 'INVALID_PROVIDER';
    error.status = 500;

    throw error;
  }

  return normalized;
}

export function dataProviderName() {
  return configured(
    process.env.DATA_PROVIDER,
    'google',
    DATA_PROVIDERS,
    'DATA_PROVIDER',
  );
}

export function storageProviderName() {
  return configured(
    process.env.STORAGE_PROVIDER,
    'google-drive',
    STORAGE_PROVIDERS,
    'STORAGE_PROVIDER',
  );
}

export function providerStatus() {
  return {
    data: dataProviderName(),
    storage: storageProviderName(),
  };
}

export const providerInternals = {
  DATA_PROVIDERS,
  STORAGE_PROVIDERS,
};