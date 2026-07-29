# Design — close→Done finalize-housekeeping

<!-- cspell:words finalizer housekeep resumable -->

**Date:** 2026-07-21
**Corrective architecture approved:** 2026-07-29
**Status:** Written-spec review after code-review findings

## Problem

GitHub "closing keywords" (`Closes/Fixes/Resolves #N` immediately followed by
`#N`) in a merged PR body auto-close the linked issue the moment the PR merges to
the default branch (`trunk`). Today this is treated as a hazard: it bypasses the
`/task close` finalizer, leaving a split-brain — GitHub `CLOSED` but the kanban
board stuck at `review`, no timing rollup, no `aitm-review-approved` marker, no
lifecycle-box ticks.

We are reversing that stance. In the PR-based deliver-to-parent flow the closing
keyword is _desirable_: opening the PR is the operator's signal "Functional DoD is
complete, ready to deliver to the parent," and letting the merge close the issue
is a natural completion signal. What AITM must add is the **housekeeping between
"closed" and "Done"**: closed ≠ Done. AITM finalizes the already-closed issue —
timing rollup, audit, markers, lifecycle ticks, board move — without owning any
acceptance gate of its own.

### Guiding principles

- **Auto-advance, no AITM-owned gate.** AITM does not block on approval columns.
  Operators may add `Approved`/`Released` kanban columns downstream; AITM neither
  owns nor waits on them.
- **AITM "Done" = the work is done** (code-complete + bookkeeping) — _not_
  demo/QA/staging/release. The rest of the release train executes elsewhere.
- **Light + coexistence is a hard constraint.** The existing
  `aitm-close-first → board Done → Projects-workflow closes issue` pattern must
  keep working unchanged. Multiple user patterns must succeed.
- **Handle operator error.** An operator can manually close a mid-flight issue and
  break the state machine; the design must detect and correct that.

### Scope trigger

We only care when an issue is **CLOSED ∧ board ≠ Done** — the signal that
something happened outside AITM control. A local merge does **not** trigger this
(no closing-keyword linkage), so the finalize path applies **only** to the
PR-based deliver-to-parent use case (and to manual/irregular operator closes).

## Decision core (pure)

Extend `decideCloseConvergence` (`scripts/task-tracker/lib/close-convergence.mjs`)
from `{boardState, issueClosed, repair}` to:

```
decideCloseConvergence({
  boardState,                 // e.g. 'review' | 'done'
  issueClosed,                // boolean
  stateReason,                // 'completed' | 'not_planned' | 'duplicate' | null
  nonLifecycleBoxesAllTicked, // boolean — mode-parameterized (see Exempt marks)
  fullAuto,                   // boolean — selects the exempt-marks set
  recoveryPhase,              // null | 'intent' | 'reopened' | 'review' | 'timing'
  repair,                     // boolean
})
```

Emitting exactly one action:

| #   | Condition                                                  | Action                                                           |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | `repair`                                                   | `proceed` — full pipeline (unchanged)                            |
| 2   | `recoveryPhase` is pending                                 | **`aberration`** — resume the durable recovery transaction       |
| 3   | closed ∧ `stateReason ≠ completed`                         | **`dead`** — no housekeeping, no board move, no reopen           |
| 4   | closed ∧ completed ∧ board `done`                          | `noop` — already finalized                                       |
| 5   | closed ∧ completed ∧ ≠done ∧ `nonLifecycleBoxesAllTicked`  | **`finalize`** — housekeep → Done                                |
| 6   | closed ∧ completed ∧ ≠done ∧ ¬`nonLifecycleBoxesAllTicked` | **`aberration`** — reopen + demote to Review + timing annotation |
| 7   | open ∧ board `done`                                        | `close-issue` (unchanged)                                        |
| 8   | else                                                       | `proceed` (unchanged)                                            |

Notes:

- **Rule 2 (dead issue).** `stateReason` other than `completed`
  (`not_planned`, `duplicate`, superseded) means the issue was closed for cause,
  not delivered. AITM keeps hands off — no board move, no reopen. The operator
  prunes the branch as dead.
- **Rule 4 vs 5** is the _irregular-close integrity check_: a completed close that
  bypassed AITM's finalizer is trusted only if the issue's own recorded state (its
  body checkmarks) says the work was actually complete.

### Exempt "lifecycle-DoD marks"

`nonLifecycleBoxesAllTicked` evaluates every body checkbox **except** the final
lifecycle marks the finalizer itself completes. The exempt set is
**mode-dependent**:

- **Full-auto:** `{ "Final Review Passed", "Story closed and moved to Done",
"Timing data flushed to issue" }` — the finalizer records the auto-approval
  audit, so "Final Review Passed" is not required beforehand.
