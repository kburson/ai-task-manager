# Merge-Method Reconciliation Help Design

## Purpose

Make the merge-method reconciliation lane introduced by #1562 discoverable
from `npx aitm deliver --help`. The change documents behavior that already
ships; it does not change delivery, verification, or receipt semantics.

## Selected Approach

Extend the `deliver` record in
`scripts/task-tracker/verbs/help-data.mjs`, the repository's canonical source
for verb help metadata. Add the two existing arguments and expand the
documented effects with the recovery lane's precise constraints.

This is preferable to a separate guide because operators explicitly reach for
verb help at the point of need. It is also preferable to generating help from
the parser because that would be an unrelated command-surface refactor with a
larger verification surface.

## Command Contract

The help record will expose:

- `--reconcile-merge-method <merge|squash|rebase>` as the declared merge method
  for an already-merged external recovery.
- `--reason <text>` as a substantive explanation required whenever the
  reconciliation flag is present.

The effects text will state all of the following:

- The lane applies only to an already-merged external recovery.
- The declared method must agree with the merge topology observed by the
  verifier.
- Squash-direction reconciliation is unsupported because a single-parent
  rewrite cannot be distinguished safely from rebase by this recovery lane.

## Boundaries

Only the centralized help metadata and its focused regression test change.
The runtime argument parser, delivery verifier, merge-topology logic, intent
and receipt writers, lifecycle state machine, and exit-code behavior remain
unchanged.

## Verification

The existing deliver help test will assert the argument spellings, accepted
values, reason coupling, recovery-path scope, topology agreement, and the
unsupported squash direction. It will inspect both `VERB_REFERENCE.deliver`
and the normalized `VERB_CONTRACTS.deliver` record so the source metadata and
catalog stay aligned. The issue's full lint, format, unit, fast, and slow lanes
remain the regression boundary.

## Risks

The main risk is help text that overstates the recovery lane. Exact assertions
pin the preconditions and limitation. The production diff is constrained to
`help-data.mjs`, which prevents this documentation issue from silently changing
delivery behavior.
