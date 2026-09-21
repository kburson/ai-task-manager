# #1663 Authority Evaluation Split Implementation Plan

> **Status:** Proposed revision of accepted WBS 11, pending semantic peer review. This document does not authorize implementation, issue hydration, or a size waiver.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans after this plan is accepted and the governed child is approved.

**Goal:** Split the newly forecast 27-hour #1663 into two ordered, independently verifiable children below the accepted mandatory 24-hour/four-unit threshold, without weakening complete guard evaluation or the atomic promote mutation-channel migration.

**Architecture:** First establish a fresh, immutable, read-only observation attempt with typed provenance and fail-closed collection. Then consume that attempt in a complete shared evaluator, including two-pass policy enrichment, bounded refresh, and the simultaneous removal of the mutable refinement-plan side channel. Keep explanation free of effects and execution's fresh authority checks intact.

**Tech Stack:** Node.js ESM, `node:test`, the existing task-tracker action-decision and guard/workflow-policy modules.

**Spec:** `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-replacement.md`, Task 4; accepted WBS `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r2.md`, WBS 11; epic #1558 and child #1663. The original Task 4 contract and VC4 acceptance criteria remain authoritative; this revision changes only work ownership and sequence.

## Global Constraints

- This is an issue-specific split of #1663, not a second hydration of WBS 1–26. Any split tool must select only the two tasks below and create governed sub-issues under #1663. The existing #1664–#1677 sequence remains intact; both new children finish before #1664 begins.
- This plan needs a semantic peer-review acceptance record, governed issue hydration, per-child deep dive/forecast/plan approval, and #1663 parent disposition before implementation. Do not treat a green parser or draft as acceptance.
- Preserve original Task 4's complete-result semantics, all arrays, known refusals, warning and human-request lanes, provenance, no-effect assertion, bounded collection/refresh, and fail-closed pending adapters. A partial evaluator cannot advertise ready.
- The review should validate estimates and the boundary: proposed 8 hours for observation collection and 19 hours for evaluator/mutation parity, totaling the current 27-hour forecast. Each has fewer than four independently owned units; re-estimate before hydration and split again if either reaches a threshold.
- Run each child with #1558 orchestrator and exact child binding, source-only tests with the local self-link `node_modules/ai-task-manager -> ..`, review/merge-back into `feature/epic/1558`, then close in rank order. Never implement directly on the epic branch.

### Task 1: Collect immutable read-only authority observations

#### Story Intent

- **Beneficiary:** lifecycle-action operator
- **Capability:** collect a current provenance-bearing immutable observation attempt without effects or cross-command reuse
- **Need:** guard and policy inputs must be identifiable complete and compatible before a readiness predicate consumes them
- **Value or failure prevented:** missing reads mismatched identities and effect attempts cannot masquerade as ready authority

#### Files and implementation

**Estimate and units:** 8 hours; observation/provenance and typed failure boundary (4 h); read-only and no-effect tests plus handoff contract (4 h).

**Files:** Create `scripts/task-tracker/lib/action-decision/observations.mjs` and `scripts/tests/unit/task-tracker/lib/action-observations.test.mjs`. Add narrowly scoped read-only seams to `scripts/task-tracker/lib/workflow-policy/{enforcement,preflight,snapshot}.mjs` as required. Do not migrate `runGuards.finish()` or `verbs/promote.mjs` in this child.

**Handoff:** Export `createObservationAttempt` with explicit repository, issue, resource, scope and boundary identity. It memoizes read-only observations only within one attempt and records the observation window and canonical content digest including normalization inputs. Return typed unavailable/incompatible results with cause provenance, not a default-ready object. Task 2 owns complete guard orchestration and all action status decisions; this task cannot certify parity or perform a mutation.

- [ ] **Step 1 — Add failing observation tests.** Cover one-attempt reuse, changed identity/scope, required read failure, incompatible body/repository/issue, missing source, and attempted local/Git/network effects recorded in an outer ledger before any caught exception. A forbidden fetch is asserted from harness `finally` independently of normalized status. `AITM_GUARD_FORCE_THROW` is a separate hook fault case, not evidence of an attempted effect.
- [ ] **Step 2 — Run the focused tests RED.** Confirm missing observation interface and failing no-effect/identity assertions, not a syntax or fixture failure.
- [ ] **Step 3 — Implement the smallest read-only collector.** Local file/Git reads and read-only network calls may observe fresh authority. Do not write locks, sessions, refs, object store, tracked files, remote resources or providers. Do not cache live authority across commands, fetch in explanation, or expose an executable capability. A failed required observation has a named indeterminate cause; skipped guards are not marked passed.
- [ ] **Step 4 — Run focused tests GREEN and hand off.** Document the exact observation contract and source provenance for Task 2. A pending adapter must remain pending; do not attach a universal-ready or universal-indeterminate placeholder to the public registry.

