// Develop-exit guard: CODE_COMPLETE gate (#336, #136, #278).
//
// Wraps `gateCodeComplete` so the develop→test transition refuses when
// functional ACs are unticked/unverified, `aitm-commits` is empty, or any
// touched file is dirty. Reached via `runGuards('develop', 'test', ctx)`
// at scripts/gh/move-state.mjs:394.
//
// Context contract:
//   { cfg: Config, issueNumber: number, body: string,
//     deps?: { codeComplete?: GhDeps } }
//
// Scope: only fires for develop → test. Fail-open when ctx missing
// cfg/issueNumber/body.

import { gateCodeComplete } from './code-complete-gate.mjs';
import { auditEvidenceBranchReachability } from './evidence-branch-reachability.mjs';
import { hasAcceptedTestEvidence } from './github-records/lifecycle-gate-source.mjs';

export const GUARD_ID = 'develop-exit-code-complete';

function codeCompleteRefusal(blocker) {
  const match = /^code-complete-ac-(unticked|unverified): (.+)$/.exec(blocker);
  if (!match) return { reason: blocker };
  const nonDemonstrable = /<!--\s*aitm-non-demonstrable\s*-->/.test(match[2]);
  const label = match[2].replace(/<!--\s*aitm-non-demonstrable\s*-->/g, '').trim();
  const condition = nonDemonstrable ? 'unticked-non-demonstrable' : match[1];
  const nextAction = nonDemonstrable
    ? 'In Develop, run npx aitm ensureChecked --allow-unverified-ticks --label "<AC label>".'
    : condition === 'unverified'
      ? 'Add a targeted verifier declaration to this AC with npx aitm issue-body; then in Develop run npx aitm ac-stamp "<AC label>".'
      : 'In Develop, add a targeted verifier declaration with npx aitm issue-body if one is missing; then run npx aitm ac-stamp "<AC label>" and npx aitm ensureChecked "<AC label>".';
  return {
    code: 'code-complete-ac-evidence-incomplete',
    args: {
      label,
      condition,
      section: 'Acceptance Criteria',
      nextAction,
    },
    noAutomaticRemediation: { reason: 'operator-action-required' },
  };
}

export const developExitCodeCompleteGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'test') return { ok: true };
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) return { ok: true };
    if (typeof ctx.body !== 'string') return { ok: true };
    if (hasAcceptedTestEvidence(ctx.lifecycleEvidence)) return { ok: true };
    if (typeof ctx.projectDir === 'string') {
      const auditFn = ctx.deps?.evidenceBranchReachability || auditEvidenceBranchReachability;
      const reachability = await auditFn({
        body: ctx.body,
        issueNumber: ctx.issueNumber,
        projectDir: ctx.projectDir,
      });
      if (!reachability.ok) {
        return {
          ok: false,
          reason: reachability.reasons.join('; '),
          blockers: reachability.reasons,
        };
      }
    }
    const gateFn = ctx.deps?.codeCompleteGate || gateCodeComplete;
    const result = await gateFn({
      cfg: ctx.cfg,
      issueNumber: ctx.issueNumber,
      body: ctx.body,
      deps: ctx.deps?.codeComplete,
    });
    if (result.ok) return { ok: true };
    return {
      ok: false,
      reason: (result.blockers || []).join('; ') || 'code-complete-refused',
      blockers: result.blockers || [],
      refusals: (result.blockers?.length ? result.blockers : ['code-complete-refused']).map(
        codeCompleteRefusal
      ),
    };
  },
};
