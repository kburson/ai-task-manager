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
