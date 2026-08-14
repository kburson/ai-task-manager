# Promote-to-Test Delegation Parity Design

## Problem

`runPromote` currently evaluates the Develop-to-Test exit guards before it
dispatches the lifecycle action selected by policy. For Develop, that action is
the `test` verb. The early CODE_COMPLETE guard reads the pre-sandbox issue body
and rejects unchecked acceptance criteria, so `promote` can stop before `test`
runs the commands that would produce evidence and auto-tick those criteria.

Direct `test` already implements the correct sequence: verify in a sandbox,
persist the receipt and evidence-backed ticks, then call the central
`move-state` boundary. The mover re-runs the full Develop-to-Test guard set
against the updated authoritative issue state.

## Decision

Treat the `test` verb as the owner of the Develop-to-Test action and its evidence
acquisition. When lifecycle policy selects the exact `develop` to `test`
transition with delegate `test`, `promote` will not make a wrapper-level final
completeness decision from the stale pre-sandbox body. It will dispatch `test`
and classify the delegate result through its existing post-delegation logic.

This does not remove or weaken the authoritative Develop-to-Test guard. The
delegate still calls `move-state` after its issue-body writes, and `move-state`
still evaluates every registered guard before changing board state.

## Alternatives considered

### Auto-tick persisted evidence in `promote`

This would make the wrapper mutate issue bodies before guard evaluation. It
would duplicate evidence interpretation and checkbox-writing behavior already
owned by the Test action, adding another authority surface to the state
orchestrator.

### Make `ac-stamp` stamp and tick atomically

This would simplify one manual helper workflow, but it would not fix the
behavioral mismatch between `promote` and direct `test`. It would also change the
documented two-step `ac-stamp` then `ensureChecked` contract outside this
defect's boundary.

### Delegate to `test` before the wrapper decision

This is the selected design. It makes the wrapper and direct action share one
sequence, keeps evidence production in Test, and leaves the final transition
authority in `move-state`.

## Implementation boundary

The production change is confined to
`scripts/task-tracker/verbs/promote.mjs`. The early guard-result handling will
recognize the exact Develop-to-Test Test-delegate case and defer its decision to
the delegate. Other lifecycle edges continue to use their existing
pre-delegate guard behavior.

No changes are planned for:

- `code-complete-gate.mjs` or its strict checkbox/evidence policy;
- `auto-tick-verified.mjs` or proof-marker parsing;
- Test receipts, branch-reachability validation, or Delivery Contracts;
- the documented `ac-stamp` and `ensureChecked` helper sequence; or
- Test-to-Review and Review-to-Done orchestration.

## Data and control flow

1. `promote` resolves the live and recorded states and selects the next action
   through lifecycle policy.
2. For edges other than Develop-to-Test, it evaluates and handles the current
   wrapper guard result unchanged.
3. For Develop-to-Test with delegate `test`, it dispatches the delegate even if
   the pre-sandbox body would produce a CODE_COMPLETE refusal.
4. `test` runs Develop finalization and sandbox verification.
5. On green results, `test` persists receipts, proof markers, and
   evidence-backed checkbox ticks.
6. `test` calls `move-state` for the Develop-to-Test edge.
7. `move-state` evaluates the full registered guard set against the freshly
   persisted authority and moves only when it passes.
8. `promote` re-reads board state and uses its existing success, hard-failure,
   or promoted-with-warning classification.

## Failure behavior

Failed verification never reaches the mover and leaves the issue in Develop.
Missing, invalid, stale, unreachable, or unsuccessful evidence remains a final
move refusal. A delegate error with the board still in Develop remains a hard
transition failure. A delegate side-task error after the board reaches Test
continues through the existing promoted-with-warning repair path.

The design accepts that a direct or delegated Test run may spend sandbox time
before another Develop-exit guard rejects the final move. Direct `test` already
has that behavior; parity requires the wrapper not to add a contradictory early
gate.

## Verification strategy

The focused promote test will first be changed to expect delegation when an
injected wrapper-level CODE_COMPLETE check would refuse. Before production code
changes, it must fail by returning `code-complete-refused` and recording no Test
delegate call. After the production change, it must pass and record exactly one
`test` delegation.

Related promote and mover suites will confirm that:

- other lifecycle edges retain their current pre-delegate guards;
- the mover remains the final Develop-to-Test authority;
- Test-to-Review delegation and gates are unchanged; and
- delegate failures still preserve correct board/result classification.

Repository Develop verification, lint, formatting, and the full Test-stage suite
will run before lifecycle handoff.
