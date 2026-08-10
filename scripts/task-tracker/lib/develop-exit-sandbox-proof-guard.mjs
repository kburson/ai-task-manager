// Develop-exit guard: sandbox-proof marker required (#270).
//
// Replaces the "provisional move then roll back on red" pattern in
// `verbs/test.mjs`. The verb now runs the sandbox BEFORE calling
// `moveState('test')`. On green it stamps `aitm-dod-verified`; this guard
// then checks for that marker at develop → test inside `runGuards`, so the
// state-mutator only accepts the transition once sandbox evidence is on
// the body. On red the verb posts a comment and exits without ever calling
// `moveState`, leaving the board on Develop.
//
// Mirrors the shape of `testExitDodVerifiedGuard` (#267).
//
// Context contract:
//   { issueNumber: number, body: string, toState?: 'test' }
//
// Scope: only fires for develop → test. Fail-open when ctx.body is missing
// (other guards / verb-layer surface the absence).

import { hasDodVerifiedMarker } from './markers.mjs';
import { auditEvidenceBranchReachability } from './evidence-branch-reachability.mjs';
import { hasAcceptedTestEvidence } from './github-records/lifecycle-gate-source.mjs';

export const GUARD_ID = 'develop-exit-sandbox-proof';

export const developExitSandboxProofGuard = {
  id: GUARD_ID,
  run(ctx) {
    if (ctx?.toState && ctx.toState !== 'test') return { ok: true };
    if (typeof ctx?.body !== 'string') return { ok: true };
    if (hasAcceptedTestEvidence(ctx.lifecycleEvidence)) return { ok: true };
    if (typeof ctx.projectDir === 'string') {
      const auditFn = ctx.deps?.evidenceBranchReachability || auditEvidenceBranchReachability;
      return Promise.resolve(
        auditFn({ body: ctx.body, issueNumber: ctx.issueNumber, projectDir: ctx.projectDir })
      ).then((reachability) => {
        if (!reachability.ok) {
          return {
            ok: false,
            reason: reachability.reasons.join('; '),
            blockers: reachability.reasons,
          };
        }
        return runPresenceGate(ctx);
      });
    }
    return runPresenceGate(ctx);
  },
};

function runPresenceGate(ctx) {
  if (hasDodVerifiedMarker(ctx.body)) return { ok: true };
  const n = String(ctx.issueNumber ?? '').replace(/^#/, '');
  const blocker =
    'develop-to-test-sandbox-proof-missing: `aitm-dod-verified` marker absent — run `/task test #' +
    n +
    '` so the sandbox stamps proof before the board moves to Test.';
  return { ok: false, reason: blocker, blockers: [blocker] };
}
