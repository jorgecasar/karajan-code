/**
 * Generic retry utility with exponential backoff and jitter.
 * Handles transient errors (429, 502, 503, timeouts) automatically.
 */

const TRANSIENT_HTTP_CODES = new Set([408, 429, 500, 502, 503, 504]);

const TRANSIENT_ERROR_PATTERNS = [
  "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "EPIPE",
  "ENETUNREACH", "EAI_AGAIN", "EHOSTUNREACH",
  "socket hang up", "network error", "fetch failed"
];

const DEFAULT_OPTIONS = {
  maxAttempts: 3,
  initialBackoffMs: 1000,
  maxBackoffMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  onRetry: null
};

export function isTransientError(error) {
  if (!error) return false;

  if (error.httpStatus && TRANSIENT_HTTP_CODES.has(error.httpStatus)) return true;
  if (error.status && TRANSIENT_HTTP_CODES.has(error.status)) return true;

  const msg = (error.message || String(error)).toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((p) => msg.includes(p.toLowerCase()));
}

export function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;

  const date = Date.parse(headerValue);
  if (!Number.isNaN(date)) {
    const delayMs = date - Date.now();
    return delayMs > 0 ? delayMs : null;
  }
  return null;
}

export function calculateBackoff(attempt, options = {}) {
  const { initialBackoffMs = 1000, maxBackoffMs = 30000, backoffMultiplier = 2, jitterFactor = 0.1 } = options;

  const base = initialBackoffMs * Math.pow(backoffMultiplier, attempt);
  const capped = Math.min(base, maxBackoffMs);
  const jitter = capped * jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= opts.maxAttempts - 1) break;
      if (!isTransientError(error)) break;

      let delayMs = calculateBackoff(attempt, opts);

      const retryAfterMs = parseRetryAfter(error.retryAfter || error.headers?.get?.("retry-after"));
      if (retryAfterMs) {
        delayMs = Math.min(retryAfterMs, opts.maxBackoffMs);
      }

      if (opts.onRetry) {
        opts.onRetry({ attempt, error, delayMs, maxAttempts: opts.maxAttempts });
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}
