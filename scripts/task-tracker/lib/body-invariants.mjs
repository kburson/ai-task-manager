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

import {
  hasExecutionProof,
  validateDeclarationCmd,
  collectDeclarationCmds,
  parseProofMarker,
} from './proof-marker.mjs';
import { parseAcEvidence } from './ac-evidence.mjs';

// Captures the stage name from both the legacy `aitm-entered-<stage>[-N]:`
// form and the new `aitm-entered-<stage>[-N] ts="..."` property form (#374),
// so dropped entry markers are detected under either grammar.
const ENTERED_STAGE_RE = /<!--\s*aitm-entered-([a-z]+)(?:-\d+)?(?:\s*:|\s+ts=")/gi;

// #476 — global counter for the append-only session-ref family. Kept separate
// from the non-global presence pattern in `lib/session-ref.mjs` because
// `matchAll` requires the /g flag.
const SESSION_REF_COUNT_RE = /<!--\s*aitm-session-ref\s+sid="/gi;

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
  // #476 — append-only session-reference chain. Entries accumulate and are
  // never removed; the invariant is "occurrence count must not decrease". A
  // dropped prior entry on an unrelated edit is a loss. Uses the `count` kind
  // so `findLostMarkers` compares occurrence counts rather than a stage set.
  { name: 'aitm-session-ref', re: SESSION_REF_COUNT_RE, kind: 'count' },
];

function countMarkers(body, re) {
  re.lastIndex = 0;
  return [...String(body || '').matchAll(re)].length;
}

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
    } else if (kind === 'count') {
      // Append-only family (#476): the occurrence count must never decrease.
      if (countMarkers(nextStr, re) < countMarkers(baseStr, re)) lost.push(name);
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
// A verifier DECLARATION is NOT proof. The distinction is content-based, not
// name-based (#391): `hasExecutionProof` parses the marker and accepts it only
// when it carries a record-of-run key (`ts`/`sha`/`evidence`). A marker carrying
// only `cmd` is a declaration of HOW an AC will be checked — whether spelled the
// legacy way (`aitm-verified-by`) or the post-#369 consolidated way
// (`aitm-verified cmd="..."`, name-indistinguishable from a proof stamp) — and
// is excluded. The marker MUST live on the same line as the tick — a marker on
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

// #423 — malformed-declaration invariant. A consolidated `aitm-verified cmd="…"`
// declaration must carry an actual command, not an unsubstituted `<…>`
// placeholder or trailing prose. We flag a malformed declaration in `after`
// ONLY when its exact marker text is not already present in `before`, so:
//   - a write never INTRODUCES new corruption (the bug #423 targets), yet
//   - a pre-existing malformed marker carried through untouched never blocks an
//     unrelated edit to the same body, and
//   - the corpus migration (which re-serializes historical markers but does not
//     route through `mutateIssueBody`) is unaffected.
// Returns `{ marker, cmd, reason }` for each newly-introduced offender; an empty
// array means clean.
export function findNewMalformedVerifiedCmds(before, after) {
  const beforeMarkers = new Set(collectDeclarationCmds(before).map((d) => d.marker));
  const offenders = [];
  for (const { marker, cmd } of collectDeclarationCmds(after)) {
    if (beforeMarkers.has(marker)) continue; // pre-existing — not newly introduced
    const reason = validateDeclarationCmd(cmd);
    if (reason) offenders.push({ marker, cmd, reason });
  }
  return offenders;
}

// #522 — proof-INTRODUCTION invariant. `guardedMutate` guards proof LOSS
// (`findLostMarkers`) but had no symmetric invariant against proof INTRODUCTION
// — the exact gap the #516 fabrication exploited (a script synthesized an
// `aitm-verified` proof marker to pass the checkbox gate). This walker returns
// each `after` line that newly carries an EXECUTION-PROOF marker absent from
// `before` — `aitm-verified` with ts/sha/evidence (per `hasExecutionProof`),
// the canonical `aitm-ac-evidence` form, or `aitm-dod-evidence`. A
// declaration-only `aitm-verified cmd="..."` marker asserts intent, not
// provenance, so it is NOT flagged.
//
// The diff is at proof-MARKER granularity, not whole-line. A whole-line diff
// false-positives on the sanctioned `/task check` write path, which toggles
// `- [ ]` → `- [x]` on a line whose stamp is ALREADY present: the line text
// changes (the checkbox) but no new proof marker is minted. Comparing the
// multiset of proof-marker comment substrings instead means a tick on an
// already-stamped line introduces nothing, while a freshly-synthesized marker
// (the #516 fabrication) appears as a new substring and is flagged.
//
// Multiset semantics: a proof marker present at multiplicity N in `before` is
// permitted at multiplicity N in `after`; the N+1-th identical copy is a new
// introduction, attributed to the `after` line carrying that extra copy.
// Returns `{ lineIndex, text }` for each offender; empty is clean.
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

function collectProofMarkers(body) {
  const lines = String(body || '').split('\n');
  const markers = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const matches = line.match(HTML_COMMENT_RE);
    if (!matches) continue;
    for (const marker of matches) {
      if (lineHasProof(marker)) markers.push({ marker, lineIndex: i, text: line });
    }
  }
  return markers;
}

