const DEFAULT_RETRIES = 4;

function statusOf(error) {
  return Number(error?.code || error?.response?.status || error?.status || 0);
}

export function isRetryableGoogleError(error) {
  const status = statusOf(error);
  return status === 429 || status === 408 || status >= 500;
}

export async function withGoogleRetry(operation, {
  retries = DEFAULT_RETRIES,
  baseDelayMs = 150,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let attempt = 0;
  // The bounded retry is deliberately at the data-access boundary, rather than
  // scattered through individual controllers.
  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryableGoogleError(error) || attempt >= retries) throw error;
      const retryAfter = Number(error?.response?.headers?.['retry-after'] || 0);
      const delay = retryAfter > 0
        ? retryAfter * 1000
        : baseDelayMs * (2 ** attempt) + Math.floor(Math.random() * baseDelayMs);
      await sleep(delay);
      attempt += 1;
    }
  }
}

