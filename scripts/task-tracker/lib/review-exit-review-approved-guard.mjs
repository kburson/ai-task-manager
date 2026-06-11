// Review-exit guard: `aitm-review-approved` marker presence (#279).
//
// Wraps the inline marker regex that used to live at
// `scripts/task-tracker/verbs/close.mjs:164`. The review→done transition
// refuses when the issue body lacks the `<!-- aitm-review-approved: ... -->`
// marker (stamped by `/task approve`).
//
// Context contract:
//   { body: string }
//
// Body-only (no network). Fail-open when ctx.body is undefined — other
// guards (or the move-state body-pull) will surface the real reason.
//
// Scope: only fires for review → done. Approve writes the marker; this
// guard reads it. Symmetric with `planApprovedGuard` for plan → develop.

export const GUARD_ID = 'review-exit-review-approved';

// Widened (#375) to accept both legacy colon and new `ts="..."` grammars.
const APPROVED_RE = /<!--\s*aitm-review-approved(?:\s*:|\s+ts=")/i;

export const reviewExitReviewApprovedGuard = {
  id: GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'done') return { ok: true };
    if (!ctx || typeof ctx.body !== 'string') return { ok: true };
    if (APPROVED_RE.test(ctx.body)) return { ok: true };
    return {
      ok: false,
      reason:
        'review-approval-missing: body must contain `<!-- aitm-review-approved: ... -->` — run `/task approve` to record human approval',
    };
  },
};
