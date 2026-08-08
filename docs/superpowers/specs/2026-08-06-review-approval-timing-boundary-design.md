# Review Approval Timing Boundary Design

## Problem

Review approval has two durable representations that are currently written by
different verbs. `approve` writes the authoritative `aitm-review-approved`
marker, while `close` writes the `review:approved` Timing Log event using the
close invocation time. If approval and close are separated, the Review phase
remains open until close and the inactive gap is published as worked time.

Issue #1127 demonstrates the failure: approval was recorded at
`2026-08-06T05:58:36Z`, but `review:approved` was written at
`2026-08-06T12:50:44Z`. The span calculator behaved correctly for its input;
the event boundary was wrong.

## Goals

- Record exactly one `review:approved` event at the authoritative approval
  marker timestamp.
- End Review active time when approval occurs, regardless of later close time.
- Repair a marker-without-event partial state on approval retry or close.
- Keep approval and close retries idempotent without moving the marker.
- Preserve the generic anti-backdating guard for ordinary Timing Log events.

## Non-goals

- Change who may approve or when approval is permitted.
- Redesign estimation or phase-span arithmetic.
- Backfill unrelated historical logs.
- Change the `issue:wrap` or `issue:closed` meanings.

## Considered Approaches

### Marker-authorized write with shared reconciliation (selected)

Approval persists and verifies the marker, then reconciles the corresponding
Timing Log event. The same operation runs when an already-approved issue is
retried and immediately before close emits `issue:wrap`. A dedicated builder
accepts only a timestamp parsed from the approval marker, allowing a legacy
repair without adding a generic freshness bypass. Deduplication and ordered
insertion occur inside the existing per-issue timing lock.

This keeps the issue marker authoritative, the event log complete, and every
consumer aligned on one visible boundary.

### Read-side synthetic boundary

Pass the marker timestamp separately into every rollup and synthesize Review's
end during calculation. Totals would be correct, but the Timing Log would
continue to claim approval happened at close or carry no approval event. This
creates two observable histories and leaves audit consumers inconsistent.

### Approval-only emission

Have `approve` emit the event and leave `close` unchanged except for skipping an
existing row. This covers the normal path but not the durable partial state in
which the marker write succeeds and the subsequent timing post fails. A retry
must reconcile from the immutable marker, and existing affected issues need the
same close-time repair.

## Components

### Shared approval timing reconciler

`scripts/task-tracker/lib/review-approval-timing.mjs` owns the operation:

```js
reconcileReviewApprovedTiming({
  issueNumber,
  repo,
  issueBody,
  wordMarker,
  readTimingCommentBody,
  postTimingEvent,
}) -> Promise<{ status, ts }>
```

It parses `aitm-review-approved`, refuses an absent or invalid timestamp, reads
the timing comment through its discriminated contract, derives the final Review
active/idle delta at that timestamp, builds the marker-authorized row, and posts
it. The timing append boundary makes the operation idempotent under retries and
concurrency.

### Marker-authorized row construction

`scripts/task-tracker/gh-timing-comment.mjs` retains `buildRow`'s unconditional
60-second freshness rule. A separate constructor accepts the issue body rather
than an arbitrary timestamp, parses the approval marker itself, and renders only
the canonical `review:approved` event. It exposes no generic skip flag.

When the locked append receives this event, it checks the current terminal
window for an existing `review:approved`. A duplicate is a no-op. If a repaired
approval timestamp precedes later rows, the event is inserted at its
chronological position rather than clamped forward; all other late events retain
the existing timestamp-clamp behavior.

### Approve verb

After the body mutation's read-back proves that the marker persisted, `approve`
calls the shared reconciler. The already-approved branch also calls it, using
the marker's existing timestamp. A timing read or write failure is surfaced as
a retryable approval failure; the durable marker remains unchanged and the next
attempt converges the missing row.

### Close verb

Before emitting the terminal close pair, `close` invokes the same reconciler
when the live body carries an approval marker. The existing pair helper then
sees `review:approved` present and emits only a missing `issue:wrap`. An explicit
review-gate bypass without a marker keeps its current close-time audit behavior,
because there is no approval timestamp to claim.

## Data Flow

1. Agent Review writes `review:passed`.
2. Approval chooses a timestamp and persists `aitm-review-approved`.
3. Read-back verifies the marker and supplies its immutable timestamp.
4. The reconciler reads the Timing Log and writes one `review:approved` at that
   timestamp with Review's delta ending there.
5. Any delay before close lies outside the now-closed Review phase.
6. Close reconciles again as a no-op, writes `issue:wrap`, publishes totals, and
   completes the issue.

## Failure and Concurrency Policy

- Missing or malformed marker authority is a refusal, never a guessed time.
- An unreadable timing comment is unknown and fails loudly.
- Marker persistence followed by timing failure is a valid recoverable partial
  state; retries reuse the marker timestamp.
- Duplicate suppression happens in the locked append mutation, so concurrent
  approval and close calls cannot create two events.
- Chronological repair changes no existing row bytes.

## Testing

The focused test uses #1127's timestamps: Review starts at `00:56:41`, approval
occurs at `00:58:36`, and close occurs at `07:50:44`. It proves the Review span
is 115 seconds, delaying close changes none of session/engaged/Review totals,
and approval/close retries retain one event at the original timestamp. Existing
span and close-order tests remain focused regression coverage, followed by all
repository verification lanes.
