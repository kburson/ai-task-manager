# Atomic + Idempotent State Movement — Design

**Date:** 2026-07-08
**Status:** Approved (design); pending implementation plan
**Topic:** Make every `/task` state transition atomic-in-effect and idempotent, behind a single `promote`/`demote` entry point, with a self-healing audit trail instead of an unbreakable wall.

---

## 1. Problem

A `/task` state move is not one write — it is four writes against two different GitHub subsystems:

1. **Exit flush** — close the _exiting_ state's timing-log row.
2. **Entry stamp** — write the entry marker (`aitm-entered-<stage>`, `aitm-last-known-state`) for the _new_ state.
3. **Entry row** — open the _new_ state's timing-log row.
4. **Status write** — change the board `Status` field to the _new_ state.

(1)-(3) hit the Issues REST API (comment + body). (4) hits the Projects GraphQL API. There is **no cross-subsystem transaction**, so a move can partially complete and leave the issue in a split-brain state.

Observed failure modes this design closes:

- **Marker-ahead-of-board** (#741, `project_marker_after_verified_move`): entry marker stamped for a state the board never reached → multi-hop drift no sanctioned tool can clear.
- **Board-committed-but-reported-failed** (#752): a timeout kills the tail after the board write committed → false "Issue left OPEN".
- **Never-reconciled lifecycle boxes** (#747 → #753): a close that bailed pre-ticker, then took the idempotent `noop` fast-path forever, never re-ticking the DoD lifecycle boxes.

All three share one root cause: **the move has no single, verifiable definition of "done," and no idempotent replay path to converge a partial move.**

## 2. Goals

1. **Atomic-in-effect.** The four elements move together. A move reports success only when _all four are verified as stored in GitHub_. It never reports success on a partial write.
2. **Idempotent.** Re-running a completed move is a no-op. Re-running a partial move rolls _forward_ to completion — it never double-writes and never rolls back.
3. **Single entry point.** The only way to move state is `promote`/`demote`. There is no standalone `move-state.mjs` to call and no direct import path.
4. **Honest, actionable output.** The command emits a readout asserting each element is true as stored in GitHub. On failure it emits an error specific enough for the operator to decide: file a bug, re-run with new parameters, or demote to fix code.
5. **Enforcement by detection, not by wall.** Bypass is assumed to be possible; the system catches and reports it rather than pretending to prevent it.

## 3. Non-Goals

- ACID transactions across GitHub subsystems (impossible; not attempted).
- Preventing a bypass by an agent that shares the operator's credentials (impossible on a single-user box; explicitly out of scope — see §8).
- Reworking the 8-state machine, guard semantics, or the timing-log format.

## 4. Atomicity Model — Roll-Forward Idempotent-Replay Saga

**Chosen over** compensating-rollback and pre-flight-then-commit.

- The move is a saga of ordered steps. **Status write is the LAST authoritative action.**
- There is **no true rollback.** On any failure the move is re-run; each step is individually idempotent, so replay converges the partial move forward to completion.
- A move **cannot report success** until every element is written _and re-read back from GitHub as equal to the target_.
- A second execution of an already-complete move does nothing (idempotent), unless explicitly inside a retry loop.

Why Status-last is safe here (and inverts the old #747 "stamp only after verified move" rule): under the old rule, markers were stamped after the board move because a move could silently fail. Under this design the move never _reports_ success until Status is verified at target, and replay is idempotent — so ordering the Status write last, with verification gating the success report, subsumes the old invariant. The entry marker is no longer a prediction that can outrun the board; it is written as part of a unit that is not declared done until the board agrees.

## 5. Completion Signal — Dedicated Sentinel

**Chosen over** inferring completion from Status alone.

- The true final act, written **after** Status is verified at target, is a sentinel:
  `aitm-move-complete state=<target> ts=<...>`
- **Definition of complete:** `sentinel present AND Status == target AND entry markers present`.
- The sentinel is what separates "went through the saga" from "was written some other way." It is the signature the audit trail (§8) keys on.

## 6. Consolidation — `promote`/`demote` Is the Only Path

**Chosen over** keeping `move-state.mjs` as a callable script.

- `move-state.mjs`'s logic (authoritatively, `runStatusWrite`) moves **into `aitm`** as an internal method. There is no standalone script and no public import.
- Verbs call the `aitm` move method; the method owns the saga, the verification, the sentinel, and the tail dispatch.
- This gives one place to hang the idempotency + atomicity adapters/decorators, and removes the agent's ability to call `move-state` directly — mirroring the existing single-state-mutator intent (`feedback_single_state_mutator`).
- **Verbs validate exit and entry guards** for the two states _before_ calling the move method. Guard validation is the verb's job; the atomic write is the move method's job.

## 7. Atomic Core vs. Best-Effort Tail

**Chosen the tight core.**

**Atomic + verified unit (all-or-report-failure):**

1. `stampEntryMarkers` — entry stamp.
2. `emitPhasePairRows` — exit-flush + entry-row.
3. `runStatusWrite` — Status field.
4. `aitm-move-complete` sentinel — written last, after Status verified.

**Best-effort tail (runs AFTER the sentinel; each independently idempotent/reconcilable):**
`dispatchOnEnterActions`, `refreshKanbanStateCache`, `emitFullAutoReviewAudit`, `unparkDoneDependents`, `emitOutOfBandAudit`, `syncTrackerState`, `syncEventFields`, `endTaskTracking`.

The tail preserves the #714 invariant: a tail throw is caught, logged to stderr, and never rolls back or fails-reports the committed move. Because the tail runs _after_ the sentinel, a killed/failed tail (the #752 shape) leaves a **complete** move — the sentinel is already present — so a re-run correctly takes the idempotent no-op path and, where relevant, reconciles any tail-owned artifact (e.g. lifecycle boxes, per #753) rather than re-driving the board.

## 8. Enforcement — Audit Trail, Not a Wall

**Design stance (explicitly chosen):** string-matching command text is defeatable by wrapper scripts, obfuscation, or a hand-rolled GitHub API call. We do not try to patch every hole. The audit trail gives aitm more value than an unbreakable wall: **it catches and reports bypasses when they occur — and they will occur.**

Layered controls, strongest to weakest:

- **Detect-and-heal — the sentinel tripwire (primary).** Any `Status` transition that lands **without a matching `aitm-move-complete` sentinel** is, by definition, out-of-band. An independent auditor (run on `bind` / `pull-next`, and/or a GitHub Action watching the Status field) flags it, reports it, and reconciles or reverts. This catches a wrapper/raw-API bypass _regardless of how the write was performed_, because it inspects GitHub state, not the command that produced it. This is the missing tier: the existing `MarkerLossError` (#361) is a write-time check that only fires when the write goes _through_ the helper; the tripwire does not depend on the write being cooperative.
- **Guard (raise the bar).** The PreToolUse Bash guard continues to refuse direct `gh` issue-body/Status/timing mutations _and_ direct `move-state`/aitm-internal invocation. This stops casual and accidental bypass. It is belt-and-suspenders, not a boundary.
- **Reliability (remove the motive).** A fast, idempotent, clearly-reporting `promote`/`demote` removes the incentive that drives an agent to hand-roll a move in the first place (the exact pressure behind #747/#752).
- **Credential isolation (aspirational ceiling, documented not built).** True prevention is removing the write capability from the agent's shell (read-scoped token; write token brokered by a process the agent can't read). On a single-user dev box the agent runs as the operator with the operator's ambient `gh` auth, so this is bounded to near-zero without a separate OS user or broker. Recorded as the known ceiling; not in scope.

## 9. Command Output Contract

**Success readout** asserts, per element, that it is true as stored in GitHub:

```
✓ move #N develop→test complete
  exit flush   : develop row closed          (verified)
  entry stamp  : aitm-entered-test present    (verified)
  entry row    : test row opened              (verified)
  status       : Status == Test               (verified)
  sentinel     : aitm-move-complete state=test (written last)
  tail         : 8/8 best-effort steps ok (or: 7/8 ok, 1 deferred — see below)
```

**Failure error** is specific enough to route the operator's next action:

- which element failed, and whether it failed _before_ or _after_ the Status write;
- whether the sentinel is present (⇒ move is actually complete; treat as success/reconcile) or absent (⇒ incomplete; safe to re-run/roll forward);
- a one-line recommendation: **file a bug** / **re-run with `--repair`/updated params** / **demote to fix code**.

## 10. Architecture / Components

- **`aitm.moveState(ctx)`** (new internal method) — owns: guard re-check, saga execution, per-element write-then-verify, sentinel write, tail dispatch, readout assembly. Sole authoritative `Status` writer.
- **`promote` / `demote` verbs** — validate exit+entry guards, assemble `ctx`, call `aitm.moveState`, surface its readout/error. No direct board writes.
- **Sentinel writer/reader** — writes `aitm-move-complete` last; reads it for the idempotent short-circuit and for the auditor.
- **Move auditor** (`verify-move-invariants`) — independent; given an issue, asserts `sentinel ⟺ Status ⟺ markers`; reports and (optionally) reconciles out-of-band transitions. Wired into `bind`/`pull-next`; optional GitHub Action mirror.
- **Post-commit tail** — unchanged architecture (`runPostCommitTail`, #714 semantics), now explicitly gated to run _after_ the sentinel.

## 11. Data Flow (happy path)

```
promote #N
  → verb validates exit guard(current) + entry guard(target)
  → aitm.moveState:
      emitPhasePairRows      (exit flush + entry row)   → re-read verify
      stampEntryMarkers      (entry markers)            → re-read verify
      runStatusWrite         (Status = target)          → re-read verify
      write aitm-move-complete sentinel                 → re-read verify
      [sentinel present ⇒ move is COMPLETE]
      runPostCommitTail(best-effort, idempotent)
  → assemble + print success readout
```

Re-run of a complete move: `moveState` reads the sentinel first, confirms `sentinel ⟺ Status ⟺ markers`, prints "already complete," runs only reconcilable tail gaps (e.g. #753 lifecycle boxes), returns.

## 12. Error Handling

- **Pre-Status failure:** no sentinel, board untouched → safe to roll forward on re-run. Error says "incomplete, before Status write, re-run."
- **Post-Status, pre-sentinel failure:** board at target but no sentinel → auditor/re-run detects, writes sentinel + reconciles, converges. Error says "board moved, completion not yet stamped, re-run to converge."
- **Tail failure:** move is complete (sentinel present); tail throw logged, never fails-reports the move (#714). Re-run reconciles tail-owned artifacts only.
- **Out-of-band Status change (bypass):** no sentinel present for a Status that isn't the recorded state → auditor flags/reports/reconciles.

## 13. Testing

- Unit: each element's write-then-verify; sentinel write-last ordering; idempotent no-op on complete; roll-forward on each partial-failure injection point.
- Guard: verbs refuse to call `moveState` when exit/entry guard fails.
- Auditor: out-of-band Status change (sentinel absent) is detected and reconciled; a legitimate saga move is not flagged.
- Regression: #741 (marker can't outrun board), #752 (killed tail ⇒ still reports success), #753 (idempotent re-run reconciles lifecycle boxes).
- Behavioral: happy-path `promote`/`demote` output contract matches §9.

## 14. Relationship to Existing Work

- **Supersedes** the operational rule in `project_marker_after_verified_move` / #747 (stamp only after verified move) — subsumed by Status-last + verified-success-report + idempotent replay.
- **Closes** the class behind #741, #752, #753 by construction.
- **Extends** the #361 enforcement layers with the independent auditor tier (the piece #361 lacked).
- **Reinforces** `feedback_single_state_mutator` — `aitm.moveState` becomes the one audited Status writer, now uncallable as a standalone script.

## 15. Open / Deferred

- GitHub Action mirror of the auditor (out-of-band, server-side) — desirable, not required for v1; the `bind`/`pull-next` auditor covers the local loop.
- Credential isolation / write-broker (§8) — aspirational; requires a separate OS user or daemon; deferred.
