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

const ENTERED_STAGE_RE = /<!--\s*aitm-entered-([a-z]+)\s*:/gi;

export const INVARIANT_MARKER_PATTERNS = [
  { name: 'aitm-fields', re: /<!--\s*aitm-fields:/i, kind: 'single' },
  { name: 'aitm-body-version', re: /<!--\s*aitm-body-version:/i, kind: 'single' },
  { name: 'aitm-stage-rollup', re: /<!--\s*aitm-stage-rollup:/i, kind: 'single' },
  { name: 'aitm-refine-complete', re: /<!--\s*aitm-refine-complete:/i, kind: 'single' },
  { name: 'aitm-plan-approved', re: /<!--\s*aitm-plan-approved:/i, kind: 'single' },
  { name: 'aitm-deep-dive-posted', re: /<!--\s*aitm-deep-dive-posted:/i, kind: 'single' },
  { name: 'aitm-deep-dive-complete', re: /<!--\s*aitm-deep-dive-complete:/i, kind: 'single' },
  { name: 'aitm-last-known-state', re: /<!--\s*aitm-last-known-state:/i, kind: 'single' },
  { name: 'aitm-last-known-state-ts', re: /<!--\s*aitm-last-known-state-ts:/i, kind: 'single' },
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
//   - `<!-- aitm-verified-at: <iso> evidence:"..." sha=... proof=#... -->`
//     (the canonical proof shape introduced by this issue)
//   - `<!-- aitm-dod-evidence: ... -->`
//     (the existing close-pipeline auto-stamp; grandfathered)
//
// The marker MUST live on the same line as the tick — a marker on line N+1
// does not validate a tick on line N. This co-location requirement makes
// proof traceable when later readers grep for a checkbox.
//
// Returns an array of `{ lineIndex, text }` for every offending transition.
// Empty array means clean.
const UNCHECKED_LINE_RE = /^\s*- \[ \]/;
const CHECKED_LINE_RE = /^\s*- \[x\]/;
const PROOF_MARKER_RE = /<!--\s*aitm-(?:verified-at|dod-evidence):/;

export function findCheckboxesTickedWithoutProof(before, after) {
  const beforeLines = String(before || '').split('\n');
  const afterLines = String(after || '').split('\n');
  const limit = Math.min(beforeLines.length, afterLines.length);
  const offenders = [];
  for (let i = 0; i < limit; i += 1) {
    if (!UNCHECKED_LINE_RE.test(beforeLines[i])) continue;
    if (!CHECKED_LINE_RE.test(afterLines[i])) continue;
    if (PROOF_MARKER_RE.test(afterLines[i])) continue;
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
