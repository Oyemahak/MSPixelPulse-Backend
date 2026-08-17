// src/lib/presence.js

const DEFAULT_ONLINE_WINDOW_MS = 2 * 60 * 1000;

function configuredWindowMs() {
  const value = Number(
    process.env.PRESENCE_ONLINE_WINDOW_MS ||
      DEFAULT_ONLINE_WINDOW_MS,
  );

  if (
    !Number.isFinite(value) ||
    value < 30_000
  ) {
    return DEFAULT_ONLINE_WINDOW_MS;
  }

  return Math.min(
    value,
    15 * 60 * 1000,
  );
}

export const PRESENCE_ONLINE_WINDOW_MS =
  configuredWindowMs();

export function normalizePresenceTimestamp(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (
    typeof value === 'number'
  ) {
    /*
     * Support both milliseconds and Unix seconds.
     */
    const timestamp =
      value > 0 &&
      value < 10_000_000_000
        ? value * 1000
        : value;

    date = new Date(timestamp);
  } else {
    const raw =
      String(value).trim();

    if (!raw) {
      return null;
    }

    /*
     * Historical Google Sheet values may contain numeric
     * timestamps stored as strings.
     */
    if (/^\d+$/.test(raw)) {
      const numeric =
        Number(raw);

      const timestamp =
        numeric > 0 &&
        numeric < 10_000_000_000
          ? numeric * 1000
          : numeric;

      date =
        new Date(timestamp);
    } else {
      date =
        new Date(raw);
    }
  }

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function timestampFromUser(
  userOrTimestamp,
) {
  if (
    userOrTimestamp &&
    typeof userOrTimestamp ===
      'object' &&
    !(userOrTimestamp instanceof Date)
  ) {
    return (
      userOrTimestamp.lastSeenAt ??
      userOrTimestamp.presence
        ?.lastSeenAt ??
      null
    );
  }

  return userOrTimestamp;
}

export function isUserOnline(
  userOrTimestamp,
  now = Date.now(),
) {
  const normalized =
    normalizePresenceTimestamp(
      timestampFromUser(
        userOrTimestamp,
      ),
    );

  if (!normalized) {
    return false;
  }

  const lastSeen =
    new Date(
      normalized,
    ).getTime();

  const current =
    now instanceof Date
      ? now.getTime()
      : Number(now);

  if (
    !Number.isFinite(current)
  ) {
    return false;
  }

  const elapsed =
    current - lastSeen;

  /*
   * Permit a small amount of future clock drift while still
   * rejecting obviously incorrect timestamps.
   */
  if (
    elapsed <
    -5 * 60 * 1000
  ) {
    return false;
  }

  return (
    elapsed <=
    PRESENCE_ONLINE_WINDOW_MS
  );
}

export function presentPresence(
  user,
  now = Date.now(),
) {
  const lastSeenAt =
    normalizePresenceTimestamp(
      timestampFromUser(user),
    );

  return {
    online:
      Boolean(
        lastSeenAt,
      ) &&
      isUserOnline(
        lastSeenAt,
        now,
      ),

    lastSeenAt,
  };
}

export const presenceInternals = {
  configuredWindowMs,
  timestampFromUser,
};