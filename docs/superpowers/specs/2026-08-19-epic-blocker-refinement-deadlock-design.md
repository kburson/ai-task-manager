# Epic Blocker Refinement Deadlock Design

## Problem

AITM cannot represent a dependency-ordered epic whose downstream children are fully refined before the parent enters Develop.

The protected blocker relationship must exist before refinement so the Refine snapshot can bind it. Today, however, `blockedByGuard` prevents an issue with an open blocker from leaving both Backlog and Refine. Temporarily removing the blocker permits refinement, but restoring it changes the dependency evidence and `BLOCKED` label, making the snapshot stale. The epic Plan-to-Develop gate then refuses the child as incomplete even though it is in Ready for Planning with a finite rank.

## Design Decision

Blocked work may be shaped and parked, but it may not be admitted to active planning or execution.

- Backlog -> Refine: an open blocker does not refuse the transition.
- Refine -> Ready for Planning: an open blocker does not refuse the transition.
- Ready for Planning -> Plan and every later nonterminal transition: the existing `blockedByGuard` continues to refuse while any blocker is open.

This places dependency enforcement at the JIT work-admission boundary. It lets teams refine future work without authorizing that work to execute.

## Dependency Authority

The protected `aitm-blocked-by` body marker is the canonical dependency input for refinement snapshots. The snapshot must not derive dependencies from Plan Metadata prose or the hidden issue-field database because those representations can disagree with the marker consumed by epic child selection.

`refinement-snapshot.mjs` will parse the marker, normalize positive blocker numbers in deterministic order, include them in the snapshot digest, and serialize the same list into the snapshot's `blocked-by` property. Existing unblocked issues continue to serialize `blocked-by=""`.

Marker-authoritative snapshots use schema 2 so persisted schema-1 evidence is not silently reinterpreted under a new digest algorithm. Verification retains the original schema-1 dependency calculation for backward compatibility, then requires the serialized legacy blocker value to agree with the live protected marker. New stamps always use schema 2.

The existing synchronization contract remains unchanged: `block` and `unblock` maintain the `BLOCKED` label, `Blocked By` project field, and body marker together. This change does not add a fourth blocker authority.

## Lifecycle Behavior

A downstream child can be created with its predecessor already recorded, pass through Refine, and reach Ready for Planning with a current snapshot. The parent epic recognizes that child as completely refined. The child remains excluded from `findNextEligibleChild()` and is refused at Ready for Planning -> Plan until its predecessor reaches an accepted terminal state and the blocker is removed.

No bypass is added for Plan, Develop, Test, Review, or Done. Sequential WIP and child-parent contiguity gates remain unchanged.

## Files

- `scripts/task-tracker/states/backlog.mjs`: remove `blockedByGuard` from the Backlog exit list.
- `scripts/task-tracker/states/refine.mjs`: remove `blockedByGuard` from the Refine exit list.
- `scripts/task-tracker/lib/refinement-snapshot.mjs`: derive dependency evidence from `parseBlockedBy(body)`.
- `scripts/task-tracker/lib/guard-registry.mjs`: update the documented guard inventory.
- `scripts/tests/unit/task-tracker/lib/r4p-jit-boundaries.test.mjs`: cover marker-backed snapshot creation and stale dependency changes.
- `scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs`: cover blocked-child mapping, parent admission, and dependency-ready selection.
- Existing guard inventory tests: prove enforcement is absent only before Ready for Planning and remains present afterward.

## Error Handling

Malformed or ambiguous blocker markers fail closed at every authorization consumer. The strict reader requires either no marker or exactly one complete marker containing only unique positive issue refs. Snapshot verification remains fail-closed: changing the blocker marker or `BLOCKED` label after refinement makes the snapshot stale until refinement is completed again.

## Verification

The regression test must demonstrate the full contract:

1. a blocker exists before refinement;
2. Backlog and Refine transitions are not refused by that blocker;
3. the Ready-for-Planning snapshot records the blocker and verifies as current;
4. parent epic Plan-to-Develop admission accepts the child as fully refined;
5. Ready-for-Planning to Plan remains refused while the blocker is open; and
6. the next-child selector admits the child only after its predecessor is terminal.

Focused lifecycle, snapshot, epic-orchestration, and blocker tests run before the full fast and slow suites.

## Out of Scope

- Changing blocker synchronization across label, project field, and body marker.
- Allowing blocked work into Plan or any execution state.
- Weakening refinement snapshot freshness checks.
- Changing epic rank ordering, sequential WIP, or child-parent state rules.
- Resolving the human-facing `shape` versus `kind` nomenclature; that requires a separate discussion.
