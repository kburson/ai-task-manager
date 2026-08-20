# Shelve R4P Backward Guard Scope Implementation Plan

> **For implementation:** Execute test-first, one task at a time, with review after each task.

**Goal:** Allow the authenticated Shelve Ready-for-Planning to Backlog demotion to omit forward-only source exit guards while retaining target entry and every ordinary transition guard.

**Architecture:** Add backward-compatible phase selection to the central guard registry, derive the narrow selection from movement context at the guard-execution boundary, and propagate the authenticated verb context from the host. Do not change individual guards or Shelve transaction phases.

**Tech Stack:** Node.js ESM, `node:test`, AITM state engine.

---

## Task 1: Specify guard-phase selection

**Files:**

- Create: `scripts/tests/integration/task-tracker/lib/shelve-blocked-r4p-state-exit.integration.test.mjs`
- Modify: `scripts/task-tracker/lib/guard-registry.mjs`

1. Add failing tests showing the normal R4P source exit pipeline refuses an open blocker.
2. Add failing tests showing an exit-disabled run omits source exit guards but retains the Backlog entry phase.
3. Extend `runGuards` with defaulted `includeExitGuards` and `includeEntryGuards` options.
4. Run the focused test and confirm both default compatibility and phase selection.
5. Commit with `[#1343]` provenance.

## Task 2: Derive and apply the exact Shelve backward policy

**Files:**

- Modify: `scripts/task-tracker/lib/move-state/guard-execution.mjs`
- Modify: `scripts/gh/move-state.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/shelve-blocked-r4p-state-exit.integration.test.mjs`

1. Add table-driven failing cases for the exact permitted signal set and near misses: missing Shelve context, missing demote flag, different source, and different target.
2. Add a pure exported phase-policy helper.
3. Propagate resolved verb context into the movement context.
4. Pass the derived policy to `runGuards`.
5. Prove normal forward R4P to Plan still refuses open blockers and parent sequencing.
6. Run the focused test and commit with `[#1343]` provenance.

## Task 3: Prove transaction recovery and boundary compatibility

**Files:**

- Modify if needed: `scripts/tests/integration/task-tracker/lib/shelve-transaction.integration.test.mjs`
- Modify if needed: `scripts/tests/unit/task-tracker/gh/move-state-host-returns.test.mjs`

1. Add or strengthen a partial-transaction retry fixture matching #1335: history recorded, active evidence cleared, state move initially fails, identical retry succeeds.
2. Assert immutable history is not duplicated and blocker carriers are retained.
3. Assert unauthenticated direct movement retains existing refusal behavior.
4. Run:

   ```bash
   node --test scripts/tests/integration/task-tracker/lib/shelve-blocked-r4p-state-exit.integration.test.mjs scripts/tests/integration/task-tracker/lib/shelve-transaction.integration.test.mjs
   ```

5. Commit with `[#1343]` provenance.

## Task 4: Validate, review, and integrate

1. Run lint and format checks.
2. Run the full fast and slow suites through repository discovery.
3. Run independent code review and correct all Important findings.
4. Record exact-head verification and commit-trail evidence.
5. Move #1343 through Test and Review, merge its PR into trunk, and close it through the governed workflow.
6. Resume #1335 and retry the identical Shelve recovery command to prove the live transaction completes.
