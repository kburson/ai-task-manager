# Terminal Review Handoff Design

## Problem

AITM intentionally pauses timing while retaining the issue binding after a
successful `/task review`. That state lets the terminal Full-Auto handoff call
approval and close directly. A different worktree can still retain an older
same-session entry clock, however. On #1077 the orchestrator called
`start → stop → start → close` after `review:passed`; the stale stop flushed an
already-accounted word span, the rebind emitted `resumed`, and a queued stop
replayed the same delta with a lower Word Marker.

The installed Stop hooks did not write those rows. The task verbs and their
shared timing-comment append path did.

## Goals

- Keep a reviewed issue bound while the terminal Full-Auto handoff advances
  directly to approval and close.
- Make stale or repeated terminal session-management rows harmless across
  worktrees and queued retries.
- Preserve the Timing Log's cumulative Word Marker invariant at its locked
  append boundary.
- Leave explicit non-terminal stop/resume behavior unchanged.

## Non-goals

- Rewrite historical Timing Logs, including #1077.
- Remove `review:approved`, `issue:wrap`, or `issue:closed` audit rows.
- Change long-gap synthesis, which is independently governed by #1095.
- Introduce a new orchestration command or change review approval policy.

## Considered Approaches

### Two-layer durable guard (selected)

The stop verb consults the durable timing tail before flushing local state. If
an unmatched `review:passed` handoff is open, stop leaves the issue bound and
directs the caller to approval/close. Independently, the locked append boundary
suppresses stale terminal `stop`/`resumed` rows and carries forward a durable
Word Marker when an incoming row has an older value.

This handles both the intended caller path and stale writers that bypass or
predate the stop preflight.

### Guidance-only repair

Document that callers should run close directly. This would fix cooperative
new callers but leave stale worktrees and queued rows capable of corrupting the
ledger, so it does not establish an invariant.

### Append-only repair

Filter the visible rows solely in the shared appender. The ledger would remain
clean, but stop would still clear the local binding and force a rebind. This
does not satisfy the direct paused-review handoff requirement.

## Components

### Terminal handoff classifier

`scripts/task-tracker/lib/terminal-review-handoff.mjs` owns two pure decisions:

```js
isTerminalReviewHandoffOpen(timingBody) -> boolean
shouldSuppressTerminalSessionEvent(timingBody, event) -> boolean
```

The classifier walks stored Timing Log rows in order. `review:passed` opens the
terminal handoff. `review:approved`, `review:failed`, `issue:wrap`,
`issue:closed`, or a new `review:started` visit closes or resets it. Unrelated
audit rows do not erase an open handoff. Only session-management slugs `stop`,
`resumed`, and `resume:*` are suppressed while it is open.

### Stop verb preflight

`scripts/task-tracker/verbs/stop.mjs` drains queued timing first, then reads the
durable timing comment through a context-provided discriminated reader. When
the classifier reports an open terminal handoff, the verb:

- posts no timing row;
- does not advance the transcript cursor;
- does not clear `active`, `entryStartTs`, or `lastActive`;
- marks fleet status as paused on a best-effort basis; and
- reports that approval/close is the next operation.

An absent or unreadable timing comment is not evidence of a terminal handoff,
so existing stop behavior remains the fail-open operational fallback. The
locked append guard still protects a successfully read live comment.

### Locked timing append guard

`scripts/task-tracker/gh-timing-comment.mjs#appendRow` remains the last local
decision inside the per-issue lock. Before timestamp clamping or insertion it:

1. suppresses forbidden session events during an open terminal handoff; and
2. parses the durable tail Word Marker and incoming Word Marker, rewriting only
   cell 6 upward when the incoming value is lower.

The marker carry-forward does not change the event, timestamp, durations,
delta words, description, full-expansion delta, or `row-sec` marker. It cannot
manufacture work because it reuses a cumulative value already present in the
durable log.

### Runtime context

`scripts/task-tracker/runtime.mjs` exposes the existing
`readTimingCommentBody` function as `ctx.readTimingCommentBody`. Production and
tests therefore use the same discriminated `{ status, body, error }` contract,
and the stop verb gains no direct shell or GitHub dependency.

## Data Flow

1. `/task review` completes Agent Review, writes `review:passed`, and preserves
   the bound issue without an open entry clock in its worktree.
2. A terminal caller may invoke `/task close` directly. If it first invokes
   `/task stop`, the stop preflight sees the durable open handoff and no-ops.
3. Any stale or queued stop/rebind row that reaches `postTimingEvent` is
   re-read under the existing issue lock and suppressed.
4. Close writes `review:approved` then `issue:wrap`; those rows close the seal
   and remain visible audit evidence.
5. Later cleanup and a fresh non-terminal session use the existing timing
   rules.

## Testing

The focused verifier
`scripts/task-tracker/tests/unit/lib/terminal-review-handoff.test.mjs` covers:

- the exact #1077 `review:passed → stop → resumed → stop` input shape;
- the canonical `review:passed → review:approved → issue:wrap` result;
- no duplicated word delta and monotonic markers;
- stop-verb preservation of an open terminal binding;
- fallthrough on an unreadable or non-terminal timing log;
- marker carry-forward without changing other cells; and
- explicit non-terminal stop/resume compatibility.

Existing timing-comment, departure-guard, start/resume/stop, close-emission,
and timing-sequence suites remain regression coverage. Final validation runs
the repository's fast, integration, and slow lanes plus lint and formatting.

## Failure Policy

Classification is conservative: a durable unmatched `review:passed` is
required. Read failures never masquerade as terminal proof. The append boundary
is the defense-in-depth authority for stale writers, and all suppression is
limited to session-management rows inside the terminal seal.
