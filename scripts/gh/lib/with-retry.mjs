// #409 — generic bounded retry-with-backoff for transient GitHub CLI failures.
//
// `gh` occasionally fails transiently — a dropped socket, a DNS hiccup, a 5xx
// from the API, a secondary rate-limit. Those should not abort a verb or risk
// dropping a timing flush. `withRetry` runs a thunk and, on an error that
// `isRetryable` classifies as transient, retries with exponential backoff up
// to `retries` times before rethrowing the last error. Non-transient errors
// (auth, validation, 404) are rethrown immediately so real bugs fail loud.
//
// `sleep` is injectable so unit tests run without real delays.

// Substrings/patterns that mark a `gh`/network failure as transient. Matched
// case-insensitively against `err.message` + `err.stderr`.
const TRANSIENT_RE =
  /etimedout|econnreset|econnrefused|enotfound|eai_again|epipe|socket hang up|network is unreachable|timeout|timed out|temporarily unavailable|service unavailable|bad gateway|gateway time-?out|connection reset|connection closed|\b(?:429|500|502|503|504)\b|rate limit|secondary rate|try again/i;

// Classify whether a thrown error looks like a transient gh/network failure.
// Inspects both `message` and any captured `stderr` (gh surfaces the HTTP
// status and curl error text on stderr).
export function isTransientGhError(err) {
  if (!err) return false;
  const haystack = `${err.message || ''}\n${err.stderr || ''}\n${err.stdout || ''}`;
  return TRANSIENT_RE.test(haystack);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Run `fn` with bounded retry-and-backoff.
//
//   withRetry(() => gh([...]), { retries: 3 })
//
// Options:
//   retries      max retry attempts after the first try (default 3 → 4 total)
//   baseDelayMs  first backoff delay (default 500)
//   maxDelayMs   backoff ceiling (default 8000)
//   isRetryable  (err) => boolean classifier (default isTransientGhError)
//   sleep        (ms) => Promise — injectable for tests
//   onRetry      ({ attempt, delay, err }) => void — optional observer
//
// Rethrows the last error once retries are exhausted or when `isRetryable`
// returns false. `fn` receives the zero-based attempt index.
export async function withRetry(
  fn,
  {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    isRetryable = isTransientGhError,
    sleep = defaultSleep,
    onRetry,
  } = {}
) {
  if (typeof fn !== 'function') {
    throw new TypeError('withRetry: fn must be a function');
  }
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryable(err)) throw err;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      if (typeof onRetry === 'function') onRetry({ attempt, delay, err });
      await sleep(delay);
    }
  }
}
