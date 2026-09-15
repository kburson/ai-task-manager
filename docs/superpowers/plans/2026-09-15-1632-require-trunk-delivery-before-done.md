# #1632 Require Trunk Delivery Before Root Done — Implementation Plan

> Implement test-first. Each production change follows a focused failing test,
> then the smallest code change that satisfies the corrected delivery contract.

**Goal:** Prevent a root epic or standalone feature branch from reaching Done
without authoritative delivery to configured trunk, while preserving nested
parent-integration and true no-commit artifact lanes.

**Architecture:** Tighten both close authorities. The receipt gate decides
whether an issue requires a correlated merged PR; the lineage gate decides which
parent branch must contain the deliverable. Root epics require both a trunk PR
receipt and a derived child trail on trunk.

**Runtime:** Node.js ESM, `node:test`, GitHub CLI adapters, injectable pure gate
dependencies.

## Task 1: Characterize the false-Done receipt path

**Files:**

- Create: `scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs`
- Test: `scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs`

Add a #1624-shaped gate fixture with an epic body, root lineage, feature branch,
accepted SHA, posted deliverable/no-commit record, no PR, and Full-Auto review
authority. Assert that the current receipt classifier returns the permissive
no-commit result, then change the expected behavior to refusal and confirm the
test fails before production code changes.

Run:

`node --test scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs`

## Task 2: Require a PR receipt for root epics

**Files:**

- Modify: `scripts/task-tracker/lib/close-delivery-receipt.mjs`
- Modify: `scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs`

Add a narrow lineage-aware no-commit predicate. Preserve no-commit artifact
receipts for non-epic kinds. Preserve the existing parent-integration return for
nested epics. Make a root epic fall through to the ordinary PR validation path.

Add regressions for audit/spike artifact delivery, nested epic delivery, and the
operator-authorized local-trunk lane. Confirm a root epic refuses no PR, open PR,
wrong base, wrong head, and absent/corrupt receipt evidence.

Run the focused test until green.

## Task 3: Prove root epic child history on trunk

**Files:**

- Modify: `scripts/task-tracker/lib/close-gates-lineage.mjs`
- Modify: `scripts/task-tracker/lib/close-gates.mjs`
- Modify: `scripts/task-tracker/lib/close-gates-lineage.test.mjs`

First update the unit expectations so a root epic resolves trunk and a nested
epic resolves its parent epic branch; confirm the current implementation fails.
Then pass `resolveDoneTargetBranch()`'s result to `epicDerivedTrailGate()` rather
than using the epic branch whenever it exists. Keep missing-branch walk-up and
delivery-exempt child behavior intact.

Update comments and result naming to describe a parent delivery target rather
than an epic-local success condition.

Run:

`node --test scripts/task-tracker/lib/close-gates-lineage.test.mjs scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs`

## Task 4: Exercise the close boundary

**Files:**

- Modify: `scripts/tests/integration/task-tracker/verbs/close-trunk-delivery-gate.test.mjs`
- Reference: `scripts/task-tracker/verbs/close.mjs`

Use the close harness at the narrowest level that observes ordering. Assert the
missing-PR failure occurs before delivered-close creation, board movement, issue
closure, label cleanup, or binding release. Add a success case using an exact
merged PR and valid receipt whose fresh verifier reports trunk delivery.

Avoid duplicating delivery-verification arithmetic already covered by the
delivery receipt suites; the new test owns the terminal non-mutation invariant.

## Task 5: Update operator documentation

**Files:**

- Modify: `docs/guides/workflow.md`
- Modify other directly affected help/tests only when a focused contract test
  proves the current wording is wrong.

Document that a root epic's parent target is trunk, that root Done is PR-gated,
and that `aitm-deliverable-posted` is not delivery authority for a root epic.
Retain the documented child-to-parent integration behavior.

## Task 6: Verify and commit

Run the issue-specific test, then:

1. `npm run format:check`
2. `npm run lint`
3. `npm test`
4. `npm run test:slow`
5. `git diff --check`
6. `git status --short`

Commit with the issue token, post the governed commit trail, and promote through
Test and Review using exact-SHA receipts.

## Task 7: Deliver #1632 and recover #1624

Publish the #1632 branch, open its governed PR to trunk, wait for required CI,
and merge through `/task deliver`. Verify the merged result on `origin/trunk`
before closing #1632.

Then publish the preserved `feature/epic/1624` history without rewriting its
accepted content, open and merge a governed recovery PR to trunk, and verify the
resulting trunk tree and delivery record. Reopen/reconcile #1624 only through the
supported recovery commands. Do not manufacture a historical receipt.

Finally execute #1633's reproducible 14-day survey and create recovery issues for
every false-Done or indeterminate result.
