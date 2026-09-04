# #1490 Recovery-Backed Partial Close Supersession Design

## Status and scope

This document amends #1490 for the live failure discovered after its corrective
delivery was merged through PR #1508.

It is further amended for the production retry failure discovered after PR
#1509 delivered the recovery-backed stale-supersession implementation. The
first corrective restart authorized against the existing `Delivered`
disposition, persisted a replacement transaction with only `timing` complete,
and then stopped. Its retry refused because the recovery-backed authorizer's
fixture expected a null disposition even though the close saga never clears the
historical `Delivered` value. This amendment corrects that impossible predicate;
it does not broaden the recovery lane.

The first reopened-close recovery durably superseded completed transaction
`ad96d1e1-8c17-471e-a060-279975761e50` with replacement transaction
`b9e5cc8e-033e-4eb3-82fe-80394ec2629a` at accepted SHA `afb0307b`. That
replacement completed only its `timing` step before additional reviewed fixes
advanced delivery authority to `1ae6a9bd`. A retry with
`--restart-reopened-transaction` now refuses with
`reopened-close-recovery:audit-authority` before mutation because the immutable
recovery record correctly names `afb0307b`, not the later authority.

In scope is one narrow bridge from a recovery-backed partial close transaction
to the existing stale-transaction supersession mechanism. The original recovery
record remains immutable, the ordinary reopened and stale restart paths retain
their current predicates, and the normal close saga remains the only path to
Done.

## Problem

The two existing recovery modes cover adjacent but non-overlapping histories:

- `--restart-reopened-transaction` supersedes a completed eight-step close that
  survived a reopen.
- `--restart-stale-transaction` supersedes an ordinary partial close whose
  accepted SHA became stale before terminal effects.

The live #1490 transaction is both partial and recovery-backed. It cannot resume
the first mode because its durable record's new authority is historical, and it
cannot enter the second mode because a legitimate reopened recovery has no
ToDo/BLOCKED label and owns a post-close rebind rather than a pending release.
Neither refusal should be weakened globally.

The missing operation is a second immutable link:

```text
completed historical close d6a3dece
  -> reopened-close recovery record
  -> partial replacement afb0307b (timing)
  -> delivered-close supersession record
  -> fresh replacement at current accepted SHA
  -> ordinary close saga
```

## Decision

Keep `--restart-stale-transaction` as the explicit operator action for the
second link. The close verb may select a recovery-backed stale authorization
only when durable evidence proves that the active partial transaction is the
replacement named by exactly one valid reopened-close recovery record.

The recovery-backed authorization is conjunctive:

1. The issue body contains exactly one valid delivered-close transaction.
2. Exactly one immutable reopened-close recovery record names that transaction
   as its replacement.
3. The active transaction's accepted SHA, review authority, issue number, and
   transaction ID agree with the recovery record.
4. Completed steps are a canonical prefix of at most the first three close
   steps, preserving the existing stale-restart terminal boundary.
5. The current accepted SHA differs from the active transaction SHA and carries
   exact-SHA Test, human Review, pull-request, intent, receipt, and live trunk
   verification.
6. The issue is OPEN/REOPENED in Review, retains the exact `Delivered` terminal
   disposition required by the first reopened-close recovery, and the recorded
   worktree is clean. The later disposition step rewrites `Delivered`
   idempotently; no close step clears it.
7. Binding ownership resolves to the current session's own post-close rebind on
   the recorded worktree.

Any absent, ambiguous, malformed, contradictory, dirty, foreign, terminal, or
same-SHA state refuses before comment or issue-body mutation.

## Components

### Recovery-backed stale authority

The reopened-close recovery module will expose a focused authorizer for the
partial-replacement shape. It consumes the already parsed durable backing
record, the active transaction, current delivery authority, and live state. It
does not broaden `authorizeDeliveredCloseRestart`, whose ToDo/BLOCKED and
pending-binding predicates remain authoritative for ordinary stale closes.

The result uses the same old/new transaction intent shape consumed by the
existing delivered-close supersession writer. This composes audited mechanisms
instead of introducing a third marker schema or flag.

For a recovery-backed retry, `Delivered` is a prefix invariant rather than a
signal that the replacement saga already completed its disposition step. The
value belongs to the historical completed close and remains present throughout
the reopened correction. A null or different disposition contradicts the
immutable recovery record and refuses before mutation.

### Immutable second link

The existing `aitm.delivered-close-supersession/v1` writer persists and
read-back verifies the link from the recovery-backed partial transaction to a
fresh zero-step transaction at the current accepted SHA. Lost-response retries
reuse the same supersession record and replacement identity. Conflicting or
duplicate records continue to fail closed.

The earlier `aitm.reopened-close-recovery/v1` comment is never edited, deleted,
or reinterpreted. It remains the authority proving how the historical completed
close became the partial replacement.

### Estimation correction authority

Close-time estimation correction requires the complete two-link chain, not an
in-memory boolean. The permission predicate will require all of these exact
relationships:

- reopened recovery replacement ID equals stale supersession old transaction
  ID;
- reopened recovery new accepted SHA equals stale supersession old accepted
  SHA;
