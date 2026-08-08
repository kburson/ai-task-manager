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
import { hasAcceptedTestEvidence } from './github-records/lifecycle-gate-source.mjs';

export const GUARD_ID = 'develop-exit-code-complete';

export const developExitCodeCompleteGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'test') return { ok: true };
    if (!ctx || !ctx.cfg || ctx.issueNumber == null) return { ok: true };
    if (typeof ctx.body !== 'string') return { ok: true };
    if (hasAcceptedTestEvidence(ctx.lifecycleEvidence)) return { ok: true };
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
    };
  },
};
