import { signedURL } from './storage.js';
import { presentPresence } from './presence.js';

export async function presentUser(user) {
  if (!user) return null;

  const value =
    typeof user.toObject === 'function'
      ? user.toObject()
      : { ...user };

  delete value.password;

  value.presence =
    presentPresence(value);

  value.online =
    value.presence.online;

  value.lastSeenAt =
    value.presence.lastSeenAt;

  value.lastActivityAt =
    value.presence.lastActivityAt;

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
