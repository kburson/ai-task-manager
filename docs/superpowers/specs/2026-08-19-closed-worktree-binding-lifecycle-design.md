# Closed Worktree Binding Lifecycle Design

**Issue:** #1297
**Date:** 2026-08-19
**Status:** Approved in Full-Auto Plan

## Problem

The Bash worktree guard elects the newest `active-task.json` for the current
session from the invoking checkout, configured project paths, and fleet
worktrees. A successful close removes only the invoking checkout's record. A
matching record in another worktree can therefore survive after its issue is
closed and later become authoritative when a newer live binding is cleared.

This is a lifecycle defect, not a command-classification defect. The guard is
correct to fail closed when a live binding points elsewhere; it is wrong to
treat a terminal binding as live.

## Decision

Introduce one main-worktree-anchored terminal-binding ledger plus one shared
release operation.

The ledger lives with other machine-local fleet state under
`.tmp/aitm/fleet/`. It records a closure timestamp by session and issue. A
binding is terminal only when its effective bind timestamp is not newer than
the recorded closure timestamp. That comparison preserves a legitimate bind
after an issue is reopened.

Every successful close lane calls the shared release operation before fleet
deregistration removes candidate information. The operation:

1. records the terminal timestamp;
2. enumerates the invoking checkout, the main checkout, configured project
   paths, fleet worktrees, and every linked Git worktree;
3. clears only current-session `active-task.json` records whose issue exactly
   matches the closed issue.

The ledger is the fail-safe half of the design: if a path disappears or a
cleanup is interrupted, the guard still excludes the terminal record. The
sweep is the hygiene half: normal successful closes leave no stale matching
record behind.

## Guard semantics

`resolveCurrentSessionWorktreeBinding` reads the terminal ledger once after it
has found the main checkout. Each candidate is evaluated independently:

- malformed, missing, or unreachable records remain ineligible;
- a record with an intrinsic `closedAt` timestamp is ineligible when that
  timestamp is at or after its bind timestamp;
- a record covered by the shared terminal ledger is ineligible on the same
  timestamp rule;
- a newer record for the same issue remains eligible, supporting an explicit
  post-reopen bind.

All eligible records retain the existing newest-timestamp election. No network
call is added to the Bash hook.

## Recovery

Extend `aitm fleet` with an exact recovery operation:

```text
npx aitm fleet release-closed-binding #1297
```

The command queries GitHub and refuses unless the named issue is confirmed
closed. It then records the terminal ledger entry, sweeps matching records, and
deregisters the stale fleet entry. The foreign-worktree refusal names this
command and tells the operator to run it from the displayed bound worktree, so
no override or misfiled audit comment is required.

An unreachable GitHub state is indeterminate and fails closed. The recovery
command never releases a binding for an open issue.

## Atomicity and failure behavior

Terminal-ledger writes are atomic and serialized with a local lock. The ledger
is written before records are removed. A ledger write or authoritative
occupancy release failure remains a close failure; fleet deregistration stays
advisory. Record removal is idempotent and issue-matched, so retries are safe.

## Compatibility

- Existing active-task records require no migration.
- Existing terminal records without a ledger entry can be repaired with the
  recovery command.
- Reopened issues can bind normally because a new `boundAt` supersedes the old
  terminal timestamp.
- Command classification, override syntax, issue lifecycle state, and GitHub
  authority remain unchanged.

## Verification

Focused tests cover terminal election, mixed live/closed candidates,
closed-only resolution, all-worktree cleanup, close-lane delegation, recovery
refusal/success, and the user-facing corrective command. The repository fast
and slow suites remain the final regression gates.
