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
import { parseAcCommitCitation } from './epic-ac-commit-citation.mjs';
import { isAcWaived } from './issue-kind.mjs';
import { parseVerificationCommands } from './verification-commands.mjs';
import { fingerprint, parseBodyLedgerHead } from './resident-action-ledger-codec.mjs';
import {
  resolveCitedOrLiteralCommands,
  parseVcRefIndexes,
  resolveVcRefCommands,
} from './vc-ref.mjs';
import { ENTRY_MARKER_RE, parseEntryMarkers } from './stage-entry-grammar.mjs';

// Captures the stage name from both the legacy `aitm-entered-<stage>[-N]:`
// form and the new `aitm-entered-<stage>[-N] ts="..."` property form (#374),
// so dropped entry markers are detected under either grammar.

// #476 — global counter for the append-only session-ref family. Kept separate
// from the non-global presence pattern in `lib/session-ref.mjs` because
// `matchAll` requires the /g flag.
const SESSION_REF_COUNT_RE = /<!--\s*aitm-session-ref\s+sid="/gi;
const WORKTREE_LOCATION_COUNT_RE = /<!--\s*aitm-worktree-location\s+worktree="/gi;
const AC_STRUCK_COUNT_RE = /<!--\s*aitm-ac-struck\b/gi;
const RESIDENT_ACTION_LEDGER_HEAD_RE = /<!--\s*aitm-resident-action-ledger-head\s+[^]*?-->/i;

const PHASE_ADVANCES = Object.freeze({
  intent: new Set(['waiting', 'resolved', 'failed']),
  waiting: new Set(['resolved', 'failed']),
  resolved: new Set(),
  failed: new Set(),
});

export class MarkerAdvanceError extends Error {
  constructor(markerId, baseMatch, nextMatch, reason, details = {}) {
    super(`marker-advance:${markerId}:${reason}`);
    this.name = 'MarkerAdvanceError';
    this.markerId = markerId;
    this.baseFingerprint = baseMatch ? fingerprint(baseMatch) : null;
    this.nextFingerprint = nextMatch ? fingerprint(nextMatch) : null;
    this.reason = reason;
    this.details = Object.freeze({ ...details });
  }
}

function rejectAdvance(markerId, baseMatch, nextMatch, reason, details) {
  throw new MarkerAdvanceError(markerId, baseMatch, nextMatch, reason, details);
}

