# Shelve R4P Backward Guard Scope Design

**Story:** #1343  
**Status:** Approved by Full-Auto authority  
**Blocks:** #1263 live recovery of #1335

## Problem

Shelve is the governed way to invalidate current refinement evidence and return work from Refine or Ready for Planning to Backlog. Its transaction correctly requests a demotion and identifies the `shelve` verb, but the state-movement boundary still runs every exit guard registered on the source state.

That is incorrect for Ready for Planning. Its exit guards are admission controls for the forward transition into Plan: open-blocker completion, epic-child readiness, sequential WIP, child-parent state, and child-cannot-lead-epic. They protect delivery sequencing; they are not prerequisites for deliberately withdrawing the work to Backlog.

The live #1335 migration proved the mismatch. The transaction authenticated the legacy snapshot, recorded immutable history, cleared current evidence, and then became recovery-pending because the backward move was refused by open-blocker and parent-admission guards.

## Design Goals

- Complete an authenticated Shelve move from Ready for Planning to Backlog even when forward admission is blocked.
- Preserve Backlog entry guards and every transaction-level safety check.
- Preserve the full exit-and-entry guard pipeline for ordinary forward moves and every unrelated verb.
- Make the exception explicit, pure, and regression-testable.
- Allow the existing partial #1335 transaction to resume idempotently.

## Non-Goals

- No force flag or general guard bypass.
- No changes to blocker graph semantics, protected markers, `BLOCKED` labels, or project-field mirrors.
- No changes to forward Ready-for-Planning to Plan admission.
- No direct repair of #1335 state or evidence.
- No redesign of individual lifecycle guards.

## Considered Designs

### Make each R4P exit guard inspect Shelve context

This spreads one transition decision across five independent guards. A newly added guard could forget the exception, and each guard would mix its forward policy with orchestration details. Rejected.

### Disable the complete guard pipeline for demotions

This would also suppress target entry and structural guards and would affect unrelated demote/rework paths. It is substantially broader than the defect. Rejected.

### Select guard phases at the movement boundary

The movement boundary already knows source, target, demotion intent, and authenticated verb context. It can select source-exit and target-entry phases independently. For exactly `shelve + --demote + ready-for-plan -> backlog`, it omits source exit guards but retains Backlog entry guards. All other transitions use both phases. Recommended.

## Detailed Design

### Guard registry phase selection

Extend `runGuards(fromState, toState, ctx)` with an optional policy argument whose defaults preserve current behavior:

```text
includeExitGuards = true
includeEntryGuards = true
```

The registry remains state keyed. The option controls whether the existing source-exit and target-entry loops execute; it does not filter individual guard IDs.

### Pure transition policy

Add a small exported policy function at the movement guard boundary. It returns `includeExitGuards: false` only when all of these are true:

- verb context is exactly `shelve`;
- the parsed move carries `--demote`;
- source state is `ready-for-plan`;
- target state is `backlog`.

It always retains entry guards. Any missing or different signal returns the default full pipeline. The already established verb gate remains the authority for internal verb context; this change does not create a new authentication surface.

### Context propagation

`runMoveStateHost` places its resolved verb context on the shared movement context. `runGuardExecution` derives the phase policy and passes it to `runGuards`.

### Retry behavior

No Shelve transaction phases change. A retry reads the existing immutable history and cleared active evidence, reaches the same state-move phase, and now completes the governed Backlog move. Existing compare-and-swap, ownership, journal, field, label, marker, and read-back checks remain authoritative.

## Safety Invariants

- R4P to Plan with an open blocker still invokes and fails `blocked-by-not-done`.
- Parent/epic sequencing guards still run on forward exit.
- `--demote` without exact Shelve context still runs all guards.
- Shelve context without the exact R4P to Backlog arc still runs all guards.
- Backlog entry guards still run on the permitted backward arc.
- Force and supersede behavior is unchanged.

## Verification

Focused tests must prove the exact four-signal policy, source-exit omission with target-entry retention, ordinary forward refusal, and default behavior for near-miss contexts. Existing Shelve transaction tests prove recovery retry and carrier preservation. Full lint, formatting, fast, and slow suites remain required before integration.
