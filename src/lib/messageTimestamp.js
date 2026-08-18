// src/lib/messageTimestamp.js

function numericTimestamp(value) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return null;
  }

  /*
   * Support Unix seconds as well as JavaScript milliseconds.
   */
  return number < 10_000_000_000
    ? number * 1000
    : number;
}

export function normalizeMessageTimestamp(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    const timestamp =
      numericTimestamp(value);

    if (!timestamp) {
      return null;
    }

    date =
      new Date(timestamp);
  } else {
    const raw =
      String(value).trim();

    if (!raw) {
      return null;
    }

    if (/^\d+$/.test(raw)) {
      const timestamp =
        numericTimestamp(raw);

      if (!timestamp) {
        return null;
      }

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

export function timestampFromObjectId(value) {
  const id = String(value || '').trim();

  if (!/^[a-f\d]{24}$/i.test(id)) {
    return null;
  }

  const timestamp = Number.parseInt(id.slice(0, 8), 16) * 1000;
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();

  return year >= 2000 && year <= 2100
    ? date.toISOString()
    : null;
}

export function messageTimestampFrom(record = {}) {
  if (!record) {
    return null;
  }

  return (
    normalizeMessageTimestamp(
      record.sentAt,
    ) ||
    normalizeMessageTimestamp(
      record.createdAt,
    ) ||
    normalizeMessageTimestamp(
      record.updatedAt,
    ) ||
    normalizeMessageTimestamp(
      record.ts,
    ) ||
    timestampFromObjectId(
      record._id || record.id,
    ) ||
    null
  );
}

export function withCanonicalMessageTimestamp(
  record = {},
  {
    createIfMissing = false,
  } = {},
) {
  const timestamp =
    messageTimestampFrom(record) ||
    (
      createIfMissing
        ? new Date().toISOString()
        : null
    );

  return {
    ...record,

    sentAt:
      timestamp,
  };
}

export const messageTimestampInternals = {
  numericTimestamp,
};
