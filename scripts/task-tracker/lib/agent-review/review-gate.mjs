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
export function buildReviewContext({ body = '', issueNumber, repo, comments = [] } = {}) {
  const src = typeof body === 'string' ? body : '';
  const lastKnown = readLastKnownState(src);
  return {
    body: src,
    issueNumber,
    repo,
    comments: Array.isArray(comments) ? comments : [],
    markers: {
      enteredStages: parseEnteredStages(src),
      lastKnownState: lastKnown.state,
      lastKnownStateTs: lastKnown.ts,
    },
  };
}

// Run the Agent Review Gate. Returns { pass, failures, normalizedBody, context }.
// `normalizedBody` is set only when a normalizer rewrote the body; the caller
// persists it before deciding pass/fail so the normalization is not lost.
export function runAgentReviewGate({
  body = '',
  issueNumber,
  repo,
  comments = [],
  registry = defaultRegistry,
} = {}) {
  const context = buildReviewContext({ body, issueNumber, repo, comments });
  const { pass, failures, normalizedBody } = registry.runAll(context);
  return { pass, failures, normalizedBody, context };
}

// --- aitm-review-failed body marker -----------------------------------------
//
// On a failing gate the verb stamps this marker listing the failing validators
// so the demoted-to-Develop issue carries an in-body record of what to fix. It
// is NOT an invariant marker (MarkerLossError does not guard it), so stamping
// and clearing it through the sanctioned mutate path is safe.

export const REVIEW_FAILED_START = '<!-- aitm-review-failed:start -->';
export const REVIEW_FAILED_END = '<!-- aitm-review-failed:end -->';
const REVIEW_FAILED_BLOCK_RE =
  /\n?<!-- aitm-review-failed:start -->[\s\S]*?<!-- aitm-review-failed:end -->\n?/;

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
  return src.replace(REVIEW_FAILED_BLOCK_RE, '\n');
}

export function hasReviewFailed(body) {
  return REVIEW_FAILED_BLOCK_RE.test(typeof body === 'string' ? body : '');
}
