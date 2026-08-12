import { createSignedUrl } from './supabase.js';

export async function presentUser(user) {
  if (!user) return null;
  const value = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete value.password;

  if (value.avatarPath) {
    try {
      value.avatarUrl = await createSignedUrl(value.avatarPath);
    } catch {
      // Keep the last known URL when storage is temporarily unavailable.
    }
  }
  return value;
}

