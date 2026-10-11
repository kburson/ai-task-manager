# Preserve shared lifecycle timing projections Implementation Plan

> **For agentic workers:** Use the executing-plans skill for this single bounded task. The controller owns independent code review, Test/Review, approval and delivery; the implementer does not spawn reviewers or merge.

**Goal:** Allow the real #1986 actor departure/shared lifecycle resumed pair to pass legacy timing sequence review while retaining genuine failures.

**Architecture:** Recognize the producer's complete adjacent actor-departure/resumed/stage-entry shape inside the pure validator. Skip only that proven resumed projection in the legacy engagement machine; preserve every format, stage, gap and actor check.

**Tech Stack:** Node ESM, node:test, existing timing-row-reader and timing-events catalog.

**Spec:** Live #1994 Scope and ACs; [deep-dive comment](https://github.com/kburson/ai-task-manager/issues/1994#issuecomment-6112780891).

## Scope

Only timing-log-sequence.mjs and a dedicated focused regression test file change. The plan is the required tracked workflow artifact. No producer changes, timing history healing, attribution changes, new dependencies or enabled-event-model work.

## Global Constraints

- Preserve all timing rows, unknown attribution and totals.
- Preserve genuine legacy sequence failures and per-actor continuity checks.
- Run the exact root Verification Command 1, full lint/format and exact-head full CI.
- The implementer stops at CODE_COMPLETE and releases its claim for controller takeover.

## Context

The actual row 17 actor-tagged switch-out closes a real Unknown actor interval. appendRow sees that interruption and resumedBoundaryFrom copies the next lifecycle entry row's clock, move marker and absolute cursors, zeroing durations/delta. Row 18 is therefore a shared projection, not an actor return. The legacy validator currently ignores the actor departure but treats the copied resumed as engagement, producing a false doubled return. Mixing actor rows into the shared legacy machine would conflate concurrent actors.

## Story Intent

- **Beneficiary:** delivery reviewer
- **Capability:** validate mixed actor and shared lifecycle timing without false doubled returns
- **Need:** legitimate zero-duration stage projections currently fail sequence review
- **Value or failure prevented:** valid delivery histories pass review while real interruptions and actor continuity failures remain visible

## Acceptance Criteria

- A genuine mixed actor/lifecycle history like #1986 passes without source mutation or assigning unknown time.
- Real doubled returns, malformed or mismatched lifecycle evidence, nonzero work, actor ordering and continuity failures still fail.

## Plan Metadata

- Priority: P1
- Size: S
- Estimate: 3 hours
- Labels: bug

## Review Focus

- A UUID by itself cannot authorize a projection; every copied field and canonical suffix must match the producer.
- A detached or repeated resumed row must retain the ordinary legacy failure.
- Unknown departure engagement must remain unknown and independently validated.
- A lifecycle projection must not suppress missing entered markers or skipped stage edges.
- Concurrent actor starts and interval conflicts must remain visible to actor validation.

## Implementation Tasks

### Task 1: Validate a proven shared resumed projection without treating it as actor work

#### Story Intent

- **Beneficiary:** delivery reviewer
- **Capability:** validate mixed actor and shared lifecycle timing without false doubled returns
- **Need:** legitimate zero-duration stage projections currently fail sequence review
- **Value or failure prevented:** valid delivery histories pass review while real interruptions and actor continuity failures remain visible

**Files:**

- Modify: scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs
- Test: scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-shared-projection.test.mjs

**Interfaces:**

- Consumes: parseTimingRow(raw), timing-events canonical entry descriptors and terminal handoff classification, validate(context).
- Produces: unchanged { pass, failures } from validate(context), with preserved source context.

- [ ] **Step 1: Add regression fixtures before source changes.** Use the actual 11:19:58 ready-for-plan, 11:20:15 actor switch-out, 12:51:11 resumed/plan clocks, moves and 3,403/202,476 cursors. Give the departure an explicit Unknown interval and add the later actor start/stop so continuity is complete. Add table-driven variants for missing/malformed/duplicated/mismatched move markers, mismatched clock/cursors, nonzero/malformed seconds, visible durations, nonzero/malformed delta, absent departure, absent entry and genuine repeated return. Add independent actor order/start-conflict and stage reconciliation negatives.

```js
const before = structuredClone(context);
assert.deepEqual(validate(context), { pass: true, failures: [] });
assert.deepEqual(context, before);
for (const invalidContext of malformedProjectionContexts) {
  assert.equal(validate(invalidContext).pass, false);
}
```

- [ ] **Step 2: Observe RED on the exact focused verifier.**

Run: `node --test scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-shared-projection.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-update-slug.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-audit-rows.test.mjs`

Expected: The new positive case fails with a doubled reengagement at the shared resumed row. Existing rejection cases pass; no import or fixture error.

- [ ] **Step 3: Implement a local read-only recognizer.** Require the immediately previous row to be actor-tagged departure with parseable clock no later than resumed. Require adjacent untagged resumed and canonical entry excluding terminal review handoffs. Parse both raw rows; require exactly eight data cells, blank Active/Idle, literal zero delta and numeric grouped-or-plain nonnegative integer absolute cursors (or explicit unavailable em dash). Require a suffix containing exactly one canonical move UUID marker followed by exactly row-sec a=0 i=0, with no extra metadata. Require identical timestamp text, suffix move ID and both cursors. Keep original rows and deriveActorEngagement unchanged.

```js
if (row.actorKey || isSharedLifecycleResume(rows, row.index - 1)) continue;
// Existing legacy engagement machine follows unchanged.
```

The helper returns true only when every preceding condition passes. It runs after existing format/clock/stage checks so those failures remain observable.

- [ ] **Step 4: Observe GREEN using the same focused verifier.**

Run: `node --test scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-shared-projection.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-update-slug.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-audit-rows.test.mjs`

Expected: All focused tests pass, including source-context immutability and each negative case.

- [ ] **Step 5: Run affected verification and formatting.**

Run: `node scripts/maintenance/verify-affected-or-cloud.mjs`

Expected: The affected test closure passes.

Run: `npm run lint`

Expected: Exit 0.

Run: `npm run format:check`

Expected: Exit 0; format touched files with Prettier if needed, then repeat the format check only.

- [ ] **Step 6: Commit and publish the bounded result.**

Run: `git add docs/superpowers/plans/2026-10-11-1994-timing-sequence.md scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-shared-projection.test.mjs`

Run: `git commit -m "[#1994] fix(timing): recognize shared lifecycle resume projections"`

Expected: Attributed commit; run npx aitm commit-trace 1994 to verify exact HEAD in the canonical trace.

Push the owned feature branch and open a PR with Refs #1994, no closing keywords. Attach the PR and add ci-slow. Wait for exact-head full and slow CI; read verify-ci-receipts output. Write .scratch/1994-report.md with base/head, genuine RED/GREEN, files/titles, tests, CI and unchecked lifecycle items. Stop the timer and release the occupancy claim for the controller.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-shared-projection.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-update-slug.test.mjs scripts/tests/unit/task-tracker/lib/agent-review/validators/timing-log-sequence-audit-rows.test.mjs
```