function sameActionEntry(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateLedgerAdvance({ markerId, baseMatch, nextMatch, nextBody }) {
  let base;
  let next;
  try {
    base = baseMatch ? parseBodyLedgerHead(baseMatch) : null;
    next = nextMatch ? parseBodyLedgerHead(nextMatch) : null;
  } catch (error) {
    rejectAdvance(markerId, baseMatch, nextMatch, 'malformed', { message: error.message });
  }
  if (!next) rejectAdvance(markerId, baseMatch, nextMatch, 'missing');
  if (next.mode === 'inline') {
    if (nextMatch.length > 8192 || String(nextBody || '').length > 57344) {
      rejectAdvance(markerId, baseMatch, nextMatch, 'inline-budget');
    }
  }
  if (!base) return;
  if (base.visit !== next.visit) return;
  if (base.mode === 'spill' && next.mode === 'inline') {
    rejectAdvance(markerId, baseMatch, nextMatch, 'spill-regression');
  }
  if (base.mode === 'spill' || next.mode === 'spill') {
    if (base.mode === next.mode && base.head === next.head) {
      rejectAdvance(markerId, baseMatch, nextMatch, 'non-advancing');
    }
    return;
  }

  let changes = 0;
  let correctionChanges = 0;
  for (const [actionId, prior] of Object.entries(base.actions)) {
    const current = next.actions[actionId];
    if (!current) rejectAdvance(markerId, baseMatch, nextMatch, 'action-removed', { actionId });
    if (sameActionEntry(prior, current)) continue;
    changes += 1;
    if (current.attemptId < prior.attemptId || current.attemptId > prior.attemptId + 1) {
      rejectAdvance(markerId, baseMatch, nextMatch, 'attempt-regression', { actionId });
    }
    if (current.attemptId === prior.attemptId) {
      const correctionBaseline =
        current.phase === prior.phase && current.proof === 'unproven' && prior.proof !== 'unproven';
      if (correctionBaseline) correctionChanges += 1;
      if (!correctionBaseline && !PHASE_ADVANCES[prior.phase]?.has(current.phase)) {
        rejectAdvance(markerId, baseMatch, nextMatch, 'phase-regression', { actionId });
      }
    } else if (current.phase !== 'intent' || !['resolved', 'failed'].includes(prior.phase)) {
      rejectAdvance(markerId, baseMatch, nextMatch, 'attempt-sequence', { actionId });
    }
  }
  for (const [actionId, current] of Object.entries(next.actions)) {
    if (base.actions[actionId]) continue;
    changes += 1;
    if (current.attemptId !== 1 || current.phase !== 'intent') {
      rejectAdvance(markerId, baseMatch, nextMatch, 'action-genesis', { actionId });
    }
  }
  if (changes !== 1 && correctionChanges !== changes) {
    rejectAdvance(markerId, baseMatch, nextMatch, 'non-advancing', { changes });
  }
  const changed = Object.entries(next.actions).find(
    ([actionId, entry]) => !sameActionEntry(base.actions[actionId], entry)
  );
  const changedEntry = changed?.[1];
  const correctionBaseline =
    changedEntry?.proof === 'unproven' && base.actions[changed?.[0]]?.proof !== 'unproven';
  if (
    changedEntry &&
    !correctionBaseline &&
    next.commit !== `${changedEntry.commentId}:${changedEntry.hash}`
  ) {
    rejectAdvance(markerId, baseMatch, nextMatch, 'commit-mismatch');
  }
}

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
  {
    name: 'aitm-refinement-snapshot',
    re: /<!--\s*aitm-refinement-snapshot\s+schema="/i,
    kind: 'single',
  },
  {
    name: 'aitm-plan-cancelled',
    re: /<!--\s*aitm-plan-cancelled\s+ts="/i,
    kind: 'single',
  },
  { name: 'aitm-plan-approved', re: /<!--\s*aitm-plan-approved(?:\s*:|\s+ts=")/i, kind: 'single' },
  {
    name: 'aitm-epic-orchestration-plan',
    re: /<!--\s*aitm-epic-orchestration-plan\s+schema="/i,
    kind: 'single',
  },
  // #887 — epic AC reconciliation. The marker takes no variable parameter, so
  // `kind: 'single'` needs no custom `findLostMarkers` branch (contrast the
  // `aitm-entered-<stage>` family). Registering it here makes *un*-reconciling
  // an epic require the explicit `allowMarkerLoss: true` hatch, which is the
  // intended asymmetry: reconciliation should be hard to silently undo.
  {
    name: 'aitm-epic-ac-reconciled',
    re: /<!--\s*aitm-epic-ac-reconciled(?:\s*:|\s+ts=")/i,
    kind: 'single',
  },
  {
    name: 'aitm-unauthorized-close',
    re: /<!--\s*aitm-unauthorized-close(?:\s*:|\s+(?:tx|ts)=")/i,
    kind: 'single',
  },
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
  { name: 'aitm-entered-<stage>', re: ENTRY_MARKER_RE, kind: 'multi' },
  // #476 — append-only session-reference chain. Entries accumulate and are
  // never removed; the invariant is "occurrence count must not decrease". A
  // dropped prior entry on an unrelated edit is a loss. Uses the `count` kind
  // so `findLostMarkers` compares occurrence counts rather than a stage set.
  { name: 'aitm-session-ref', re: SESSION_REF_COUNT_RE, kind: 'count' },
  // #1191 — durable development-location history is append-only. A generic
  // body mutation may add entries but must never remove an earlier location.
  { name: 'aitm-worktree-location', re: WORKTREE_LOCATION_COUNT_RE, kind: 'count' },
  // #888 — epic AC strikes. Append-only, hence `count`: a strike records that a
  // promise was withdrawn, which is a fact about history, so the occurrence
  // count must never decrease. `count` needs no custom `findLostMarkers` branch.
  // Un-striking an AC therefore requires the explicit `allowMarkerLoss: true`
  // hatch — the intended asymmetry, since quietly deleting the record of dropped
  // scope is exactly what this marker exists to prevent.
  { name: 'aitm-ac-struck', re: AC_STRUCK_COUNT_RE, kind: 'count' },
  {
    name: 'aitm-resident-action-ledger-head',
    re: RESIDENT_ACTION_LEDGER_HEAD_RE,
    kind: 'advance',
    validateAdvance: validateLedgerAdvance,
  },
];

function countMarkers(body, re) {
  re.lastIndex = 0;
  return [...String(body || '').matchAll(re)].length;
}

function enteredStages(body) {
  const set = new Set();
  for (const entry of parseEntryMarkers(body)) {
    // Preserve raw historical stage identity. Entry markers are append-only
    // audit bytes: adding a canonical alias does not authorize removing the
    // marker that actually recorded the historical transition.
    set.add(entry.state.toLowerCase());
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
    if (kind === 'single' || kind === 'advance') {
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

export function validateMarkerAdvances(baseBody, nextBody, { allowMarkerAdvance = [] } = {}) {
  const allowed = new Set(allowMarkerAdvance);
  for (const marker of INVARIANT_MARKER_PATTERNS.filter((entry) => entry.kind === 'advance')) {
    const baseMatch = marker.re.exec(String(baseBody || ''))?.[0] ?? null;
    const nextMatch = marker.re.exec(String(nextBody || ''))?.[0] ?? null;
    if (baseMatch === nextMatch) continue;
    if (!allowed.has(marker.name)) {
      rejectAdvance(marker.name, baseMatch, nextMatch, 'unauthorized');
    }
    marker.validateAdvance({
      markerId: marker.name,
      baseMatch,
      nextMatch,
      baseBody,
      nextBody,
    });
  }
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

// #536 — proof STRUCTURAL-COMPLETENESS invariant, the flag-bearing sibling of
// #522's provenance guard. When `evidenceStamp: true` (a sanctioned stamper),
// #522 skips provenance entirely — so a buggy/half-written stamper could mint a
// structurally-junk proof marker (missing `sha`, missing `ts`, or a `sha` that
// is neither a git commit sha nor the `sandbox` sentinel) and have it persist as
// trusted "proof". This check validates the SHAPE of a flag-bearing marker, not
// its truth — exactly the boundary the #527 trust-boundary decision drew (no run
// re-derivation). It runs ONLY on newly-introduced markers (multiset diff, same
// as #522), so a tick on an already-stamped line or an unrelated edit introduces
// nothing to check.
//
// Scope: the families that carry `sha`/`ts` attributes — the consolidated
// `aitm-verified` execution-proof form and the `aitm-ac-evidence` form. The
// `aitm-dod-evidence: sandbox exit 0` free-text form carries no such attributes
// (its `parseProofMarker`/`parseAcEvidence` both return null), so it is out of
// scope and never flagged.
const PROOF_SHA_RE = /^[0-9a-f]{7,40}$/i;

function validateShaTs({ sha, ts }) {
  if (ts == null || !String(ts).trim()) return 'missing `ts`';
  if (sha == null || !String(sha).trim()) return 'missing `sha`';
  const s = String(sha).trim();
  if (s !== 'sandbox' && !PROOF_SHA_RE.test(s)) {
    return `\`sha\` "${s}" is neither a git commit sha (7–40 hex chars) nor the \`sandbox\` sentinel`;
  }
  return null;
}

// Returns a defect reason string for a single proof-marker substring, or null
// when the marker is structurally complete (or out of scope).
function proofMarkerStructuralDefect(marker) {
  const props = parseProofMarker(marker);
  if (props && ('ts' in props || 'sha' in props || 'evidence' in props)) {
    return validateShaTs(props);
  }
  const ac = parseAcEvidence(marker);
  if (ac) return validateShaTs(ac);
  return null;
}

// Flag-bearing structural check: among the proof markers newly introduced by
// `after` (multiset diff vs `before`), return `{ lineIndex, text, reason }` for
// each structurally-incomplete one. Empty array is clean.
export function findStructurallyIncompleteIntroducedProof(before, after) {
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
    const reason = proofMarkerStructuralDefect(marker);
    if (reason) offenders.push({ lineIndex, text, reason });
  }
  return offenders;
}

export class IncompleteProofError extends Error {
  constructor({ lines } = {}) {
    const list = Array.isArray(lines) ? lines : [];
    const sample = list
      .slice(0, 5)
      .map((l) => `    line ${l.lineIndex}: ${l.reason}\n      ${l.text}`)
      .join('\n');
    const msg =
      `mutateIssueBody refused: ${list.length} structurally-incomplete execution-proof marker(s).\n` +
      `  A flag-bearing stamp (\`evidenceStamp: true\`) may bypass the provenance guard, but every proof marker it introduces must still carry a present \`ts\` and a \`sha\` that is a git commit sha (7–40 hex chars) or the \`sandbox\` sentinel.\n` +
      `  Offending markers:\n${sample}\n` +
      `  A sanctioned stamper is emitting an incomplete record — fix the stamper, never persist junk proof.`;
    super(msg);
    this.name = 'IncompleteProofError';
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
//   - it carries the `<!-- aitm-non-demonstrable -->` marker (an honest
//     opt-out for a genuinely unverifiable assertion).
// The whole-suite/whole-lane commands are the regression FLOOR, not AC
// verifiers: an AC whose only declared command is `npm run test:all`, `npm
// test` (fast lane), or `npm run test:slow` (slow lane, #934) proves nothing
// specific to that AC, so it is flagged with reason `test-all-verifier`. An AC
// lacking both a verifier and the opt-out marker is flagged `no-verifier`.
//
// Returns `{ lineIndex, label, reason }` for each offending AC line, in body
// order. Empty array means every AC is demonstrable (or honestly tagged).
const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const AC_SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;
const AC_BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;
// #891 — anchored to the marker, not the visible label. The prior
// `/invalid\s+[—-]+\s+non-demonstrable/i` form was a plain substring test
// against the whole label, so prose that merely *discussed* or *quoted* the
// tag (rather than genuinely bearing it) satisfied the opt-out. A trailing
// HTML-comment marker never renders as visible text, so it cannot be
// satisfied by hand-written prose describing the concept — the same shape
// already used by every other machine-readable body signal (`aitm-verified`,
// `aitm-ac-waived`, etc). Legacy bodies carrying the old prose-position tag
// are migrated by `scripts/maintenance/migrate-non-demonstrable-tag-position.mjs`.
export const NON_DEMONSTRABLE_TAG_RE = /<!--\s*aitm-non-demonstrable\s*-->/i;
// The regression-floor commands rejected as AC verifiers (#934 adds the two
// lane commands alongside the legacy `npm run test:all`).
const TEST_ALL_CMD_RE = /^npm(\s+run\s+test:(all|slow)|\s+test)$/;

// #762 — resolve an AC declaration's `cmd` against the issue's parsed VC list so
// a `vc:<n>` citation names the same real command(s) an embedded backtick form
// would. `vcItems` is the body's `## Verification Commands` list; when omitted
// (or for a legacy embedded marker) resolution falls back to the backtick form.
// A citation naming a nonexistent VC position resolves to nothing → the AC is
// treated as unverified (`no-verifier`), which is correct: a dangling citation
// is not demonstrable.
function acDeclaredCommands(text, vcItems = []) {
  const props = parseProofMarker(String(text || ''));
  if (!props) return [];
  // #773/#804 — `vc-list` is the canonical id-citation attribute; resolve it by
  // id (never through the retired ordinal `cmd` fallback). A `cmd` attribute is
  // read only for the DoD-Functional backtick-literal form. An empty/dangling
  // citation resolves to nothing → the AC is treated as unverified
  // (`no-verifier`), which the vc-citation guardrail separately flags with a
  // sharper `empty-vc-list` / `dangling-vc-list` reason.
  try {
    if (typeof props['vc-list'] === 'string') {
      const cited = resolveVcRefCommands(props['vc-list'], vcItems);
      return (cited || []).map((c) => c.trim());
    }
    if (typeof props.cmd === 'string') {
      return resolveCitedOrLiteralCommands(props.cmd, vcItems).map((c) => c.trim());
    }
    return [];
  } catch {
    return [];
  }
}

export function findAcsWithoutVerifierOrInvalidTag(body) {
  const src = String(body || '');
  const heading = src.match(AC_HEADING_RE);
  if (!heading) return [];
  const start = heading.index + heading[0].length;
  const rest = src.slice(start);
  const endMatch = rest.match(AC_SECTION_END_RE);
  const endIdx = endMatch ? start + endMatch.index : src.length;

  // #762 — parse the issue's VC list once so citation-form ACs resolve to their
  // cited command(s) and are recognized as demonstrable.
  const vcItems = parseVerificationCommands(src);
  const lines = src.split('\n');
  const startLine = src.slice(0, start).split('\n').length - 1;
  const endLine = src.slice(0, endIdx).split('\n').length;

  const offenders = [];
  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(AC_BOX_RE);
    if (!box) continue;
    const labelRaw = box[4];
    if (NON_DEMONSTRABLE_TAG_RE.test(labelRaw)) continue; // honest opt-out
    if (isAcWaived(labelRaw)) continue; // #688 — no-commit lane waiver is a valid opt-out
    // #886 — a commit citation is evidence of a different kind: an epic AC
    // delegates to a child's deliverable, so there is nothing to run. Checked
    // BEFORE command resolution but AFTER the opt-outs, so a line carrying both
    // `commits` and `cmd` is accepted here and its command still resolves
    // unchanged everywhere else. Resolution and attribution of the cited shas
    // need git and therefore live in `runReviewPreflight`'s epic branch — this
    // function stays pure.
    if (parseAcCommitCitation(labelRaw)) continue;
    const cmds = acDeclaredCommands(labelRaw, vcItems);
    const label = String(labelRaw)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cmds.length === 0) {
      offenders.push({ lineIndex: i, label, reason: 'no-verifier' });
      continue;
    }
    // #678 — a declared cmd that fails validateDeclarationCmd (e.g. an
    // unresolved `{tbd}` sentinel) is not a real verifier even though
    // cmds.length > 0; catch it before the test-all check so a malformed
    // placeholder doesn't slip through as "OK".
    const malformed = cmds.find((c) => validateDeclarationCmd(c));
    if (malformed !== undefined) {
      offenders.push({
        lineIndex: i,
        label,
        reason: `malformed-verifier: ${validateDeclarationCmd(malformed)}`,
      });
      continue;
    }
    const hasTargeted = cmds.some((c) => !TEST_ALL_CMD_RE.test(c));
    if (!hasTargeted) {
      offenders.push({ lineIndex: i, label, reason: 'test-all-verifier' });
    }
  }
  return offenders;
}

// #773 — VC-citation id-scheme exit guardrail. Once child A (#772) landed
// stable per-entry `<!-- id=N -->` ids and by-id `vc:N` resolution, new work
// must bind its Acceptance-Criteria markers through the id-citation form
// (`<!-- aitm-verified vc-list="vc:1 vc:2" -->`) rather than the three legacy
// forms that predate it. This finder walks the `## Acceptance Criteria` section
// and flags each AC marker that uses a forbidden legacy verification form, so
// `gateRefineToPlan` can refuse the Refine→Plan promotion until it is healed
// (child C, #774, does the bulk heal). Scope is STRICTLY the AC section — the
// seeded `## Definition of Done` Functional block still carries `cmd=` markers
// and is intentionally left untouched by this release.
//
// Three rejection reasons, each a distinct `reason` string:
//   - `backtick-embedded-cmd` — the marker declares `cmd="`…`"` with a literal
//     backtick-wrapped command instead of a `vc:N` citation.
//   - `ordinal-cmd-citation` — the marker cites via the deprecated `cmd`
//     attribute (`cmd="vc:N"`); citations must move to the `vc-list` attribute
//     so a reader never has to disambiguate intent from record-of-run.
//   - `dangling-vc-list` — the marker cites via `vc-list` but names a `vc:N`
//     with no matching live VC id (`resolveVcRefCommands` throws RangeError).
//
// A marker that cites existing ids via `vc-list` passes; an *uncited* (orphan)
// VC entry never blocks — only that every citation resolves. Markers with no
// recognized proof marker (plain box, or the retired `aitm-verified-by:`
// declaration form `parseProofMarker` does not recognize) are skipped: the
// #523 demonstrable-AC gate owns "no verifier at all", not this guardrail.
//
// Returns `{ lineIndex, label, reason }` per offending AC, in body order.
export function findAcsWithLegacyVerificationForm(body) {
  const src = String(body || '');
  const heading = src.match(AC_HEADING_RE);
  if (!heading) return [];
  const start = heading.index + heading[0].length;
  const rest = src.slice(start);
  const endMatch = rest.match(AC_SECTION_END_RE);
  const endIdx = endMatch ? start + endMatch.index : src.length;

  const vcItems = parseVerificationCommands(src);
  const lines = src.split('\n');
  const startLine = src.slice(0, start).split('\n').length - 1;
  const endLine = src.slice(0, endIdx).split('\n').length;

  const offenders = [];
  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(AC_BOX_RE);
    if (!box) continue;
    const labelRaw = box[4];
    if (NON_DEMONSTRABLE_TAG_RE.test(labelRaw)) continue; // honest opt-out
    if (isAcWaived(labelRaw)) continue; // no-commit lane waiver

    const props = parseProofMarker(labelRaw);
    if (!props) continue; // no recognized marker — #523 owns "no verifier"

    const label = String(labelRaw)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Correct form: citation via the `vc-list` attribute. It passes only when
    // every cited id resolves against a live VC entry; a dangling citation is
    // rejected here rather than swallowed.
    if (typeof props['vc-list'] === 'string') {
      // #804 — a present-but-empty (or otherwise non-citation) `vc-list` is a
      // silent-false-green vector: it resolves to zero commands without failing.
      // Reject it here so a verified AC can never be authored with an empty
      // verifier citation.
      if (parseVcRefIndexes(props['vc-list']) === null) {
        offenders.push({ lineIndex: i, label, reason: 'empty-vc-list' });
        continue;
      }
      try {
        resolveVcRefCommands(props['vc-list'], vcItems);
      } catch {
        offenders.push({ lineIndex: i, label, reason: 'dangling-vc-list' });
      }
      continue;
    }

    // Legacy `cmd` attribute on an AC is forbidden for new promotions. A `cmd`
    // whose value parses as a pure `vc:N` run is the interim ordinal citation;
    // anything else (a backtick-wrapped literal command, or a bare embedded
    // command) is the pre-citation embedded form.
    if (typeof props.cmd === 'string') {
      const reason =
        parseVcRefIndexes(props.cmd) !== null ? 'ordinal-cmd-citation' : 'backtick-embedded-cmd';
      offenders.push({ lineIndex: i, label, reason });
      continue;
    }

    // #804 — a recognized `aitm-verified` marker carrying neither a `vc-list`
    // nor a `cmd` attribute declares a verifier with no citation at all: another
    // zero-command silent green. Reject it so every verified AC names a verifier.
    offenders.push({ lineIndex: i, label, reason: 'missing-vc-list' });
  }
  return offenders;
}

// #725 — generic unbounded-deletion guardrail. The marker-loss check above
// only guards the fixed `aitm-*` marker allowlist; it is blind to arbitrary
// heading/prose loss. This is what let the #718/#724 boundary-regex bug in
// `replaceDeepDiveSection` silently delete five unrelated `## ` sections
// (Acceptance Criteria, What I want, …) whose bytes carried no tracked marker.
//
// `findUnexpectedSectionLoss(base, next, opts)` fires on either signal:
//   1. any pre-existing level-2 (`## `) heading present in `base` but absent
//      from `next` AND not declared in `opts.expectedRemovedHeadings`; or
//   2. `next` shorter than `base` by more than `opts.shrinkThreshold` (default
//      0.4 → 40% byte drop) without `opts.allowLargeShrink`.
// Returns `{ removedHeadings, shrinkRatio }` when it fires, else `null`.
//
// `expectedRemovedHeadings` entries are matched on heading TITLE (leading
// `#`/whitespace stripped), so callers may pass either `## Foo` or `Foo`.
const LEVEL2_HEADING_RE = /^##[ \t]+(\S.*?)\s*$/gm;
const DEFAULT_SHRINK_THRESHOLD = 0.4;

function normalizeHeadingTitle(h) {
  return String(h || '')
    .replace(/^#+/, '')
    .trim();
}

export function collectLevel2Headings(body = '') {
  const src = String(body || '');
  const titles = [];
  LEVEL2_HEADING_RE.lastIndex = 0;
  let m;
  while ((m = LEVEL2_HEADING_RE.exec(src))) {
    titles.push(m[1].trim());
  }
  return titles;
}

export function findUnexpectedSectionLoss(base, next, opts = {}) {
  const baseSrc = String(base || '');
  const nextSrc = String(next || '');
  const {
    expectedRemovedHeadings = [],
    allowLargeShrink = false,
    shrinkThreshold = DEFAULT_SHRINK_THRESHOLD,
  } = opts;

  const allowed = new Set(
    (Array.isArray(expectedRemovedHeadings) ? expectedRemovedHeadings : []).map(
      normalizeHeadingTitle
    )
  );
  const nextHeadings = new Set(collectLevel2Headings(nextSrc).map((t) => t.trim()));
  const removedHeadings = [];
  for (const title of collectLevel2Headings(baseSrc)) {
    const t = title.trim();
    if (nextHeadings.has(t)) continue;
    if (allowed.has(normalizeHeadingTitle(t))) continue;
    removedHeadings.push(t);
  }

  let shrinkRatio = 0;
  if (baseSrc.length > 0) {
    shrinkRatio = (baseSrc.length - nextSrc.length) / baseSrc.length;
  }
  const shrinkExceeded = !allowLargeShrink && shrinkRatio > shrinkThreshold;

  if (removedHeadings.length === 0 && !shrinkExceeded) return null;
  return {
    removedHeadings,
    shrinkRatio,
    shrinkExceeded,
  };
}

export class UnexpectedSectionLossError extends Error {
  constructor(issueNumber, loss = {}) {
    const removed = Array.isArray(loss.removedHeadings) ? loss.removedHeadings : [];
    const pct = Math.round((loss.shrinkRatio || 0) * 100);
    const parts = [];
    if (removed.length > 0) {
      parts.push(
        `removed ${removed.length} pre-existing section heading(s): ${removed.join(', ')}`
      );
    }
    if (loss.shrinkExceeded) {
      parts.push(`body shrank ${pct}% (exceeds the allowed threshold)`);
    }
    const msg =
      `mutateIssueBody on #${issueNumber}: refusing unbounded silent deletion — ${parts.join('; ')}.\n` +
      `  If this removal is intentional, declare each removed heading via \`expectedRemovedHeadings: [...]\`` +
      ` and/or pass \`allowLargeShrink: true\`. Otherwise a boundary-scan bug is silently erasing content (cf. #718/#724).`;
    super(msg);
    this.name = 'UnexpectedSectionLossError';
    this.issueNumber = issueNumber;
    this.removedHeadings = removed.slice();
    this.shrinkRatio = loss.shrinkRatio || 0;
    this.shrinkExceeded = Boolean(loss.shrinkExceeded);
  }
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
