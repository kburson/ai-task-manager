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
import { hasAcceptedTestEvidence } from './github-records/lifecycle-gate-source.mjs';
import { resolveDocsOnlyLaneSkipProof } from './docs-only-lane-skip-proof.mjs';

export const GUARD_ID = 'test-exit-pre-close-completeness';

export const testExitPreCloseCompletenessGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'review') return { ok: true };
    if (typeof ctx?.body !== 'string') return { ok: true };
    if (hasAcceptedTestEvidence(ctx.lifecycleEvidence)) return { ok: true };
    const resolveProof = ctx?.deps?.resolveDocsOnlyLaneSkipProof || resolveDocsOnlyLaneSkipProof;
    const docsOnlyLaneSkipProven = await resolveProof({
      body: ctx.body,
      issueNumber: ctx.issueNumber,
      projectDir: ctx.projectDir,
      deps: ctx?.deps?.docsOnlyLaneSkipProof,
    });
    const stillUnticked = uncheckedPreCloseCheckboxes(ctx.body, { docsOnlyLaneSkipProven });
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
