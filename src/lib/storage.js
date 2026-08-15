import { getStorageProvider } from '../storage/provider.js';

function storage() {
  const provider = getStorageProvider();

  provider.ensureReady?.();

  return provider;
}

export async function putObject({
  path,
  buffer,
  contentType = 'application/octet-stream',
  metadata = {},
}) {
  if (!path) {
    const error = new Error('Storage path is required');
    error.status = 400;
    error.code = 'STORAGE_PATH_REQUIRED';
    throw error;
  }

  if (!Buffer.isBuffer(buffer)) {
    const error = new Error('Storage upload buffer is required');
    error.status = 400;
    error.code = 'STORAGE_BUFFER_REQUIRED';
    throw error;
  }

  return storage().uploadBuffer(
    path,
    buffer,
    contentType,
    metadata,
  );
}

export async function signedURL(
  path,
  expiresInSeconds = 60 * 60 * 24 * 7,
) {
  if (!path) return '';

  return storage().createSignedUrl(
    path,
    expiresInSeconds,
  );
}

export async function removeObject(path) {
  if (!path) return;

  return storage().removePath(path);
}

export async function removeObjects(paths = []) {
  const uniquePaths = [
    ...new Set(
      (paths || []).filter(Boolean),
    ),
  ];

  if (!uniquePaths.length) return;

  return storage().removePaths(uniquePaths);
}