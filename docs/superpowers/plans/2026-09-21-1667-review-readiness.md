# Review Readiness and Evidence-Dependent Navigation Implementation Plan

> **For agentic workers:** Follow this plan task by task with test-driven development and review checkpoints. The accepted #1558 WBS Task 15 remains the normative scope.

**Goal:** Explain whether Review may begin or must rerun without performing review, normalization, approval, or provider effects, and recheck the same knowable requirements in execution.

**Architecture:** Add a read-only Review collector over fresh issue, board, HEAD, Test receipt, preflight, policy, guard, and resident observations. Evaluate Test→Review guards against a pure Functional DoD candidate projection; retain persistence/readback and reviewer actions in the existing locked Review/Promote execution paths. Route both direct Review and Test-state Promote through the collector, and select a Review self-rerun only from current resident evidence.

**Tech Stack:** Node.js ESM, `node:test`, AITM lifecycle guards and action decisions, GitHub issue/board observations.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md`; accepted WBS Task 15 in `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md`.

## Story Intent

- **Beneficiary:** review operator
- **Capability:** inspect whether Review can begin or must rerun from current evidence
- **Need:** Review entry mixes completeness and exact-HEAD checks with normalization and reviewer effects
- **Value or failure prevented:** an explanation cannot stamp approval or recommend close while Review work remains incomplete

## Global Constraints

- A ready explanation is never a grant; Review and Promote reload live authority before mutation.
- Preserve the closed seven-field operational decision, every simultaneous blocker and warning, typed args, and explicit indeterminacy for missing reads.
- `waived` remains distinct from `passed`; an active managed-provider denial or unsupported required capability is not silently bypassed.
- Explanation cannot run review probes, spawn reviewers, persist a DoD projection, comment, stamp evidence, approve, move the board, or create a sandbox.
- Keep existing Test→Review guards, Review resident/approval boundaries, `deriveAndRescan` persistence/readback, and exact-HEAD verification semantics.
- Use leading `[#1667]` attribution; integrate into `feature/epic/1558`, not trunk.
- Plan Size `XL`, Estimate `20.5` human hours; the governed issue forecast record remains authoritative.

## File Map

- Create `scripts/task-tracker/lib/action-decision/review.mjs`: read-only collection, projected guard verdict, and resident rerun classification.
- Modify `scripts/task-tracker/lib/action-decision/evaluate.mjs`, `navigation.mjs`, and `contract.mjs` only for Review routing and required typed vocabulary.
- Modify `scripts/task-tracker/lib/review-preflight.mjs` only to expose reusable read-only facts without weakening existing reasons.
- Modify `scripts/task-tracker/verbs/review.mjs` and `promote.mjs` to recheck shared predicates at fresh execution boundaries while keeping normalization and resident effects inside the verbs.
- Modify `scripts/task-tracker/lib/resident-actions/review-agent-validation.mjs` only if a pure verify seam is needed for current Review resident evidence.
- Create `scripts/tests/integration/task-tracker/lib/action-review.test.mjs`; extend narrow Review/guard/navigation tests and refusal inventory only where a new typed case requires it.

### Task 1: Characterize the complete Review entry matrix

- [ ] Add paired fixtures for Test first-entry, Review self-rerun, accepted exact-HEAD Test proof, stale receipt, incomplete AC/DoD, missing trail, epic children/trail, policy `waived`, denied managed review, and failed required reads. The test must import the real `evaluateAction` and compare with `runReviewPreflight` and complete Test→Review guards.
- [ ] Assert a ready projected normalization has `normalizerId: 'functional-dod-derived/v1'` and no issue/board/comment/reviewer/probe/sandbox effect; assert incomplete evidence never produces a close recommendation.
- [ ] Run `node --test scripts/tests/integration/task-tracker/lib/action-review.test.mjs` and retain the expected RED failure before implementation.

### Task 2: Implement the read-only Review collector and pure projection

- [ ] Collect current body, board, HEAD, binding, Test receipt or directory lifecycle evidence, Review preflight, workflow policy, and resident evidence through a command-local `createObservationAttempt`; mark unavailable required sources indeterminate.
- [ ] Use `projectFunctionalDod({ body, head, evaluatedAt })` only as an in-memory candidate, then call `evaluateCompleteGuards({ fromState: 'test', toState: 'review', context: { body: projection.body }, ... })`. Preserve every refusal and warning; carry the normalization intent into the decision, never the projected body as authorization.
- [ ] For Review self-runs, reuse the resident's pure `verify` result to select a runnable Review action for incomplete/stale evidence; do not turn a completed or waived resident into an approval or close grant.
- [ ] Route direct `review` and Test-state `promote` explanation to the same collector. Run the focused integration and `review-preflight` unit tests until GREEN.

### Task 3: Refresh at execution and prove navigation parity

- [ ] At both direct Review and Promote's Review delegate, reload current body, board, HEAD, Test evidence, policy, and resident state before any effect; call the shared knowable predicates. A prior decision object is never accepted as an execution input.
- [ ] Keep `deriveAndRescan` execution-only: persist only a ready projection, verify readback and current HEAD, then execute Review guards/resident work. Report persistence/readback drift as a refusal, not as a successful normalization or Review completion.
- [ ] Add paired tests for changed authority after a ready explanation, normalization persistence/readback failure, Review resident rerun, and Test→Review delegated parity. Run `node --test scripts/tests/integration/task-tracker/lib/action-review.test.mjs scripts/tests/unit/task-tracker/lib/review-preflight.test.mjs scripts/tests/unit/task-tracker/lib/review-preflight-epic-aware.test.mjs scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs`.

### Task 4: Verify and hand off

- [ ] Run issue VC1, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:integration`, and `npm run test:slow`; review the exact changed paths and refusal inventory.
- [ ] Commit with leading `[#1667]`, individually stamp the root AC and VC evidence at the final HEAD, then run governed Test and Review. Fast-forward the verified child into the epic branch, push the epic, and close the child through AITM Full-Auto.
