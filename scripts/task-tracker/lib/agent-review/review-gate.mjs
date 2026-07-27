// Agent Review Gate — orchestrator (#809).
//
// `runAgentReviewGate` assembles the review context (issue body + comments +
// parsed board markers), runs the validator registry, and returns the
// aggregate. The `/task review` verb calls it inline just before the move to
// Review and branches on the result: pass ticks the "Agent Review Passed" DoD
// item and continues the normal review-approval flow; fail writes a
// `review:failed` timing row + an `aitm-review-failed` body marker and demotes
// to Develop.
//
// The orchestrator depends only on the registry's `runAll` return shape and
// the parsed-context helpers below — it knows nothing about individual
// validators, so V1–V6 land independently against the frozen interface.

import { registry as defaultRegistry } from './registry.mjs';
import { readLastKnownState } from '../../gh-timing-comment.mjs';
import { tickLifecycleItem } from '../lifecycle-dod.mjs';
import { serializeProofMarker } from '../proof-marker.mjs';

// Tolerant parser for `aitm-entered-<stage>` board markers. Both grammars
// appear in live bodies:
//   <!-- aitm-entered-develop ts="2026-05-30T08:00:00.000Z" -->
//   <!-- aitm-entered-develop: 2026-05-30T08:00:00Z -->
// Returns [{ stage, ts }] in body order.
const ENTERED_RE = /<!--\s*aitm-entered-([a-z-]+)(?:\s+ts="([^"]*)"|:\s*([^\s>]+))\s*-->/gi;

export function parseEnteredStages(body) {
  const src = typeof body === 'string' ? body : '';
  const out = [];
  for (const m of src.matchAll(ENTERED_RE)) {
    out.push({ stage: m[1].toLowerCase(), ts: (m[2] ?? m[3] ?? '').trim() });
  }
  return out;
}

// Build the context object passed to every validator. Kept deliberately flat:
// validators read what they need and ignore the rest.
//
// `changedPaths` (#940) is the `trunk...HEAD` changed-path set the `/task review`
// verb computes; the required-comments (V2) validator consults it to make the
// "New Automated Tests" requirement diff-aware for `docs-only` issues. It is
// normalized to an array; a missing value becomes `[]`, which is default-deny at
// every consumer (an unknown diff keeps the NAT requirement).
export function buildReviewContext({
  body = '',
  issueNumber,
  repo,
  comments = [],
  changedPaths = [],
} = {}) {
  const src = typeof body === 'string' ? body : '';
  const lastKnown = readLastKnownState(src);
  return {
    body: src,
    issueNumber,
    repo,
    comments: Array.isArray(comments) ? comments : [],
    changedPaths: Array.isArray(changedPaths) ? changedPaths : [],
    markers: {
      enteredStages: parseEnteredStages(src),
      lastKnownState: lastKnown.state,
      lastKnownStateTs: lastKnown.ts,
    },
  };
}

// Run the Agent Review Gate. Returns
// { pass, failures, validatorsRun, normalizedBody, context }.
// `normalizedBody` is set only when a normalizer rewrote the body; the caller
// persists it before deciding pass/fail so the normalization is not lost.
// `validatorsRun` lists the ids of every validator that executed (#841); the
// review verb stamps it onto the "Agent Review Passed" evidence marker so the
// proven box records what actually ran.
export function runAgentReviewGate({
  body = '',
  issueNumber,
  repo,
  comments = [],
  changedPaths = [],
  registry = defaultRegistry,
} = {}) {
  const context = buildReviewContext({ body, issueNumber, repo, comments, changedPaths });
  const { pass, failures, validatorsRun, normalizedBody } = registry.runAll(context);
  return { pass, failures, validatorsRun: validatorsRun || [], normalizedBody, context };
}

// --- proven "Agent Review Passed" box (#841) ---------------------------------
//
// On a passing gate the review verb ticks "Agent Review Passed" AND stamps the
// gate's OWN run-evidence onto the box — a real `aitm-verified` execution-proof
// marker, never a bare `[x]`. Because the gate runs in-process (not anchored to
// a commit) the `sha` is the `sandbox` sentinel; `ts` is the review runtime and
// `validators` lists exactly which validators executed. The box now CARRIES
// proof, so the verb writes it with `evidenceStamp: true` (a sanctioned stamper
// — honest because the gate genuinely ran) and WITHOUT the `allowUnverifiedTicks`
// bypass. This replaces the fake `agent-review-validator-suite` VC scheme.

// Build the run-evidence marker. `ts` must be a real ISO timestamp (caller
// passes review-runtime `nowIso()`); `validators` is the executed-id list.
export function buildAgentReviewEvidenceMarker({ ts, validators = [] } = {}) {
  return serializeProofMarker({
    gate: 'agent-review',
    ts: ts || '',
    sha: 'sandbox',
    validators: (Array.isArray(validators) ? validators : []).join(','),
    result: 'pass',
  });
}

