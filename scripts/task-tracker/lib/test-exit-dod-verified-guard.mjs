// Test-exit guard: dod-verified marker required (#267, #210 Fix C).
//
// Wraps `hasDodVerifiedMarker` so the test→review transition refuses when
// the body lacks `aitm-dod-verified`. Reached via `runGuards('test', 'review',
// ctx)` from both `verbs/promote.mjs` and `verbs/review.mjs`. Folds in the
// duplicated inline checks that previously lived in those two call-sites.
//
// Context contract:
//   { issueNumber: number, body: string, toState?: 'review' }
//
// Scope: only fires for test → review. Fail-open when ctx.body is missing
// (other guards / verb-layer surface the absence).

import { hasDodVerifiedMarker } from './markers.mjs';

export const GUARD_ID = 'test-exit-dod-verified';

export const testExitDodVerifiedGuard = {
  id: GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'review') return { ok: true };
    if (typeof ctx?.body !== 'string') return { ok: true };
    if (hasDodVerifiedMarker(ctx.body)) return { ok: true };
    const n = String(ctx.issueNumber ?? '').replace(/^#/, '');
    const blocker =
      'test-to-review-dod-missing: `aitm-dod-verified` marker absent — re-run `/task test #' +
      n +
      '` to produce sandbox evidence before promoting to Review.';
    return { ok: false, reason: blocker, blockers: [blocker] };
  },
};
