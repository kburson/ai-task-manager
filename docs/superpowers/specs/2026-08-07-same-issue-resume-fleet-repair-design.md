# Same-Issue Resume Fleet Repair Design

## Problem

AITM keeps the active issue in a per-session record and separately keeps issue
workspace evidence in the shared fleet registry. A same-issue `resume` returns
immediately when the session record already names the target. If the fleet entry
is missing, that no-op preserves a divergent state: the timer remains safely
bound, but `close` cannot prove which worktree owns the issue and refuses.

## Decision

Reconcile fleet registration in the same-issue early-return branch. Before
printing `already active`, call the existing registration boundary with the
invoking project directory and current branch. Keep the call best-effort, as it
is on the fresh-bind path, and do not touch session state or timing.

This is preferable to weakening `close` with a current-directory fallback,
which could attribute the wrong diff. It is preferable to forcing operators to
pause and rebind, which creates unnecessary timing events. It is preferable to
repairing during approval because resume is the explicit binding reconciliation
boundary and must be safe to invoke before any downstream verb.

## Behavior

When `resume <issue>` sees that this session is already bound to the same issue,
it idempotently writes or refreshes the fleet entry for the invoking worktree,
branch, derived bind kind, and active status. It then keeps the historical
`already active` result. No timing comment, issue body, board state, queue, or
word marker is changed.

If fleet registration throws, resume keeps its existing best-effort behavior.
The later close remains fail-closed, making the missing evidence visible rather
than silently accepting an unrelated workspace.

## Verification

A focused unit regression injects the fleet registration and branch-resolution
collaborators, establishes an already-bound session, and proves one repair call
with the expected worktree and branch. The same test proves timing collaborators
remain untouched. Existing self-bind source-order coverage continues to guard
the early return before timing and queue work.

## Delivery

Issue #1140 is a deepest-first blocker of #1139. The design, plan, regression,
and minimal implementation land as one `#1140` commit on top of `c8bbf8eb`.
After integration and closure, #1139 is unblocked and its close is retried.