**Verification Commands:**

Run: `node --test scripts/tests/unit/task-tracker/lib/action-observations.test.mjs`

**Acceptance criteria:** Immutable, provenance-complete, read-only observations fail closed on unavailable or incompatible evidence; effect-attempt tests inspect the out-of-band ledger independently of caught exceptions. No action claims readiness or shares authority across attempts.

### Task 2: Evaluate complete guards and preserve mutation parity

#### Story Intent

- **Beneficiary:** lifecycle-action operator
- **Capability:** derive complete current readiness through shared executor guards and consume promote data without context mutation
- **Need:** explanation and mutation must agree on blockers exception policy bounded refresh and the final guard result under fresh authority
- **Value or failure prevented:** omitted blockers stale observations partial second passes and lost refinement plans cannot authorize or corrupt a transition

#### Files and implementation

**Estimate and units:** 19 hours; complete evaluator and conditional policy pass (8 h); bounded refresh and provenance parity (5 h); atomic derived-result/promote migration and regression verification (6 h).

**Dependencies:** Task 1 is accepted and merged into the #1558 epic branch first. Complete this child and #1663's parent disposition before the next WBS child #1664.

**Files:** Create `scripts/task-tracker/lib/action-decision/evaluate.mjs` and `scripts/tests/integration/task-tracker/lib/action-evaluator.test.mjs`. Modify `scripts/task-tracker/lib/move-state/guard-execution.mjs`, `scripts/task-tracker/lib/guard-registry.mjs`, `scripts/task-tracker/verbs/promote.mjs`, `scripts/task-tracker/lib/guard-adapters-entry-fields.mjs`, `scripts/task-tracker/states/index.mjs`, and any Task 1 read-only workflow-policy seam needed for shared predicates. Update stale context-mutation comments/tests. Consume, do not redefine, Task 1's observation identity and digest.

- [ ] **Step 1 — Add failing complete-result tests.** Ready, blocked and indeterminate fixtures assert the entire guard output, warnings, requests, typed causes and derived result. Include baseline success with zero policy reads, genuine non-applicable exception, required policy read failure, thrown shared guard, unmapped refusal, changed repository/issue/body/scope, missing source and an attempted effect. Assert expected positive ready paths, not just refusals.
- [ ] **Step 2 — Run VC4-focused tests RED.** Freeze each pass's inputs. A separate `AITM_GUARD_FORCE_THROW` hook regression preserves its blocking-hook behavior; injected shared-evaluator throw produces `guard-error`/indeterminate and no effect; attempted effect produces `guard-effect-forbidden` and an outer-ledger failure.
- [ ] **Step 3 — Implement the complete shared evaluator.** Evaluate every guard on baseline observations. Only qualifying baseline refusals select required policy enrichment; collect it once and re-evaluate the whole guard set on the frozen enriched attempt, returning only the final replacement result, never a union of provisional and final blockers. Keep typed collection errors, legitimate exception semantics, known final refusals and normalization inputs. If a preflight helper is effectful, split read-only evidence collection from its predicate; do not call it unchanged from explanation.
- [ ] **Step 4 — Preserve bounded refresh and execution authority.** Pre-Refine contiguity refresh replaces superseded body observations and re-runs all predicates affected by the change. Failure/incompatible identity is indeterminate. Invalidate attempts on effects, retries, scope changes and delegated subprocess boundaries. Execution still refreshes independently; explanation never authorizes later mutation. Read-only remote-tip attribution, if exposed here, requires complete local object traversal and exact-tip provenance; missing history remains indeterminate, never a fetch in explanation.
- [ ] **Step 5 — Atomically migrate the derived result and its consumer.** Remove `Reflect.set(ctx, 'refinementPlan', ...)` from `runGuards.finish()` while changing `verbs/promote.mjs` to consume only final `guardResult.derived?.refinementPlan`; preserve `applyRefinementEstimate` after success. Test frozen context, returned derived plan, promoted estimate, lower-mutator parity and absence of another mutable write-through channel in the same commit. Never land one half alone.
- [ ] **Step 6 — Verify VC4 and commit.** Check explanation no-effect boundaries, execution parity, full result preservation, post-extraction request counts and no duplicate physical read within an attempt. Keep downstream per-action collectors in their assigned WBS tasks; unconverted adapters cannot claim parity. Run fast tests, slow tests and lint according to the governed test gate.

**Verification Commands:**

Run: `node --test scripts/tests/unit/task-tracker/lib/action-observations.test.mjs scripts/tests/integration/task-tracker/lib/action-evaluator.test.mjs`

**Acceptance criteria:** Original Task 4 VC4 acceptance criteria hold as a whole after both children: complete guards, conditional enrichment, provenance and contiguity refresh share one read-only evaluation path with mutation; unavailable or malformed authority never becomes ready; bounded reuse does not remove fresh execution checks; the promote derived-result migration is atomic.
