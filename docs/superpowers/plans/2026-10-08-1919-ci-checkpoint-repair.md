# #1919 UTC and Validation Budget Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan inline, preserve the retained production corrections, and obtain one fresh branch review after verification.

**Goal:** Qualify the retained UTC producer and synchronous DATA-validation corrections through #1919's real focused verifier and unchanged Linux budgets.

**Architecture:** Work on feature/epic/1918/child/1919, based on parent commit 22315b6a1dae616b6f55a4533b5cb202d7fc2f9c. The ownership hierarchy is #1847 → #1855 → #1918 → #1919. Existing public/native fixtures exercise the original emitter, actor validation, source correction, restart and current-source checks. Reuse those complete cases in isolated subprocesses rather than invent another transition adapter or authority constructor.

**Tech Stack:** Node.js 26, node:test, native subprocess execution, existing repository sandbox fixtures, and exact-head Linux CI.

**Spec:** docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md; bounded child Scope in GitHub issue #1919.

## Scope

Preserve and qualify only the UTC signed-zero producer correction and synchronous DATA-validation work in audit-timing.mjs, schema.mjs and records.mjs. Add the already-declared missing focused checkpoint verifier. Do not reimplement headless actor lifetime changes, alter transition tails, replace real fixtures with mocks, or claim inherited CI failures fixed by unrelated local success.

## Context and baseline evidence

The committed #1855 checkpoint 14f6c5589724e9d2a33c2353c19f0c793bfe6033 produces the native phase offset by negating getTimezoneOffset; UTC produces negative zero and its original Linux job reports canonical-json:invalid:number. The retained parent source uses subtraction from positive zero and preserves the strict raw-negative-zero validator. The actual UTC phase-11 case passed locally in about 72 seconds; its existing timeout remains 600000ms.

The retained schema suite passed all 19 cold/warm, mutation, recovery, accessor, throw and real-await cases. The existing linked-plan source suite passed all five genuine native source/approval/drift cases. These are pre-implementation observations on the retained source, not exact-head child delivery or Linux evidence.

The declared focused checkpoint file is absent. On this installed Node version, the declared two-path command nevertheless runs only the 19 schema cases and exits zero. That result cannot prove the UTC or linked-source obligations. The new checkpoint entrypoint must visibly execute those behaviors and refuse zero selected tests.

The inherited failing Linux job is run 37724695483, integration job 113140086190, at checkpoint 14f6. Its log reports 92 failing files, including native actor/phase failures. It reports the linked-source transaction file passing in 173.3 seconds and the basic linked-source file passing in 7.5 seconds. Preserve that distinction; do not fabricate a historical timeout from this job. The first repair still must qualify current Linux execution under the unchanged budget.

## Global Constraints

- Node.js scripts and Markdown only; no compiled binaries/addons.
- Preserve original algorithms, current-source/authority checks, input identity, errors, and lock/resource ordering.
- Successful DATA validation may be reused only inside one synchronous validation call. Never cache authority or readiness across awaits, effects, returns, throws or later observations.
- Never delete tests, shrink fixtures, raise timeouts, weaken raw-zero refusal, or copy prior receipts onto new HEADs.
- Keep the existing 600000ms per-file and semantic-section budgets, 20-minute verifier ceiling, and 45-minute lifecycle sandbox budget.
- Preserve all six live Verification Commands, including npm test, slow, lint, format and commit-trail obligations. Report inherited failures by name and scope; no global-green claim without actual evidence.
- Re-estimate from incremental work only; any individual forecast at or above 24 human hours must split again.

## Plan Metadata

- Issue: #1919
- Parent-epic: #1918
- Ancestors: #1855, #1847
- Priority: P1
- Size: M
- Refine estimate: 6 prospective human hours, excluding prior implementation and passive CI
- Source base: 22315b6a1dae616b6f55a4533b5cb202d7fc2f9c
- Native blocker: #1854, already closed

## Story Intent

- **Beneficiary:** delivery owner
- **Capability:** restore the existing actor and linked-source checks without relaxing validation
- **Need:** the preserved local checkpoint contains corrections that have not been published or qualified on Linux
- **Value or failure prevented:** the first repair can demonstrate bounded CI progress over the exact published baseline

