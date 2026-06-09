// Child-cannot-lead-epic exit guard (#162, parent epic #269 / story #356).
//
// Migrated out of the inline block at `scripts/task-tracker/verbs/promote.mjs`
// L324-360 into the state-keyed registry. Registered as an `exitGuards` entry
// on every forward state (`backlog`, `refine`, `plan`, `develop`, `test`,
// `review`) so `runGuards(fromState, toState, ctx)` fires it on every forward
// transition.
//
// Wraps `fetchParentIssue` + `checkParentAdmission`. Solo issues (no parent)
// bypass — fetch failure or null parent resolves to `{ ok: true }`. When the
// child would lead its parent epic, the guard refuses with the same blocker
// messages the inline block returned, surfaced via the verb-level
// `parent-admission-refused` status in `REFUSAL_ID_TO_STATUS`.
//
// `checkParentAdmission` throw is rethrown so the verb layer's existing
// `parent-admission-error` short-circuit (caught at the verb boundary) keeps
// its semantics. Today the verb path classifies the throw at L347; routing
// through the registry preserves the same error message.
//
// Context contract:
//   { issueNumber: number, cfg: { repo, projectId }, toState: string,
//     deps?: { fetchParentIssue?, readParentStatus? } }
// Fail-open when ctx missing cfg/issueNumber.

import { checkParentAdmission } from './body-gates.mjs';
import { fetchParentIssue as defaultFetchParentIssue } from './fetch-parent-issue.mjs';
import { readParentStatus as defaultReadParentStatus } from '../../gh/lib/parent-status.mjs';

export const GUARD_ID = 'child-cannot-lead-epic-exit';

export const childCannotLeadEpicExitGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (!ctx || !ctx.cfg || ctx.issueNumber == null || !ctx.toState) {
      return { ok: true };
    }
    const fetchParentIssue = ctx.deps?.fetchParentIssue || defaultFetchParentIssue;
    const readParentStatus = ctx.deps?.readParentStatus || defaultReadParentStatus;
    let parentEpicNumber = null;
    try {
      parentEpicNumber = await fetchParentIssue({
        issueNumber: ctx.issueNumber,
        repo: ctx.cfg.repo,
      });
    } catch {
      parentEpicNumber = null;
    }
    if (parentEpicNumber == null) return { ok: true };
    const blockers = await checkParentAdmission({
      parentEpicNumber,
      repo: ctx.cfg.repo,
      projectId: ctx.cfg.projectId,
      readParentStatus,
      targetState: ctx.toState,
    });
    if (Array.isArray(blockers) && blockers.length > 0) {
      return {
        ok: false,
        reason: `child-cannot-lead-epic: parent #${parentEpicNumber} not admitted to ${ctx.toState}`,
        blockers: blockers.map((b) => b.message),
      };
    }
    return { ok: true };
  },
};
