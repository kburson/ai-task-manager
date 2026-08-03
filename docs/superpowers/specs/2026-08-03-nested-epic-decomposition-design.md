# Nested-Epic Decomposition Design

**Issue:** #1052  
**Status:** Approved under explicit Full-Auto authority  
**Date:** 2026-08-03

## Problem

AITM currently enforces issue structure, lifecycle order, and review evidence,
but it does not enforce delivery granularity. An issue can reach Develop even
when its Size, Estimate, implementation plan, and independent verification
groups show that it is really a family of stories.

Issue #1049 demonstrated the cost: one child story carried seven substantial
task groups, repeated RED/GREEN milestones, many commits, and an evidence bundle
too large for one human review. Parentage did not make the work atomic; the
child should itself have become a nested coordination epic.

Markdown guidance is insufficient. The workflow needs an executable
classification, a Plan-to-Develop gate, a visible exception record, and a
guided way to turn implementation-plan sections into sanctioned child issues.

## Goals

1. Classify a planned issue as `story-ok`, `needs-decomposition-review`, or
   `must-split` from deterministic Size, Estimate, plan-section, and verifier
   signals.
2. Block Plan to Develop for `must-split` unless a complete, visible waiver is
   present.
3. Keep review-only cases visible without blocking legitimate large stories.
4. Produce deterministic child drafts from numbered implementation-plan tasks.
5. Create confirmed children only through AITM's sanctioned issue creator.
6. Preserve parent, nested-epic, specification, plan, source-section, and commit
   provenance on every generated child.
7. Keep execution evidence on generated children rather than accumulating one
   monolithic evidence bundle on the source issue.

## Non-Goals

- Rewriting or splitting the historical #1049 branch.
- Automatically closing, superseding, relabeling, or retitling the source
  issue.
- Inferring useful child issues from unstructured prose with an LLM.
- Rolling back GitHub issues that were already created before a later child
  creation failed.
- Walking an entire ancestor tree during lifecycle enforcement.
- Adding a configuration UI for thresholds in this delivery.

## Selected Architecture

The feature is split into three independently testable units:

1. `decomposition-policy.mjs` is pure policy. It extracts plan signals,
   classifies work, resolves linked plan paths, and validates waiver sections.
2. `decomposition-plan-exit-guard.mjs` adapts the policy to AITM's guard
   registry. It performs only the I/O needed to obtain project values and plan
   text, then returns the standard guard result.
3. `split-plan.mjs` is a pure parser and draft renderer. A thin verb supplies
   issue/project data, writes scratch fragments, and delegates creation to
   `npx aitm create-issue`.

Thin CLI verbs expose `decompose-check` and `split-plan`. Existing command
routing, help, and impact-manifest authorities discover the commands in the
same way as other workflow verbs.

This is preferred over an inline `promote.mjs` implementation because policy
and rendering stay independently testable. It is preferred over advisory-only
commands because the Plan-exit guard makes `must-split` enforceable.

## Classification Inputs

The classifier accepts:

```js
classifyDecomposition({
  size, // "XS" | "S" | "M" | "L" | "XL" | null
  estimateHours, // finite non-negative number | null
  planText, // markdown string | ""
});
```

The command obtains Size and Estimate from `projectValuesForIssue`. Tests and
offline consumers can pass them directly. Missing values remain `null`; they
are never coerced to zero.

The linked plan path is read from the first substantive flat Plan Metadata
field in this order:

1. `Implementation-plan`
2. `Source-plan`
3. `Plan`

Field names are case-insensitive. A value may carry an optional commit suffix,
for example:

```text
docs/superpowers/plans/2026-08-03-example.md @ abc1234
```

Only the path portion is opened. It must resolve inside the repository root.
Absolute paths, traversal outside the root, directories, and unreadable files
produce an unavailable-plan diagnostic. `decompose-check --plan <path>`
overrides metadata resolution without mutating the issue.

## Plan Signals

Only exact level-three numbered headings count as task groups:

```markdown
### Task 1: Classifier

### Milestone 2: Confirmed creation
```

Matching is case-insensitive for `Task` and `Milestone`. The number must be a
positive integer and the title must be non-empty. Duplicate numbers are invalid
for split drafting. Other headings—including `## Task`, `#### Task`, and prose
that mentions a task—do not count.

Verification groups come from exact executable declarations inside each task:

- `Run: \`<command>\`` lines; and
- non-empty command lines in fenced blocks immediately owned by a bold
  `**Verification Commands:**` label.

Commands are trimmed and deduplicated within a task while preserving order.
A task with at least one extracted command is independently verifiable.

The classifier reports:

```js
{
  status,
  signals: [{ code, value, threshold }],
  taskCount,
  verificationGroupCount,
  tasks,
}
```

## Classification Rules

The defaults are fixed for this delivery:

| Signal                           | Review threshold |                     Must-split threshold |
| -------------------------------- | ---------------: | ---------------------------------------: |
| Size                             |             `XL` | `XL` plus at least 2 verification groups |
| Estimate                         |         16 hours |                                 24 hours |
| Numbered task/milestone sections |                3 |                                        4 |
| Independent verification groups  |                2 |            only in combination with `XL` |

