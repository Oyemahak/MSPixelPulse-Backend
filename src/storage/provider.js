import { storageProviderName } from '../config/providers.js';
import { googleDriveStorage } from './googleDriveStorage.js';

const SUPPORTED_STORAGE_PROVIDERS = new Set([
  'google-drive',
]);

function unsupportedProviderError(provider) {
  const error = new Error(
    `Unsupported storage provider: ${provider || '(empty)'}`,
  );

  error.status = 500;
  error.code = 'UNSUPPORTED_STORAGE_PROVIDER';

  return error;
}

export function getStorageProvider() {
  const provider = storageProviderName();

  if (!SUPPORTED_STORAGE_PROVIDERS.has(provider)) {
    throw unsupportedProviderError(provider);
  }

  return googleDriveStorage;
}

export function storageProviderStatus() {
  try {
    const provider = getStorageProvider();

    return provider.status();
  } catch (error) {
    let provider = '';

    try {
      provider = storageProviderName();
    } catch {
      provider = String(
        process.env.STORAGE_PROVIDER || '',
      );
    }

    return {
      provider,
      configured: false,
      error:
        error?.code ||
        'STORAGE_PROVIDER_ERROR',
    };
  }
}

export const storageProviderInternals = {
  SUPPORTED_STORAGE_PROVIDERS,
};
