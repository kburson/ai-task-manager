# Decomposed Epic WBS Plan-Exit Design

**Issue:** #1279
**Discovered during:** #1268
**Status:** Approved for implementation planning
**Date:** 2026-08-15

## Problem

AITM correctly classifies #1268 as an epic and GitHub reports its six immediate
sub-issues. Its accepted Superpowers implementation plan is also correctly
classified `must-split`. However, the Plan-to-Develop decomposition guard treats
`must-split` as permanently blocking unless the issue carries a Decomposition
Waiver. The guard never asks whether the plan's WBS has already been instantiated
as linked child issues.

That omission creates a cycle:

1. the epic cannot leave Plan because the decomposition guard still says
   `must-split`;
2. a child cannot enter Plan because its parent epic has not reached Develop;
3. the waiver is inapplicable because the epic does have nested children.

The decomposition classification is not wrong. It describes the structure of the
accepted plan. The missing behavior is a Plan-exit success path for a completed,
traceable WBS.

## Governing Workflow

When an epic's accepted plan contains a defined WBS, the first deliverable of the
epic's Plan stage is to create that WBS as immediate linked children. The epic's
deep dive covers the plan, WBS, ordering, metadata, and structural relationships.

After the parent enters Develop, each child independently enters Plan and performs
its own current-repository deep dive over files, tests, interfaces, dependencies,
and risks. Parent WBS admission must not require those child deep dives early.

`split-plan --confirm` remains a sanctioned way to create the children, but command
execution is not authoritative evidence. The live issue graph and pinned plan
provenance are authoritative.

## Decision

For a `must-split` issue, the decomposition Plan-exit guard admits the issue when
either:

1. the existing complete Decomposition Waiver is valid; or
2. the issue is an epic and its live immediate-child graph faithfully covers the
   accepted plan's numbered WBS.

`decompose-check` continues to report the underlying `must-split` classification.
It does not rewrite the plan's classification to `story-ok` after children exist.

## WBS Coverage Contract

The guard extracts the numbered tasks from the same resolved plan text used for
decomposition classification. It then fetches the epic's immediate sub-issues,
including each child's title and body.

Every expected WBS task must have exactly one child whose visible `Plan Metadata`
contains:

- `Source-plan` equal to the resolved accepted-plan path;
- `Source-plan-section` equal to the task's full numbered heading;
- `Source-plan-commit` naming a readable revision of that source plan.

The child's title must match the task title after the existing plan-extraction
normalization. The plan bytes at `Source-plan-commit:Source-plan` must be identical
to the accepted plan bytes used by the guard. Commit SHA equality is insufficient:
equivalent rebased or review commits are accepted when the file content is the
same.

Coverage is successful only when every expected task has one matching child.
Children that refer to another source plan do not satisfy coverage. A child that
claims the accepted source plan but names an unknown section is a contradiction
and blocks admission. Duplicate claims for one section also block admission.
Unrelated children may coexist, but they cannot substitute for any WBS task.

The `Generated-by` field is informational and is not part of admission. This keeps
the rule about resulting structure rather than one command implementation.

## Architecture

Add a focused, pure reconciliation unit adjacent to the decomposition policy. It
accepts already-extracted plan tasks, accepted plan path and bytes, child records,
and an injected plan-at-commit reader. It returns a structured result containing:

- `ok`;
- expected and covered task counts;
- matched child/task pairs;
- missing task headings;
- duplicate section claims;
- provenance mismatches;
- unknown section claims.

The unit performs no GitHub, filesystem, Git, or body mutation itself.

The decomposition Plan-exit guard owns orchestration:

1. classify the issue and resolve the accepted plan as today;
2. preserve the existing waiver path;
3. verify the issue kind is `epic`;
4. fetch immediate children through an injectable dependency;
5. read unique child plan revisions through an injectable dependency;
6. invoke the pure reconciler;
7. admit on complete coverage or return precise blockers.

Default dependencies use GitHub GraphQL for immediate sub-issues and `git show`
for pinned plan bytes. Tests inject both boundaries.

The existing `plan-exit-epic-children-r4p-or-beyond` guard remains responsible for
child lifecycle state. The decomposition guard proves that the WBS exists and is
traceable; the epic-children guard proves that every child is at least Ready for
Planning.

## Failure Behavior

The guard fails closed for `must-split` when it cannot prove coverage. Its blockers
name actionable discrepancies, including:

- missing WBS task headings;
- duplicate child claims with issue numbers;
- title mismatch for a claimed section;
- missing or unreadable source-plan provenance;
- pinned plan content mismatch;
- a child claiming an unknown section of the accepted plan;
- a non-epic `must-split` issue without a waiver;
- GitHub or Git dependency failure.

No failure path edits issue bodies, creates children, changes state, or fabricates
a completion marker.

## Compatibility

- `story-ok` remains a quiet pass.
- `needs-decomposition-review` remains warning-only.
- complete Decomposition Waivers remain accepted with their existing warning.
- incomplete waivers remain blocking.
- `decompose-check` output and exit classification remain unchanged.
- `split-plan` proposal and creation behavior remain unchanged.
- accepted #1268 specification and plan files remain unchanged.
- #1272 remains outside #1268 and #1279.

## Testing

Strict TDD begins in
`scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs`.
Focused tests cover:

1. RED: a complete six-task epic WBS is still refused by the current guard;
2. complete one-to-one WBS coverage passes;
3. matching file content at a different commit is accepted;
4. missing task coverage blocks with the missing heading;
5. duplicate section claims block with both child numbers;
6. incorrect path, unreadable commit, and different file content block;
7. unknown section and title mismatch block;
8. unrelated children cannot satisfy a task but may coexist;
9. a non-epic `must-split` issue remains blocked;
10. existing waiver, review-only, story-ok, and missing-plan cases remain unchanged;
11. guard ordering and the separate epic-child readiness guard remain intact.

Focused verification is:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs \
  scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs
```

Repository Develop verification is:

```bash
node scripts/task-tracker/verify-develop.mjs
```

## Out of Scope

- changing #1268's accepted design or implementation plan;
- requiring child deep dives before the parent enters Develop;
- making `split-plan --confirm` history authoritative;
- accepting child count or title similarity without provenance;
- changing epic delivery, final reconciliation, or archive naming;
- folding #1272 into #1268;
- pushing, merging, rebasing, force-updating, or opening a pull request.
