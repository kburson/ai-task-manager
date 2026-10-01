// @story #1859
import { evaluateReviewedScope } from './reviewed-scope/readiness.mjs';

export const GUARD_ID = 'test-exit-reviewed-scope';
export const testExitReviewedScopeGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'review') return { ok: true };
    const evaluated = await evaluateReviewedScope({
      body: ctx?.body,
      repository: ctx?.cfg?.repo ?? ctx?.repo ?? ctx?.repository,
      issue: ctx?.issueNumber,
      projectDir: ctx?.projectDir,
      invokingDir: ctx?.invokingDir,
      lifecycleEvidence: ctx?.lifecycleEvidence,
      deps: ctx?.deps?.reviewedScope,
    });
    if (evaluated.ok) return { ok: true };
    return {
      ok: false,
      reason: evaluated.blockers[0].reason,
      blockers: evaluated.blockers.map((x) => x.reason),
      refusals: evaluated.blockers.map(({ label, code, reason }) => ({
        code,
        args: { label, reason },
        noAutomaticRemediation: { reason: 'operator-reviewed-evidence-required' },
      })),
    };
  },
};
