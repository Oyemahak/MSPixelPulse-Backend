// Compatibility façade for existing controller imports. The public surface
// remains stable while STORAGE_PROVIDER selects Supabase (default) or Drive.
import { getStorageProvider, storageProviderStatus } from '../storage/provider.js';
import {
  SUPA_BUCKET,
  supabase,
  supabaseConfigured,
  storageBucketConfigured,
  supabaseStorage,
} from '../storage/supabaseStorage.js';

export { SUPA_BUCKET, supabase, supabaseConfigured, storageBucketConfigured };

export function storageStatus() {
  return storageProviderStatus();
}

export function ensureStorageReady() {
  return getStorageProvider().ensureReady();
}

export async function uploadBuffer(path, buffer, contentType = 'application/octet-stream', metadata = {}) {
  return getStorageProvider().uploadBuffer(path, buffer, contentType, metadata);
}

export async function createSignedUrl(path, expiresInSeconds = 60 * 60 * 24 * 7) {
  return getStorageProvider().createSignedUrl(path, expiresInSeconds);
}

export function getPublicUrl(path) {
  const provider = getStorageProvider();
  return provider.getPublicUrl ? provider.getPublicUrl(path) : '';
}

export async function removePath(path) {
  return getStorageProvider().removePath(path);
}

export async function removePaths(paths = []) {
  return getStorageProvider().removePaths(paths);
}

// Legacy maintenance scripts can be intentionally explicit about Supabase.
export function supabaseStorageProvider() {
  return supabaseStorage;
}