- stale supersession replacement ID equals the active close transaction ID;
- stale supersession new accepted SHA equals the active accepted SHA; and
- all three records carry the same issue number.

Only that chain permits the outcome writer's correction mode. The writer then
requires one globally active predecessor, appends one immutable successor, and
re-lists and validates the global outcome chain before the close marks the
`estimation` step complete.

### Close orchestration

When `--restart-stale-transaction` is requested, close first performs the
ordinary stale authorization. If the active transaction is durably proven to be
a reopened recovery replacement, close instead evaluates the recovery-backed
authorization. It must never infer this mode from labels, issue state, or the
flag alone.

After supersession, the existing close convergence engine receives the fresh
zero-step transaction. Timing, estimation, lifecycle, board, disposition,
issue, labels, and binding execute in their existing order.

## Data flow

```text
close --restart-stale-transaction
  -> verify current Test, Review, PR, intent, receipt, and origin/trunk
  -> parse active partial delivered-close transaction
  -> resolve exactly one immutable reopened-close backing record
  -> verify clean worktree and own post-close binding
  -> authorize recovery-backed stale restart
  -> write and read back delivered-close supersession record
  -> replace active marker with current-SHA zero-step transaction
  -> prove two-link correction authority
  -> append and read back corrected estimation outcome
  -> replay ordinary close saga to Done
```

## Error handling and retry behavior

- The existing `audit-authority` refusal remains correct for
  `--restart-reopened-transaction`; operators must use the stale restart for a
  partial replacement whose authority advanced.
- No durable backing record, more than one backing record, or a record that does
  not exactly name the active transaction refuses before mutation.
- A non-canonical or terminal completed-step sequence refuses.
- Dirty, foreign-binding, non-REOPENED, non-Review, non-Delivered-disposition, and
  stale delivery evidence refuse.
- A lost response after supersession-comment creation reuses the exact durable
  record. A lost response after marker replacement resumes the observed prefix.
- Outcome correction refuses unless the complete immutable two-link chain is
  present and globally consistent.
- Ordinary stale restart, ordinary reopened restart, ordinary close, and generic
  protected-marker behavior are unchanged.

## Verification design

Tests first reproduce the live shape and must fail with the current
`audit-authority` behavior before production changes are written.

Focused coverage will prove:

1. a recovery-backed `timing`-only replacement at an old accepted SHA can be
   superseded through `--restart-stale-transaction` after a new exact-SHA
   delivery;
2. the original reopened recovery comment remains unchanged and one immutable
   delivered-close supersession comment is appended;
3. retry before and after body replacement reuses the same replacement identity;
4. the two-link chain enables exactly one corrected estimation outcome and
   leaves exactly one globally active outcome;
5. missing, duplicate, malformed, cross-issue, cross-SHA, terminal-prefix,
   dirty, foreign-binding, non-REOPENED, non-Review, and same-SHA cases refuse
   before mutation;
6. a standalone stale transaction still requires ToDo/BLOCKED plus pending
   binding;
7. a completed reopened transaction still uses
   `--restart-reopened-transaction`; and
8. the normal close, delivery, marker-protection, and outcome-creation suites
   remain green.

The regression must exercise the production sequence rather than construct an
unreachable null-disposition fixture: authorize the first reopened recovery
with `Delivered`, interrupt after the `timing` checkpoint, then retry the
recovery-backed stale supersession with the same persisted `Delivered` value.
The test must fail on the old predicate before production code changes and pass
after the minimal correction. Null and alternate dispositions remain explicit
refusal cases.

Full lint, format, unit, integration, slow, and governed exact-SHA Test lanes
remain required before Review.

## Alternatives rejected

### Extend the reopened recovery record to partial chains

That schema intentionally proves an eight-step completed historical close.
Allowing partial transactions would mix two distinct lifecycle meanings and
weaken the strongest invariant in the original recovery design.

### Add a third recovery flag and marker schema

A dedicated post-recovery-rework transaction would be explicit but would
duplicate the stale supersession record, persistence, retry, and replacement
machinery. The existing mechanisms already provide the required two links.

### Edit or replace the first recovery comment

The record is true historical authority. Mutating it would destroy the audit
trail and make lost-response reconciliation ambiguous.

### Treat tree inclusion or current delivery as sufficient

Current content correctness does not prove authority to retire the active close
transaction or correct its estimation outcome. Both mutations require the
immutable transaction chain.

### Clear disposition during reopened recovery

Adding a new clearing mutation would expand the terminal saga, create another
lost-response boundary, and temporarily discard true historical state. The
existing disposition step is already an idempotent `Delivered` write.

### Accept either null or Delivered on retry

Permitting both would conceal contradictory project state. The initial recovery
can only create this replacement after observing `Delivered`, and no intervening
step clears it, so `Delivered` is the sole reachable and auditable value.

## Non-goals

- Weakening exact-SHA Test, Review, delivery, or trunk verification.
- Broadening the terminal boundary beyond three completed steps.
- Relaxing ordinary stale restart's managed-label or pending-binding rules.
- Editing or deleting historical recovery, delivery, close, or estimation
  records.
- Adding a general-purpose transaction-rewrite command.
- Bypassing the human Review or close gates.
