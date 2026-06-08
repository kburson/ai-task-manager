// Backlog-exit guard: child sub-issues may not enter refine while their parent
// epic sits outside the active planning window (#338, parent epic #259).
//
// Mirrors the parent-side `planEpicChildrenGuard` from #277 but from the child's
// perspective: a sub-issue moving backlog → refine is refused when its parent's
// live board Status is anything other than `refine` or `plan`.
//
// Wave-model invariant: children should join the active planning wave while the
// parent is itself being planned. Letting a child enter refine while the parent
// is still in backlog (or has already moved past plan to develop/test/review/
// done) breaks that wave alignment.
//
// Context contract:
//   { cfg: Config, issueNumber: number,
//     fromState?: string, toState?: string,
//     deps?: { fetchParentIssue?, readParentStatus? } }
//
// Short-circuit cases (return `{ok: true}` without consulting the API):
//   - ctx.fromState is present and not 'backlog'
//   - ctx.toState is present and not 'refine'
//   - ctx or ctx.cfg or ctx.issueNumber missing (fail-open per planEpicChildren-
//     Guard convention — refusal here would mask the real blocker)
//
// Fail-open data cases (return `{ok: true}`):
//   - issue has no parent (leaf / top-level epic)
//   - readParentStatus returns null (parent not on the configured board, or a
//     transient GraphQL failure inside the reader)
//
// Refuses when the parent state is one of {backlog, develop, test, review, done}.

import { fetchParentIssue as defaultFetchParentIssue } from './fetch-parent-issue.mjs';
import { readParentStatus as defaultReadParentStatus } from '../../gh/lib/parent-status.mjs';

export const GUARD_ID = 'backlog-exit-child-parent-refine-or-plan';

const ALLOWED_PARENT_STATES = new Set(['refine', 'plan']);

export const backlogExitChildParentStateGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.fromState && ctx.fromState !== 'backlog') return { ok: true };
    if (ctx?.toState && ctx.toState !== 'refine') return { ok: true };
    if (!ctx || !ctx.cfg || !ctx.issueNumber) return { ok: true };

    const fetchParent = ctx.deps?.fetchParentIssue || defaultFetchParentIssue;
    const readStatus = ctx.deps?.readParentStatus || defaultReadParentStatus;

    let parentNumber;
    try {
      parentNumber = await fetchParent({ issueNumber: ctx.issueNumber, repo: ctx.cfg.repo });
    } catch {
      return { ok: true };
    }
    if (parentNumber == null) return { ok: true };

    let parentState;
    try {
      parentState = await readStatus({
        parentEpicNumber: parentNumber,
        repo: ctx.cfg.repo,
        projectId: ctx.cfg.projectId,
      });
    } catch {
      return { ok: true };
    }
    if (parentState == null) return { ok: true };

    const slug = String(parentState).toLowerCase();
    if (ALLOWED_PARENT_STATES.has(slug)) return { ok: true };

    const reason = `parent #${parentNumber} is in ${slug}; child cannot enter refine until parent reaches refine or plan`;
    return { ok: false, reason, blockers: [reason] };
  },
};
