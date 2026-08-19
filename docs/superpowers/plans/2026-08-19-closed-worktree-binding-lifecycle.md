# Closed Worktree Binding Lifecycle Implementation Plan

**Issue:** #1297
**Design:** `docs/superpowers/specs/2026-08-19-closed-worktree-binding-lifecycle-design.md`

## Task 1: Prove terminal election and release behavior

- Add focused failing tests for a closed record losing to a live record and to
  no record at all.
- Add a regression for closing B, clearing B, and ensuring closed A cannot be
  resurrected.
- Add release tests proving every matching candidate record is cleared while
  unrelated bindings survive.
- Add deterministic race coverage proving a concurrent switch or reopen
  survives terminal cleanup.

## Task 2: Add terminal-binding state and shared release

- Add the main-anchored terminal-ledger path.
- Implement atomic ledger read/write and timestamp comparison.
- Implement complete local worktree enumeration and issue-matched binding
  cleanup for the current session.
- Require strict main-worktree authority and deeply validate ledger entries.
- Serialize binding writes and compare-and-clear cleanup on the same record
  lock.
- Integrate terminal filtering into the existing synchronous election.

## Task 3: Route every successful close through the release

- Extend the shared `releaseClosedBinding` boundary so it records and sweeps
  active bindings before advisory fleet deregistration.
- Prove both Done and disposition close lanes use the shared boundary.
- Prove convergence-dead, cascaded-child, and supersede terminal paths use the
  same boundary.
- Preserve mandatory occupancy release and existing close retry semantics.

## Task 4: Add verified non-override recovery

- Add `aitm fleet release-closed-binding #N`.
- Require a confirmed GitHub `CLOSED` state before cleanup.
- Deregister the repaired issue and print the released record count.
- Document the exact recovery command in CLI help, the command catalog, and
  foreign-worktree refusal text.

## Task 5: Verify and deliver

- Run the focused #1297 regression command.
- Run format, lint, the complete fast suite, and the slow suite.
- Obtain independent code review and resolve every actionable finding.
- Publish the exact reviewed commit, wait for GitHub CI, merge, verify trunk
  ancestry, and close #1297 through the governed Done path.
