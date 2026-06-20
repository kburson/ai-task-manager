# Spike #474 — Timing Log idle/word column measurement reliability

**Status:** complete · **Spike issue:** #474 · **Follow-on implementation:** #475 (and #476, #477)

Research output of the `{discuss}` session for #474. Traces where each timing-log
metric comes from, whether it can be measured reliably, and what the follow-on
implementation must do. This document is the spike's deliverable; the spike
carried no committed production code.

## Scope correction up front: compaction is a non-event

An early hypothesis was to sample Word Marker across `pre-compact` / `post-compact`
to capture "lost volume." Tracing the code kills this idea: the session JSONL on
disk **never shrinks**. Compaction only moves the in-memory context-window start
point and injects a summary; the transcript file keeps every event.
`onPostCompact` (`scripts/task-tracker/hook-handler.mjs`) confirms it — it does not
recount or drop anything, it re-baselines the line marker to the (only-ever-larger)
`totalLines`. Word Marker is therefore monotonic across compaction; there is nothing
to adjust. **Compaction is dropped from scope.**

## Column-by-column verdict

| Column          | Verdict             | Reason                                                                                                                                |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Word Marker** | **FIX**             | Cumulative total — must never read 0 after any words exist. Two root causes below.                                                    |
| **Δ Words**     | **KEEP**            | A delta. On a lifecycle/audit row no session work happened, so `0` is _correct_. Document this.                                       |
| **Idle**        | **FIX (new model)** | Today's sub-threshold inference is unreliable and never aggregated. Replace/augment with explicit pause→resume "pregnant pause" idle. |

## Word Marker — two root causes for "frequently 0"

**Root cause 1 — ~15 audit-row sites hardcode `wordMarker: 0`.** Every one is tagged
with the same rationalization, e.g. `// wordMarker:0 audit row — no active session`
(in `close.mjs`, `review.mjs`, `reconcile.mjs`, `approve.mjs`, `reject.mjs`,
`promote.mjs`). These conflate the _delta_ (correctly 0) with the _running total_
(which is available in state and should be carried forward). Two outliers
(`orphan-finalize.mjs`, `on-ask.mjs`) emit `null` instead, rendering differently again.

**Root cause 2 (the bigger one) — the total is re-derived from a live `sid`, not
persisted.** `pause` zeroes the baseline: `wordsAtEntryStart: 0`
(`scripts/task-tracker/verbs/pause.mjs`). `resume` recomputes it from the JSONL
**only when a session id exists**: `if (sid) { wordsAtStart = count } else
{ wordsAtStart = 0 }` (`scripts/task-tracker/verbs/resume.mjs`). So whenever `sid`
is absent — remote/iOS sessions, or session-id detection failing — the cumulative
total collapses to 0. Proof the pattern _can_ work: `resume`, `switch`, `new`
already stamp `wordMarker: wordsAtStart` correctly when `sid` is present (matches
the observation that #414 had valid values at resume/pause).

**Recommended fix (Word Marker):**

- Persist a durable monotonic `lastWordMarker` in state, updated at every flush.
- Every row stamps `lastWordMarker` (carry-forward), never a hardcoded `0` and never
  a smaller value than the row above.
- **Scope expansion (requested):** apply the carry-forward to _every_ recorded timing
  event, not just start/resume/pause/stop — including all audit/lifecycle rows.
- Invariant to assert in tests: _no row may emit a Word Marker smaller than the row above it._

## Δ Words — keep, document

It is a per-segment delta. `0` on a lifecycle/audit row is the correct, meaningful
value (no assistant work occurred in that transition). No fix needed beyond a
one-line column-doc note so `0` is not misread as "measurement failed."

## Idle — replace the model with "pregnant pause" capture

**Why today's idle is ~always 0:** `computeActiveAndIdleMinutes`
(`scripts/task-tracker/active-time.mjs`) infers idle only as the _excess_ of an
intra-session JSONL event gap over `idleThresholdMinutes` (default 5 min). In active
work nearly all gaps are sub-threshold, so it rarely fires. Compounding this, idle is
carried in the per-row `i=N` marker but is **never aggregated** by `rollupTotals`
(`scripts/task-tracker/timing-rollup.mjs`) — so even when non-zero it never surfaces
in any summary.

**The reliable model — explicit pause→resume gap.** When the user runs `/task pause`
and later `/task resume`, the wall-clock interval between them is unambiguous,
user-declared idle ("pregnant pause"). This is far more reliable than gap-inference
because both endpoints are explicit user actions with timestamps.

**Wire-up check:** `pause` currently persists **no timestamp**
(`scripts/task-tracker/verbs/pause.mjs`) — it only flips `paused: true`. So this needs
**one new persisted field**:

- On `pause`: store `pausedAtTs` (in state and/or fleet registry).
- On `resume`: compute `idle = resume_ts − pausedAtTs`, stamp it as idle on the
  `resumed` row, then clear `pausedAtTs`.
- Aggregate idle into `rollupTotals` so it reaches the summary.

## Follow-on discoveries (spawned during the spike)

These surfaced while tracing the timing path and became their own stories rather than
expanding this spike:

- **Terminal-event taxonomy (#475 AC group 4).** #414 has two `story approved` rows
  12s apart and no `closed` event. `done`≡`closed` must appear _after_ `approved`
  (approval is sometimes automatic, sometimes human), capturing post-approval cleanup
  time (flush timing, update body, close) as the `closed` row's elapsed.
- **Session-ref marker (#476).** Persist an append-only `aitm-session-ref`
  `{ sid, jsonlPath, ts }` so the chat behind a story's timing log is locatable.
- **Codex parity (#477).** Ensure Codex records the same session-ref data from its
  own transcript location; depends on #476.

## Implications for implementation story #475

1. **Word Marker:** add durable `lastWordMarker`; carry-forward on every event; ban
   hardcoded `0`; test the monotonic invariant.
2. **Idle:** add `pausedAtTs` on pause; compute pregnant-pause idle on resume;
   aggregate idle in `rollupTotals`.
3. **Δ Words:** no behavior change; add column-doc note that `0` = no segment work.
4. **Terminal split:** add a distinct `closed`/`done` event after `approved`;
   eliminate the duplicate row.
5. **Out of scope:** compaction before/after capture (non-event — JSONL is monotonic).