Precedence is deterministic:

1. If any must-split rule fires, status is `must-split`.
2. Otherwise, if any review threshold fires, status is
   `needs-decomposition-review`.
3. Otherwise, status is `story-ok`.

Examples:

| Inputs                             | Result                       |
| ---------------------------------- | ---------------------------- |
| `M`, 8h, 2 tasks, 1 verifier group | `story-ok`                   |
| `XL`, 12h, no linked plan          | `needs-decomposition-review` |
| `L`, 18h, 2 tasks                  | `needs-decomposition-review` |
| `XL`, 12h, 2 verifier groups       | `must-split`                 |
| `L`, 24h, 2 tasks                  | `must-split`                 |
| `M`, 10h, 4 tasks                  | `must-split`                 |

## `decompose-check` Command

Public usage:

```text
npx aitm decompose-check <issue> [--plan <repo-relative-path>] [--json]
```

The command:

1. fetches the issue body;
2. reads live Size and Estimate;
3. resolves or overrides plan text;
4. classifies the issue;
5. parses any waiver; and
6. prints the effective decision.

Human output begins with exactly one status token:

```text
must-split #1052
```

It then lists the triggering signals, linked-plan diagnostic, and waiver
status. `--json` emits the stable result object without prose. Classification
is not a mutation and does not change board state or issue content.

Exit codes:

- `0`: `story-ok` or `needs-decomposition-review`;
- `3`: `must-split` without a valid waiver;
- `2`: usage error;
- `1`: issue/project read or unexpected runtime failure.

A valid waiver changes the effective decision to allowed but preserves the
underlying `must-split` classification in output.

## Visible Waiver

A waiver is a root-level section with exactly this minimum schema:

```markdown
## Decomposition Waiver

- **Rationale**: <why one story is safer>
- **Expected-focused-duration**: <positive hours, e.g. 12h>
- **Milestone-checkpoint-plan**: <reviewable checkpoint sequence>
- **Why-no-nested-children**: <why child issues add more risk than clarity>
- **Approved-by**: <reviewer identity>
- **Approved-at**: <ISO-8601 timestamp>
```

Labels are case-insensitive but normalize to the spelling above in diagnostics.
Values must remain on the same flat field line and must be substantive after
HTML comments are stripped. Expected duration accepts a positive numeric value
followed by `h`, `hour`, or `hours`. `Approved-at` must parse as a valid date.

Missing, duplicated, malformed, or nested fields make the waiver invalid. A
hidden marker alone is never a waiver. No environment variable bypass exists.

## Plan-to-Develop Guard

`decompositionPlanExitGuard` is registered in `plan.exitGuards`, before the
epic-children guard. It runs only for the standard Plan-to-Develop transition
because the registry controls its state slot.

Results:

- `story-ok`: `{ ok: true }` with no warning;
- `needs-decomposition-review`: `{ ok: true, warn }`, naming the signals;
- `must-split` plus valid waiver: `{ ok: true, warn }`, naming the waiver;
- `must-split` without valid waiver: `{ ok: false, reason, blockers }`.

The refusal ID is `plan-exit-decomposition`. `promote.mjs` maps it to
`decomposition-refused` so callers receive a stable structured status.

The guard uses dependency injection for issue body, project values, repository
root, and plan reads. A transient plan read failure does not invent task
signals; known Size/Estimate inputs can still classify the issue. If those
known inputs alone produce `must-split`, the guard refuses. Otherwise it emits
an unavailable-plan warning and permits the existing workflow.

## `split-plan` Command

Public usage:

```text
npx aitm split-plan <issue> --dry-run [--plan <path>] [--json]
npx aitm split-plan <issue> --confirm [--plan <path>]
```

Exactly one of `--dry-run` and `--confirm` is required.

The command refuses when:

- the plan is missing or unreadable;
- the classifier returns `story-ok`;
- there are no numbered Task/Milestone sections;
- any task number is duplicated;
- any task title is empty;
- any task has no executable verifier; or
- required provenance cannot be resolved.

### Source as nested coordination epic

The source issue becomes the coordination epic when generated children are
attached to it. The command does not retitle or relabel the source. AITM already
treats an issue with linked sub-issues as an epic for lifecycle gates, so the
relationship—not title decoration—is authoritative.

If the source already has a parent, that parent is recorded as the outer Parent
epic. Otherwise the source is recorded as both the parent and nested epic.

### Generated child fragments

Each task produces a `sub-issue` shape with:

- title: the task heading title;
- Scope: the task number, outcome, source plan, and bounded task-section text;
- Acceptance Criteria: one demonstrable outcome item citing every extracted
  verifier through canonical VC references;
- Verification Commands: extracted commands in source order;
- Story Origin: `kind=code`, source issue, and source plan section;
- Plan Metadata:
  - `Parent-epic`
  - `Nested-epic`
  - `Governing-spec`
  - `Source-plan`
  - `Source-plan-commit`
  - `Source-plan-section`
  - `Generated-by`

