// Test-exit guard: pre-close completeness gate (#267, #257).
//
// Wraps `uncheckedPreCloseCheckboxes` so the test→review transition refuses
// when any non-lifecycle, non-close-owned checkbox is still unticked. Reached
// via `runGuards('test', 'review', ctx)` from both `verbs/promote.mjs` and
// `verbs/review.mjs`. Folds in the duplicated inline checks that previously
// lived in those two call-sites (the #257 hole that motivated this guard).
//
// Context contract:
//   { issueNumber: number, body: string, toState?: 'review' }
//
// Scope: only fires for test → review. Fail-open when ctx.body is missing.

import { uncheckedPreCloseCheckboxes } from '../close-gate.mjs';

export const GUARD_ID = 'test-exit-pre-close-completeness';

export const testExitPreCloseCompletenessGuard = {
  id: GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'review') return { ok: true };
    if (typeof ctx?.body !== 'string') return { ok: true };
    const stillUnticked = uncheckedPreCloseCheckboxes(ctx.body);
    if (stillUnticked.length === 0) return { ok: true };
    const blockers = stillUnticked.map(
      (line) => `test-to-review-incomplete: ${line} (the close gate enforces the same set)`
    );
    return {
      ok: false,
      reason: blockers[0],
      blockers,
    };
  },
};
