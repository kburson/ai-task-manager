# Test Entry Readiness Implementation Plan

> **For agentic workers:** Follow this plan task by task with test-driven development and review checkpoints. The existing #1558 accepted WBS Task 14 remains the normative scope.

**Goal:** Explain whether Test may start without performing Test effects, and make execution recheck the same knowable requirements.

**Architecture:** Add a read-only Test collector over command-local authority observations and shared entry predicates. Route both direct Test and Develop-state Promote explanation through it. Keep locked execution, Develop finalization, board transitions, sandbox creation, verification, receipt writes, and runtime-result reporting in their existing execution paths.

**Tech Stack:** Node.js ESM, `node:test`, AITM lifecycle guards, GitHub issue/board observations.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS Task 14 in `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`.

## Story Intent

- **Beneficiary:** verification operator
- **Capability:** inspect whether Test can begin without launching verification
- **Need:** current Test entry mixes knowable preconditions with Develop finalization and sandbox effects
- **Value or failure prevented:** prevent a guidance query from creating a sandbox, running commands, or falsely reporting a later test result

## Global Constraints

- Explanations are observations, never authorization; execution reloads current issue, board, binding, HEAD, receipts, and workflow policy under its normal interlock.
- Keep the closed seven-field operational result; all blockers, warnings, args, and human requests are explicit and untruncated.
- Preserve `runTestWithEntryInterlock`, sandbox `AITM_ISSUE_LOCK_HELD` stripping, workflow-exception revalidation, directory-backed Test evidence, allowed self-reruns, and force behavior.
- No provider call, sandbox, verification command, evidence stamp, board/body mutation, or receipt retirement may occur while evaluating readiness.
- Use leading `[#1666]` commit attribution. The source epic branch is `feature/epic/1558`, not trunk.

## File Map

- Create `scripts/task-tracker/lib/action-decision/test.mjs`: read-only Test collector and typed verdicts.
- Modify `scripts/task-tracker/lib/action-decision/evaluate.mjs` and `navigation.mjs`: dispatch Test and Develop-state Promote to the collector.
- Modify `scripts/task-tracker/verbs/test.mjs` and `promote.mjs`: share fresh knowable entry predicates while retaining lock and effects.
- Modify `scripts/task-tracker/lib/resident-actions/develop-verification.mjs` and `test-quick-ci.mjs`: expose read-only receipt/action status without running residents.
- Modify narrow Develop-exit/Test-entry guard producers only where a tested pure predicate is needed.
- Create `scripts/tests/integration/task-tracker/lib/action-test.test.mjs`: paired readiness/effect/authority/runtime matrix.

### Task 1: Characterize Test entry and refusal parity

- [ ] Add integration fixtures for Develop first-entry, Test self-rerun, accepted directory Test evidence, missing/malformed VC declarations, invalid binding or HEAD, stale Develop receipt, workflow exception, and required-read failure.
- [ ] Assert every explanation case has zero worktree, `npm ci`, verification, provider, comment, body, and board effects.
- [ ] Pair each entry refusal with `runVerbTest`, `runTestWithEntryInterlock`, or the Develop-to-Test guard result; assert red Test commands after a ready entry remain runtime outcomes.
- [ ] Run `node --test scripts/tests/integration/task-tracker/lib/action-test.test.mjs` and preserve the expected RED result before implementation.

### Task 2: Implement the read-only collector and shared predicates

- [ ] Collect issue body, project board, HEAD, binding, policy, lifecycle evidence, and receipt observations through the existing attempt; classify missing reads as indeterminate.
- [ ] Reuse complete guard evaluation for Develop-to-Test, with typed remediation/manual disposition and full refusal aggregation; do not call effectful guard fallbacks from explanation.
- [ ] Distinguish a runnable Develop resident action from a completed exact-HEAD receipt, and distinguish Test self-rerun or accepted directory evidence from ordinary first-entry.
- [ ] Run the focused integration test until GREEN, then run `node --test scripts/tests/unit/task-tracker/lib/guard-parity-mid-stages.test.mjs scripts/tests/unit/task-tracker/lib/test-407-binding-survives.test.mjs`.

### Task 3: Recheck in execution and preserve effects

- [ ] Invoke the shared knowable predicates at the locked Test entry and Promote delegate on fresh authority, preserving their existing execution interlocks and later refresh boundaries.
- [ ] Keep finalization, state changes, receipts, sandbox setup, and command execution outside the collector; preserve truthful aborted/red/green outcomes and self-rerun semantics.
- [ ] Run `node --test scripts/tests/integration/task-tracker/lib/action-test.test.mjs scripts/tests/integration/task-tracker/lib/test-verb-entry-interlock.test.mjs scripts/tests/unit/task-tracker/lib/test-verb-retry.test.mjs scripts/tests/unit/task-tracker/lib/test-verb-sandbox.test.mjs`.

- [ ] Run issue VC1, `npm run lint`, `npm run format:check`, `npm test`, and `npm run test:slow`; inspect exits and exact changed paths.
- [ ] Commit with leading `[#1666]`, stamp the root AC/VC items individually with exact-SHA evidence, and run governed Test and Review before integration into the epic branch.
