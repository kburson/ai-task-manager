// Ready-for-Planning-exit guard: child sub-issues may not enter plan while their parent
// epic has not yet reached develop (#339, parent epic #259).
//
// Mirror of #338's backlog-exit rule, one stage later: a sub-issue moving
// ready-for-plan → plan is refused when its parent's board Status is `backlog`,
// `refine`, `ready-for-plan`, or `plan`. The parent must have finished its own plan stage and
// begun develop before any child enters plan.
//
// Wave-model invariant: children must not lead the parent. The parent's
// `planEpicChildrenGuard` (#277) blocks the epic from advancing past plan
// until children are refined; this is the converse — children can't pass
// refine while the parent itself hasn't reached develop.
//
// Context contract:
//   { cfg: Config, issueNumber: number,
//     fromState?: string, toState?: string,
//     deps?: { fetchParentIssue?, readParentStatus? } }
//
// Short-circuit cases (return `{ok: true}` without consulting the API):
//   - ctx.fromState present and not 'ready-for-plan'
//   - ctx.toState present and not 'plan'
//   - ctx, ctx.cfg, or ctx.issueNumber missing
//
// Fail-open data cases (return `{ok: true}`):
//   - issue has no parent (leaf / top-level epic) — fetchParentIssue *returns* null
//   - readParentStatus *returns* null (parent not on board)
//
// Fail-closed cases (#565 — return `{ok: false, reason: 'parent state unverifiable'}`):
//   - fetchParentIssue *throws* / readParentStatus *throws* (transient gh/GraphQL
//     failure). A throw leaves the parent's true state unknown; per
//     docs/guides/fail-open-policy.md transition preconditions are fail-closed.

import { fetchParentIssue as defaultFetchParentIssue } from './fetch-parent-issue.mjs';
import { readParentStatus as defaultReadParentStatus } from '../../gh/lib/parent-status.mjs';
import { normalizeStateId } from './lifecycle-policy/index.mjs';

export const GUARD_ID = 'refine-exit-child-parent-developing-or-beyond';

const ALLOWED_PARENT_STATES = new Set(['develop', 'test', 'review', 'done']);

export const refineExitChildParentStateGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.fromState && ctx.fromState !== 'ready-for-plan') return { ok: true };
    if (ctx?.toState && ctx.toState !== 'plan') return { ok: true };
    if (!ctx || !ctx.cfg || !ctx.issueNumber) return { ok: true };

    const fetchParent = ctx.deps?.fetchParentIssue || defaultFetchParentIssue;
    const readStatus = ctx.deps?.readParentStatus || defaultReadParentStatus;

    const UNVERIFIABLE = 'parent state unverifiable';

    let parentNumber;
    try {
      parentNumber = await fetchParent({ issueNumber: ctx.issueNumber, repo: ctx.cfg.repo });
    } catch {
      // fail-closed: parent state unverifiable (docs/guides/fail-open-policy.md)
      return { ok: false, reason: UNVERIFIABLE, blockers: [UNVERIFIABLE] };
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
      // fail-closed: parent state unverifiable (docs/guides/fail-open-policy.md)
      return { ok: false, reason: UNVERIFIABLE, blockers: [UNVERIFIABLE] };
    }
    if (parentState == null) return { ok: true };

    const slug = normalizeStateId(parentState);
    if (ALLOWED_PARENT_STATES.has(slug)) return { ok: true };

    const reason = `parent #${parentNumber} is in ${slug}; child cannot leave refine until parent reaches develop`;
    return { ok: false, reason, blockers: [reason] };
  },
};