- **Human-gate:** `{ "Story closed and moved to Done", "Timing data flushed to
issue" }` — "Final Review Passed" is **required**; a human must have ticked it
  before an authorized close.

Everything else — ACs, Functional DoD (tests/lint/commits), "Agent Review Passed",
and (human-gate) "Final Review Passed" — must already be ticked, or it is an
aberration. This reuses the existing
`all-non-self-non-lifecycle-checkboxes-ticked` derivation, mode-parameterized.

## Wiring / trigger

No new verb. `/task promote` already delegates `review → close`
(`promote.mjs:130`), so promote-to-Done _is_ close. Two entry points route through
the extended core:

1. **Explicit `/task close #N` / `/task promote #N`.** Already reaches the
   `issueClosed && !boardDone` converge branch; now it additionally branches on
   `stateReason` + checkmark integrity.
2. **`pull-next` self-heal sweep.** When selecting next work, scan tracked
   in-flight issues; any CLOSED ∧ ≠Done gets `finalize` / `dead` / `aberration`
   applied. This is what auto-picks-up a PR-keyword close that arrived with no
   explicit verb call — the common case, since GitHub does not invoke AITM.

## Move-tail effect profiles

The move-state saga already owns one ordered eight-step post-commit tail. The
tail currently runs as a fixed list whose leaf functions decide whether to act
from process-global state. That is unsafe for background convergence: moving a
child to Done from `pull-next` also runs `syncTrackerState` and
`endTaskTracking`, which can overwrite or end the active parent epic.

Replace the fixed-list assumption with explicit effect scopes while preserving
the existing order:

| Scope     | Responsibility                                                                  |
| --------- | ------------------------------------------------------------------------------- |
| `issue`   | Issue audit and event-field effects belonging to the issue that moved           |
| `project` | Kanban cache refresh, dependent unpark, and other project-wide reconciliation   |
| `session` | Active-task cache synchronization and task-tracking termination on this machine |

Two named profiles are required:

- **`task-owner`** — the default for every existing CLI-driven state move. It
  enables `issue + project + session` and must enumerate the exact current tail
  order. Existing promote, demote, close, supersede, and reconcile behavior is
  unchanged.
- **`background-convergence`** — used when `pull-next` converges a child while
  the parent remains active. It enables `issue + project` and excludes every
  `session` effect. It still writes the child board state, audit, event fields,
  lifecycle evidence, and dependent-unpark effects.

Profile selection is a typed internal parameter passed through
`runMoveStateInProcess` → `runMoveStateHost` → `moveState`; it is not a public
CLI flag or ambient environment variable. An unknown profile fails closed
before the board write. `runPostCommitTail` remains the single sequencer and
filters the ordered step registry by scope.

This boundary is deliberately useful beyond `pull-next`: a future hosted,
cloud-agent, or maintenance caller can select a non-session profile without
silently inheriting whichever local task happens to be active. New profiles are
not part of this story.

## Authority-aware inspection

The GitHub issue/board snapshot is read before any integrity detail. Decision
precedence controls which further reads are allowed:

1. A closed non-completed issue is `dead` immediately. No body or child query is
   required, and an unrelated read outage cannot turn the no-op into a failure.
2. A closed completed issue already at Done is `noop` immediately. Existing
   housekeeping may make best-effort body/timing reads, but their failure cannot
   reinterpret the terminal state.
3. Only a closed completed issue whose board is not Done requires strict body
   and child integrity.

Child discovery uses a strict snapshot:

```
fetchSubIssueBoardSnapshot(issueNumber)
  -> { status: 'ok', children: [{ number, boardState }] }
   | { status: 'unknown', error }
```

`status: 'ok', children: []` is the only authoritative leaf result. A missing
issue, failed GraphQL query, unrecognized project item, or unknown child board
state fails integrity and blocks finalization. The legacy `fetchSubIssues`
array-returning capability remains a compatibility facade for existing callers;
new convergence code never treats its catch-to-empty behavior as authority.

The epic-child query also carries each child's recovery-marker phase so
`pull-next` can resume a partially recovered open child, not only detect a
closed/not-Done child.

### Action handlers

- **`finalize`** = the existing converge/`noop+boardDrift` housekeep path:
  `runMoveStateDone` (board → Done), emit `review:approved → issue:wrap` timing
  rows (review:approved only if `aitm-review-approved` present, else record the
  full-auto approval audit first), `reconcileLifecycleBoxes`, clear state. A
  child finalized by `pull-next` selects `background-convergence`; an explicitly
  active issue selects `task-owner`.
- **`dead`** = true no-op: leave issue closed, leave board where it is, write
  nothing. Optionally log a one-line note that a dead-closed issue was skipped.
- **`aberration`** = execute or resume the durable recovery transaction below.

