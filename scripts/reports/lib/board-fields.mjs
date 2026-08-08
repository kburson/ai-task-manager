// Board custom-field readers for the value report (#789).
//
// The per-issue Product Backlog table repoints from computed values to the
// GitHub Project board's real custom fields. `Engaged`, `Review`, and `Plan`
// are Text duration strings (`DDd HHh MMm SSs`, integer seconds); `Started` is a
// Text datetime (`YYYY-MM-DD HH:MM:SS ±HH:MM`). All are read by field NAME from
// the map built by `fields()` in the report.
//
// Every reader is pure and total: an absent field returns `null` (never throws),
// so a missing `Review`/`Plan`/`Started` degrades the row to `—` rather than
// failing the report.

import { parseDuration } from '../../task-tracker/lib/duration.mjs';

// Convert a named duration board field to MINUTES.
//   - field absent / null / undefined  → null
//   - empty or unparseable string       → null
//   - `00d 00h 00m 00s` (present-zero)   → 0 (distinct from absent)
//   - number (defensive)                 → passthrough (already minutes)
export function readDurationMinutes(fields = {}, name) {
  const v = (fields || {})[name];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    try {
      return parseDuration(t) / 60;
    } catch {
      return null;
    }
  }
  return null;
}

// Board `Engaged` duration → minutes (null when absent).
export function readEngagedMinutes(fields = {}) {
  return readDurationMinutes(fields, 'Engaged');
}

// Board `Started` datetime → Date, or null when absent/unparseable.
// Graceful: never throws, so a missing start date renders `—` downstream.
export function readStartedAt(fields = {}) {
  const v = (fields || {})['Started'];
  if (v == null) return null;
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === '') return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Acceleration ratio = Estimate (hours) ÷ Engaged (hours). Returns null — which
// the table renders as `—` — when the estimate is absent or engaged time is
// absent or zero, so a divide-by-zero can never surface.
export function accelRatio(estimate, engagedMin) {
  if (estimate == null) return null;
  if (engagedMin == null || engagedMin <= 0) return null;
  return estimate / (engagedMin / 60);
}

export function formatAcceleration(ratio) {
  if (ratio == null || typeof ratio !== 'number' || !Number.isFinite(ratio)) return '—';
  const value = `${ratio.toFixed(2)}×`;
  return ratio < 1 ? `${value} (slower than Plan)` : value;
}