export function findNewlyIntroducedExecutionProof(before, after) {
  const beforeCounts = new Map();
  for (const { marker } of collectProofMarkers(before)) {
    beforeCounts.set(marker, (beforeCounts.get(marker) || 0) + 1);
  }
  const offenders = [];
  for (const { marker, lineIndex, text } of collectProofMarkers(after)) {
    const avail = beforeCounts.get(marker) || 0;
    if (avail > 0) {
      beforeCounts.set(marker, avail - 1);
      continue;
    }
    offenders.push({ lineIndex, text });
  }
  return offenders;
}

export class FabricatedProofError extends Error {
  constructor({ lines } = {}) {
    const list = Array.isArray(lines) ? lines : [];
    const sample = list
      .slice(0, 5)
      .map((l) => `    line ${l.lineIndex}: ${l.text}`)
      .join('\n');
    const msg =
      `mutateIssueBody refused: ${list.length} newly-introduced execution-proof marker(s).\n` +
      `  A body write may not INTRODUCE an execution-proof marker (\`aitm-verified\` with ts/sha/evidence, \`aitm-ac-evidence\`, or \`aitm-dod-evidence\`) unless a sanctioned stamper minted it from a real run.\n` +
      `  Offending lines:\n${sample}\n` +
      `  Only \`ac-stamp\`, \`dod-stamp\`, the close pipeline, and the sandbox auto-stamp may pass \`evidenceStamp: true\` to bypass this guard. Never fabricate a proof marker to satisfy a gate.`;
    super(msg);
    this.name = 'FabricatedProofError';
    this.lines = list.slice();
  }
}

export class MalformedDeclarationCmdError extends Error {
  constructor({ offenders } = {}) {
    const list = Array.isArray(offenders) ? offenders : [];
    const sample = list
      .slice(0, 5)
      .map((o) => `    cmd="${o.cmd}" — ${o.reason}`)
      .join('\n');
    const msg =
      `mutateIssueBody refused: ${list.length} malformed \`aitm-verified cmd="…"\` declaration(s).\n` +
      `  A declaration's \`cmd\` must name an actual command (each backtick-wrapped), not a placeholder or prose.\n` +
      `  Offending declarations:\n${sample}\n` +
      `  Substitute the placeholder / remove the prose so \`cmd\` is a real verifier command.`;
    super(msg);
    this.name = 'MalformedDeclarationCmdError';
    this.offenders = list.slice();
  }
}

// #523 — Demonstrable-AC invariant. The Refine→Plan exit gate must refuse any
// Acceptance-Criteria checkbox line that is not bound to a concrete, targeted
// verifier. An AC is demonstrable when EITHER:
//   - it carries an `aitm-verified cmd="…"` declaration naming at least one
//     real targeted command (a `node --test <file>`-style probe), OR
//   - it is explicitly tagged `invalid — non-demonstrable` (an honest opt-out
//     for a genuinely unverifiable assertion).
// `npm run test:all` is the regression FLOOR, not an AC verifier: an AC whose
// only declared command is `test:all` proves nothing specific to that AC, so it
// is flagged with reason `test-all-verifier`. An AC lacking both a verifier and
// the invalid tag is flagged `no-verifier`.
//
// Returns `{ lineIndex, label, reason }` for each offending AC line, in body
// order. Empty array means every AC is demonstrable (or honestly tagged).
const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const AC_SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;
const AC_BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;
export const NON_DEMONSTRABLE_TAG_RE = /invalid\s+[—-]+\s+non-demonstrable/i;
const TEST_ALL_CMD_RE = /^npm\s+run\s+test:all$/;

function acDeclaredCommands(text) {
  const props = parseProofMarker(String(text || ''));
  if (!props || typeof props.cmd !== 'string') return [];
  return [...props.cmd.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

export function findAcsWithoutVerifierOrInvalidTag(body) {
  const src = String(body || '');
  const heading = src.match(AC_HEADING_RE);
  if (!heading) return [];
  const start = heading.index + heading[0].length;
  const rest = src.slice(start);
  const endMatch = rest.match(AC_SECTION_END_RE);
  const endIdx = endMatch ? start + endMatch.index : src.length;

  const lines = src.split('\n');
  const startLine = src.slice(0, start).split('\n').length - 1;
  const endLine = src.slice(0, endIdx).split('\n').length;

  const offenders = [];
  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(AC_BOX_RE);
    if (!box) continue;
    const labelRaw = box[4];
    if (NON_DEMONSTRABLE_TAG_RE.test(labelRaw)) continue; // honest opt-out
    const cmds = acDeclaredCommands(labelRaw);
    const label = String(labelRaw)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cmds.length === 0) {
      offenders.push({ lineIndex: i, label, reason: 'no-verifier' });
      continue;
    }
    const hasTargeted = cmds.some((c) => !TEST_ALL_CMD_RE.test(c));
    if (!hasTargeted) {
      offenders.push({ lineIndex: i, label, reason: 'test-all-verifier' });
    }
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
