# Ready for Planning and Exclusive Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Local execution is strictly sequential; do not dispatch parallel story agents.

**Goal:** Replace the ownership-coupled Assigned state with Ready for Planning, make ownership an exclusive orthogonal property enforced at the development boundary, add honest shelving and R4P epic orchestration, and migrate the live board without losing assignments or history.

**Architecture:** Seven direct children execute in a strict dependency chain. The first supplies governed issue-record mutation commands; the remaining children establish canonical state topology, ownership, R4P/JIT behavior, shelving, epic orchestration, and finally the live migration. Historical Assigned and On Deck artifacts are compatibility inputs only; every new write uses R4P vocabulary.

**Tech Stack:** Node.js 22+, ECMAScript modules, `node:test`, GitHub GraphQL and REST APIs, GitHub Projects v2, AITM versioned issue writers, GitHub Actions or the separately planned cloud CI provider, Prettier, ESLint, markdownlint.

## Global Constraints

- Governing design: `docs/superpowers/specs/2026-08-11-ready-for-planning-ownership-lifecycle-design.md`.
- Tracking epic: #1209.
- Rejected implementation: #1207 is Closed - Not Planned; its worktree is evidence only and must not be merged or copied wholesale.
- Mistaken CI issue #1214 is Closed - Not Planned and is not part of delivery.
- The separately planned cloud CI test-automation story has no task number yet.
- Run all local children and all local full-suite gates sequentially until that external CI story is complete and isolated exact-SHA validation is proven.
- Completion of the external CI story does not automatically authorize parallel #1209 work; re-triage dependencies before any later parallel wave.
- Preserve historical `assigned` and `on-deck` bodies, comments, markers, rows, caches, and GitHub records byte-for-byte.
- New lifecycle writes use `ready-for-plan`; new configuration uses `kanbanOptionReadyForPlan`.
- Assignment never changes Status.
- Backlog through Plan may be unassigned.
- Plan -> Develop requires exactly one matching owner.
- Full-Auto claims only an unassigned Plan -> Develop story.
- Full-Auto never reclaims an ownerless story after Develop has begun.
- Shelve preserves labels and immutable history but clears Priority, Size, Estimate, Rank, and invalidated evidence.
- Only #1217 may mutate the live Status option or migrate existing Assigned project items.
- Every child uses a seeded isolated worktree cut from the current #1209 epic head.
- Every child completes its own deep dive, TDD cycle, focused verification, full fast suite, full slow suite, lint, format, commit trace, governed Test, independent review, and merge-back before the next child begins.

---

## Delivery Graph

```text
#1209 Ready for Planning and Exclusive Story Ownership
|
+-- #1210 Governed issue-body and comment mutation commands
|   `-- #1211 Canonical Ready for Planning topology
|       `-- #1212 Exclusive story ownership at Develop boundary
|           `-- #1213 Refine active WIP and R4P JIT parking
|               `-- #1215 Shelve and refinement invalidation
|                   `-- #1216 Epic child R4P orchestration
|                       `-- #1217 Live board migration and verification
|
`-- External cloud CI automation plan: task number intentionally unavailable
    Local execution remains sequential until it is complete and verified.
