const DATA_PROVIDERS = new Set(['mongodb', 'google']);
const STORAGE_PROVIDERS = new Set(['supabase', 'google-drive']);

function configured(value, fallback, supported, envName) {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (!supported.has(normalized)) {
    const error = new Error(`${envName} must be one of: ${[...supported].join(', ')}`);
    error.code = 'INVALID_PROVIDER';
    error.status = 500;
    throw error;
  }
  return normalized;
}

/**
 * Phase 1 intentionally defaults to the existing production services. Google
 * providers are opt-in so an incomplete migration cannot change live traffic.
 */
export function dataProviderName() {
  return configured(process.env.DATA_PROVIDER, 'mongodb', DATA_PROVIDERS, 'DATA_PROVIDER');
}

export function storageProviderName() {
  return configured(process.env.STORAGE_PROVIDER, 'supabase', STORAGE_PROVIDERS, 'STORAGE_PROVIDER');
}

export function providerStatus() {
  return {
    data: dataProviderName(),
    storage: storageProviderName(),
  };
}

