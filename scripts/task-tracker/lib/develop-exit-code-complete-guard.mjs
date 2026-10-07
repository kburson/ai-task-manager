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

import { gateCodeComplete, readCodeCompleteReadData } from './code-complete-gate.mjs';
import { auditEvidenceBranchReachability, readEvidenceBranchReadData } from './evidence-branch-reachability.mjs';
import { hasAcceptedTestEvidence } from './github-records/lifecycle-gate-source.mjs';
import { NON_DEMONSTRABLE_TAG_RE } from './body-invariants.mjs';

export const GUARD_ID = 'develop-exit-code-complete';
const nativeReadData = new WeakMap();

function codeCompleteRefusal(blocker) {
  const match = /^code-complete-ac-(unticked|unverified): (.+)$/.exec(blocker);
  if (!match) return { reason: blocker };
  const nonDemonstrable = NON_DEMONSTRABLE_TAG_RE.test(match[2]);
  const label = match[2].replace(/<!--\s*aitm-non-demonstrable\s*-->/gi, '').trim();
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
    let nativeAudit = false;
    let ancestry = null;
    if (typeof ctx.projectDir === 'string') {
      const auditFn = ctx.deps?.evidenceBranchReachability || auditEvidenceBranchReachability;
      nativeAudit = auditFn === auditEvidenceBranchReachability;
      const reachability = await auditFn({
        body: ctx.body,
        issueNumber: ctx.issueNumber,
        projectDir: ctx.projectDir,
      });
      if (nativeAudit) ancestry = readEvidenceBranchReadData(reachability);
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
    const finish = out => {
      const data = nativeAudit && gateFn === gateCodeComplete ? readCodeCompleteReadData(result) : null;
      if (data && ancestry) nativeReadData.set(out, Object.freeze({ ...data, ancestry }));
      return out;
    };
    if (result.ok) return finish({ ok: true });
    return finish({
      ok: false,
      reason: (result.blockers || []).join('; ') || 'code-complete-refused',
      blockers: result.blockers || [],
      refusals: (result.blockers?.length ? result.blockers : ['code-complete-refused']).map(
        codeCompleteRefusal
      ),
    });
  },
};

const originalRun = developExitCodeCompleteGuard.run;
// Result data only; invocation references are compared, never called or returned.
export function readDevelopCodeCompleteReadData(result, invocation) {
  try {
    if (!invocation || Object.keys(invocation).sort().join(',') !== 'guard,id,run' ||
        invocation.guard !== developExitCodeCompleteGuard || invocation.run !== originalRun ||
        invocation.id !== GUARD_ID) return null;
    return result && typeof result === 'object' ? nativeReadData.get(result) ?? null : null;
  } catch { return null; }
}
