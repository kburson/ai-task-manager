// Session-time field resolution for the value report (#786).
//
// The GitHub Project board field that records AI session time was renamed from
// "Session Time" to "Session"; its stored format is a Text duration string
// (`DDd HHh MMm SSs`, integer seconds) since #398/#399. The value report keys
// its per-issue field map by field NAME, so the rename left the old read path
// (`f['Session Time']`) resolving to `undefined` and the report showing blank /
// zero session time.
//
// `readSessionMinutes(fields)` resolves the value from the current field name
// first, then the two legacy fallbacks, and normalizes to MINUTES — the unit
// the rest of the report's math assumes.

import { parseDuration } from '../../task-tracker/lib/duration.mjs';

// Convert a single board field value to MINUTES.
//   - null/undefined            → null (field absent)
//   - number                    → passthrough (legacy "Actual Session Time",
//                                 already in minutes)
//   - duration string           → parseDuration() seconds / 60
//   - empty / unparseable string → null
export function sessionToMinutes(v) {
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

// Resolve session minutes from a name-keyed board field map, preferring the
// current `Session` field, then the legacy `Session Time` duration string, then
// the numeric `Actual Session Time` minutes fallback.
export function readSessionMinutes(fields = {}) {
  const f = fields || {};
  return sessionToMinutes(f['Session'] ?? f['Session Time'] ?? f['Actual Session Time']);
}
