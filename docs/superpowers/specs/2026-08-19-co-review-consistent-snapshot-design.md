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
Whenever the retained array contains an event at the sampled state's revision,
that corresponding event—not merely the final event—is compared to the state's
lifecycle, role, round, budget, supplement, and acceptance projection.
Forward confirmation is considered only when all of the following are true:

1. the only integrity error is `event-count`;
2. the event file leads state by one or more revisions; and
3. every observed event still passes schema, protocol-ID, type, and ordinal
   revision validation.

For that shape, the reader re-reads `state.json` and validates it against the
exact event array already observed. This closes interleavings where one or more
writers acquire and release the mutex entirely between the reader's state and
event reads. A fully matching N+k state is returned immediately. If confirmation
has advanced beyond the retained event array because another serialized mutation
completed, the reader restarts within the same fixed attempt budget even when
neither earlier mutex sample was live. If state remains at N, only an exact
one-event lead with an observed mutex permits a small bounded wait and retry. An
unchanged multi-event lead fails immediately because one authorized mutation
cannot publish multiple events before its state replacement. Production waits
are synchronous because the writer is a separate process and the public protocol
API is intentionally synchronous. Test-only injected read and wait functions
provide deterministic seams without timing-sensitive sleeps.

A confirmation state that is ahead of the retained array is carried into the
next attempt. Before that attempt can proceed or accept a newer snapshot, the
carried state must match its corresponding newly retained event. A partially
confirmed state within the retained array may restart only when its sole
integrity error is still the forward event-count mismatch. Projection drift at
any sampled revision is therefore durable evidence and cannot be healed by a
later matching state/event pair.

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
format and synchronous callers, and recognizes the bounded publication
interleavings that serialized writers create.

## Fail-closed Boundaries

The retry path does not accept or normalize corruption.

- No mutex: after the immediate state confirmation remains at N, a one-event lead
  is reported as durable drift without a delayed retry.
- A stale mutex: retries end at the fixed bound and the original integrity error
  is returned.
- Continuous authorized publication can consume the fixed attempt budget; the
  final unmatched snapshot is reported rather than accepted or normalized.
- Every sampled or carried state must match the retained event at its own
  revision before publication progress can be inferred.
- An unmatched multi-event lead with unchanged confirmation, missing events,
  malformed JSON, wrong schema, protocol-ID drift, invalid event type,
  reordered/duplicate revisions, projection drift, artifact drift, supplement
  drift, and Git drift never qualify.
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
and event reads. A third case will complete two serialized publications around
the initial event read and require a bounded restart to the N+2 snapshot. A
fourth will complete both publications inside the first read gap and confirm the
exact N+2 state against retained N+2 events.
`statusProtocol` and `waitForTurn` must return healthy settled snapshots.

Adversarial cases will corrupt projection fields in the initial state, a partial
confirmation, and a state-ahead confirmation. A later matching N+k pair must not
erase any of those earlier integrity errors.

Separate cases will prove that the same one-event lead fails closed without a
mutex and after bounded retries with a persistent mutex. Existing revision,
ordering, immutable-artifact, supplement, and real-repository boundary tests
remain unchanged and green. Generated handoff assertions will pin the settled
re-read and persistent-failure wording for both roles.