The governing specification defaults to this specification path when the
source metadata lacks a more specific field. The source plan commit is the
current `HEAD` resolved before any child is created and is pinned identically on
all proposals from one invocation.

### Dry-run

Dry-run performs no GitHub mutation. It returns deterministic proposal JSON and
preflights every generated child through:

```text
npx aitm create-issue --shape sub-issue ... --dry-run
```

The dry-run result includes the exact future live argv minus `--dry-run`, plus
the rendered fragments. This proves compatibility with the sanctioned creator
before an operator confirms.

### Confirm

Confirm first completes the same all-child preflight. Only after every draft
passes does it invoke the creator live, in source-plan order:

```text
npx aitm create-issue --shape sub-issue --parent <source> ...
```

It never invokes `gh issue create`, `gh issue edit --body`, or a project mutation
directly. The existing creator owns canonical body rendering, project tethering,
placeholder substitution, parent linkage, duplicate-child detection, and
assignee behavior.

If child N fails after earlier children were created, confirm stops. The error
contains:

- created child numbers and titles;
- the failed task number and title;
- the creator exit code and stderr summary; and
- instructions to inspect existing children before retrying.

Already-created children are not deleted. A retry relies on the sanctioned
creator's duplicate-child guard and requires explicit operator resolution.

## Evidence Scoping

Generated child issues own their task-specific AC and Verification Commands.
Their Test and Review receipts therefore remain bounded to one plan task. The
source coordination issue contains relationship and roll-up evidence only; the
command does not copy child verifier output into the source issue.

Existing epic reconciliation and immediate-parent lifecycle gates remain the
authority for aggregate readiness. No new root-walking gate is added.

## Command-Surface Integration

Both verbs are added to:

- `scripts/task-tracker/task-tracker.mjs` dispatch;
- `scripts/task-tracker/lib/command-surface/routing.mjs`;
- `scripts/task-tracker/lib/command-surface/catalog.mjs`;
- `scripts/task-tracker/verbs/help-data.mjs`; and
- the command relationship map where required.

Help must document usage, preconditions, effects, output, exit codes, examples,
and related commands. `npx aitm decompose-check help` and
`npx aitm split-plan help` must return without issue or network access.

## Test Strategy

### Policy tests

`scripts/task-tracker/tests/unit/lib/decomposition-policy.test.mjs` covers:

- all classification thresholds and precedence;
- XL plus multiple verifier groups;
- non-XL stories that remain unblocked;
- exact numbered-heading grammar;
- verification-group extraction and deduplication;
- linked-plan metadata resolution and traversal refusal;
- complete, incomplete, duplicated, and malformed waivers; and
- missing Size, Estimate, and plan inputs.

### Guard tests

`scripts/task-tracker/tests/unit/lib/decomposition-plan-exit-gate.test.mjs`
covers:

- `must-split` refusal and stable refusal ID;
- valid-waiver admission;
- `needs-decomposition-review` warning;
- `story-ok` no-op;
- known-field classification when plan loading fails;
- Plan-state registration order; and
- `promote.mjs` status translation.

### Split tests

`scripts/task-tracker/tests/unit/verbs/split-plan.test.mjs` covers:

- ordered task parsing;
- duplicate/malformed task refusal;
- missing-verifier refusal;
- child fragment and provenance rendering;
- canonical VC citation generation;
- dry-run zero mutation and exact creator preflight argv;
- confirm exact live creator argv;
- all-drafts-before-first-create ordering;
- partial-success stop behavior; and
- source-parent/nested-epic metadata for root and nested sources.

### Repository verification

The issue-specific targeted commands run first. Then the delivery runs lint,
format, fast tests, slow tests, and the governed `aitm test 1052` sandbox.

## Documentation

`docs/guides/sub-issue-nesting.md` gains:

- the executable classification thresholds;
- the visible waiver schema;
- dry-run and confirm examples;
- the source-as-coordination-epic model; and
- partial-success recovery guidance.

## Compatibility

- Existing `story-ok` Plan transitions remain unchanged.
- Existing XL issues with no plan receive review visibility, not an automatic
  block, unless their known Estimate is already at least 24 hours.
- No existing issue body is rewritten by classification.
- No configuration migration is required.
- The creator wrapper remains the sole GitHub issue-creation authority.

## Acceptance Mapping

| Issue criterion               | Design section                    |
| ----------------------------- | --------------------------------- |
| Executable three-state gate   | Classification, `decompose-check` |
| Pre-Develop enforcement       | Plan-to-Develop Guard             |
| Waiver format                 | Visible Waiver                    |
| Guided dry-run                | Split-plan Dry-run                |
| Confirmed sanctioned creation | Split-plan Confirm                |
| Complete Plan Metadata        | Generated child fragments         |
| Scoped evidence               | Evidence Scoping                  |
| Required test cases           | Test Strategy                     |
