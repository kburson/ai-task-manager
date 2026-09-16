# Epic Blocker Refinement Deadlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit dependency-ordered epic children to reach Ready for Planning with current blocker-aware refinement evidence while keeping blocked work out of Plan and execution.

**Architecture:** Move open-blocker enforcement from the shaping transitions to the Ready-for-Planning work-admission boundary. Make the protected `aitm-blocked-by` marker the single dependency input for refinement snapshots so the snapshot and epic child mapper consume identical evidence.

**Tech Stack:** Node.js 22+ ESM, `node:test`, AITM state guard registry, protected issue-body markers, and refinement snapshot hashing.

## Global Constraints

- Preserve atomic synchronization of the `BLOCKED` label, `Blocked By` project field, and `aitm-blocked-by` body marker.
- Preserve persisted schema-1 refinement evidence; new marker-authoritative snapshots use schema 2 rather than changing schema-1 digest semantics.
- Keep `blockedByGuard` on Ready for Planning, Plan, Develop, Test, and Review exits.
- Do not allow an open blocker to authorize Plan or execution.
- Keep sequential WIP, rank, parent-child contiguity, and epic terminal gates unchanged.
- Use strict red-green-refactor and observe the focused regression fail before changing production code.

---

### Task 1: Align Refinement and Dependency Admission

**Files:**

- Modify: `scripts/tests/unit/task-tracker/lib/r4p-jit-boundaries.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs`
- Modify: the existing guard-registry inventory test that asserts per-state `blocked-by-not-done` registration
- Modify: `scripts/task-tracker/states/backlog.mjs`
- Modify: `scripts/task-tracker/states/refine.mjs`
- Modify: `scripts/task-tracker/lib/refinement-snapshot.mjs`
- Modify: `scripts/task-tracker/lib/guard-registry.mjs`

**Interfaces:**

- Consumes: `parseBlockedBy(body): number[]`, `blockedByGuard`, `stampRefinementSnapshot()`, `verifyRefinementSnapshot()`, `mapSubIssueNodes()`, and `planEpicDevelopChildrenGate()`.
- Produces: refinement snapshots whose `fields.blockedBy` equals the canonical protected blocker marker, plus a guard inventory that first enforces open blockers at Ready for Planning -> Plan.

- [ ] **Step 1: Write the failing lifecycle-boundary tests**

Add assertions that `STATES.backlog.exitGuards` and `STATES.refine.exitGuards` do not contain `blocked-by-not-done`, while `STATES['ready-for-plan']`, `STATES.plan`, `STATES.develop`, `STATES.test`, and `STATES.review` still do.

- [ ] **Step 2: Write the failing snapshot authority test**

Build a refined body containing `<!-- aitm-blocked-by refs="#11" -->` and labels including `BLOCKED`. Stamp and verify it, then assert:

```js
assert.equal(verified.ok, true);
assert.equal(verified.snapshot.fields.blockedBy, '#11');
```

Change the marker to `#12` without restamping and assert verification returns `stale refinement snapshot`.

- [ ] **Step 3: Write the failing epic admission regression**

Map a Ready-for-Planning child whose stamped body and live marker both name predecessor `#11`. Assert the mapped child has `blockedBy: [11]` and `hasCurrentRefinement: true`; assert `planEpicDevelopChildrenGate()` accepts it as completely refined; assert `findNextEligibleChild()` excludes it while #11 is open and admits it after #11 is terminal.

- [ ] **Step 4: Run the focused tests and observe RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/r4p-jit-boundaries.test.mjs scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs scripts/tests/unit/task-tracker/lib/guard-registry-plan-exit.test.mjs
```

Expected: failures show Backlog/Refine still register `blocked-by-not-done` and snapshots do not record the protected blocker marker.

- [ ] **Step 5: Move blocker enforcement to the JIT boundary**

Remove the `blockedByGuard` imports and exit-list entries only from `states/backlog.mjs` and `states/refine.mjs`. Update the inventory comment in `guard-registry.mjs` to show no blocker exit guard for those two states and unchanged enforcement for Ready for Planning onward.

- [ ] **Step 6: Make the protected marker the snapshot dependency source**

Import the strict protected-marker reader into `refinement-snapshot.mjs`. Normalize its result as `#N` comma-separated text, use that value in the hashed `dependencies` input, and serialize it into a schema-2 refinement snapshot marker's `blocked-by` property. Retain exact schema-1 verification for persisted snapshots and require their serialized blocker value to agree with the live protected marker. Do not use dependency prose from Plan Metadata for schema-2 evidence and do not add blocker data to the hidden field database.

- [ ] **Step 7: Run focused tests and observe GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/r4p-jit-boundaries.test.mjs scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs scripts/tests/unit/task-tracker/lib/guard-registry-plan-exit.test.mjs scripts/tests/unit/task-tracker/lib/blocked-by-guard.test.mjs
```

Expected: all tests pass; blocked enforcement remains present at Ready for Planning and every later nonterminal state.

- [ ] **Step 8: Run repository verification**

Run:

```bash
npm run lint
npm run format:check
npm test
npm run test:slow
```

Expected: every command exits 0.

- [ ] **Step 9: Commit the defect fix**

```bash
git add scripts/task-tracker/states/backlog.mjs \
  scripts/task-tracker/states/refine.mjs \
  scripts/task-tracker/lib/refinement-snapshot.mjs \
  scripts/task-tracker/lib/guard-registry.mjs \
  scripts/tests/unit/task-tracker/lib/r4p-jit-boundaries.test.mjs \
  scripts/tests/unit/task-tracker/lib/epic-r4p-orchestration.test.mjs \
  scripts/tests/unit/task-tracker/lib/guard-registry-plan-exit.test.mjs
git commit -m "fix(workflow): allow blocked children to complete refinement [#1339]"
```

## Self-Review Checklist

- The protected blocker marker is the only dependency source used by refinement snapshots.
- Blocked work can reach Ready for Planning but cannot leave it while the blocker is open.
- Parent epic admission and next-child selection consume one consistent dependency representation.
- No new bypass, hidden field, or configuration is introduced; the schema-2 boundary preserves schema-1 compatibility instead of reinterpreting existing evidence.
- No `TBD`, `TODO`, deferred behavior, or unrelated nomenclature change is included.
