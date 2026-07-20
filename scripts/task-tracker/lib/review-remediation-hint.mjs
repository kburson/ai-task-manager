// #935 — bind-time review-remediation diagnostic.
//
// When an agent binds to an issue whose recorded state is `review` but whose body
// carries no Agent-Review pass-evidence marker, the correct move is to re-run the
// Agent Review gate IN PLACE (`/task review` — a satisfied no-op re-run is
// explicitly supported, review.mjs) rather than demoting back to Develop and
// re-driving the whole Develop→Test→Review chain. This module computes that
// diagnostic so every bind path can surface it and the agent never has to invent
// a remediation plan.
//
// Detection reuses the proven completeness primitives from the review gate
// (`isAgentReviewComplete` / `agentReviewIncompleteReason`), which key on the
// pass-evidence marker (`gate="agent-review" … result="pass"`), NOT the bare
// checkbox — so a hand-ticked box still reads as incomplete and the hint fires.

import { isAgentReviewComplete, agentReviewIncompleteReason } from './agent-review/review-gate.mjs';

// True only when the issue is parked in `review` AND the Agent Review action is
// not yet complete. Every other state (or a complete review) returns false.
export function reviewNeedsAgentReview({ state, body } = {}) {
  if (state !== 'review') return false;
  return !isAgentReviewComplete(body);
}

// The operator-facing diagnostic. Names the exact in-place remediation and
// explicitly warns against demoting. `reason` distinguishes the two incomplete
// cases so the message tells the agent which one it is in:
//   - `not-run`       → the gate was never run; re-run it.
//   - `review-failed` → the last run objected; fix the listed failures, re-run.
export function formatReviewRemediationHint(issueNumber, body) {
  const reason = agentReviewIncompleteReason(body);
  const num = String(issueNumber).replace(/^#/, '');
  const cause =
    reason === 'review-failed'
      ? 'the last Agent Review run OBJECTED (an `aitm-review-failed` block is present)'
      : 'the Agent Review gate has NOT been run (no pass-evidence marker)';
  return (
    `\n⚠️  #${num} is in Review but ${cause}.\n` +
    `   Re-run the Agent Review gate IN PLACE:  /task review #${num}\n` +
    `   (re-invoking \`/task review\` re-executes the Review-stage validation and stamps\n` +
    `   "Agent Review Passed" — a satisfied re-run is a supported no-op.)\n` +
    `   Do NOT demote to Develop to "re-trigger" validation — demote is for committing\n` +
    `   code changes only, and re-driving the whole chain wastes time and context.\n`
  );
}

// Convenience: the hint string when it applies, else null. Callers that already
// hold `{ state, body }` can attach this to a bind result and print when present.
export function reviewRemediationHint({ state, body, issueNumber } = {}) {
  if (!reviewNeedsAgentReview({ state, body })) return null;
  return formatReviewRemediationHint(issueNumber, body);
}
