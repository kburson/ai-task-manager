# Reconcile Sentinel Drift Design

## Problem

AITM's move-invariant auditor treats the final `aitm-move-complete` marker as
the strongest proof that a board transition completed through the state saga.
When a board Status is changed out of band, the board and
`aitm-last-known-state` can agree while the move-complete sentinel still names
the last verified state. The auditor correctly recommends
`revert-to-sentinel`, but the reconcile verb does not accept that mode. Its
existing modes cannot repair this shape because they operate only on
board-versus-recorded drift.

## Decision

Add an explicit public reconcile mode named `revert-to-sentinel`.

The mode reads the final move-complete sentinel from the freshly fetched issue
body. It refuses when the marker is missing, names an unknown state, or the
board, recorded state, and sentinel already align. For valid drift, it writes
only the board Status field through the existing confirmed status-write seam,
then updates `aitm-last-known-state` to the sentinel value. It preserves the
sentinel instead of manufacturing a new saga completion.

The recovery appends a `reverted` audit marker containing the prior board,
recorded, and sentinel values, then refreshes the active-session state cache.
It does not add stage-entry markers or timing rows because the target stage was
already entered and the operation is recovery, not a new lifecycle visit.

## Alternatives Rejected

- `accept-live` cannot repair the reproduced state because board and recorded
  already agree, so it returns `no-drift-refused`.
- Stamping a new sentinel for the live board would falsely vouch for a move the
  saga did not perform.
- Running a forced normal state transition would create lifecycle and timing
  history for an illegal recovery edge and would overwrite the provenance being
  used to repair the issue.

## Failure Semantics

The mode is fail-closed. A missing or invalid sentinel performs no write. A
failed or unconfirmed Status write leaves the recorded marker unchanged. The
recorded-state update is a closure over a freshly fetched body and rechecks that
the sentinel still names the expected target before writing, so a concurrent
provenance change cannot be overwritten.

If the Status write succeeds but the later body write exhausts its retries, the
command returns a distinct nonzero partial-recovery result and does not stamp a
success audit or update the session cache. A retry recognizes the
board-equals-sentinel/recorded-lags shape, skips the already-completed Status
write, and resumes only the closure-based marker, audit, and cache repair.

## Compatibility

`accept-live`, `revert-to-recorded`, and `backfill` retain their existing
branches and return shapes. The new branch executes before the historical
board-equals-recorded early return because sentinel-only drift deliberately has
that shape. Help and usage text list the new public mode, matching the existing
invariant diagnostic.

## Verification

Focused tests cover:

- board and recorded at `develop`, sentinel at `plan`, successful confirmed
  Status recovery to `plan`;
- last-known state, cache, and audit effects;
- missing, unknown, and already-aligned sentinels;
- a failed Status write with no body rewrite;
- CLI argument acceptance and help/diagnostic consistency;
- unchanged existing reconcile-mode tests.
