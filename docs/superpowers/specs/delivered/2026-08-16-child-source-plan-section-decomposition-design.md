# Child Source-Plan Section Decomposition Design

**Issue:** #1281  
**Discovered during:** #1273 in epic #1268  
**Status:** Approved by the operator's governed full-auto authorization and the accepted #1268 WBS semantics  
**Date:** 2026-08-16

## Problem

`split-plan` gives every generated child a `Source-plan` and the exact numbered
`Source-plan-section` that defines the child's work. The decomposition evaluator
currently resolves the source plan file but ignores that section claim. It passes
the entire parent plan to `classifyDecomposition`, so #1273 is reported as a
six-task, six-verification-group `must-split` issue even though it represents only
Task 1.

The earlier #1279 repair correctly admits a `must-split` epic after its WBS is
instantiated. It intentionally keeps a genuine non-epic `must-split` issue
blocked. The remaining defect is therefore the input supplied to classification,
not the non-epic guard.

## Governing Workflow

The epic owns the accepted plan's complete WBS. Creating the linked children is
the structural deliverable of the epic's Plan stage. After the epic reaches
Develop, each child enters Plan independently and performs its own current-tree
deep dive. A generated child may retain the parent plan as provenance, but its
decomposition decision must be scoped to the one WBS section assigned to it.

## Decision

When the active linked plan metadata key is `Source-plan` and the issue contains
one visible, substantive `Source-plan-section`, AITM selects exactly one task from
the resolved plan whose canonical `task.heading` equals the claim. Only that task
heading and body are passed to `classifyDecomposition`.

Whole-plan classification remains the default when:

- an explicit `--plan` override is supplied;
- `Implementation-plan` or `Plan` wins the existing metadata precedence;
- `Source-plan-section` is absent.

This preserves standalone plans and legacy source-plan users. A generated child
with an omitted section will therefore retain today's conservative whole-plan
classification rather than receiving an implicit waiver.

## Selection Contract

Add a pure policy function that receives the issue body, resolved plan text, and
the active metadata key. It returns the effective plan text plus a structured
selection record.

For a requested source section:

- exactly one visible `Source-plan-section` field must exist;
- its value must be substantive;
- exactly one extracted task must have the same canonical heading;
- the selected text is that task's heading followed by its preserved body bytes.

Duplicate metadata fields, an unknown heading, or duplicate matching task
headings are invalid. They do not fall back to whole-plan or `story-ok`.

## Fail-Closed Behavior

The evaluator exposes the section-selection result alongside classification.
The Plan-exit guard refuses an invalid requested selection before interpreting
classification, and its blocker names `Source-plan-section` plus the exact
problem. `decompose-check` returns a non-zero decomposition exit for the same
invalid selection and includes the diagnostic in text and JSON output.

This invalid-selection rule is intentionally narrower than existing missing-plan
behavior. A missing plan may remain warning-only for a small legacy issue, while
an explicit but contradictory child section claim is a provenance error and
blocks.

## Architecture

`decomposition-policy.mjs` owns visible metadata enumeration, linked-plan key
selection, and pure task-section selection. It already owns Markdown masking and
task extraction, so no second Markdown parser is introduced.

`decomposition-plan-exit-guard.mjs` records which linked metadata key won,
applies the pure selector to the single plan snapshot, and classifies the
effective text. It blocks invalid selection before the existing waiver, epic WBS,
review-only, and story-ok branches.

`decompose-check.mjs` derives its exit code from both genuine `must-split` and an
invalid requested selection. No issue body or plan file is mutated by evaluation.

## Compatibility

- Epic whole-plan classification and #1279 WBS reconciliation are unchanged.
- Genuine non-epic `must-split` plans remain blocked.
- `Implementation-plan` retains precedence over stale source-plan metadata.
- Explicit plan overrides continue to classify the complete override.
- A missing `Source-plan-section` does not opt an issue into section scoping.
- No accepted #1268 specification or plan file changes.
- #1272 remains outside scope.

## Testing

Strict TDD covers the pure policy first, then guard and CLI integration:

1. select one task from a six-task source plan and classify one task;
2. preserve whole-plan behavior for absent section, implementation-plan, and
   explicit override inputs;
3. reject duplicate section fields, unknown headings, and duplicate task
   headings;
4. admit a bounded non-epic child that previously reported `must-split`;
5. block an invalid requested section even when size and estimate are otherwise
   small;
6. retain the existing non-epic `must-split`, epic WBS, waiver, review-only, and
   story-ok cases;
7. make `decompose-check` report one task for the bounded child and a non-zero
   exit for invalid selection.

Focused verification:

```bash
node --test scripts/tests/unit/task-tracker/lib/decomposition-policy.test.mjs
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs
```

Repository verification:

```bash
node scripts/task-tracker/verify-develop.mjs
```

## Out of Scope

- waiving decomposition for #1273 through #1278;
- changing split-plan child creation or #1279 epic WBS reconciliation;
- requiring child deep dives before parent admission;
- implementing any co-review feature from #1268 Tasks 1 through 6;
- changing the accepted #1268 specification or plan;
- including #1272;
- pushing, merging, rebasing, force-updating, or opening a pull request.