### Durable aberration recovery

Recovery must survive a fresh process after failure. A single protected marker
is upserted through these phases:

```
<!-- aitm-unauthorized-close
     tx="..."
     phase="intent|reopened|review|timing|complete"
     state-reason="completed"
     unticked="..."
     actor="..."
     ts="..." -->
```

The marker is machine-readable; `actor="unknown"` is honest when GitHub does
not expose the closing actor. The transaction proceeds:

1. Write `phase="intent"` while the issue is still closed.
2. Reopen the issue; upsert `phase="reopened"`.
3. Move its board card to Review with the correct tail profile; upsert
   `phase="review"`.
4. Append the `unauthorized-close` Timing Log row tagged with the transaction
   id; upsert `phase="timing"`.
5. Upsert `phase="complete"`.

Every step is idempotent. Reopen and Review self-transitions are satisfied
no-ops. Before appending timing, the service checks for the transaction id so a
crash after the timing write cannot duplicate the row. Any failed or queued
timing write leaves the marker pending. A fresh explicit close or `pull-next`
sweep recognizes the pending marker even though the issue is now open, resumes
at the first incomplete phase, and refuses to promote another child until the
transaction is complete.

The action result names the durable phase and failed step. It never reports
`recovered` until `phase="complete"` has been verified from the issue body.

### Explicit review authority

Finalize derives review authority from the configured/session
`reviewToDone` gate and passes one of these internal values through the move
context:

- `human-gate` — Final Review evidence was required by integrity.
- `gate-bypassed` — Final Review was explicitly exempted.

The Done audit consumes this explicit value instead of re-inferring authority
from missing reviewer environment metadata. A genuine non-full-auto
`aitm-review-approved` marker still wins as durable human evidence. Otherwise,
`gate-bypassed` records Full-Auto truth and `human-gate` records human-gated
truth without fabricating a Full-Auto comment.

## Audit / timeline

- **`finalize`:** review-approval audit comment (full-auto), `review:approved →
issue:wrap` timing rows, lifecycle-box ticks — all existing machinery.
- **`aberration`:** a ⏱ Timing Log annotation — "closed without authorization —
  reopened & demoted to Review" — recording the offending `stateReason`/actor and
  which non-lifecycle box(es) were unticked, plus the structured, resumable
  `aitm-unauthorized-close` marker (via `mutateIssueBody`, so invariant markers
  survive).

## Epic variant (in scope)

Same two gates. For an **epic**, `nonLifecycleBoxesAllTicked` additionally requires
**all sub-issues Done**. An epic closed-as-completed with any open/non-Done child
→ `aberration` → reopen + demote. An epic has no `[#N]` deliverable commit; its
completion signal is all-children-Done, so the integrity check subsumes the
child-rollup.

## Coexistence (hard constraint)

The existing `aitm-close-first → board Done → Projects-workflow closes issue`
pattern is untouched: it reaches board = Done **first**, so it lands on rules 3/6
(`noop` / `close-issue`) and never on `finalize` / `aberration`. The new path
activates only when **close precedes Done**. Both patterns coexist; no user
pattern regresses.

## Testing

- **Pure-core table tests** over all six actions across the matrix:
  `stateReason ∈ {completed, not_planned, duplicate, null}` ×
  `nonLifecycleBoxesAllTicked ∈ {true,false}` × `fullAuto ∈ {true,false}` ×
  `boardState ∈ {review, done, …}` × epic-children state × recovery phase.
- **Tail profiles:** pin the exact existing `task-owner` step order, prove
  `background-convergence` executes every issue/project effect and no session
  effect, reject unknown profiles before status mutation, and exercise the real
  default `pull-next` adapter while a parent epic remains active.
- **Authority reads:** distinguish a successful empty child snapshot from query
  failure and unknown child state; prove dead and already-Done decisions do not
  depend on strict body/child reads.
- **Recovery:** inject a failure after every aberration phase, construct a fresh
  invocation, and prove it resumes without duplicate timing rows or child
  promotion.
- **Review audit:** cover `human-gate × gate-bypassed × genuine approval marker ×
reviewer environment` and assert durable truth never comes from missing
  metadata alone.
- **Consumer packaging:** run the full fast/slow/static suites, verify the npm
  package includes the profiled move-state modules, and install the packed
  artifact into a temporary consumer fixture that exercises one ordinary move
  and one background child convergence.

## Non-goals

- No AITM-owned Approved/Released gate.
- No demo/QA/staging/release orchestration.
- No change to the local-merge flow (never triggers this path).
- No auto-pruning of branches for dead-closed issues (operator's job).
- No public CLI profile flag and no consumer-project migration.
- No speculative profiles beyond `task-owner` and `background-convergence`.
