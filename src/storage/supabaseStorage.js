import { createClient } from '@supabase/supabase-js';

const url = String(process.env.SUPABASE_URL || '').trim();
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export const SUPA_BUCKET = String(process.env.SUPABASE_BUCKET || 'uploads').trim();
export const supabaseConfigured = Boolean(url && key);
export const storageBucketConfigured = Boolean(SUPA_BUCKET);

export const supabase = supabaseConfigured
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function unavailable() {
  const error = new Error('File storage is unavailable');
  error.status = 503;
  error.code = 'STORAGE_UNAVAILABLE';
  throw error;
}

export const supabaseStorage = {
  name: 'supabase',
  status() {
    return { provider: 'supabase', supabaseConfigured, storageBucketConfigured, bucket: storageBucketConfigured ? SUPA_BUCKET : null };
  },
  ensureReady() {
    if (!supabase || !storageBucketConfigured) unavailable();
    return supabase;
  },
  async uploadBuffer(path, buffer, contentType = 'application/octet-stream') {
    const client = this.ensureReady();
    const { error } = await client.storage.from(SUPA_BUCKET).upload(path, buffer, { contentType, upsert: true });
    if (error) throw error;
    return { path, url: await this.createSignedUrl(path) };
  },
  async createSignedUrl(path, expiresInSeconds = 60 * 60 * 24 * 7) {
    const client = this.ensureReady();
    const { data: signed, error } = await client.storage.from(SUPA_BUCKET).createSignedUrl(path, expiresInSeconds);
    if (!error && signed?.signedUrl) return signed.signedUrl;
    const { data: publicUrl } = client.storage.from(SUPA_BUCKET).getPublicUrl(path);
    return publicUrl?.publicUrl || '';
  },
  getPublicUrl(path) {
    const client = this.ensureReady();
    return client.storage.from(SUPA_BUCKET).getPublicUrl(path).data?.publicUrl || '';
  },
  async removePath(path) {
    if (!path) return;
    const { error } = await this.ensureReady().storage.from(SUPA_BUCKET).remove([path]);
    if (error) throw error;
  },
  async removePaths(paths = []) {
    const unique = [...new Set((paths || []).filter(Boolean))];
    if (!unique.length) return;
    const { error } = await this.ensureReady().storage.from(SUPA_BUCKET).remove(unique);
    if (error) throw error;
  },
};

