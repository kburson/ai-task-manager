// #297 — Plan → Develop pre-flight: refuse unless the issue body carries
// evidence the Deep-Dive Analysis ran. Three independent signals:
//
//   1. `<!-- aitm-deep-dive-posted: ... -->` AND `<!-- aitm-deep-dive-complete: ... -->`
//      markers (boundary markers around the Deep-Dive section).
//   2. A `## Deep-Dive Analysis` or `### Deep-Dive Analysis` heading.
//   3. `- [x] Deep dive complete` inside the `## Pickup Directive` section.
//
// Each is checked independently so a partial / drifted body surfaces every
// missing signal in one pass (no fail-fast).

const POSTED_RE = /<!--\s*aitm-deep-dive-posted:\s*[^>]*?-->/i;
const COMPLETE_RE = /<!--\s*aitm-deep-dive-complete:\s*[^>]*?-->/i;
const SECTION_RE = /^#{2,3}\s+Deep-Dive Analysis\b/im;
const PICKUP_HEADING_RE = /^##\s+Pickup Directive\b/im;
const PICKUP_NEXT_H2_RE = /^##\s+/m;
const CHECKBOX_TICKED_RE = /^- \[x\] Deep dive complete\b/im;

export function hasDeepDiveMarkers(body = '') {
  return POSTED_RE.test(body) && COMPLETE_RE.test(body);
}

export function hasDeepDiveSection(body = '') {
  return SECTION_RE.test(body);
}

// `Deep dive complete` checkbox must be ticked AND must live under the
// `## Pickup Directive` heading. Slice from the heading to the next H2
// (or EOF) and search that window.
export function hasDeepDiveCheckboxTicked(body = '') {
  const m = PICKUP_HEADING_RE.exec(body);
  if (!m) return false;
  const start = m.index;
  const rest = body.slice(start + m[0].length);
  const nextH2 = rest.search(PICKUP_NEXT_H2_RE);
  const window = nextH2 >= 0 ? rest.slice(0, nextH2) : rest;
  return CHECKBOX_TICKED_RE.test(window);
}

export function planDeepDiveGate({ body = '' } = {}) {
  const blockers = [];
  if (!hasDeepDiveMarkers(body)) {
    blockers.push(
      'plan-develop-deep-dive-marker-missing: body must contain both `<!-- aitm-deep-dive-posted: ... -->` and `<!-- aitm-deep-dive-complete: ... -->` markers — run the deep-dive author flow and stamp both markers around the section'
    );
  }
  if (!hasDeepDiveSection(body)) {
    blockers.push(
      'plan-develop-deep-dive-section-missing: body must contain a `## Deep-Dive Analysis` or `### Deep-Dive Analysis` heading — author the section before promoting to Develop'
    );
  }
  if (!hasDeepDiveCheckboxTicked(body)) {
    blockers.push(
      'plan-develop-deep-dive-checkbox-unticked: `- [x] Deep dive complete` checkbox must be present and ticked inside the `## Pickup Directive` section'
    );
  }
  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}