```

## File Responsibility Map

| Child | Primary responsibility                                | Primary production files                                                                                                                                              |
| ----- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1210 | Safe issue-record mutation commands                   | `scripts/task-tracker/verbs/issue-body.mjs`, `scripts/task-tracker/verbs/comment.mjs`, `scripts/task-tracker/lib/owned-comment.mjs`, command-surface files            |
| #1211 | Canonical lifecycle topology and compatibility        | `scripts/task-tracker/lib/lifecycle-policy/*.mjs`, `scripts/task-tracker/states/*.mjs`, `scripts/task-tracker/lib/stage-entry-markers.mjs`, timing and config readers |
| #1212 | Exclusive ownership and last-responsible-moment claim | `scripts/task-tracker/lib/assignee-guard.mjs`, `scripts/task-tracker/lib/verb-preflight.mjs`, new assignment modules and verbs, commit/source guards                  |
| #1213 | Refine -> R4P -> Plan and Plan cancellation           | `scripts/task-tracker/verbs/refine.mjs`, `scripts/task-tracker/verbs/plan.mjs`, lifecycle actions, timing/marker transitions                                          |
| #1215 | Shelve snapshot and invalidation transaction          | new `scripts/task-tracker/verbs/shelve.mjs`, new refinement-history and transaction modules, field/body clear helpers                                                 |
| #1216 | Epic R4P staging and sequential JIT pull              | `scripts/task-tracker/lib/epic-children-gate.mjs`, `scripts/task-tracker/lib/plan-epic-children-guard.mjs`, `scripts/task-tracker/verbs/pull-next.mjs`                |
| #1217 | Dry-run/apply live migration                          | new migration library and CLI, `scripts/gh/init-project-config.sh`, configuration, migration guide, live read-back verifier                                           |

## Task 1: #1210 - Governed Issue-Body and Comment Mutation Commands

**Files:**

- Create: `scripts/task-tracker/verbs/issue-body.mjs`
- Create: `scripts/task-tracker/verbs/comment.mjs`
- Create: `scripts/task-tracker/lib/owned-comment.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/routing.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/entrypoints.mjs`
- Reuse: `scripts/task-tracker/lib/issue-body-mutate.mjs`
- Reuse: `scripts/task-tracker/lib/github-records/github-comment-store.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/issue-body.test.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/comment.test.mjs`
- Test: `scripts/task-tracker/tests/integration/lib/governed-issue-record-writes.test.mjs`

**Interfaces:**

- Produces `runIssueBodyOperation({ issueNumber, operation, cfg, deps })` where `operation` is a validated exact-replace or named-section-replace value.
- Produces `upsertOwnedComment({ issueNumber, marker, body, cfg, deps })` returning `{ status: 'created'|'updated'|'no-op', commentNodeId, body }`.
- Both interfaces require active binding, current ownership authorization, file-backed input, and verified read-back.

- [ ] **Step 1: Write failing command and invariant tests**

```js
test('exact replace refuses zero or multiple matches before write', async () => {
  const result = await runIssueBodyOperation({
    issueNumber: 1210,
    operation: { kind: 'replace-exact', expected: 'old', replacement: 'new' },
    cfg,
    deps,
  });
  assert.equal(result.status, 'precondition-refused');
  assert.equal(deps.writeCount(), 0);
});

test('comment upsert refuses duplicate ownership markers', async () => {
  await assert.rejects(
    upsertOwnedComment({ issueNumber: 1210, marker: 'aitm-plan', body, cfg, deps }),
    /duplicate ownership marker/
  );
});
```

- [ ] **Step 2: Run RED tests**

Run: `node --test scripts/task-tracker/tests/unit/verbs/issue-body.test.mjs scripts/task-tracker/tests/unit/verbs/comment.test.mjs`

Expected: FAIL because the new verbs and owned-comment boundary do not exist.

- [ ] **Step 3: Implement the minimal versioned operations**

```js
export async function runIssueBodyOperation({ issueNumber, operation, cfg, deps = {} }) {
  return mutateIssueBody({
    issueNumber,
    repo: cfg.repo,
    mutate: (base) => applyValidatedBodyOperation(base, operation),
    deps: deps.bodyWrite,
  });
}

export async function upsertOwnedComment({ issueNumber, marker, body, cfg, deps = {} }) {
  const matches = await listCommentsByOwnershipMarker({ issueNumber, marker, cfg, deps });
  if (matches.length > 1) throw new OwnedCommentError('duplicate-marker');
  if (matches.length === 0)
    return createAndVerifyOwnedComment({ issueNumber, marker, body, cfg, deps });
  return updateAndVerifyOwnedComment({ comment: matches[0], body, cfg, deps });
}
```

- [ ] **Step 4: Wire help, routing, packaging, and Full-Auto behavior**

Add canonical `issue-body` and `comment` routes, detailed self-doc entries, strict argv parsing, file-path validation under the project scratch policy, and noninteractive Full-Auto behavior that retains every preflight guard.

- [ ] **Step 5: Verify #1210 sequentially**

```bash
node --test scripts/task-tracker/tests/unit/verbs/issue-body.test.mjs scripts/task-tracker/tests/unit/verbs/comment.test.mjs
node --test scripts/task-tracker/tests/integration/lib/governed-issue-record-writes.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

- [ ] **Step 6: Commit and merge #1210**

```bash
git add scripts/task-tracker scripts/gh docs
git commit -m "feat(records): add governed issue mutation commands [#1210]"
```

## Task 2: #1211 - Canonical Ready for Planning Topology

**Files:**

- Rename: `scripts/task-tracker/states/assigned.mjs` -> `scripts/task-tracker/states/ready-for-plan.mjs`
- Modify: `scripts/task-tracker/lib/lifecycle-policy/states.mjs`
- Modify: `scripts/task-tracker/lib/lifecycle-policy/actions.mjs`
- Modify: `scripts/task-tracker/lib/lifecycle-policy/executable-transitions.mjs`
- Modify: `scripts/task-tracker/states/index.mjs`
- Modify: `scripts/task-tracker/lib/stage-entry-markers.mjs`
- Modify: `scripts/task-tracker/lib/timing-ladder.mjs`
- Modify: `scripts/task-tracker/lib/timing-events/legacy.mjs`
- Modify: `scripts/task-tracker/config.mjs`
- Modify: `.ai-task-manager/task-tracker.json`
- Modify: `scripts/gh/init-project-config.sh`
- Test: `scripts/task-tracker/tests/unit/lib/ready-for-plan-topology.test.mjs`
- Test: `scripts/task-tracker/tests/unit/core/assigned-state-residue.test.mjs`

**Interfaces:**

- Produces canonical `stateIds() === ['backlog','refine','ready-for-plan','plan','develop','test','review','done']`.
- Produces `stateConfigKey('ready-for-plan') === 'kanbanOptionReadyForPlan'`.
- Compatibility readers normalize historical `assigned` and `on-deck` to `ready-for-plan` without rewriting source bytes.

- [ ] **Step 1: Pin the new topology and legacy-reader contract RED**

```js
assert.deepEqual(stateIds(), [
  'backlog',
  'refine',
  'ready-for-plan',
  'plan',
  'develop',
  'test',
  'review',
  'done',
]);
assert.equal(normalizeStateId('Assigned'), 'ready-for-plan');
assert.equal(normalizeStateId('On Deck'), 'ready-for-plan');
assert.equal(serializeCurrentState('ready-for-plan'), 'ready-for-plan');
```

- [ ] **Step 2: Run RED topology tests**

Run: `node --test scripts/task-tracker/tests/unit/lib/ready-for-plan-topology.test.mjs scripts/task-tracker/tests/unit/core/assigned-state-residue.test.mjs`

Expected: FAIL on the current `assigned` descriptor and state module.

- [ ] **Step 3: Replace canonical authority and keep narrow legacy readers**

```js
const STATE_DESCRIPTORS = Object.freeze([
  { id: 'backlog', configKey: 'kanbanOptionBacklog' },
  { id: 'refine', configKey: 'kanbanOptionRefine' },
  { id: 'ready-for-plan', configKey: 'kanbanOptionReadyForPlan' },
  { id: 'plan', configKey: 'kanbanOptionPlan' },
  { id: 'develop', configKey: 'kanbanOptionDevelop' },
  { id: 'test', configKey: 'kanbanOptionTest' },
  { id: 'review', configKey: 'kanbanOptionReview' },
  { id: 'done', configKey: 'kanbanOptionDone' },
]);
```

Move only guards appropriate to R4P into `ready-for-plan.mjs`; Refine owns refinement-completion gates and R4P owns Plan-entry admission.

- [ ] **Step 4: Update timing, marker, config, help, docs, and strict residue inventories**

Historical `aitm-entered-assigned`, `aitm-entered-on-deck`, and timing events remain accepted by readers. New emitters and templates must contain only `ready-for-plan`.

- [ ] **Step 5: Verify #1211 sequentially**

```bash
node --test scripts/task-tracker/tests/unit/lib/ready-for-plan-topology.test.mjs scripts/task-tracker/tests/unit/core/assigned-state-residue.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

- [ ] **Step 6: Commit and merge #1211**

```bash
git commit -am "refactor(state): replace Assigned with Ready for Planning [#1211]"
```

## Task 3: #1212 - Exclusive Story Ownership

**Files:**

- Create: `scripts/task-tracker/lib/ownership-policy.mjs`
- Create: `scripts/task-tracker/lib/assignment-snapshot.mjs`
- Create: `scripts/task-tracker/verbs/assign.mjs`
- Create: `scripts/task-tracker/verbs/unassign.mjs`
- Modify: `scripts/task-tracker/lib/assignee-guard.mjs`
- Modify: `scripts/task-tracker/lib/verb-preflight.mjs`
- Modify: `scripts/task-tracker/source-edit-gate.mjs`
- Modify: `scripts/task-tracker/lib/gh-edit-guard.mjs`
- Modify: command-surface routing, catalog, and entrypoint files
- Test: `scripts/task-tracker/tests/unit/lib/ownership-policy.test.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/assign.test.mjs`
- Test: `scripts/task-tracker/tests/integration/lib/ownership-boundaries.integration.test.mjs`

**Interfaces:**

- Produces `ownershipDecision({ state, assignees, currentUser, mode, transition })`.
- Produces locked, verified `assign`, `transfer`, and pre-Develop `unassign` transactions.
- `verb-preflight` becomes stage-aware instead of auto-claiming every unassigned issue.

- [ ] **Step 1: Write the complete ownership matrix RED**

```js
assert.deepEqual(
  ownershipDecision({ state: 'refine', assignees: [], currentUser: 'alice', mode: 'full-auto' }),
  { ok: true, kind: 'team-unassigned' }
);
assert.equal(
  ownershipDecision({
    state: 'plan',
    transition: 'develop',
    assignees: [],
    currentUser: 'alice',
    mode: 'full-auto',
  }).kind,
  'claim-at-commitment'
);
assert.equal(
  ownershipDecision({ state: 'develop', assignees: [], currentUser: 'alice', mode: 'full-auto' })
    .kind,
  'human-coordination-required'
);
```

- [ ] **Step 2: Run RED ownership tests**

Run: `node --test scripts/task-tracker/tests/unit/lib/ownership-policy.test.mjs scripts/task-tracker/tests/unit/verbs/assign.test.mjs`

- [ ] **Step 3: Implement one snapshot and one policy authority**

```js
export function ownershipDecision({ state, assignees, currentUser, mode, transition }) {
  const owners = canonicalLogins(assignees);
  if (owners.length > 1) return refusal('multiple-owners');
  if (owners.length === 1 && owners[0] !== canonicalLogin(currentUser))
    return refusal('foreign-owner');
  if (owners.length === 0 && transition === 'develop') {
    return mode === 'full-auto' ? claim('claim-at-commitment') : prompt('assignment-required');
  }
  if (owners.length === 0 && isInFlight(state)) return prompt('human-coordination-required');
  return { ok: true, kind: owners.length === 0 ? 'team-unassigned' : 'owned-by-session' };
}
```

All mutations run under the issue lock, re-read assignees before and after, and compensate only ownership proven to have been added by the current transaction.

- [ ] **Step 4: Wire bind, transition, body mutation, source edit, and commit boundaries**

Pre-Develop unassigned work passes. Foreign or multiple ownership fails everywhere. Plan -> Develop Full-Auto claims once with a visible comment. Develop+ owner loss never auto-claims.

- [ ] **Step 5: Verify #1212 sequentially**

```bash
node --test scripts/task-tracker/tests/unit/lib/ownership-policy.test.mjs scripts/task-tracker/tests/unit/verbs/assign.test.mjs
node --test scripts/task-tracker/tests/integration/lib/ownership-boundaries.integration.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

- [ ] **Step 6: Commit and merge #1212**

```bash
git commit -am "feat(ownership): enforce exclusive development ownership [#1212]"
```

## Task 4: #1213 - Refine Active WIP and R4P JIT Parking

**Files:**

- Modify: `scripts/task-tracker/verbs/refine.mjs`
- Modify: `scripts/task-tracker/verbs/plan.mjs`
- Create: `scripts/task-tracker/verbs/plan-cancel.mjs`
- Create: `scripts/task-tracker/lib/current-refinement-snapshot.mjs`
- Modify: `scripts/task-tracker/states/refine.mjs`
- Modify: `scripts/task-tracker/states/ready-for-plan.mjs`
- Modify: lifecycle action and transition policy files
- Modify: timing and marker writers
- Test: `scripts/task-tracker/tests/unit/verbs/refine-to-r4p.test.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/r4p-plan-cancel.test.mjs`

**Interfaces:**

- Produces `writeCurrentRefinementSnapshot(body, snapshot)` and `readCurrentRefinementSnapshot(body)`.
- `refine` completes at R4P after fields and evidence verify.
- `plan` accepts only R4P.
- `plan-cancel` returns Plan -> R4P and clears Plan-only artifacts.

- [ ] **Step 1: Write RED transition and evidence tests**

```js
assert.equal(actionPolicyFor('plan', 'ready-for-plan').ok, true);
assert.equal(actionPolicyFor('plan', 'refine').ok, false);
assert.deepEqual(backwardTargets('plan'), ['ready-for-plan']);
```

- [ ] **Step 2: Run RED workflow tests**

Run: `node --test scripts/task-tracker/tests/unit/verbs/refine-to-r4p.test.mjs scripts/task-tracker/tests/unit/verbs/r4p-plan-cancel.test.mjs`

- [ ] **Step 3: Implement current refinement snapshot and one-edge transitions**

```js
export const CURRENT_REFINEMENT_SCHEMA = 'aitm.current-refinement/v1';

export function buildCurrentRefinementSnapshot({
  priority,
  size,
  estimate,
  rank,
  baseSha,
  scopeHash,
  acHash,
  dependencies,
  refinedAt,
}) {
  return Object.freeze({
    schema: CURRENT_REFINEMENT_SCHEMA,
    priority,
    size,
    estimate,
    rank,
    baseSha,
    scopeHash,
    acHash,
    dependencies,
    refinedAt,
  });
}
```

Refine performs field/body convergence, writes the snapshot, verifies it, and moves Refine -> R4P. Plan cancellation removes Plan approval/deep-dive/forecast evidence but preserves the verified current refinement snapshot.

- [ ] **Step 4: Verify #1213 sequentially**

```bash
node --test scripts/task-tracker/tests/unit/verbs/refine-to-r4p.test.mjs scripts/task-tracker/tests/unit/verbs/r4p-plan-cancel.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

- [ ] **Step 5: Commit and merge #1213**

```bash
git commit -am "feat(planning): add R4P staging and JIT Plan entry [#1213]"
```

## Task 5: #1215 - Shelve and Refinement Invalidation

**Files:**

- Create: `scripts/task-tracker/verbs/shelve.mjs`
- Create: `scripts/task-tracker/lib/refinement-history.mjs`
- Create: `scripts/task-tracker/lib/shelve-transaction.mjs`
- Modify or retire: `scripts/task-tracker/verbs/park.mjs`
- Modify: command-surface routing, catalog, and entrypoint files
- Modify: project field write helpers and evidence invalidation helpers
- Test: `scripts/task-tracker/tests/unit/verbs/shelve.test.mjs`
- Test: `scripts/task-tracker/tests/integration/lib/shelve-transaction.integration.test.mjs`

**Interfaces:**

- Produces immutable `aitm.refinement-history/v1` snapshots.
- Produces `runShelve({ issueNumber, reason, removeOwner, cfg, deps })` with journaled phases.

- [ ] **Step 1: Write RED snapshot, clear-list, and refusal tests**

```js
assert.deepEqual(activeFieldsAfterShelve(before), {
  priority: null,
  size: null,
  estimate: null,
  rank: null,
});
assert.deepEqual(labelsAfterShelve(before), before.labels);
```

- [ ] **Step 2: Run RED Shelve tests**

Run: `node --test scripts/task-tracker/tests/unit/verbs/shelve.test.mjs scripts/task-tracker/tests/integration/lib/shelve-transaction.integration.test.mjs`

- [ ] **Step 3: Implement a resumable phase journal**

```js
export const SHELVE_PHASES = Object.freeze([
  'snapshot-recorded',
  'active-evidence-cleared',
  'fields-cleared',
  'status-backlog',
  'owner-updated',
  'verified',
]);
```

The operation verifies each phase before advancing. Refine/R4P are legal; Develop+ refuses before the first write. Optional owner removal executes only before Develop and verifies exact final assignees.

- [ ] **Step 4: Verify #1215 sequentially**

```bash
node --test scripts/task-tracker/tests/unit/verbs/shelve.test.mjs scripts/task-tracker/tests/integration/lib/shelve-transaction.integration.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

- [ ] **Step 5: Commit and merge #1215**

```bash
git commit -am "feat(backlog): add refinement-aware Shelve transaction [#1215]"
```

## Task 6: #1216 - Epic R4P Orchestration

**Files:**

- Modify: `scripts/task-tracker/lib/epic-children-gate.mjs`
- Modify: `scripts/task-tracker/lib/plan-epic-children-guard.mjs`
- Modify: `scripts/task-tracker/lib/refine-exit-wip-budget-guard.mjs`
- Modify: `scripts/task-tracker/verbs/pull-next.mjs`
- Modify: `scripts/task-tracker/lib/parent-state-gate.mjs`
- Modify: pickup directive and orchestration documentation
- Test: `scripts/task-tracker/tests/unit/lib/epic-r4p-admission.test.mjs`
- Test: `scripts/task-tracker/tests/unit/verbs/pull-next-r4p.test.mjs`
- Test: `scripts/task-tracker/tests/slow/lib/epic-r4p-lifecycle.test.mjs`

**Interfaces:**

- `findNextEligibleChild` filters `ready-for-plan`, complete dependencies, and rank.
- Epic Plan admission requires every nonterminal executable child at R4P or later.
- Parent Test admission requires every required child Done or accepted terminal disposition.

- [ ] **Step 1: Write RED R4P admission and sequential selection tests**

```js
const next = findNextEligibleChild([
  { number: 1, state: 'refine', rank: 1, blockedBy: [] },
  { number: 2, state: 'ready-for-plan', rank: 2, blockedBy: [] },
]);
assert.equal(next.number, 2);
```

- [ ] **Step 2: Run RED epic tests**

Run: `node --test scripts/task-tracker/tests/unit/lib/epic-r4p-admission.test.mjs scripts/task-tracker/tests/unit/verbs/pull-next-r4p.test.mjs`

- [ ] **Step 3: Replace Refine staging with R4P and enforce the local sequential policy**

```js
const CHILD_STAGING_STATE = 'ready-for-plan';
const ACTIVE_CHILD_STATES = new Set(['plan', 'develop', 'test', 'review']);
```

`pull-next` selects one R4P child, moves it to Plan, and stops. It never starts another local child while any sibling is active. The external CI story number is recorded later when available; its absence never weakens sequential enforcement.

- [ ] **Step 4: Verify #1216 sequentially**

```bash
node --test scripts/task-tracker/tests/unit/lib/epic-r4p-admission.test.mjs scripts/task-tracker/tests/unit/verbs/pull-next-r4p.test.mjs
node --test scripts/task-tracker/tests/slow/lib/epic-r4p-lifecycle.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
```

- [ ] **Step 5: Commit and merge #1216**

```bash
git commit -am "feat(epic): stage children in R4P for sequential JIT pull [#1216]"
```

## Task 7: #1217 - Live Board Migration and Verification

**Files:**

- Create: `scripts/task-tracker/lib/ready-for-plan-migration.mjs`
- Create: `scripts/migrate/assigned-to-ready-for-plan.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/ready-for-plan-migration.test.mjs`
- Create: `scripts/task-tracker/tests/slow/lib/ready-for-plan-live-migration.test.mjs`
- Modify: `scripts/gh/init-project-config.sh`
- Modify: `.ai-task-manager/task-tracker.json`
- Modify: `scripts/task-tracker/lib/command-surface/entrypoints.mjs`
- Modify: `docs/guides/migration-7-state.md` or replace it with a canonical R4P migration guide
- Modify: architecture and operator documentation

**Interfaces:**

- Produces `inspectReadyForPlanMigration({ cfg, deps })` with zero writes.
- Produces `applyReadyForPlanMigration({ plan, cfg, deps })` with a resumable journal.
- No other child may call the live mutation interface.

- [ ] **Step 1: Write RED exhaustive-scan, no-write, and read-back tests**

```js
const plan = await inspectReadyForPlanMigration({ cfg, deps });
assert.equal(plan.writes, 0);
assert.deepEqual(
  plan.items.map(({ status }) => status),
  ['assigned', 'assigned']
);
assert.equal(plan.option.afterName, 'Ready for Planning');
```

- [ ] **Step 2: Run RED migration tests**

Run: `node --test scripts/task-tracker/tests/unit/lib/ready-for-plan-migration.test.mjs scripts/task-tracker/tests/slow/lib/ready-for-plan-live-migration.test.mjs`

- [ ] **Step 3: Implement dry-run inventory and a phase journal**

```js
export const MIGRATION_PHASES = Object.freeze([
  'inventory-complete',
  'items-moved-to-backlog',
  'items-verified',
  'option-renamed',
  'option-reordered',
  'config-cutover',
  'final-verification',
]);
```

Inventory uses repository-qualified identities, exhaustive pagination, cursor-progress checks, duplicate detection, and zero mutation. Apply cannot rename the option before every item move and assignee read-back verifies.

- [ ] **Step 4: Implement saved-view handling and final end-to-end verification**

Use a supported GitHub API if one exists. Otherwise emit exact operator instructions for `has:assignee`, per-owner, unassigned Backlog, Refine WIP, and Ready for Planning views, then require operator-confirmed read-back before final completion.

- [ ] **Step 5: Verify code before live apply**

```bash
node --test scripts/task-tracker/tests/unit/lib/ready-for-plan-migration.test.mjs
node --test scripts/task-tracker/tests/slow/lib/ready-for-plan-live-migration.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
node scripts/migrate/assigned-to-ready-for-plan.mjs
```

Expected dry-run: complete inventory, zero writes, stable option ID, exact item count, exact assignee snapshots.

- [ ] **Step 6: Apply only after human migration authorization**

```bash
node scripts/migrate/assigned-to-ready-for-plan.mjs --apply
```

The apply command must print and persist final item counts, option order, option ID, configuration key, and assignee-preservation verification.

- [ ] **Step 7: Commit and merge #1217**

```bash
git commit -am "feat(migration): cut over Assigned to Ready for Planning [#1217]"
```

## Final Epic Verification

- [ ] Confirm #1210, #1211, #1212, #1213, #1215, #1216, and #1217 are Done or carry an explicitly accepted terminal disposition.
- [ ] Confirm #1214 remains Closed - Not Planned and contributes no implementation commit.
- [ ] Confirm #1207 remains Closed - Not Planned and no #1207-only commit is merged.
- [ ] Confirm the live Status order is Backlog -> Refine -> Ready for Planning -> Plan -> Develop -> Test -> Review -> Done.
- [ ] Confirm every migrated Assigned item is Backlog with its pre-migration assignee set preserved.
- [ ] Confirm unassigned stories can refine and plan but cannot enter Develop without the commitment-boundary ownership rule.
- [ ] Confirm owner loss after Develop blocks Full-Auto and requests human direction.
- [ ] Confirm Shelve clears active refinement fields while preserving labels and immutable snapshots.
- [ ] Confirm epic `pull-next` admits only one dependency-ready R4P child locally.
- [ ] Record the external cloud CI story number when it becomes available; do not infer or create a duplicate.
- [ ] Run final gates sequentially:

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
git diff --check
```