## Review Focus

- UTC is canonical positive zero while caller-supplied negative zero still refuses through real actor/schema validation.
- Chicago control uses the same original phase-11 case; a wrapper must not overwrite its requested timezone back to UTC.
- Warm DATA validation preserves original objects, accessors, error types, changed/repaired inputs and cleanup at return/throw/await.
- The new focused entrypoint runs actual complete owned cases, detects empty selection, isolates mutable test globals, and respects original budgets.
- Historical Linux failures and current local passing cases remain separate from new exact-head Linux CI and full-suite results.

## Implementation Tasks

### Task 1: Qualify the retained repairs through the missing checkpoint entrypoint

#### Story Intent

- **Beneficiary:** delivery owner
- **Capability:** execute the UTC, actor, linked-source and schema qualification contract on the retained repair HEAD
- **Need:** the missing checkpoint file lets the declared command run only schema coverage
- **Value or failure prevented:** a zero exit cannot silently claim behaviors that never executed

**Files:**

- Create: scripts/tests/integration/task-tracker/lib/criteria-revision-ci-checkpoint-repair.test.mjs
- Reuse: scripts/tests/integration/task-tracker/lib/native-actor-candidate-capture.test.mjs
- Reuse: scripts/tests/integration/task-tracker/lib/native-stage-phase-11-prefix-after-intent-write.test.mjs
- Reuse: scripts/tests/integration/task-tracker/lib/native-linked-plan-source.test.mjs
- Reuse: scripts/tests/integration/task-tracker/lib/native-linked-plan-source-transaction.test.mjs
- Preserve: scripts/tests/unit/task-tracker/lib/criteria-revision/schema.test.mjs
- Inspect; change only if an owned regression requires it: scripts/task-tracker/lib/move-state/audit-timing.mjs, scripts/task-tracker/lib/criteria-revision/schema.mjs, scripts/task-tracker/lib/criteria-revision/records.mjs

**Interfaces:** Consume original Node test entrypoints and retained source. Produce a focused verification entrypoint with real UTC and Chicago phase behavior, raw-zero/actor refusal and complete linked-source behavior. It must not become another production adapter or construct mutation authority.

- [ ] **Step 1: Record the unfulfilled verification contract.** Run the live VC and verify the checkpoint file's absence. Expected: file presence check fails; VC currently executes only 19 schema tests. Record that the existing production corrections already pass owned local cases; do not delete or rewrite them to manufacture a red test.
- [ ] **Step 2: Add the focused entrypoint.** Run the complete native actor capture file under UTC, the original phase-11 case under America/Chicago, and complete basic/transaction linked-source files in isolated subprocesses. Assert actual subprocess success and nonzero complete-case counts. Use unchanged budgets and original fixtures. The source mutation this catches is returning to signed-negative-zero production, weakening raw-zero refusal, or breaking current/source/restart validation.
- [ ] **Step 3: Run the declared focused VC.** Expected: the checkpoint behaviors actually execute and the 19 schema cases pass. Any failure receives source-backed diagnosis inside the owned three production surfaces before claiming repair.
- [ ] **Step 4: Qualify exact child HEAD on Linux and run ordinary required checks.** Preserve actual failures and ownership; do not mark aggregate CI green from focused success. The same source cases must pass their unchanged budget on actual CI Node/Linux.
- [ ] **Step 5: Commit and review.** Commit with #1919 attribution, retain current-HEAD evidence, request a fresh branch review, and report CODE_COMPLETE only when its declared completion obligations actually hold.

**Verification Commands:**

Run: `node --test scripts/tests/integration/task-tracker/lib/criteria-revision-ci-checkpoint-repair.test.mjs scripts/tests/unit/task-tracker/lib/criteria-revision/schema.test.mjs`

Expected: checkpoint cases plus all 19 schema cases pass; no empty selected profile.

Run: `npm test`

Run: `npm run test:slow`

Run: `npm run lint`

Run: `npm run format:check`

Run: `git log --oneline -1`

Expected: actual declared checks pass on the accepted HEAD, or concrete inherited failures remain explicitly reported and unclaimed. Configured exact-head CI receipts can cover declared full-suite commands only through the repository's legitimate verification-provider contract.
