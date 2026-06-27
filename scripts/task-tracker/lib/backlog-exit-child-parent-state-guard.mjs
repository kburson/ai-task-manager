// Pre-refine-exit guard: child sub-issues may not enter refine while their
// parent epic sits outside the active planning window (#338, parent epic #259;
// relocated from backlog-exit to on-deck-exit in #433).
//
// Mirrors the parent-side `planEpicChildrenGuard` from #277 but from the child's
// perspective: a sub-issue moving on-deck → refine (the 8-state predecessor of
// refine) is refused when its parent's live board Status is anything other than
// `refine`, `plan`, or `develop`. The earlier backlog → on-deck hop is gateless
// (On Deck is an inert tranche waiting room), so the parent-state floor moved
// with the real refinement-entry transition.
//
// Wave-model invariant: children should join the active planning wave while the
// parent is itself being planned, OR while the parent is actively developing
// (mid-develop discovery work — new ACs, defects, sub-tasks spawned during the
// epic's develop stage are legitimate refinement work). The parent cannot leave
// `develop` until all children — including discovered ones — reach `done`, so
// allowing `develop` as an accepted parent state cannot let the parent escape
// its children (that invariant is enforced by the parent-side guard from #337).
//
// Letting a child enter refine while the parent is in backlog/on-deck (still
// un-planned) or has already moved into test/review/done (post-develop) breaks
// the wave alignment.
//
// Context contract:
//   { cfg: Config, issueNumber: number,
//     fromState?: string, toState?: string,
//     deps?: { fetchParentIssue?, readParentStatus? } }
//
// Short-circuit cases (return `{ok: true}` without consulting the API):
//   - ctx.fromState is present and not 'on-deck'
//   - ctx.toState is present and not 'refine'
//   - ctx or ctx.cfg or ctx.issueNumber missing (fail-open per planEpicChildren-
//     Guard convention — refusal here would mask the real blocker)
//
// Fail-open data cases (return `{ok: true}`):
//   - issue has no parent (leaf / top-level epic) — fetchParentIssue *returns* null
//   - readParentStatus *returns* null (parent not on the configured board)
//
// Fail-closed cases (#565 — return `{ok: false, reason: 'parent state unverifiable'}`):
//   - fetchParentIssue *throws* (transient gh/GraphQL failure)
//   - readParentStatus *throws*
// A thrown error is NOT a legitimate "no parent": it leaves the parent's true
// state unknown, so per docs/guides/fail-open-policy.md (transition preconditions
// are fail-closed) the guard must refuse rather than wave the move through.
//
// Refuses when the parent state is one of {backlog, test, review, done}.

import { fetchParentIssue as defaultFetchParentIssue } from './fetch-parent-issue.mjs';
import { readParentStatus as defaultReadParentStatus } from '../../gh/lib/parent-status.mjs';

export const GUARD_ID = 'backlog-exit-child-parent-refine-or-plan';

const ALLOWED_PARENT_STATES = new Set(['refine', 'plan', 'develop']);

export const backlogExitChildParentStateGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.fromState && ctx.fromState !== 'on-deck') return { ok: true };
    if (ctx?.toState && ctx.toState !== 'refine') return { ok: true };
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

    const slug = String(parentState).toLowerCase();
    if (ALLOWED_PARENT_STATES.has(slug)) return { ok: true };

    const reason = `parent #${parentNumber} is in ${slug}; child cannot enter refine until parent is in refine, plan, or develop`;
    return { ok: false, reason, blockers: [reason] };
  },
};
