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

const POSTED_RE = /<!--\s*aitm-deep-dive-posted:\s*[^>]*?-->/i;
const COMPLETE_RE = /<!--\s*aitm-deep-dive-complete:\s*[^>]*?-->/i;
const SECTION_RE = /^#{2,3}\s+Deep-Dive Analysis\b/im;

export function hasDeepDivePostedMarker(body = '') {
  return POSTED_RE.test(body);
}

export function hasDeepDiveCompletedMarker(body = '') {
  return COMPLETE_RE.test(body);
}

// Back-compat alias: prior callers asked for "both markers" in one shot.
export function hasDeepDiveMarkers(body = '') {
  return hasDeepDivePostedMarker(body) && hasDeepDiveCompletedMarker(body);
}

export function hasDeepDiveSection(body = '') {
  return SECTION_RE.test(body);
}

export function planDeepDiveGate({ body = '' } = {}) {
  const blockers = [];
  if (!hasDeepDivePostedMarker(body)) {
    blockers.push(
      'plan-develop-deep-dive-posted-marker-missing: body must contain `<!-- aitm-deep-dive-posted: ... -->` — run the deep-dive author flow to stamp the posted marker'
    );
  }
  if (!hasDeepDiveSection(body)) {
    blockers.push(
      'plan-develop-deep-dive-section-missing: body must contain a `## Deep-Dive Analysis` or `### Deep-Dive Analysis` heading — author the section before promoting to Develop'
    );
  }
  if (!hasDeepDiveCompletedMarker(body)) {
    blockers.push(
      'plan-develop-deep-dive-complete-marker-missing: body must contain `<!-- aitm-deep-dive-complete: ... -->` — run `/task check "Deep dive complete"` to stamp the marker'
    );
  }
  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}
