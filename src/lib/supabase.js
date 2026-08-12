// backend/src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client (server-side, service role)
 * Make sure these are set in your environment:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - SUPABASE_BUCKET (optional; defaults to "uploads")
 */
const url = String(process.env.SUPABASE_URL || "").trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

export const SUPA_BUCKET = String(process.env.SUPABASE_BUCKET || "uploads").trim();
export const supabaseConfigured = Boolean(url && key);
export const storageBucketConfigured = Boolean(SUPA_BUCKET);

if (!supabaseConfigured) {
  console.warn("Supabase storage is not configured; upload endpoints will return 503.");
}

export const supabase = supabaseConfigured
  ? createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export function storageStatus() {
  return {
    supabaseConfigured,
    storageBucketConfigured,
    bucket: storageBucketConfigured ? SUPA_BUCKET : null,
  };
}

export function ensureStorageReady() {
  if (!supabase || !storageBucketConfigured) {
    const err = new Error("File storage is unavailable");
    err.status = 503;
    err.code = "STORAGE_UNAVAILABLE";
    throw err;
  }
  return supabase;
}

/**
 * Upload a Node.js Buffer to Supabase Storage.
 * Returns: { path, url } with a 7-day signed URL when possible,
 *          otherwise falls back to public URL (when bucket is public).
 *
 * @param {string} path        Storage path, e.g. "avatars/<userId>/<fileName>"
 * @param {Buffer} buffer      Raw file buffer
 * @param {string} contentType Mime type (default: application/octet-stream)
 */
export async function uploadBuffer(path, buffer, contentType = "application/octet-stream") {
  const client = ensureStorageReady();
  const { error } = await client
    .storage
    .from(SUPA_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });

  if (error) throw error;

  // Prefer a 7-day signed URL (works for private buckets too)
  const { data: signed, error: signErr } = await client
    .storage
    .from(SUPA_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (!signErr && signed?.signedUrl) {
    return { path, url: signed.signedUrl };
  }

  // Fallback to public URL (if bucket is public)
  const { data: pub } = client.storage.from(SUPA_BUCKET).getPublicUrl(path);
  return { path, url: pub?.publicUrl || "" };
}

/**
 * Create a signed URL for an existing object (default 7 days).
 * Useful when you stored only the path and need a fresh link later.
 */
export async function createSignedUrl(path, expiresInSeconds = 60 * 60 * 24 * 7) {
  const client = ensureStorageReady();
  const { data, error } = await client
    .storage
    .from(SUPA_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl || "";
}

/**
 * Get a public URL (only works if bucket/object is public).
 */
export function getPublicUrl(path) {
  const client = ensureStorageReady();
  const { data } = client.storage.from(SUPA_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

/**
 * Remove a single object by path. Ignores missing files.
 */
export async function removePath(path) {
  if (!path) return;
  const client = ensureStorageReady();
  const { error } = await client.storage.from(SUPA_BUCKET).remove([path]);
  if (error) throw error;
}

export async function removePaths(paths = []) {
  const unique = [...new Set((paths || []).filter(Boolean))];
  if (!unique.length) return;
  const client = ensureStorageReady();
  const { error } = await client.storage.from(SUPA_BUCKET).remove(unique);
  if (error) throw error;
}
