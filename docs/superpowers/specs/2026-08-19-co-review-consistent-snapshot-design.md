# Co-review Consistent Snapshot Design

**Issue:** #1322  
**Date:** 2026-08-19  
**Status:** Approved in Full-Auto mode

## Problem

Co-review mutations append the next immutable event and then atomically replace
`state.json` while holding the protocol mutex. `status` and `wait` currently read
the state and event files independently without the mutex. During the short valid
publication window, a reader can therefore pair revision N state with N+1 events
and falsely report `integrity:event-count`.

The durable integrity rules are correct. The defect is that a transient,
authorized publication window is treated as a settled snapshot.

## Decision

Introduce a bounded, lock-aware consistent-snapshot reader inside
`statusProtocol`.

Each attempt reads and validates `state.json`, reads `events.jsonl` once, and
evaluates the complete existing event-integrity rules against those exact bytes.
The snapshot is returned immediately unless all of the following are true:

1. the only integrity error is `event-count`;
2. the event file leads state by exactly one revision;
3. every observed event still passes schema, protocol-ID, type, and ordinal
   revision validation; and
4. the protocol mutex directory is present, showing an authorized mutation may
   still be publishing its state.

For that shape, the reader first re-reads `state.json` and validates it against
the exact event array already observed. This closes the interleaving where the
writer acquires and releases the mutex entirely between the reader's state and
event reads. A fully matching N+1 state is returned immediately. If state remains
at N, only an observed mutex permits a small bounded retry. Production retries
use a short synchronous wait because the writer is a separate process and the
public protocol API is intentionally synchronous. Test-only injected read and
wait functions provide deterministic seams without timing-sensitive sleeps.

The successful attempt's event array is retained and reused for all downstream
status projection. Status never re-reads the event file after deciding the
snapshot is consistent.

## Why This Approach

Acquiring the writer mutex for reads would make ordinary status calls contend
with mutations and would require a new wait/ownership protocol. Making the public
status API asynchronous would ripple through the CLI, protocol index, tests, and
mutation preflights. A new combined state/event file would be a broader storage
migration.

The selected design changes only the read boundary, preserves the existing file
format and synchronous callers, and recognizes exactly the one interleaving that
the writer creates.

## Fail-closed Boundaries

The retry path does not accept or normalize corruption.

- No mutex: after the immediate state confirmation remains at N, a one-event lead
  is reported as durable drift without a delayed retry.
- A stale mutex: retries end at the fixed bound and the original integrity error
  is returned.
- More than one extra event, missing events, malformed JSON, wrong schema,
  protocol-ID drift, invalid event type, reordered/duplicate revisions, projection
  drift, artifact drift, supplement drift, and Git drift never qualify.
- The reader never steals, deletes, or rewrites the mutex or protocol files.

Mutation preflights continue to use the same full integrity validation. The new
reader only prevents a read-only command from judging a still-publishing snapshot.

## Generated Handoff Recovery

Both generated role handoffs will explain that an integrity refusal can be
transient only during authorized snapshot publication. On an integrity exit, the
agent must run one settled `status` re-read:

- if the re-read is healthy, continue from the reported state;
- if the mismatch persists, preserve protocol files, report the exact diagnostic,
  and stop.

The handoff continues to forbid lock deletion or theft and does not weaken the
mandatory stop rule for durable drift.

## Verification

The focused corpus will deterministically stage revision N state, revision N+1
events, and a live mutex from a real protocol mutation. The injected retry seam
will publish revision N+1 state between attempts. A separate injected read seam
will publish the state and release the mutex entirely between the initial state
and event reads. `statusProtocol` and `waitForTurn` must return healthy settled
snapshots.

Separate cases will prove that the same one-event lead fails closed without a
mutex and after bounded retries with a persistent mutex. Existing revision,
ordering, immutable-artifact, supplement, and real-repository boundary tests
remain unchanged and green. Generated handoff assertions will pin the settled
re-read and persistent-failure wording for both roles.
