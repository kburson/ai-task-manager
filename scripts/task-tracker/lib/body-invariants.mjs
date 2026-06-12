// Body-invariant markers — the set of hidden HTML comment markers that
// must NEVER be dropped by an issue-body mutation. This list is the
// authoritative source for the marker-loss validator inside
// `mutateIssueBody`, and is mirrored (with the same names) in
// `gh-edit-guard.MARKER_PATTERNS` to backstop external bash invocations.
//
// Each entry:
//   - `name`   — short identifier surfaced in MarkerLossError messages.
//   - `re`     — regex that matches the marker's hidden HTML comment form.
//   - `kind`   — 'single' (zero-or-one occurrence) or 'multi' (zero-or-more,
//                where each individual occurrence must survive — used for
//                `aitm-entered-<stage>` which appears once per stage visited).
//
// Adding a new invariant marker:
//   1. Append a `{name, re, kind}` entry below.
//   2. If `kind === 'multi'` and the marker is parameterized (like
//      `aitm-entered-<stage>`), add a custom branch in `findLostMarkers`
//      that enumerates the parameter values present in `base` and
//      confirms each survives in `next`.
//   3. Mirror the entry in `gh-edit-guard.MARKER_PATTERNS` so external
//      `gh issue edit` invocations are caught by the diff guard too.

import { hasExecutionProof } from './proof-marker.mjs';
import { parseAcEvidence } from './ac-evidence.mjs';