// Tick "Agent Review Passed" and append the fresh run-evidence marker to that
// box, replacing any prior agent-review marker on the line (idempotent). Other
// lines are untouched. Returns the rewritten body; when the box is absent the
// body comes back with only the tick applied (a no-op if it too is absent).
export function stampAgentReviewPassed(body, { ts, validators = [] } = {}) {
  const ticked = tickLifecycleItem(typeof body === 'string' ? body : '', 'agent-review-passed');
  const marker = buildAgentReviewEvidenceMarker({ ts, validators });
  const lines = ticked.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/^- \[[ xX]\] /.test(line)) continue;
    const label = line
      .replace(/^- \[[ xX]\]\s+/, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
    if (label !== 'Agent Review Passed') continue;
    const stripped = line.replace(
      /\s*<!--\s*aitm-verified\s+[^>]*gate="agent-review"[^>]*-->/g,
      ''
    );
    lines[i] = `${stripped.replace(/\s+$/, '')} ${marker}`;
    break;
  }
  return lines.join('\n');
}

// --- aitm-review-failed body marker -----------------------------------------
//
// On a failing gate the verb stamps this marker listing the failing validators
// so the demoted-to-Develop issue carries an in-body record of what to fix. It
// is NOT an invariant marker (MarkerLossError does not guard it), so stamping
// and clearing it through the sanctioned mutate path is safe.

export const REVIEW_FAILED_START = '<!-- aitm-review-failed:start -->';
export const REVIEW_FAILED_END = '<!-- aitm-review-failed:end -->';

// #1004 — line-anchored detection, mirroring v6-marker-organization.mjs's
// REVIEW_FAILED_START_RE/END_RE. A body-wide, non-greedy regex over the raw
// text (the prior implementation) collides with prose that merely quotes the
// delimiter syntax rather than carrying a real marker line; requiring each
// delimiter to occupy its own standalone line rules that out.
const REVIEW_FAILED_START_LINE_RE = /^\s*<!--\s*aitm-review-failed:start\s*-->\s*$/i;
const REVIEW_FAILED_END_LINE_RE = /^\s*<!--\s*aitm-review-failed:end\s*-->\s*$/i;

// Locate the [start, end] line-index span (inclusive) of a standalone
// review-failed block: a line that is exactly the start marker through the
// nearest following line that is exactly the end marker. Returns null when
// no standalone start line exists, or a start has no matching standalone end.
function findReviewFailedLineSpan(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!REVIEW_FAILED_START_LINE_RE.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (REVIEW_FAILED_END_LINE_RE.test(lines[j])) return { start: i, end: j };
    }
    return null;
  }
  return null;
}

// Build the marker block. `failures` is the aggregate failure list; each line
// is rendered verbatim so the fixer sees exactly which validator objected.
export function buildReviewFailedBlock(failures = [], { ts } = {}) {
  const lines = (Array.isArray(failures) ? failures : []).map((f) => `- ${String(f)}`).join('\n');
  const stamp = ts ? ` ts="${ts}"` : '';
  return (
    `${REVIEW_FAILED_START}\n` +
    `<!-- aitm-review-failed-meta${stamp} -->\n` +
    `**Agent Review Gate failed.** Fix the following, then re-run \`/task review\`:\n\n` +
    `${lines || '- (no detail reported)'}\n` +
    `${REVIEW_FAILED_END}`
  );
}

// Idempotently stamp the marker: strip any prior block, append the fresh one.
export function stampReviewFailed(body, failures = [], { ts } = {}) {
  const cleared = clearReviewFailed(body);
  const block = buildReviewFailedBlock(failures, { ts });
  const sep = cleared.endsWith('\n') ? '' : '\n';
  return `${cleared}${sep}\n${block}\n`;
}

// Remove the marker block. Idempotent — returns the body unchanged when absent.
export function clearReviewFailed(body) {
  const src = typeof body === 'string' ? body : '';
  const lines = src.split('\n');
  const span = findReviewFailedLineSpan(lines);
  if (!span) return src;
  lines.splice(span.start, span.end - span.start + 1, '');
  return lines.join('\n');
}

export function hasReviewFailed(body) {
  const src = typeof body === 'string' ? body : '';
  return findReviewFailedLineSpan(src.split('\n')) !== null;
}

// --- Review state-action completeness (#881) ---------------------------------
//
// The Agent Review Gate is the ACTION of the Review state; the human approval is
// the state's EXIT condition. `approve` must therefore refuse while the action is
// incomplete, so a human is never asked to sign off on a story the agent has not.
//
// Complete means BOTH: no `aitm-review-failed` block (the last run objected), and
// an "Agent Review Passed" box carrying this gate's own run evidence
// (`gate="agent-review" … result="pass"`). The evidence marker — not the tick — is
// the signal: `stampAgentReviewPassed` writes the marker and leaves the checkbox
// for the derived ticking pass, so keying on `[x]` would reject a genuine run.
// Keying on the marker is also what makes a hand-ticked box insufficient.
const AGENT_REVIEW_PASS_EVIDENCE_RE =
  /^- \[[ xX]\] .*<!--\s*aitm-verified\s+[^>]*gate="agent-review"[^>]*result="pass"[^>]*-->/m;

export function isAgentReviewComplete(body) {
  const src = typeof body === 'string' ? body : '';
  if (hasReviewFailed(src)) return false;
  return AGENT_REVIEW_PASS_EVIDENCE_RE.test(src);
}

// Which signal blocked completeness, for a message the operator can act on.
// Returns null when the action IS complete.
export function agentReviewIncompleteReason(body) {
  const src = typeof body === 'string' ? body : '';
  if (hasReviewFailed(src)) return 'review-failed';
  if (!AGENT_REVIEW_PASS_EVIDENCE_RE.test(src)) return 'not-run';
  return null;
}
