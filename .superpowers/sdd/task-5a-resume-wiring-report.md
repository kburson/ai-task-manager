# Task 5A Resume Wiring Report

<!-- cspell:ignore SAVEPOINT -->

## Status

Complete on `feature/child/1049`, based exactly on
`c3bc0fdb5340d5af9768c4b0a74e0290a94377f1`.

This batch implements only Task 5A:

- cold start/fresh bind acquisition;
- adoption of a pre-upgrade same-session binding;
- durable no-argument resume renewal;
- same-issue held-lease self-bind;
- exact session, fleet, timing, and GitHub reconciliation;
- heartbeat and invariant-audit ordering;
- fail-closed refusal of a genuine cross-issue bind before the legacy switch.

Atomic `switchLease` work (Task 5B) and lifecycle release/handoff work (Task 6)
remain out of scope.

## Implementation

- Extended the durable work-lease intent model with `operation: "resume"`, an
  exact canonical `RenewRequest`, the canonical issue, the prior-session
  snapshot, and four stable projection identities.
- Added `coordinateWorkLeaseResume`, which:
  1. persists the exact renew request and projection inputs;
  2. verifies and renews authority;
  3. validates that the receipt was stamped by the exact request;
  4. attaches the receipt before projections;
  5. reconciles `session`, `fleet`, `timing`, and `github` in order;
  6. requires a matching positive proof before each checkpoint; and
  7. clears the intent only after every projection reconciles.
- Routed production `start`/`resume` through read-only bind preflight and the
  acquire/resume coordinators. Production now fails closed when no lazy
  work-lease authority is present.
- Kept the former ungoverned path available only through explicitly named
  test exports for legacy behavior characterization.
- Made the exact timing decision durable, including selected/emitted event,
  idle accounting, suppression, synthetic-gap data, canonical rows, stable
  sub-operation IDs, and projection identity.
- Added exact fleet projection write/read-back and idempotent GitHub claim-audit
  reconciliation with a stable projection receipt.
- Made session reconciliation cover exact global state, per-session binding
  data, word marker, full durable lease, and kanban cache read-back.
- Starts the heartbeat only after all four projections reconcile, and runs the
  invariant audit only after heartbeat registration.

## TDD Evidence

The following RED results were observed before their corresponding
implementation:

- resume intent rejected `operation: "resume"` as unsupported;
- resume coordinator tests failed because `coordinateWorkLeaseResume` did not
  exist;
- cold bind lacked read-only preflight/acquire ordering;
- a losing acquire still reached legacy bind effects;
- no-argument resume was not persisted in the durable journal;
- cross-issue resume reached the unsafe legacy switch;
- same-issue self-bind attempted duplicate bind projections;
- a mismatched renewal receipt was accepted;
- invalid no-argument resume drained the queue;
- fleet projection and GitHub projection-reconciliation helpers did not exist;
- read-only preflight did not return the live kanban state.

Each focused RED was followed by a focused GREEN run. Crash/restart tests cover:

- authority success with response loss before receipt persistence;
- receipt persistence failure before projection;
- local checkpoint failure after each of the four projections;
- timing and GitHub remote success followed by local crash;
- byte-identical authority replay and stable projection identities.

## Verification

Fresh named regression batch:

```text
node --test <17 focused lease/session/timing/start/resume files>
tests 113
pass 113
fail 0
```

The batch includes exclusive lease integration, guard/provider/session-state,
timing projection and queue consumers, runtime capabilities, state/session
regressions, start/resume behavior, cross-worktree binding, fleet, assignee
locking, orphan finalization, and switch no-op coverage.

Complete fast lane:

```text
npm test
lane=fast (749 files)
All 749 test files passed.
```

The first complete-lane audit exposed:

- two pre-existing-on-branch #1049 regressions in guard wording and executable
  classification, both absent from exact pre-#1049 base
  `19b2e28d8be6e9c21f4f912554714a55111ba0f3`;
- missing self-documentation metadata for the classified ledger release
  executable;
- post-format line drift in the timing-emitter characterization baseline;
- three approval test files sharing the repository issue-58 lock path; and
- a fake-`gh` test using the production two-second timeout while launching
  dozens of fresh Node processes under a saturated parallel lane.

The corrections preserve production policy: the approval tests now use unique
project roots, and only the fake-`gh` test receives a test-sized startup budget.
The production issue-lock and two-second GitHub timeout remain unchanged.

Additional quality gates:

- changed-file Prettier, cspell, and Markdown lint;
- repository-wide ESLint;
- test-reach, fleet-sandbox, story-tag, and doc-anchor audits;
- `git diff --check`.

Repository-wide formatting, spelling, temporary-path, Markdown, and line-cap
commands still report inherited failures outside this delta:

- `.superpowers/sdd/task-5-brief.md` formatting/MD012;
- `SAVEPOINT` spelling in
  `packages/aitm-ledger/src/sqlite/work-lease-store.mjs`;
- four unchanged `tmpdir()` uses;
- four changed test files that already exceeded the 400-code-line cap at the
  exact Task 5A base (base counts: 905, 486, 645, and 642).

No changed-file formatting, spelling, Markdown, whitespace, fleet-sandbox, or
story-tag violation remains.

## Self-Review

The self-review found and corrected:

- missing exact global/session/lease/kanban read-back in the session projection;
- callback validation that occurred after a possible queue/finalization effect;
- missing durable timing decision metadata;
- an ungoverned production fallback when lease authority was absent;
- invalid no-argument resume queue mutation;
- overly permissive fleet projection status/issue validation;
- renewal receipts not correlated to the exact persisted request.

No Critical or Important findings remain after correction and re-verification.
An independent reviewer dispatch was attempted, but the agent concurrency limit
was already occupied; the parent agent should still perform its normal
integration review against this report and diff.

## Concerns and Process Deviations

Two detached audit worktrees were created to compare the Task 5A base and the
exact pre-#1049 base. They were removed after the audit, and the subsequent
`git worktree list` and `git worktree prune --dry-run --verbose` checks showed
no remaining or stale audit worktrees.

Process deviation: before removal I verified that both worktrees were detached
at the exact read-only base commits and that I had made no commits in them, but
I did not run an explicit clean-status or unique-commit check first. The only
test setup created there was a `node_modules` self-link. No branch or commit
work existed in either audit worktree.

## Files

- `docs/superpowers/plans/2026-07-29-exclusive-work-lease.md`
- `scripts/task-tracker/fleet-registry.mjs`
- `scripts/task-tracker/gh-timing-comment.mjs`
- `scripts/lib/self-doc.mjs`
- `scripts/task-tracker/lib/assignee-guard.mjs`
- `scripts/task-tracker/lib/command-surface/entrypoints.mjs`
- `scripts/task-tracker/lib/verb-preflight.mjs`
- `scripts/task-tracker/lib/work-lease/context.mjs`
- `scripts/task-tracker/lib/work-lease/guard.mjs`
- `scripts/task-tracker/session-state.mjs`
- `scripts/task-tracker/verbs/resume.mjs`
- `scripts/task-tracker/verbs/start.mjs`
- approval test isolation and timing-emitter characterization fixtures;
- focused integration and unit tests listed in the commit.
