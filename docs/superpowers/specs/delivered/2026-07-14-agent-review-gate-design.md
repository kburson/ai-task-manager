# Agent Review Gate — Design Spec

- **Issue:** #808 (EPIC)
- **Date:** 2026-07-14
- **Status:** Approved (design), driving to implementation

## Problem

The Definition of Done carries a single `[ ] Passed final human review` checkbox.
Under full-auto it is routinely auto-ticked and therefore meaningless — it certifies
nothing. Separately, we repeatedly chase bugs caused by malformed issues: timing logs
that skip or double a step, missing body sections, missing report comments (New Tests,
Commits), un-cited ACs, and disorganized hidden markers. These are objective,
machine-checkable defects that no human "review" reliably catches.

## Goal

Replace the meaningless human-review checkbox with a real, objective **structural
review gate** that the agent runs as part of the Review step. The gate proves the issue
is well-formed and fully reported before it can pass Review. Human sign-off becomes a
second, optional checkbox that only matters when not in full-auto.

## Behavior — gate runs inside `/task review`

The gate is part of the **Review action**, not an exit guard (an exit guard would
require a separate `move-state`/`promote`, which we do not want) and not a separate verb.

Running `/task review #N`:

1. Records the move to Review.
2. Runs the validator registry (all validators; normalizers normalize first, then re-check).
3. **Pass** → tick DoD **"Agent Review Passed"**, stay in Review, continue the normal
   review-approval flow (Final Review).
4. **Fail** → write a `review:failed` row to the ⏱ Timing Log + an `aitm-review-failed`
   body marker (listing which validators failed and why), then **demote straight to
   Develop** (two steps back). Fixing structural defects needs source/body edits, which
   the Test-state WRITE_CODE gate forbids, so Develop is the only honest landing state.
   This wastes the Test cycle but keeps the state machine honest.

The issue never rests in Review on failure. Close cannot be attempted until Review passes.

## DoD change — two checkboxes

Replaces the single `[ ] Passed final human review` line:

```
[ ] Agent Review Passed     ← ticked only by a passing gate; prerequisite for Final Review
[ ] Final Review Passed      ← auto-ticked in full-auto; manually ticked by a human otherwise
```

- New lifecycle key `agent-review-passed` with label "Agent Review Passed".
- Existing key `passed-final-review` is **kept** (avoids migration churn) but relabeled
  "Final Review Passed".
- Close-gate requires **both** ticked. It refuses "Final Review Passed" unless
  "Agent Review Passed" is already ticked (agent gate is the prerequisite).
- Full-auto auto-ticks "Final Review Passed" (today's `audited` path); human mode ticks
  it manually. Agent-vs-human identity remains tracked by the existing
  `aitm-human-reviewer` / `aitm-full-auto-approval` markers.

## Validator registry

Pluggable registry. Each validator implements a common interface and returns
`{ pass: boolean, failures: string[], normalized?: {body, comments} }`. The framework
runs every registered validator, applies normalization where supported, re-checks, and
aggregates. The gate passes only when every validator passes.

| #   | Validator            | Family        | Checks                                                                                                                                                                                                                  |
| --- | -------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | body-sections        | validate      | 9 body sections present, ordered, non-empty: Story narrative, Scope, Plan Metadata, Pickup Directive, Deep Dive, Acceptance Criteria, Verification Commands, Definition of Done, AITM Progress Markers                  |
| V2  | required-comments    | validate      | required report comments exist: ⏱ Timing Log, Refine Estimate w/ Planned Estimate, Full-Auto Audit (plan approval), Commits, New Automated Tests                                                                        |
| V3  | timing-log-sequence  | validate      | Timing Log rows are well-formed AND a legal event-sequence walk (see below)                                                                                                                                             |
| V4  | new-tests-content    | validate      | the New Automated Tests comment actually lists the new tests created for the story                                                                                                                                      |
| V5  | ac-dod-vc-attributes | validate      | every AC / Functional-DoD item carries a proper `aitm-verified cmd="…"` attribute referencing a command under `### Verification Commands`                                                                               |
| V6  | marker-organization  | **normalize** | hoist `aitm-last-known-state` / `aitm-state` / `issue-version` to the top of the body; move all other hidden markers under the AITM Progress Markers ("AITM Marker") heading. Fails only if normalization is impossible |

### V3 timing-log-sequence — the state-machine check

Targets the skip/double bugs directly. The Timing Log is validated as a state machine
over its event rows, not merely chronological order:

- **Format:** every row matches the canonical schema (event type, timestamp, deltas,
  note). Malformed/partial rows fail.
- **Sequential validity:** the event sequence must be a legal walk over the allowed
  transitions —
  - must open with `start`; every `pause` / `switch-out:#N` / `review` closes an open
    interval; every `resume` / `start` re-opens one.
  - **no doubled step** — two `start`s or two `pause`s in a row, a `resume` with no
    preceding `pause`, etc. → fail.
  - **no skipped step** — an interval closed by `pause` but never re-opened before the
    next close, a `review`/demote row with no preceding open interval → fail.
- **Reconciliation:** timing rows agree with board state-entry markers
  (`aitm-entered-<stage>`) — a `review` row with no `aitm-entered-review`, or a demote
  in the log not reflected in markers, is flagged.
- Reports the exact offending row pair: `row K "<x>" cannot follow row K-1 "<y>"`.

## Epic breakdown — ~7 children

Framework lands first (validators depend on the registry interface); validators then
fan out.

1. **Framework child** — validator registry + interface; `/task review` integration
   (pass/fail/demote flow, `review:failed` timing row + `aitm-review-failed` marker);
   the two-checkbox DoD template change + lifecycle/close-gate wiring
   (`agent-review-passed` key, relabel, prerequisite rule).
2. **V1** body-sections validator.
3. **V2** required-comments validator.
4. **V3** timing-log-sequence validator.
5. **V4** new-tests-content validator.
6. **V5** ac-dod-vc-attributes validator.
7. **V6** marker-organization normalizer.

## Testing

- Each validator child ships targeted `node --test` unit tests: passing fixtures,
  and one failing fixture per distinct failure mode (V3 especially: doubled-start,
  orphan-resume, unclosed-interval, malformed-row, marker-mismatch).
- Framework child ships registry tests + `/task review` integration tests covering the
  pass→tick and fail→demote paths.
- Full regression (`npm run test:all`) runs once per child at its Test stage (isolated
  worktree), per the standard AITM per-phase cadence.

## Non-goals

- No new verb — the gate is inline in `/task review`.
- No exit guard — no extra `move-state`/`promote`.
- No change to the review-approval prompt / Review Notes machinery beyond adding the
  agent-gate prerequisite.
