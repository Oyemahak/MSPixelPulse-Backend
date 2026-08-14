import { createSignedUrl, removePath, uploadBuffer } from './supabase.js';

export async function putObject({ path, buffer, contentType = 'application/octet-stream', metadata = {} }) {
  return uploadBuffer(path, buffer, contentType, metadata);
}

export async function signedURL(path, expiresInSeconds = 60 * 60 * 24 * 7) {
  return createSignedUrl(path, expiresInSeconds);
}

export async function removeObject(path) {
  return removePath(path);
}
