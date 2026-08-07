# Epic Metadata Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Epic-conversion path converge the body marker, Epic DoD, label, and title prefix without later workflow rollback.

**Architecture:** A pure planner derives canonical Epic visible metadata, while a guarded reconciler applies body, label, and title changes through injected adapters. Explicit conversion, first-child linking, and workflow repair share that authority.

**Tech Stack:** Node.js ES modules, `node:test`, GitHub GraphQL/REST adapters, AITM `mutateIssueBody`.

## Global Constraints

- Preserve non-Epic kind-prefix behavior and every unrelated label.
- Route issue-body changes through `mutateIssueBody`.
- Fail closed on incomplete carrier convergence; retries must be idempotent.
- Produce exactly one final `[#1130]` commit for the complete story.

---

### Task 1: Define the Epic desired-state planner

**Files:**

- Create: `scripts/gh/lib/epic-metadata.mjs`
- Modify: `scripts/gh/lib/kind-prefix.mjs`
- Test: `scripts/task-tracker/tests/unit/gh/lib/epic-metadata.test.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/beta-report-title-reconcile.test.mjs`

**Interfaces:**

- Produces: `planEpicMetadata({ title, labels, body, forceEpic })` returning normalized labels, desired title, and missing writes.
- Produces: `reconcileEpicBody(body, templateDodText)` returning the marker/DoD-converged body.

- [x] Write tests proving marker/force detection, label insertion, title precedence, body DoD reconciliation, and repeat-call idempotency.
- [x] Run `node --test scripts/task-tracker/tests/unit/gh/lib/epic-metadata.test.mjs scripts/task-tracker/tests/unit/lib/beta-report-title-reconcile.test.mjs` and confirm the expected missing-module/missing-Epic behavior failures.
- [x] Implement the minimal pure planner and add `epic` to the canonical prefix authority.
- [x] Re-run the focused tests and confirm they pass.

### Task 2: Converge explicit and first-child conversions

**Files:**

- Modify: `scripts/gh/lib/epic-retitle.mjs`
- Modify: `scripts/task-tracker/verbs/kind.mjs`
- Test: `scripts/task-tracker/tests/unit/gh/lib/epic-retitle.test.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/coverage-kind.test.mjs`

**Interfaces:**

- Consumes: the Task 1 planner/body transform.
- Produces: `reconcileEpicMetadata(...)`, plus the backward-compatible `ensureParentEpicTitle(...)` adapter.

- [x] Add tests proving explicit conversion delegates once and first-child linking writes missing body, label, and title carriers.
- [x] Run the two adapter test files and confirm failures identify the old split behavior.
- [x] Implement injected live-state reads and guarded body/label/title writes, preserving the existing export and non-Epic path.
- [x] Re-run the adapter tests and confirm idempotent no-op behavior after convergence.

### Task 3: Make workflow reconciliation self-healing

**Files:**

- Modify: `.github/workflows/label-beta-report.yml`
- Test: `scripts/task-tracker/tests/unit/core/beta-report-templates-497.test.mjs`
- Test: `scripts/task-tracker/tests/unit/lib/beta-report-title-reconcile.test.mjs`

**Interfaces:**

- Consumes: `planEpicMetadata` from Task 1.
- Produces: event-driven restoration of a removed Epic label and preservation of the Epic prefix.

- [x] Add structural and pure tests covering `opened`, `edited`, `labeled`, and `unlabeled` repair from the durable marker.
- [x] Run the workflow/core tests and confirm the current workflow fails the Epic assertions.
- [x] Update the workflow to compute the shared plan, add only missing labels, and reconcile the planned title.
- [x] Re-run the workflow/core tests and confirm all non-Epic assertions remain green.

### Task 4: Verify and commit the complete story

**Files:**

- Verify all files listed above.

- [x] Run the issue's targeted five-file verifier.
- [x] Run `npm run lint` and `npm run format:check`.
- [x] Run `npm test` and `npm run test:slow`.
- [x] Inspect `git diff --check`, the exact diff, and `git status`.
- Commit command: `git commit -m "[#1130] fix: reconcile epic metadata"`.
