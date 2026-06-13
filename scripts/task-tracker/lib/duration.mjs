// #230 (child c of #238) — duration unit conversion for board fields.
//
// The four board "actuals" fields (Engaged Time, Session Time, Review Time,
// Plan Time) are written in float-HOURS so that `Estimate − Actual` is a
// single subtraction in Estimate's native unit. `secondsToFloatHours`
// converts a seconds total to hours at fixed decimal precision (default 5
// digits ≈ 0.036s granularity — lossless for any realistic session).
//
// The `<!-- aitm-fields -->` body marker stays in MINUTES; only the board
// write uses this helper. Downstream consumer migration to seconds is #243.

// Convert a seconds count to float-hours rounded to `digits` decimal places.
// Returns a Number (trailing zeros are not preserved — the board renders the
// column at fixed precision). Returns null for non-finite input so callers
// skip the write rather than push NaN onto the board.
export function secondsToFloatHours(n, digits = 5) {
  // Treat absent input as "skip" rather than coercing null/'' to 0 hours.
  if (n === null || n === undefined || n === '') return null;
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  const d = Number.isInteger(digits) && digits >= 0 && digits <= 100 ? digits : 5;
  return Number((num / 3600).toFixed(d));
}

// #397 (foundation child of #238) — fixed-width duration string codec.
//
// The pivot moves the four board "actuals" fields off float-hours onto a
// human-readable Text format `DDd HHh MMm SSs` (e.g. `00d 02h 03m 45s`). Each
// component is zero-padded to exactly two digits, so byte-wise lexical ordering
// of two formatted strings equals numeric ordering of their second counts — the
// property the board's text sort relies on. Canonical stored unit is integer
// seconds. This module supersedes the formatter from the closed #237.

// Inclusive ceiling: `99d 23h 59m 59s`. Above this the day component would need
// a third digit, breaking the fixed-width lexical-sort guarantee, so we throw
// rather than widen. Real session durations never approach 99 days.
const MAX_DURATION_SECONDS = 99 * 86400 + 23 * 3600 + 59 * 60 + 59; // 8 639 999

const DURATION_RE = /^(\d{2})d (\d{2})h (\d{2})m (\d{2})s$/;

const pad2 = (n) => String(n).padStart(2, '0');

// Render a non-negative integer second count as `DDd HHh MMm SSs`.
// Throws RangeError on negative, fractional, NaN, or over-ceiling input — a bad
// duration is a programming error, not a value to silently coerce.
export function formatDuration(totalSeconds) {
  if (!Number.isInteger(totalSeconds)) {
    throw new RangeError(`formatDuration: expected an integer, got ${totalSeconds}`);
  }
  if (totalSeconds < 0) {
    throw new RangeError(`formatDuration: expected a non-negative value, got ${totalSeconds}`);
  }
  if (totalSeconds > MAX_DURATION_SECONDS) {
    throw new RangeError(
      `formatDuration: ${totalSeconds}s exceeds the representable ceiling of ${MAX_DURATION_SECONDS}s (99d 23h 59m 59s)`
    );
  }
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(days)}d ${pad2(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s`;
}

// Parse a `DDd HHh MMm SSs` string back to an integer second count.
// Strict: the whole string must match the fixed-width pattern AND the time
// components must be in range (h <= 23, m <= 59, s <= 59); otherwise throws
// RangeError so a malformed-but-shaped string is never silently mis-summed.
// Round-trip invariant: parseDuration(formatDuration(n)) === n for every n in
// [0, MAX_DURATION_SECONDS].
export function parseDuration(str) {
  if (typeof str !== 'string') {
    throw new RangeError(`parseDuration: expected a string, got ${typeof str}`);
  }
  const m = DURATION_RE.exec(str);
  if (!m) {
    throw new RangeError(`parseDuration: "${str}" does not match DDd HHh MMm SSs`);
  }
  const days = Number(m[1]);
  const hours = Number(m[2]);
  const minutes = Number(m[3]);
  const seconds = Number(m[4]);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new RangeError(`parseDuration: "${str}" has an out-of-range time component`);
  }
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export { MAX_DURATION_SECONDS };
