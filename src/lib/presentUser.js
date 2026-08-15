import { signedURL } from './storage.js';

export async function presentUser(user) {
  if (!user) return null;

  const value =
    typeof user.toObject === 'function'
      ? user.toObject()
      : { ...user };

  delete value.password;

  if (value.avatarPath) {
    try {
      value.avatarUrl = await signedURL(value.avatarPath);
    } catch (error) {
      console.warn(
        'Unable to refresh avatar URL:',
        error?.code || error?.message || 'unknown error',
      );

      // Keep the last known avatarUrl if Drive is temporarily unavailable.
    }
  }

  return value;
}