// Captures the stage name from both the legacy `aitm-entered-<stage>[-N]:`
// form and the new `aitm-entered-<stage>[-N] ts="..."` property form (#374),
// so dropped entry markers are detected under either grammar.
const ENTERED_STAGE_RE = /<!--\s*aitm-entered-([a-z]+)(?:-\d+)?(?:\s*:|\s+ts=")/gi;

export const INVARIANT_MARKER_PATTERNS = [
  { name: 'aitm-fields', re: /<!--\s*aitm-fields:/i, kind: 'single' },
  // Widened (#376) to detect the body-version marker under BOTH the legacy
  // colon grammar and the new `version="..."` property grammar, so a writer
  // flipped to the new form is not falsely reported as a dropped marker by
  // `findLostMarkers`. Legacy branch stays until #369's corpus sweep.
  {
    name: 'aitm-body-version',
    re: /<!--\s*aitm-body-version(?:\s*:|\s+version=")/i,
    kind: 'single',
  },
  { name: 'aitm-stage-rollup', re: /<!--\s*aitm-stage-rollup:/i, kind: 'single' },
  // Lifecycle-timestamp invariants widened (#375) to detect the marker under
  // BOTH the legacy colon grammar and the new `ts="..."` property grammar, so
  // a writer flipped to the new form is not falsely reported as a dropped
  // marker by `findLostMarkers`. Legacy branch stays until #369's corpus sweep.
  {
    name: 'aitm-refine-complete',
    re: /<!--\s*aitm-refine-complete(?:\s*:|\s+ts=")/i,
    kind: 'single',
  },
  { name: 'aitm-plan-approved', re: /<!--\s*aitm-plan-approved(?:\s*:|\s+ts=")/i, kind: 'single' },
  {
    name: 'aitm-deep-dive-posted',
    re: /<!--\s*aitm-deep-dive-posted(?:\s*:|\s+ts=")/i,
    kind: 'single',
  },
  {
    name: 'aitm-deep-dive-complete',
    re: /<!--\s*aitm-deep-dive-complete(?:\s*:|\s+ts=")/i,
    kind: 'single',
  },
  // Widened (#378) so collapsing the legacy two-marker pair into the new single
  // property marker `aitm-last-known-state state="..." ts="..."` does not report
  // either invariant as lost. The new combined marker satisfies BOTH detectors
  // (it carries state and ts), so the pair→single conversion is loss-free.
  {
    name: 'aitm-last-known-state',
    re: /<!--\s*aitm-last-known-state(?:\s*:|\s+state=")/i,
    kind: 'single',
  },
  {
    name: 'aitm-last-known-state-ts',
    re: /<!--\s*aitm-last-known-state(?:-ts\s*:|\s+state=")/i,
    kind: 'single',
  },
  { name: 'aitm-entered-<stage>', re: ENTERED_STAGE_RE, kind: 'multi' },
];

function enteredStages(body) {
  const set = new Set();
  // matchAll requires a global regex; ENTERED_STAGE_RE is /g.
  for (const m of String(body || '').matchAll(ENTERED_STAGE_RE)) {
    set.add(m[1].toLowerCase());
  }
  return set;
}

// Returns an array of lost marker names. For 'single' kinds, returns the
// marker name. For the parameterized `aitm-entered-<stage>` multi marker,
// returns `aitm-entered-<stage>` per dropped stage so the error message
// names exactly which stage transition was clobbered.
export function findLostMarkers(base, next) {
  const baseStr = String(base || '');
  const nextStr = String(next || '');
  const lost = [];
  for (const { name, re, kind } of INVARIANT_MARKER_PATTERNS) {
    if (kind === 'single') {
      if (re.test(baseStr) && !re.test(nextStr)) lost.push(name);
    } else if (kind === 'multi' && name === 'aitm-entered-<stage>') {
      const baseStages = enteredStages(baseStr);
      const nextStages = enteredStages(nextStr);
      for (const stage of baseStages) {
        if (!nextStages.has(stage)) lost.push(`aitm-entered-${stage}`);
      }
    }
  }
  return lost;
}

// #362 — checkbox proof-marker invariant. Every transition from `- [ ]` to
// `- [x]` (per-line, same line index in `before` vs `after`) must carry an
// execution-evidence marker on the new line. Valid markers are:
//   - `<!-- aitm-verified key="value" ... -->`
//     (the consolidated proof shape — #368)
//   - `<!-- aitm-verified-at: <iso> evidence:"..." sha=... proof=#... -->`
//     (legacy proof shape; read until #369 rewrites the corpus)
//   - `<!-- aitm-dod-evidence: ... -->`
//     (the existing close-pipeline auto-stamp; grandfathered)
//   - `<!-- aitm-ac-evidence:<key> cmd="..." exit=N sha=... ts=... -->`
//     (the AC evidence stamp produced by `/task ac-stamp` — #383). This is the
//     marker the #345 evidence gate REQUIRES to tick a verifier-declaring AC,
//     so #362 must accept it too; otherwise the two gates demand incompatible
//     markers and a correctly-stamped AC can never be ticked. Only the strict
//     canonical form (all of key/cmd/exit/sha/ts, via `parseAcEvidence`)
//     qualifies — a bare `aitm-ac-evidence:<key>` fragment is not proof.
//
// A bare `aitm-verified-by` DECLARATION is NOT proof — `hasExecutionProof`
// excludes it. The marker MUST live on the same line as the tick — a marker on
// line N+1 does not validate a tick on line N. This co-location requirement
// makes proof traceable when later readers grep for a checkbox.
//
// Returns an array of `{ lineIndex, text }` for every offending transition.
// Empty array means clean.
const UNCHECKED_LINE_RE = /^\s*- \[ \]/;
const CHECKED_LINE_RE = /^\s*- \[x\]/;
// Functional-DoD close-pipeline auto-stamp, resolved here (proof-marker.mjs owns
// the `aitm-verified*` family; dod-evidence stays a local concern). Widened
// (#379) to accept BOTH the legacy colon form (`aitm-dod-evidence:<key> ...`)
// and the new consolidated property form (`aitm-dod-evidence key="..." ...`),
// so a writer flipped to the new grammar still counts as checkbox proof.
// Legacy branch stays until the #369 corpus sweep. (The ac-evidence proof path
// is covered by the widened `parseAcEvidence` in `lineHasProof`.)
const DOD_EVIDENCE_RE = /<!--\s*aitm-dod-evidence(?::|\s+key=")/;

function lineHasProof(line) {
  const s = String(line || '');
  // `parseAcEvidence` returns a parsed object only for the strict canonical
  // ac-evidence form (key + cmd + exit + sha + ts); a partial fragment yields
  // null and therefore does NOT count as proof.
  return hasExecutionProof(line) || DOD_EVIDENCE_RE.test(s) || parseAcEvidence(s) != null;
}

export function findCheckboxesTickedWithoutProof(before, after) {
  const beforeLines = String(before || '').split('\n');
  const afterLines = String(after || '').split('\n');
  const limit = Math.min(beforeLines.length, afterLines.length);
  const offenders = [];
  for (let i = 0; i < limit; i += 1) {
    if (!UNCHECKED_LINE_RE.test(beforeLines[i])) continue;
    if (!CHECKED_LINE_RE.test(afterLines[i])) continue;
    if (lineHasProof(afterLines[i])) continue;
    offenders.push({ lineIndex: i, text: afterLines[i] });
  }
  return offenders;
}

export class CheckboxProofMissingError extends Error {
  constructor({ lines } = {}) {
    const list = Array.isArray(lines) ? lines : [];
    const sample = list
      .slice(0, 5)
      .map((l) => `    line ${l.lineIndex}: ${l.text}`)
      .join('\n');
    const msg =
      `mutateIssueBody refused: ${list.length} checkbox tick(s) without proof marker.\n` +
      `  Every \`- [ ]\` → \`- [x]\` transition must include an \`aitm-verified-at\` or \`aitm-dod-evidence\` HTML comment on the SAME line.\n` +
      `  Offending lines:\n${sample}\n` +
      `  Pass \`allowUnverifiedTicks: true\` to bypass for legitimate cases.`;
    super(msg);
    this.name = 'CheckboxProofMissingError';
    this.lines = list.slice();
  }
}
