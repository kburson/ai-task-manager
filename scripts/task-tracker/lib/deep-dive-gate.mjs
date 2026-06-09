// #297 — Plan → Develop pre-flight: refuse unless the issue body carries
// evidence the Deep-Dive Analysis ran. Three independent signals:
//
//   1. `<!-- aitm-deep-dive-posted: ... -->` marker (deep-dive section was authored).
//   2. A `## Deep-Dive Analysis` or `### Deep-Dive Analysis` heading.
//   3. `<!-- aitm-deep-dive-complete: ... -->` marker (deep-dive section was
//      acknowledged via `/task check "Deep dive complete"`).
//
// Each is checked independently so a partial / drifted body surfaces every
// missing signal in one pass (no fail-fast).
//
// #300 — migrated from the legacy `- [x] Deep dive complete` checkbox to the
// hidden `aitm-deep-dive-complete` marker. The checkbox is deprecated and
// `gh-edit-guard` refuses bodies that reintroduce it; the marker is the sole
// source of truth.

// #325 — single source of truth for signal detection now lives in
// `lib/deep-dive.mjs::readDeepDiveSignals`. This module composes the gate
// blocker messages on top of that shape.
//
// #358 — the size-bucketed substantive-chars floor (XS=1200, S=1800,
// M/L/XL=2400, default 2000) used to live as an inline check in
// `scripts/gh/move-state.mjs` that called `validateBody(body, { gates:
// [deep-dive-complete] })` directly. When the inline block was deleted, the
// substantive-chars floor was lost from the plan→develop guard chain. It is
// now folded into `planDeepDiveGate` so `planExitDeepDiveGuard` covers it.

import { readDeepDiveSignals } from './deep-dive.mjs';
import { validateBody, DEFAULT_GATES } from './body-gates.mjs';

const DEEP_DIVE_COMPLETE_RULES = DEFAULT_GATES.filter((g) => g.name === 'deep-dive-complete');

// Legacy back-compat predicate wrappers. New callers should use
// `readDeepDiveSignals` directly.
export function hasDeepDivePostedMarker(body = '') {
  return readDeepDiveSignals(body).hasPosted;
}

export function hasDeepDiveCompletedMarker(body = '') {
  return readDeepDiveSignals(body).hasComplete;
}

// Back-compat alias: prior callers asked for "both markers" in one shot.
export function hasDeepDiveMarkers(body = '') {
  const s = readDeepDiveSignals(body);
  return s.hasPosted && s.hasComplete;
}

export function hasDeepDiveSection(body = '') {
  return readDeepDiveSignals(body).hasHeading;
}

export function planDeepDiveGate({ body = '' } = {}) {
  const signals = readDeepDiveSignals(body);
  const blockers = [];
  if (!signals.hasPosted) {
    blockers.push(
      'plan-develop-deep-dive-posted-marker-missing: body must contain `<!-- aitm-deep-dive-posted: ... -->` — call `ensureDeepDive (scripts/task-tracker/lib/deep-dive.mjs)` with `posted: true` (and optional `prose`) to stamp the marker in one atomic write'
    );
  }
  if (!signals.hasHeading) {
    blockers.push(
      'plan-develop-deep-dive-section-missing: body must contain a `## Deep-Dive Analysis` heading — author the section before promoting to Develop'
    );
  }
  if (!signals.hasComplete) {
    blockers.push(
      'plan-develop-deep-dive-complete-marker-missing: body must contain `<!-- aitm-deep-dive-complete: ... -->` — run `/task check "Deep dive complete"` to stamp the marker'
    );
  }
  // #358 — size-tiered substantive-chars floor: only fires when both the
  // `deep-dive-complete` marker AND the section heading are present. The
  // section-missing and posted/complete-missing cases are already surfaced
  // above; running the chars check then would duplicate them with a less
  // actionable "ticked but no section" reason.
  if (signals.hasPosted && signals.hasComplete && signals.hasHeading) {
    const charsCheck = validateBody(body, { gates: DEEP_DIVE_COMPLETE_RULES });
    if (!charsCheck.ok) {
      for (const r of charsCheck.refusedRules || []) {
        blockers.push(`deep-dive-complete: ${r.reason}`);
      }
    }
  }
  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}
