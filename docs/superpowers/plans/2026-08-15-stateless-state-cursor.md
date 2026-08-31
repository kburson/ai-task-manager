# Stateless State Cursor Implementation Plan

<!-- cspell:ignore base64url deduplicate idempotency monotonicity supersede TOCTOU ULID -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace distributed lifecycle execution with immutable three-list state definitions and an ephemeral Cursor that reconstructs, verifies, resumes, and crosses at most one policy-valid boundary from durable repository evidence.

**Architecture:** Four independently green sequential stories introduce the pure state factory, the provenance-bearing repository adapter, the resident-action ledger/Cursor with Review as the pilot action, and finally the transition-ID plus single-lock boundary correction. The existing `moveState(ctx)` saga remains the sole writer of Status and transition evidence, while `lifecycle-policy` remains the sole authority for state order and executable edges.

**Tech Stack:** Node.js 22+ ESM, `node:test`, Git and GitHub CLI adapters, existing AITM issue locks and versioned issue-body mutation, immutable plain JavaScript records, SHA-256/base64url codecs.

**Accepted Source:** `docs/superpowers/specs/2026-08-14-stateless-state-cursor-architecture-design.md` at `17ce26eefced44b9bf4e00855bcdcfc2e85d3e0d`, with final acceptance evidence under `docs/superpowers/reviews/1117/`.

## Global Constraints

- Deliver the accepted design in four independently green sequential stories: A (6h), B (10h), C (28h), and D (12h). A later story may consume earlier merged behavior but an earlier story must not depend on a later one.
- The fixed state order is exactly `backlog`, `refine`, `ready-for-plan`, `plan`, `develop`, `test`, `review`, `done`; `stateIds()`, `forwardTarget`, `backwardTargets`, and `validateExecutableTransition` remain the only transition-policy authority.
- Every machine definition has `id` plus exactly three ordered active lists named `entryGuards`, `residentActions`, and `exitGuards`. The shipped `name` and `onEnter` surfaces remain compatibility projections and must not become fourth active lists.
- Definitions, registries, snapshots, plans, contexts, and result values are immutable. No Cursor, action index, task data, process-local program counter, daemon, or hidden workflow database persists across invocations.
- Guards remain quick, read-only, aggregate source exits before target entries, preserve warnings/blockers, coerce throws or malformed results to refusals, and never perform lifecycle work.
- Guard-derived data is returned as `derived` and folded into an immutable snapshot replacement. During migration only, the compatibility adapter mirrors `derived.refinementPlan` onto the legacy context for existing callers.
- Resident actions are ordered, verify-first, idempotent, and restricted to the closed outcomes `complete`, `waiting`, `paused`, and `failed`. A `waiting` outcome requires a durable correlation key and injected-clock ISO deadline.
- All externally mutating actions record a correlation intent before the provider effect; provider effects are discoverable by that key and reject stale state visits before submission.
- Project Status, transition phase rows, entry/last-known markers, and `aitm-move-complete` are written only by the shipped `moveState(ctx)` saga. Resident actions never invoke movement verbs or write reserved movement facts.
- Forward and actions-only triggers resume current resident work. Reverse and explicit `force`/`supersede` bypasses remain available from incomplete or damaged resident work and never fabricate resolution events.
- One invocation selects at most one explicit target and crosses at most one boundary. Target resident work starts only after a confirmed `{ kind: 'moved' }` result and a fresh target-state hydration.
- Story C delegates every crossing to the current host boundary unchanged. Story D alone moves final hydration plus the complete pre-mutation gate under the same issue lock as `moveState`.
- Preserve movement exit codes: body-fetch failure 3, generic guard refusal 4, contiguity refusal 6, boundary/Status/sentinel failure 7, post-commit board-marker drift 8, and unknown internal boundary result 1.
- Keep `probeCompletion` strictly read-only. Transition-commit creation/repair is best-effort audit work in the post-commit tail and cannot turn a confirmed move into failure.
- Keep the existing tail's ordered `project`, `issue`, and `session` profiles. Cache refresh, Full-Auto audit, dependent unpark, tracker/event synchronization, and end-tracking remain transition infrastructure rather than resident actions.
- Consolidate every executable entry-marker reader on the dependency-free order-insensitive grammar before any writer emits `move="<transition-id>"`. Legacy colon markers remain valid indefinitely; backfill is optional.
- Action IDs match `[a-z0-9][a-z0-9._:-]{0,95}`. A definition/retained visit has at most 96 IDs; each canonical map entry is at most 384 bytes; event comments are at most 4 KiB; spill-head comments are at most 60 KiB with the accepted 8 KiB reserve.
- Inline heads are allowed only at 8,192 marker characters or fewer and 57,344 final body characters or fewer. Exact overflow spills automatically; unsafe definition/runtime size refuses before provider effects with `resident-action-definition-cap` or `resident-action-ledger-budget`.
- Never use blanket `allowMarkerLoss` for ledger advancement. Use the one-marker `allowMarkerAdvance: ['aitm-resident-action-ledger-head']` path and validate every versioned-write retry against its fresh base.
- `TT_SKIP_NETWORK=1` permits read-only local/in-memory hydration and deterministic tests but refuses production boundaries and performs no GitHub writes.
- #937 retains Develop/Test action contents, PR/CI orchestration, verification receipts, and rework policy. #1117 supplies only the shared architecture and Review pilot.
- Every new test file begins with `// @story #1117`. Use test-driven development and observe each focused test fail for the intended missing behavior before production edits.
- Do not push, merge, rebase, close #1117, or start #937 without explicit human approval.

---

## File Structure

### Story A — topology and pure factory

- Create: `scripts/task-tracker/lib/state-method-registry.mjs` — validate direct guard/action references and build the frozen diagnostic method index.
- Create: `scripts/task-tracker/lib/state-factory.mjs` — normalize, validate, freeze, and index all eight definitions while delegating navigation to lifecycle policy.
- Modify: `scripts/task-tracker/states/*.mjs` — export raw `{ id, entryGuards, residentActions, exitGuards }` specifications with empty resident lists except Review in Story C.
- Modify: `scripts/task-tracker/states/index.mjs` — export the machine plus `STATES`, `FORWARD_CHAIN`, `getState`, and `name`/`onEnter` compatibility projections.
- Modify: `scripts/task-tracker/lib/state-bootstrap.mjs` and `scripts/task-tracker/lib/guard-registry.mjs` — populate the mutable legacy registry from factory definitions without changing direct-import or registration behavior.
- Modify: `scripts/tests/unit/task-tracker/states/states-skeleton.test.mjs` — replace the old shape expectation with the compatibility projection contract.
- Create: `scripts/tests/unit/task-tracker/states/state-factory.test.mjs` — factory validation, identity, immutability, limits, aliases, and topology parity.
- Modify: `scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs` — prove factory navigation and every sanctioned forward/reverse edge match lifecycle policy.

### Story B — snapshot and repository adapter

- Create: `scripts/task-tracker/lib/task-snapshot.mjs` — immutable provenance values, five-signal current-state reconciliation, visit identity, freshness, and non-throwing ledger diagnostics.
- Create: `scripts/task-tracker/lib/resident-action-ledger-codec.mjs` — schemas, canonical serialization, hashes, size limits, marker/event/comment parsing, and deterministic IDs.
- Create: `scripts/task-tracker/lib/resident-action-ledger-read.mjs` — bounded head/current-attempt reads, mixed-visit classification, spill-pointer retry, and orphan diagnostics.
- Create: `scripts/task-tracker/lib/repository-adapter.mjs` — production adapter implementing hydration, Git/worktree/check reads, issue locking, and injected mutation seams.
- Create: `scripts/tests/helpers/in-memory-repository-adapter.mjs` — stateful offline adapter with mutation history and deterministic clock.
- Create: `scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs` — snapshot reconstruction, five-signal reconciliation, partial freshness, mixed visits, and offline behavior.

### Story C — resident execution, ledger protection, Cursor, and Review

- Create: `scripts/task-tracker/lib/resident-action-ledger-write.mjs` — genesis, intent/waiting/resolved/failed append, attempt derivation, orphan recovery, monotonic head advance, spill lifecycle, and GC reachability proof.
- Create: `scripts/task-tracker/lib/resident-action-runner.mjs` — ordered verify-first execution and correlation-/issue-lock serialization.
- Create: `scripts/task-tracker/lib/state-cursor.mjs` — trigger normalization, resident execution, one-boundary result discrimination, compatibility boundary delegation, and target re-entry.
- Create: `scripts/task-tracker/lib/resident-actions/review-agent-validation.mjs` — Review action adapter around the shipped agent-review gate, evidence stamps, and timing rows.
- Create: `scripts/task-tracker/verbs/action-ledger.mjs` — human-approved reconcile/audit/GC maintenance surface, distinct from movement reconcile.
- Modify: `scripts/task-tracker/states/review.mjs` — install the Review action direct reference.
- Modify: `scripts/task-tracker/lib/body-invariants.mjs` and `scripts/task-tracker/lib/issue-body-mutate.mjs` — register and enforce the pure synchronous `advance` invariant and narrow mutation option.
- Modify: `scripts/task-tracker/lib/gh-edit-guard.mjs` and `scripts/task-tracker/bash-guard.mjs` — protect transition, ledger, spill-head, damage-carry, and correction comments from generic edit/delete operations.
- Modify: `scripts/task-tracker/verbs/review.mjs`, `scripts/task-tracker/verbs/start.mjs`, `scripts/task-tracker/verbs/resume.mjs`, `scripts/task-tracker/verbs/switch.mjs`, and `scripts/task-tracker/task-tracker.mjs` — route Review entry/retry and bind/rebind actions through the Cursor while preserving preflight, probe, timing, and approval output.
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs` and `scripts/lib/self-doc.mjs` — publish `action-ledger` routing and help metadata.
- Create: `scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs` — attempt folding, stale evidence, deadlines, dormancy, locking, and crash recovery.
- Create: `scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs` — trigger planning, action-before-boundary ordering, reverse/bypass behavior, and discriminated results.
- Create: `scripts/tests/unit/task-tracker/lib/state-action-conformance.test.mjs` — reusable action contract harness.
- Create: `scripts/tests/unit/task-tracker/lib/state-cursor-interruption.test.mjs` — abort/restart table across every durable boundary.
- Modify: `scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs` — Review arrival, objection dormancy, retry-in-place, and no entry-guard replay.

### Story D — entry grammar, transition identity, and final locked boundary

- Create: `scripts/task-tracker/lib/stage-entry-grammar.mjs` — dependency-free order-insensitive modern parser plus explicitly named legacy-colon parser.
- Modify: `scripts/task-tracker/lib/stage-entry-markers.mjs`, `scripts/task-tracker/lib/agent-review/review-gate.mjs`, `scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs`, `scripts/task-tracker/lib/body-invariants.mjs`, `scripts/task-tracker/lib/close-gates.mjs`, `scripts/task-tracker/lib/contiguity-entry-guard.mjs`, `scripts/task-tracker/lib/deep-dive.mjs`, `scripts/task-tracker/lib/derive-drivers.mjs`, `scripts/task-tracker/lib/gh-edit-guard.mjs`, `scripts/task-tracker/lib/markers.mjs`, `scripts/task-tracker/lib/move-state/github-mutation.mjs`, `scripts/task-tracker/lib/move-state/readout.mjs`, `scripts/task-tracker/lib/plan-approved-guard.mjs`, `scripts/task-tracker/lib/seed-kanban-cache.mjs`, `scripts/task-tracker/heal-entry-markers.mjs`, `scripts/task-tracker/heal-refine-entry-marker.mjs`, `scripts/task-tracker/timing-rollup.mjs`, `scripts/task-tracker/verbs/plan-approve.mjs`, `scripts/task-tracker/verbs/promote.mjs`, `scripts/task-tracker/verbs/reconcile.mjs`, `scripts/task-tracker/verbs/review.mjs`, `scripts/gh/move-state.mjs`, `scripts/gh/scaffold-web-issue.mjs`, `scripts/maintenance/heal-stage-rollups.mjs`, `scripts/maintenance/lib/corpus-marker-transforms.mjs`, `scripts/maintenance/lib/heal-stage-rollups-core.mjs`, `scripts/maintenance/migrate-markers-corpus.mjs`, and `scripts/maintenance/verify-389.mjs` — import the shared parser/serializer or the explicitly named legacy primitive; remove locally constructed entry-marker regexes.
- Create: `scripts/task-tracker/lib/move-state/transition-commit.mjs` — transition-ID record codec, verified comment write/read, repair, deterministic backfill identity, and mixed-corpus provenance reads.
- Modify: `scripts/task-tracker/lib/move-state/{audit-timing,github-mutation,sentinel,move-state-core,post-commit-tail}.mjs` — carry one transition ID through rows/marker/sentinel, write/repair commit provenance, and preserve saga ordering.
- Modify: `scripts/task-tracker/lib/move-state/guard-execution.mjs` — accept one immutable gate context and preserve all shipped warnings/refusal details.
- Modify: `scripts/task-tracker/lib/repository-adapter.mjs` and `scripts/task-tracker/lib/state-cursor.mjs` — final hydration, gate, damage carry, and `moveState` under one provenance-aware boundary lock.
- Modify: `scripts/gh/move-state.mjs` — expose public `ctx.runGuardExecution` with precedence over the underscore test seam.
- Modify: `scripts/task-tracker/verbs/promote.mjs`, `scripts/task-tracker/verbs/refine.mjs`, `scripts/task-tracker/verbs/plan.mjs`, `scripts/task-tracker/verbs/test.mjs`, `scripts/task-tracker/verbs/review.mjs`, `scripts/task-tracker/verbs/close.mjs`, `scripts/task-tracker/verbs/demote.mjs`, `scripts/task-tracker/verbs/reject.mjs`, `scripts/task-tracker/verbs/shelve.mjs`, `scripts/task-tracker/verbs/park.mjs`, `scripts/task-tracker/verbs/cancel-plan.mjs`, `scripts/task-tracker/verbs/supersede.mjs`, `scripts/task-tracker/verbs/plan-approve.mjs`, `scripts/task-tracker/verbs/approve.mjs`, `scripts/task-tracker/verbs/start.mjs`, `scripts/task-tracker/verbs/resume.mjs`, and `scripts/task-tracker/verbs/switch.mjs` — map command semantics to Cursor triggers without changing human gates.
- Modify: `scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs` and existing move-state atomicity/idempotency/tail/concurrency suites — prove parity and TOCTOU closure.
- Modify: `docs/architecture/state-machine.md` and `docs/guides/workflow.md` — document repository authority, dormancy, wake-up, recovery, and Review pilot behavior.

## Shared Interfaces

`scripts/task-tracker/lib/state-factory.mjs` exports:

```js
export class InvalidStateDefinitionError extends Error {
  constructor(code, details = {}) {
    super(`invalid-state-definition:${code}`);
    this.name = 'InvalidStateDefinitionError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function createStateMachine({ definitions, policy });
// => Object.freeze({ order, byId, methodById, get, previous, next, backwardTargets })
```

`scripts/task-tracker/lib/task-snapshot.mjs` exports:

```js
export function provenance(value, source, details = {});
export function reconcileCurrentState({ target, signals, lastKnownState });
export function deriveStateVisitId({ state, marker, occurrence, transitionCommit });
export function createTaskSnapshot(input);
export function requireFresh(snapshot, paths);
```

`scripts/task-tracker/lib/repository-adapter.mjs` exports `RepositoryAdapter` with the exact accepted interface:

```js
export class RepositoryAdapter {
  hydrateTask({ issue, cwd, mode }) {}
  resolveLiveState({ issue }) {}
  readIssueBody({ issue }) {}
  readActionLedger({ issue, stateVisitId, actionId, maxLinks }) {}
  readGitSnapshot({ cwd }) {}
  readChecks({ issue, headSha }) {}
  readBoundWorktree({ issue, cwd }) {}
  appendActionEvent({ issue, event }) {}
  advanceActionLedgerHead({ issue, expectedHead, event }) {}
  recordLedgerDamageCarry({ snapshot, movementIntent }) {}
  withCorrelationIntent(input, operation) {}
  mutateActionEvidence({ issue, mutate }) {}
  now() {}
  withIssueLock(options, operation) {}
  withBoundaryLock(options, operation) {}
  runPreMutationGate({ moveContext, snapshot, plan }) {}
  requestTransition({ moveContext, plan, gateResult }) {}
}
```

`scripts/task-tracker/lib/resident-action-runner.mjs` exports:

```js
export const VERIFY_STATUSES = Object.freeze(['complete', 'incomplete']);
export const ACTION_OUTCOMES = Object.freeze(['complete', 'waiting', 'paused', 'failed']);
export function createResidentActionRunner({ repository, actionContext });
// runner.resume(actions, snapshot, { trigger, writeAuthorized })
```

`scripts/task-tracker/lib/state-cursor.mjs` exports:

```js
export class BoundaryLockAcquireError extends Error {}
export function normalizeMovementIntent({ trigger, requestedTarget, flags });
export function buildMoveContext(input);
export function createStateCursor({ machine, repository, actions });
// cursor.execute({ issue, cwd, trigger, requestedTarget, flags })
```

`scripts/task-tracker/lib/stage-entry-grammar.mjs` exports only pure grammar helpers:

```js
export const ENTRY_MARKER_RE;
export const LEGACY_COLON_ENTRY_MARKER_RE;
export function parseEntryMarker(line);
export function parseEntryMarkers(body);
export function serializeEntryMarker({ state, visit, ts, move });
```

---

## Story A — Topology Single-Sourcing and Pure Factory

### Task 1: Define and validate immutable three-list state components

**Files:**

- Create: `scripts/task-tracker/lib/state-method-registry.mjs`
- Create: `scripts/task-tracker/lib/state-factory.mjs`
- Create: `scripts/tests/unit/task-tracker/states/state-factory.test.mjs`

**Interfaces:**

- Consumes: `stateIds()`, `normalizeStateId()`, `forwardTarget()`, `backwardTargets()`, and `validateExecutableTransition()`.
- Produces: `InvalidStateDefinitionError`, `validateStateMethod`, `buildMethodIndex`, and `createStateMachine`.

- [ ] **Step 1: Write failing factory contract tests**

Create the test with `// @story #1117`. Define frozen guard/action fixtures and assert the exact accepted shape and failures:

```js
const guard = Object.freeze({ id: 'shared-guard', run: async () => ({ ok: true }) });
const action = Object.freeze({
  id: 'shared-action',
  serialization: 'correlation',
  verify: async () => ({ status: 'incomplete', reason: 'missing' }),
  run: async () => ({ status: 'paused', reason: 'test-yield' }),
});

test('factory freezes direct references and policy-backed navigation', () => {
  const machine = createStateMachine({ definitions: definitionsUsing(guard, action), policy });
  assert.deepEqual(machine.order, stateIds());
  assert.equal(machine.get('test').entryGuards[0], guard);
  assert.equal(machine.get('test').residentActions[0], action);
  assert.equal(machine.next('test'), forwardTarget('test'));
  assert.deepEqual(machine.backwardTargets('review'), backwardTargets('review'));
  assert.throws(() => machine.get('test').residentActions.push(action), TypeError);
});

for (const [code, mutate] of [
  ['duplicate-state-id', duplicateNormalizedState],
  ['state-order-mismatch', reverseDefinitions],
  ['duplicate-method-id', duplicateActionInOneList],
  ['unknown-method-contract', removeActionVerify],
  ['resident-action-definition-cap', addNinetySeventhAction],
  ['resident-action-id', addUnsafeActionId],
]) {
  test(`factory refuses ${code}`, () => {
    assert.throws(
      () => createStateMachine({ definitions: mutate(baseDefinitions), policy }),
      (error) => error instanceof InvalidStateDefinitionError && error.code === code
    );
  });
}
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `node --test scripts/tests/unit/task-tracker/states/state-factory.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `state-factory.mjs`.

- [ ] **Step 3: Implement method and factory validation**

Implement `validateStateMethod(method, kind)` so guards require `{ id, run }`, actions require `{ id, serialization, verify, run }`, IDs match the 96-byte ASCII grammar, and action serialization is `correlation` or `issue-lock`. `createStateMachine` must normalize IDs, compare exact order/membership to `policy.stateIds()`, reject duplicate IDs per list, validate every forward/reverse edge through `validateExecutableTransition`, freeze copied lists/definitions/indexes, and expose navigation by delegating to policy functions.

The diagnostic method index must be derived from references already present in definitions:

```js
export function buildMethodIndex(definitions) {
  const pairs = definitions
    .flatMap((definition) => [
      ...definition.entryGuards,
      ...definition.residentActions,
      ...definition.exitGuards,
    ])
    .map((method) => [method.id, method]);
  const byId = Object.create(null);
  for (const [id, method] of pairs) {
    const existing = byId[id];
    if (existing && existing !== method) {
      throw new InvalidStateDefinitionError('method-id-reference-conflict', { id });
    }
    byId[id] = method;
  }
  return Object.freeze(byId);
}
```

- [ ] **Step 4: Run factory tests to green**

Run: `node --test scripts/tests/unit/task-tracker/states/state-factory.test.mjs`

Expected: PASS with tests covering immutability, reference identity, aliases, duplicate states/methods, order parity, limits, and navigation.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/task-tracker/lib/state-method-registry.mjs \
  scripts/task-tracker/lib/state-factory.mjs \
  scripts/tests/unit/task-tracker/states/state-factory.test.mjs
git commit -m "[#1117] feat: add immutable lifecycle state factory"
```

### Task 2: Project factory definitions through the legacy state and guard surfaces

**Files:**

- Modify: `scripts/task-tracker/states/backlog.mjs`
- Modify: `scripts/task-tracker/states/refine.mjs`
- Modify: `scripts/task-tracker/states/ready-for-plan.mjs`
- Modify: `scripts/task-tracker/states/plan.mjs`
- Modify: `scripts/task-tracker/states/develop.mjs`
- Modify: `scripts/task-tracker/states/test.mjs`
- Modify: `scripts/task-tracker/states/review.mjs`
- Modify: `scripts/task-tracker/states/done.mjs`
- Modify: `scripts/task-tracker/states/index.mjs`
- Modify: `scripts/task-tracker/lib/state-bootstrap.mjs`
- Modify: `scripts/task-tracker/lib/guard-registry.mjs`
- Modify: `scripts/tests/unit/task-tracker/states/states-skeleton.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs`

**Interfaces:**

- Consumes: `createStateMachine` and all existing direct guard references.
- Produces: `STATE_MACHINE`; compatibility `STATES`, `FORWARD_CHAIN`, `getState`, `bootstrapGuards`, `registerGuard`, and `runGuards` retain shipped shapes.

Run: `node --test scripts/tests/unit/task-tracker/states/state-factory.test.mjs`

- [ ] **Step 1: Extend characterization tests before changing state modules**

Assert every raw state spec has only `id`, `entryGuards`, `residentActions`, and `exitGuards`; every compatibility state has `name`, `entryGuards`, `exitGuards`, and legacy empty `onEnter`; and `runGuards` preserves aggregate order, blockers, warnings, malformed-result coercion, thrown-result coercion, idempotent registration, empty direct import, and the temporary `derived.refinementPlan` compatibility mirror.

```js
test('factory and compatibility surfaces preserve one guard identity', () => {
  const definition = STATE_MACHINE.get('review');
  const compatibility = getState('review');
  assert.equal(compatibility.entryGuards[0], definition.entryGuards[0]);
  assert.equal(compatibility.exitGuards[0], definition.exitGuards[0]);
  assert.deepEqual(compatibility.onEnter, []);
});
```

- [ ] **Step 2: Run the state and policy tests and record the shape failure**

Run:

```bash
node --test scripts/tests/unit/task-tracker/states/states-skeleton.test.mjs \
  scripts/tests/unit/task-tracker/states/state-factory.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs \
  scripts/tests/unit/task-tracker/core/guard-registry.test.mjs
```

Expected: FAIL because state modules still export `{ name, entryGuards, exitGuards, onEnter }` and no `STATE_MACHINE` exists.

- [ ] **Step 3: Convert state modules and add compatibility projections**

Each state module exports a frozen raw spec in this form, retaining its existing direct guard objects and order:

```js
export default Object.freeze({
  id: 'review',
  entryGuards: Object.freeze([contiguityEntryGuard, bodyGatesEntryGuardReview]),
  residentActions: Object.freeze([]),
  exitGuards: Object.freeze([
    blockedByGuard,
    reviewExitReviewApprovedGuard,
    reviewExitEpicChildrenDoneGuard,
    reviewExitEpicChildDispositionGuard,
    reviewExitCloseGatesGuard,
    childCannotLeadEpicExitGuard,
  ]),
});
```

Build `STATE_MACHINE` once in `states/index.mjs`. Derive `STATES` as frozen compatibility objects whose `name` aliases `id`, whose guard lists share the machine's list objects, and whose `onEnter` is the frozen legacy list. Derive `FORWARD_CHAIN` only through `STATE_MACHINE.next(id)`. Update `state-bootstrap` to walk `STATE_MACHINE.order` and populate the unchanged mutable `GUARDS` only when explicitly imported. Extend guard invocation to aggregate `result.derived` into a frozen replacement and mirror only `derived.refinementPlan` to `ctx.refinementPlan` until all legacy consumers migrate.

- [ ] **Step 4: Run Story A focused and package-fast gates**

Run:

```bash
node --test scripts/tests/unit/task-tracker/states/state-factory.test.mjs \
  scripts/tests/unit/task-tracker/states/states-skeleton.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs \
  scripts/tests/unit/task-tracker/core/guard-registry.test.mjs \
  scripts/tests/unit/task-tracker/lib/guard-registry-entry-fields.test.mjs \
  scripts/tests/unit/task-tracker/lib/guard-registry-plan-exit.test.mjs \
  scripts/tests/unit/task-tracker/lib/guard-registry-review-exit.test.mjs
npm test
```

Expected: all focused tests and the fast lane PASS with no runtime behavior change.

- [ ] **Step 5: Commit Story A**

```bash
git add scripts/task-tracker/states/backlog.mjs scripts/task-tracker/states/refine.mjs \
  scripts/task-tracker/states/ready-for-plan.mjs scripts/task-tracker/states/plan.mjs \
  scripts/task-tracker/states/develop.mjs scripts/task-tracker/states/test.mjs \
  scripts/task-tracker/states/review.mjs scripts/task-tracker/states/done.mjs \
  scripts/task-tracker/states/index.mjs scripts/task-tracker/lib/state-bootstrap.mjs \
  scripts/task-tracker/lib/guard-registry.mjs \
  scripts/tests/unit/task-tracker/states/states-skeleton.test.mjs \
  scripts/tests/unit/task-tracker/states/state-factory.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs
git commit -m "[#1117] refactor: compose states through lifecycle policy"
```

---

## Story B — Repository Adapter, Snapshot, and Bounded Reads

### Task 3: Model provenance-bearing snapshots and current-state reconciliation

**Files:**

- Create: `scripts/task-tracker/lib/task-snapshot.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs`

**Interfaces:**

- Consumes: `isMoveComplete`, parsed last-known state, entry-marker occurrences, and optional transition-commit provenance.
- Produces: frozen `ProvenanceValue`, `TaskSnapshot`, current-state verdict, visit identity, and consumer-specific freshness refusal.

- [ ] **Step 1: Write failing reconciliation and immutability tests**

Cover confirmed target, marker-ahead-of-board replay, Status-at-target without sentinel, genuine post-condition drift, legacy visit identity, transition-ID visit identity, missing commit provenance diagnostic, and partial freshness:

```js
test('confirmed movement selects the target from all five signals', () => {
  const current = reconcileCurrentState({
    target: 'review',
    signals: {
      sentinelState: 'review',
      statusState: 'review',
      entryMarkerPresent: true,
      exitRowPresent: true,
      entryRowPresent: true,
    },
    lastKnownState: 'review',
  });
  assert.deepEqual(current, { status: 'current', state: 'review', recovery: null });
});

test('snapshot freshness is field-scoped and immutable', () => {
  const snapshot = createTaskSnapshot(snapshotInput({ checksFresh: false }));
  assert.deepEqual(requireFresh(snapshot, ['currentState', 'headSha']), { ok: true, missing: [] });
  assert.deepEqual(requireFresh(snapshot, ['checks']), { ok: false, missing: ['checks'] });
  assert.throws(() => {
    snapshot.currentState.value = 'done';
  }, TypeError);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing snapshot API**

Run: `node --test scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs`

Expected: FAIL because `task-snapshot.mjs` does not exist.

- [ ] **Step 3: Implement snapshot construction without I/O**

`reconcileCurrentState` must use all five `isMoveComplete` signals. It returns explicit `current`, `incomplete-move`, or `drift` verdicts with the named recovery command and never changes evidence. `deriveStateVisitId` uses the selected modern transition ID; otherwise it uses `(state, visit suffix, durable marker occurrence)` and treats timestamps as diagnostic only. `createTaskSnapshot` deep-freezes provenance fields, derived values, action-ledger diagnostics, and invocation metadata.

- [ ] **Step 4: Run snapshot tests to green**

Run: `node --test scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs`

Expected: PASS for all state-reconciliation, visit-identity, freshness, and immutability cases.

- [ ] **Step 5: Commit Task 3**

```bash
git add scripts/task-tracker/lib/task-snapshot.mjs \
  scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs
git commit -m "[#1117] feat: reconstruct immutable task snapshots"
```

### Task 4: Parse bounded resident-action evidence and supply production/offline adapters

**Files:**

- Create: `scripts/task-tracker/lib/resident-action-ledger-codec.mjs`
- Create: `scripts/task-tracker/lib/resident-action-ledger-read.mjs`
- Create: `scripts/task-tracker/lib/repository-adapter.mjs`
- Create: `scripts/tests/helpers/in-memory-repository-adapter.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs`

**Interfaces:**

- Consumes: task-snapshot constructors, issue body/comments, live Project Status, local Git/worktree evidence, and injected providers.
- Produces: `RepositoryAdapter`, `InMemoryRepositoryAdapter`, canonical ledger codecs, bounded `readActionLedger`, and offline mode.

- [ ] **Step 1: Add failing adapter and bounded-read tests**

Use the in-memory adapter as a persistent fake, not a sequence of constant-return stubs. Assert inline-head reads, one spilled-head point read, a 404 followed by one fresh-body pointer retry, at most three current-attempt phase links, no timeline enumeration, legacy/current visit classification, and observation-only damaged diagnostics.

```js
test('spill collection race retries once from the fresh body pointer', async () => {
  const repository = seededRepository({ body: bodyPointingAt('101'), missingComments: ['101'] });
  repository.onMissingComment('101', () => repository.setBody(bodyPointingAt('102')));
  repository.addComment('102', validSpillHead());
  const snapshot = await repository.hydrateTask({ issue: 1117, cwd: '/worktree' });
  assert.equal(snapshot.actionLedger.status, 'clean');
  assert.deepEqual(repository.reads.commentIds, ['101', '102']);
  assert.equal(repository.reads.issueBody, 2);
});

test('offline hydration performs no GitHub operation', async () => {
  const repository = seededRepository({ rejectNetwork: true });
  await repository.hydrateTask({ issue: 1117, cwd: '/worktree', mode: 'offline' });
  assert.deepEqual(repository.networkOperations, []);
  await assert.rejects(() => repository.requestTransition({}), /offline-boundary-refused/);
});
```

- [ ] **Step 2: Run the adapter test and confirm missing modules**

Run: `node --test scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs`

Expected: FAIL with missing codec/adapter imports.

- [ ] **Step 3: Implement canonical codecs and bounded readers**

Define schemas `aitm.resident-action-event/v1`, `aitm.resident-action-head/v1`, and the inline/spill body head. Each event contains `eventId`, `previousCommentId`, `previousHash`, `actionPreviousCommentId`, `actionPreviousHash`, `issue`, `state`, `stateVisitId`, `actionId`, `attemptId`, `phase`, `correlation`, `ts`, optional `deadline`, optional `attribution`, and optional evidence fingerprint. Use stable key ordering, SHA-256 fingerprints, strict base64url decoding, byte-based limits, and explicit diagnostics. Normal hydration reads only the body head, the current spill head when present, the current action's latest event, and at most its three phase links. When a spill point fetch is missing, re-read the body once and retry only a changed pointer.

- [ ] **Step 4: Implement production and in-memory adapters**

Production methods receive narrow constructor-injected `gh`, `git`, lock, body-mutation, check, and clock capabilities. `hydrateTask` batches one invocation's reads, passes provenance into `createTaskSnapshot`, and never mutates. The in-memory adapter stores body, Status, comments, Git snapshot, checks, worktree binding, locks, and ordered mutation/read history across calls.

- [ ] **Step 5: Run Story B focused and package-fast gates**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs \
  scripts/tests/unit/task-tracker/lib/stage-entry-markers-core.test.mjs \
  scripts/tests/unit/task-tracker/lib/stage-entry-markers-reentry.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state/move-state-idempotent.test.mjs
npm test
```

Expected: PASS; production offline hydration makes no GitHub call and existing movement remains unchanged.

- [ ] **Step 6: Commit Story B**

```bash
git add scripts/task-tracker/lib/task-snapshot.mjs \
  scripts/task-tracker/lib/resident-action-ledger-codec.mjs \
  scripts/task-tracker/lib/resident-action-ledger-read.mjs \
  scripts/task-tracker/lib/repository-adapter.mjs \
  scripts/tests/helpers/in-memory-repository-adapter.mjs \
  scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs
git commit -m "[#1117] feat: hydrate repository-backed cursor evidence"
```

---

## Story C — Resident Actions, Cursor, Ledger Protection, and Review

### Task 5: Add monotonic inline/spill ledger-head protection

**Files:**

- Create: `scripts/task-tracker/lib/resident-action-ledger-write.mjs`
- Modify: `scripts/task-tracker/lib/body-invariants.mjs`
- Modify: `scripts/task-tracker/lib/issue-body-mutate.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs`

**Interfaces:**

- Consumes: ledger codecs and `mutateIssueBody` version retries.
- Produces: `MarkerAdvanceError`, `validateMarkerAdvances`, `advanceActionLedgerHead`, genesis heads, and inline/spill transition validation.

Run: `node --test scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs`

- [ ] **Step 1: Write failing invariant and budget tests**

Register the ledger head with `kind: 'advance'`. Assert presence detection, exact predecessors, attempt/phase monotonicity, same-visit `inline→spill` and `spill→spill`, new-visit `spill→inline`, refusal of same-visit spill regression, stale expected heads, 8,192/57,344 thresholds, automatic spill, 60 KiB/4 KiB caps, and validation on every fresh retry base.

```js
test('ledger advance is narrow and retry-base monotonic', async () => {
  const bases = [headAt('intent', 1), headAt('waiting', 1)];
  const result = await mutateIssueBody({
    issueNumber: 1117,
    mutate: (base) => replaceHead(base, headAt('resolved', 1)),
    allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
    deps: retryingBodyDeps(bases),
  });
  assert.equal(parseHead(result.body).phase, 'resolved');
});

test('same-visit spill to inline is refused', () => {
  assert.throws(
    () =>
      validateMarkerAdvances(spillHead, inlineHead, {
        allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
      }),
    (error) => error instanceof MarkerAdvanceError && error.reason === 'spill-regression'
  );
});
```

- [ ] **Step 2: Run focused tests and confirm the unsupported `advance` kind**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs
```

Expected: FAIL because `advance`, `allowMarkerAdvance`, and the ledger writer are absent.

- [ ] **Step 3: Implement pure advance validation and fresh-base mutation**

Add `validateAdvance({ markerId, baseMatch, nextMatch, baseBody, nextBody })` to the invariant registration. `findLostMarkers` treats `advance` as presence-only. `validateMarkerAdvances` is synchronous and performs no network calls. `mutateIssueBody` invokes it inside `guardedMutate(baseBody)` on every retry and throws `MarkerAdvanceError` with marker/fingerprint/reason fields. `advanceActionLedgerHead` writes/read-back-verifies a spill comment before body mutation and point-verifies it again after the body write.

- [ ] **Step 4: Run ledger-head tests to green**

Run the Step 2 command.

Expected: PASS with all existing marker-loss, checkbox-proof, section-loss, and large-shrink invariants still armed.

- [ ] **Step 5: Commit Task 5**

```bash
git add scripts/task-tracker/lib/resident-action-ledger-write.mjs \
  scripts/task-tracker/lib/body-invariants.mjs \
  scripts/task-tracker/lib/issue-body-mutate.mjs \
  scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs
git commit -m "[#1117] feat: protect resident action ledger advances"
```

### Task 6: Append, recover, audit, reconcile, and collect ledger records

**Files:**

- Modify: `scripts/task-tracker/lib/resident-action-ledger-write.mjs`
- Create: `scripts/task-tracker/verbs/action-ledger.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `scripts/task-tracker/lib/gh-edit-guard.mjs`
- Modify: `scripts/task-tracker/bash-guard.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/gh-edit-guard-protected-comments.test.mjs`
- Create: `scripts/tests/unit/task-tracker/verbs/action-ledger.test.mjs`

**Interfaces:**

- Consumes: deterministic codec IDs/hashes, issue lock, versioned head advance, and injected comment APIs.
- Produces: `appendActionEvent`, `recoverOrphanedEvent`, `auditActionLedger`, `reconcileActionLedger`, `collectSupersededSpillHeads`, and protected-comment CLI guards.

Run: `node --test scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs`

- [ ] **Step 1: Write failing event/repair/protection tests**

Cover genesis before first event, the finite phase graph, one-based attempt derivation, deterministic exact retry no-op, definition fingerprint changes, within-visit action-union retention across upgrade/rollback, legitimate attempt 1 for newly added actions, full pagination during orphan recovery, interrupted scan pause, ambiguous/missing/altered event damage, correction baseline with `proof: 'unproven'`, damage carry visibility, GC reachability, failed deletion warning, protected generic edits/deletes, and ambiguous `--edit-last`/`--delete-last` refusal.

```js
test('failed attempts advance ordinal while open attempts reuse it', async () => {
  const store = ledgerStore();
  await store.append(event('intent', { attemptId: 1, correlation: key('A') }));
  await store.append(event('failed', { attemptId: 1, correlation: key('A') }));
  assert.equal(store.deriveAttempt({ verifyStatus: 'incomplete' }).attemptId, 2);
  await store.append(event('intent', { attemptId: 2, correlation: key('B') }));
  assert.deepEqual(store.deriveAttempt({ verifyStatus: 'incomplete' }), {
    attemptId: 2,
    correlation: key('B'),
    phase: 'intent',
  });
});

test('reconcile requires declared human approval and leaves proof unproven', async () => {
  await assert.rejects(() => reconcileActionLedger(input()), /human-approval-required/);
  const result = await reconcileActionLedger(
    input({ approvedBy: 'kendrick', reason: 'deleted event' })
  );
  assert.equal(result.head.actions['review-agent-validation'].proof, 'unproven');
  assert.match(result.correction.schema, /resident-action-ledger-correction\/v1/);
});
```

- [ ] **Step 2: Run focused tests and observe missing protocol behavior**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs \
  scripts/tests/unit/task-tracker/verbs/action-ledger.test.mjs \
  scripts/tests/unit/task-tracker/lib/gh-edit-guard-protected-comments.test.mjs
```

Expected: FAIL for event append/recovery/reconcile and comment protection.

- [ ] **Step 3: Implement append, orphan recovery, audit, correction, and GC**

Create/read-back-verify each permanent event comment before advancing the head. Exact retries recompute the same event ID and require byte-for-byte equality. Recovery paginates all comments newer than the audit head and accepts one deterministic candidate with exact global/action predecessors. Reconcile runs under the issue lock, never fabricates deleted bytes, appends the correction record, and advances affected action heads to `proof: 'unproven'`. GC deletes only a spill snapshot proven unreachable from a fresh body head and verified successor.

- [ ] **Step 4: Protect managed comments**

Extend the managed command guard to inspect target comment bodies and refuse edits/deletes of transition commits, resident events, current spill heads, damage carries, and corrections. `action-ledger gc` is the only deletion path and must carry its reachability proof. Keep visible do-not-edit guidance in every protected comment.

- [ ] **Step 5: Run Task 6 tests to green**

Run the Step 2 command.

Expected: PASS; interrupted mechanical recovery returns `paused: ledger-orphan-scan-interrupted`, while damaged chains require the human-approved command.

- [ ] **Step 6: Commit Task 6**

```bash
git add scripts/task-tracker/lib/resident-action-ledger-write.mjs \
  scripts/task-tracker/verbs/action-ledger.mjs scripts/task-tracker/lib/gh-edit-guard.mjs \
  scripts/task-tracker/bash-guard.mjs scripts/task-tracker/task-tracker.mjs \
  scripts/task-tracker/lib/command-surface/catalog.mjs \
  scripts/lib/self-doc.mjs scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs \
  scripts/tests/unit/task-tracker/lib/gh-edit-guard-protected-comments.test.mjs \
  scripts/tests/unit/task-tracker/verbs/action-ledger.test.mjs
git commit -m "[#1117] feat: recover and reconcile resident action evidence"
```

### Task 7: Execute resident actions with verify-first correlation semantics

**Files:**

- Create: `scripts/task-tracker/lib/resident-action-runner.mjs`
- Modify: `scripts/task-tracker/lib/repository-adapter.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs`

**Interfaces:**

- Consumes: state definitions, snapshots, ledger reader/writer, short issue locks, injected providers, and clock.
- Produces: `runner.resume(actions, snapshot, { trigger, writeAuthorized })` and frozen action capability context.

- [ ] **Step 1: Write failing traversal, deadline, and concurrency tests**

Assert scan-from-start on every invocation, complete evidence skipping `run`, stale evidence rerun, closure of open intent/waiting as correlated or observed, deadline behavior exactly at/beyond injected time, malformed waiting refusal, rehydration after effects, final verify, stale-visit refusal immediately before provider submission, one winning correlation key across concurrent Cursors, and action-lock contention as paused rather than exit 7.

```js
test('verify-first execution never calls run for fresh completion', async () => {
  const action = actionDouble({ verify: [{ status: 'complete', evidence: { sha: 'abc' } }] });
  const result = await runner.resume([action], snapshot(), {
    trigger: 'actions-only',
    writeAuthorized: true,
  });
  assert.equal(result.status, 'complete');
  assert.equal(action.calls.run, 0);
});

test('correlation intent revalidates visit before provider effect', async () => {
  repository.changeVisitDuringIntent('review:1', 'review:2');
  const result = await runner.resume([externalAction], snapshot({ stateVisitId: 'review:1' }), {
    trigger: 'resident-entry',
    writeAuthorized: true,
  });
  assert.deepEqual(result, { status: 'paused', reason: 'stale-state-visit' });
  assert.equal(repository.providerEffects.length, 0);
});
```

- [ ] **Step 2: Run the focused action suite and confirm the missing runner**

Run: `node --test scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs`

Expected: FAIL because `resident-action-runner.mjs` is missing.

- [ ] **Step 3: Implement the ordered execution algorithm**

For each action: hydrate/fold its record, call `verify`, close an open verified attempt when write-authorized, skip fresh completion, call `run` only for incomplete evidence, rehydrate after any possible effect, verify again, append the terminal event, and stop on waiting/paused/failed/unverifiable. `waiting` requires a verified waiting event, correlation, and ISO deadline. Expiry is read-only during hydration and becomes a deterministic failed event only in a write-authorized invocation.

- [ ] **Step 4: Freeze and enforce the capability surface**

Construct the action context once from `now`, `hydrateTask`, `resolveCorrelation`, `withCorrelationIntent`, ledger methods, `mutateActionEvidence`, and narrow `git`/`pullRequests`/`checks`/`receipts`/`instructions` adapters. Actions must not receive movement, raw `gh`, lock directories, or ambient clocks.

- [ ] **Step 5: Run action tests to green**

Run the Step 2 command.

Expected: PASS, including concurrent correlation selection, issue-lock-class local mutation, observed completion, stale regression, and no persisted action index.

- [ ] **Step 6: Commit Task 7**

```bash
git add scripts/task-tracker/lib/resident-action-runner.mjs \
  scripts/task-tracker/lib/repository-adapter.mjs \
  scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs
git commit -m "[#1117] feat: resume verify-first resident actions"
```

### Task 8: Add the ephemeral Cursor and Story C compatibility boundary

**Files:**

- Create: `scripts/task-tracker/lib/state-cursor.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs`

**Interfaces:**

- Consumes: machine, repository adapter, resident-action runner, and `computeTransitionPlan`.
- Produces: actions-only, forward, reverse, and bypass execution with discriminated results; Story C boundary adapter delegates the entire crossing to the shipped host.

Run: `node --test scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs`

- [ ] **Step 1: Write failing trigger and result tests**

Cover matrix refusal before effects, self-target resident resume before no-op, actions-only without boundary, forward actions before boundary, reverse/bypass skipping actions, incomplete/damaged ordinary-forward refusal, one explicit target only, source drift, every gate/move/lock/internal result shape, confirmed move before target action, and crash between move confirmation and target action.

```js
test('ordinary forward completes residents before requesting one boundary', async () => {
  const result = await cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'advance-forward',
    requestedTarget: 'review',
  });
  assert.deepEqual(
    repository.calls.map(({ name }) => name),
    [
      'hydrateTask',
      'resume:test',
      'requestLegacyBoundary:test->review',
      'hydrateTask',
      'resume:review',
    ]
  );
  assert.equal(result.kind, 'resident-result');
});

test('force records skipped actions without resolving them', async () => {
  const result = await cursor.execute({
    issue: 1117,
    cwd: '/worktree',
    trigger: 'bypass',
    requestedTarget: 'done',
    flags: { force: true, reason: 'operator recovery' },
  });
  assert.deepEqual(repository.lastMove.skippedResidentActions, ['review-agent-validation']);
  assert.equal(
    repository.events.some(({ phase }) => phase === 'resolved'),
    false
  );
  assert.equal(result.kind, 'moved');
});
```

- [ ] **Step 2: Run Cursor tests and confirm the missing executor**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs
```

Expected: FAIL because `state-cursor.mjs` is missing.

- [ ] **Step 3: Implement evidence-free intent/plan plus Story C execution**

Normalize trigger/target/flags without reading evidence. Compute matrix/bypass/no-op before resident work; return matrix refusal immediately. Resume only for actions-only or non-bypassed forward. Return legal no-op only after residents finish. In Story C, call one injected `requestLegacyBoundary` that retains the current host's unlocked guard/lock/`moveState` sequence byte-for-byte. Rehydrate only after a confirmed move, then enter target residents.

- [ ] **Step 4: Preserve discriminated results exactly**

Return `matrix-refused`, `noop`, `resident-complete`, `dormant`, `drift`, `gate-refused`, `move-refused`, `boundary-lock-refused`, `invalid-boundary-result`, or `moved`/target resident result. Preserve guard exits/refusals/warnings and saga phase/item/sentinel/board diagnostics; unknown boundary kinds become exit 1 and never enter target actions.

- [ ] **Step 5: Run Cursor tests to green**

Run the Step 2 command.

Expected: PASS with one-boundary and target-after-confirmation guarantees.

- [ ] **Step 6: Commit Task 8**

```bash
git add scripts/task-tracker/lib/state-cursor.mjs \
  scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs
git commit -m "[#1117] feat: execute state work with an ephemeral cursor"
```

### Task 9: Migrate Review as the first resident action

**Files:**

- Create: `scripts/task-tracker/lib/resident-actions/review-agent-validation.mjs`
- Modify: `scripts/task-tracker/states/review.mjs`
- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/task-tracker/verbs/start.mjs`
- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Modify: `scripts/task-tracker/verbs/switch.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/promote-test-to-review-gate.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/review-probe-policy.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs`

**Interfaces:**

- Consumes: `runAgentReviewGate`, Review evidence helpers, mutation/timing capabilities, Cursor actions-only and forward triggers.
- Produces: `reviewAgentValidationAction` with stable ID `review-agent-validation` and `serialization: 'issue-lock'`.

Run: `node --test scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs`

- [ ] **Step 1: Extend Review characterization before extraction**

Assert Test→Review moves before agent validation; objection writes durable failed evidence and leaves Status Review; retry while already in Review is actions-only and does not replay Review entry guards; passing evidence skips `run`; probe stays Review-only; pass stamps Agent Review Passed and emits `review:passed`; objection emits `review:failed`; no automatic demotion occurs.

```js
test('review objection is dormant resident work in Review', async () => {
  const result = await invokeReview({ gate: objection('missing required comment') });
  assert.equal(result.status, 'failed');
  assert.equal(repository.status, 'review');
  assert.deepEqual(repository.boundaries, ['test->review']);
  assert.match(repository.body, /aitm-review-failed/);
});

test('review retry does not replay entry guards', async () => {
  repository.status = 'review';
  await invokeReview({ gate: passingGate() });
  assert.equal(repository.guardCalls.filter(({ phase }) => phase === 'entry').length, 0);
  assert.equal(repository.boundaries.length, 0);
});
```

- [ ] **Step 2: Run Review suites and confirm the action is still inline**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs \
  scripts/tests/unit/task-tracker/verbs/promote-test-to-review-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/review-probe-policy.test.mjs \
  scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs
```

Expected: FAIL new direct-reference/Cursor assertions because the action remains embedded in `verbReview`.

- [ ] **Step 3: Extract the Review action**

`verify(snapshot)` returns complete only when fresh Agent Review Passed evidence matches the current visit; otherwise incomplete with the exact objection/evidence reason. `run(snapshot, context)` obtains the post-entry body/comments/changed paths through capabilities, runs the gate, stamps failure or pass evidence, emits the shipped timing row, and returns `failed` or `complete` with evidence fingerprint. Preserve output and exit mapping in the verb adapter.

- [ ] **Step 4: Route Review entry and retry through Cursor**

Install the direct action reference in `review.residentActions`. Test→Review uses `advance-forward`; `review --probe`, rebind/resume in Review, callback, and retry use `actions-only`. Keep all command-level preflight, human approval prompts, duration/word handling, and targeted probe semantics outside the state action.

- [ ] **Step 5: Run Review and Story C focused suites**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs \
  scripts/tests/unit/task-tracker/verbs/promote-test-to-review-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/review-probe-policy.test.mjs \
  scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs
```

Expected: PASS with unchanged user-facing Review refusal/pass behavior.

- [ ] **Step 6: Commit Task 9**

```bash
git add scripts/task-tracker/lib/resident-actions/review-agent-validation.mjs \
  scripts/task-tracker/states/review.mjs scripts/task-tracker/verbs/review.mjs \
  scripts/task-tracker/verbs/start.mjs scripts/task-tracker/verbs/resume.mjs \
  scripts/task-tracker/verbs/switch.mjs scripts/task-tracker/task-tracker.mjs \
  scripts/task-tracker/lib/state-cursor.mjs \
  scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs \
  scripts/tests/unit/task-tracker/verbs/promote-test-to-review-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/review-probe-policy.test.mjs \
  scripts/tests/unit/task-tracker/lib/review-verb-timing-order.test.mjs
git commit -m "[#1117] refactor: run Review as a resident state action"
```

### Task 10: Prove resident-action conformance and interruption convergence

**Files:**

- Create: `scripts/tests/unit/task-tracker/lib/state-action-conformance.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/state-cursor-interruption.test.mjs`
- Modify: `scripts/tests/helpers/in-memory-repository-adapter.mjs`
- Modify: `scripts/task-tracker/lib/resident-action-ledger-codec.mjs`
- Modify: `scripts/task-tracker/lib/resident-action-ledger-read.mjs`
- Modify: `scripts/task-tracker/lib/resident-action-ledger-write.mjs`
- Modify: `scripts/task-tracker/lib/resident-action-runner.mjs`
- Modify: `scripts/task-tracker/lib/state-cursor.mjs`
- Modify: `scripts/task-tracker/lib/repository-adapter.mjs`
- Modify: `scripts/task-tracker/lib/resident-actions/review-agent-validation.mjs`

**Interfaces:**

- Consumes: Review action, runner, Cursor, and in-memory adapter.
- Produces: reusable action conformance harness and table-driven crash-prefix harness.

Run: `node --test scripts/tests/unit/task-tracker/lib/state-action-conformance.test.mjs`

- [ ] **Step 1: Write the reusable conformance harness**

For every registered resident action assert `verify` is read-only/deterministic, `run` plus fresh hydration converges to complete or a declared dormant state, correlation discovers an already-created effect, stale evidence fails, event/body budgets are checked before effects, and observed completion is audit-visible but boundary-equivalent to correlated completion.

- [ ] **Step 2: Write interruption cases for every durable boundary**

Inject aborts before/after genesis, intent, provider submission, waiting, resolved/failed, spill write, body-head advance, confirmed move, target hydration, and first target action. Start a fresh Cursor after each abort and assert convergence, no duplicate provider effect, one action attempt per phase, and at most one Status crossing.

```js
for (const point of INTERRUPTION_POINTS) {
  test(`fresh Cursor converges after ${point}`, async () => {
    const repository = scenarioWithAbort(point);
    await assert.rejects(() => executeOnce(repository), AbortAtPoint);
    repository.disableAbort();
    const result = await executeFreshCursor(repository);
    assertConverged(result, repository);
    assertNoDuplicateEffects(repository);
    assertAtMostOneBoundary(repository);
  });
}
```

- [ ] **Step 3: Run conformance/interruption tests and fix only exposed Story C defects**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/state-action-conformance.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-cursor-interruption.test.mjs
```

Expected: initial failures identify exact non-convergent prefixes; after focused fixes both suites PASS.

- [ ] **Step 4: Run the complete Story C gate**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-action-conformance.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-cursor-interruption.test.mjs \
  scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs
npm test
npm run test:slow
```

Expected: focused, fast, and slow suites PASS; Story C remains shippable with the existing host boundary.

- [ ] **Step 5: Commit Story C**

```bash
git add scripts/tests/unit/task-tracker/lib/state-action-conformance.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-cursor-interruption.test.mjs \
  scripts/tests/helpers/in-memory-repository-adapter.mjs \
  scripts/task-tracker/lib/resident-action-ledger-codec.mjs \
  scripts/task-tracker/lib/resident-action-ledger-read.mjs \
  scripts/task-tracker/lib/resident-action-ledger-write.mjs \
  scripts/task-tracker/lib/resident-action-runner.mjs \
  scripts/task-tracker/lib/state-cursor.mjs \
  scripts/task-tracker/lib/repository-adapter.mjs \
  scripts/task-tracker/lib/resident-actions/review-agent-validation.mjs
git commit -m "[#1117] test: prove resident action crash convergence"
```

---

## Story D — Transition Identity and the Locked Boundary

### Task 11: Consolidate every entry-marker reader before writer rollout

**Files:**

- Create: `scripts/task-tracker/lib/stage-entry-grammar.mjs`
- Modify: `scripts/task-tracker/lib/stage-entry-markers.mjs`
- Modify: `scripts/task-tracker/lib/agent-review/review-gate.mjs`
- Modify: `scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs`
- Modify: `scripts/task-tracker/lib/close-gates.mjs`
- Modify: `scripts/task-tracker/lib/contiguity-entry-guard.mjs`
- Modify: `scripts/task-tracker/lib/deep-dive.mjs`
- Modify: `scripts/task-tracker/lib/derive-drivers.mjs`
- Modify: `scripts/task-tracker/lib/markers.mjs`
- Modify: `scripts/task-tracker/lib/move-state/github-mutation.mjs`
- Modify: `scripts/task-tracker/lib/move-state/readout.mjs`
- Modify: `scripts/task-tracker/lib/plan-approved-guard.mjs`
- Modify: `scripts/task-tracker/lib/seed-kanban-cache.mjs`
- Modify: `scripts/task-tracker/heal-entry-markers.mjs`
- Modify: `scripts/task-tracker/heal-refine-entry-marker.mjs`
- Modify: `scripts/task-tracker/timing-rollup.mjs`
- Modify: `scripts/task-tracker/verbs/plan-approve.mjs`
- Modify: `scripts/task-tracker/verbs/promote.mjs`
- Modify: `scripts/task-tracker/verbs/reconcile.mjs`
- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/gh/move-state.mjs`
- Modify: `scripts/gh/scaffold-web-issue.mjs`
- Modify: `scripts/maintenance/heal-stage-rollups.mjs`
- Modify: `scripts/maintenance/lib/corpus-marker-transforms.mjs`
- Modify: `scripts/maintenance/lib/heal-stage-rollups-core.mjs`
- Modify: `scripts/maintenance/migrate-markers-corpus.mjs`
- Modify: `scripts/maintenance/verify-389.mjs`
- Modify: `scripts/task-tracker/lib/body-invariants.mjs`
- Modify: `scripts/task-tracker/lib/gh-edit-guard.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/stage-entry-markers-core.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/stage-entry-markers-reentry.test.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/stage-entry-grammar-ownership.test.mjs`

**Interfaces:**

- Consumes: side-effect-free marker property grammar only.
- Produces: one order-insensitive entry parser, named legacy-colon primitive, canonical `ts` then `move` serializer, source ownership scan, and fail-closed import-graph assertion.

Run: `node --test scripts/tests/unit/task-tracker/lib/stage-entry-grammar-ownership.test.mjs`

- [ ] **Step 1: Characterize the entire existing marker corpus**

Build fixtures from all previously accepted modern and legacy shapes. Assert property order independence, aliases, visit suffixes, duplicate visits, legacy colon identity, body occurrence, and exact current output of every reader. Add a repository scan that fails when an executable `.mjs` outside `stage-entry-grammar.mjs` constructs an `aitm-entered` regex; exclude tests, fixtures, and prose only.

- [ ] **Step 2: Add the fail-closed Bash-guard import graph test**

Traverse static imports from `bash-guard.mjs` through the new grammar and fail if the reachable graph includes `node:child_process`, GitHub adapters, lifecycle policy, databases, or any process-executing module.

- [ ] **Step 3: Run grammar ownership tests and record current duplicate readers**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/stage-entry-grammar-ownership.test.mjs \
  scripts/tests/unit/task-tracker/lib/stage-entry-markers-core.test.mjs \
  scripts/tests/unit/task-tracker/lib/stage-entry-markers-reentry.test.mjs
```

Expected: FAIL listing each executable reader that still constructs its own regex.

- [ ] **Step 4: Implement the dependency-free grammar and migrate all readers**

`parseEntryMarker` accepts attributes in any order, optional visit suffix, optional `move`, and the named legacy colon shape. `serializeEntryMarker` emits `ts` then `move`. `stage-entry-markers`, body invariants, edit guard, runtime verbs, guards, healing tools, and maintenance transforms import these primitives; legacy-only transformations explicitly import `LEGACY_COLON_ENTRY_MARKER_RE`.

- [ ] **Step 5: Run grammar and package-fast gates**

Run the Step 3 command, then `npm test`.

Expected: PASS with no writer emitting `move` yet and no runtime behavior change.

- [ ] **Step 6: Commit the reader-first migration**

```bash
git add scripts/task-tracker/lib/stage-entry-grammar.mjs \
  scripts/task-tracker/lib/stage-entry-markers.mjs \
  scripts/task-tracker/lib/agent-review/review-gate.mjs \
  scripts/task-tracker/lib/agent-review/validators/timing-log-sequence.mjs \
  scripts/task-tracker/lib/body-invariants.mjs scripts/task-tracker/lib/close-gates.mjs \
  scripts/task-tracker/lib/contiguity-entry-guard.mjs scripts/task-tracker/lib/deep-dive.mjs \
  scripts/task-tracker/lib/derive-drivers.mjs scripts/task-tracker/lib/gh-edit-guard.mjs \
  scripts/task-tracker/lib/markers.mjs scripts/task-tracker/lib/move-state/github-mutation.mjs \
  scripts/task-tracker/lib/move-state/readout.mjs scripts/task-tracker/lib/plan-approved-guard.mjs \
  scripts/task-tracker/lib/seed-kanban-cache.mjs scripts/task-tracker/heal-entry-markers.mjs \
  scripts/task-tracker/heal-refine-entry-marker.mjs scripts/task-tracker/timing-rollup.mjs \
  scripts/task-tracker/verbs/plan-approve.mjs scripts/task-tracker/verbs/promote.mjs \
  scripts/task-tracker/verbs/reconcile.mjs scripts/task-tracker/verbs/review.mjs \
  scripts/gh/move-state.mjs scripts/gh/scaffold-web-issue.mjs \
  scripts/maintenance/heal-stage-rollups.mjs \
  scripts/maintenance/lib/corpus-marker-transforms.mjs \
  scripts/maintenance/lib/heal-stage-rollups-core.mjs \
  scripts/maintenance/migrate-markers-corpus.mjs scripts/maintenance/verify-389.mjs \
  scripts/tests/unit/task-tracker/lib/stage-entry-markers-core.test.mjs \
  scripts/tests/unit/task-tracker/lib/stage-entry-markers-reentry.test.mjs \
  scripts/tests/unit/task-tracker/lib/stage-entry-grammar-ownership.test.mjs
git commit -m "[#1117] refactor: single-source stage entry grammar"
```

### Task 12: Add invocation-stable transition IDs and best-effort commit provenance

**Files:**

- Create: `scripts/task-tracker/lib/move-state/transition-commit.mjs`
- Modify: `scripts/task-tracker/lib/move-state/audit-timing.mjs`
- Modify: `scripts/task-tracker/lib/move-state/github-mutation.mjs`
- Modify: `scripts/task-tracker/lib/move-state/sentinel.mjs`
- Modify: `scripts/task-tracker/lib/move-state/move-state-core.mjs`
- Modify: `scripts/task-tracker/lib/move-state/post-commit-tail.mjs`
- Modify: `scripts/task-tracker/lib/resident-action-ledger-read.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/move-state/move-state-core.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/move-state/move-state-idempotent.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/move-state/move-state-sentinel-write.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/stage-entry-markers-reentry.test.mjs`

**Interfaces:**

- Consumes: shared entry grammar, saga context, body/status/sentinel completion, and comment APIs.
- Produces: transition ID, `aitm.transition-commit/v1`, `writeTransitionCommit`, `repairTransitionCommit`, and deterministic `backfill:<sha256>` identity.

Run: `node --test scripts/tests/unit/task-tracker/lib/move-state/move-state-core.test.mjs`

- [ ] **Step 1: Write failing saga identity and provenance tests**

Assert one transition ID appears in exit/entry rows, entry marker, sentinel, and commit comment; same-second demote/re-promote visits differ; marker idempotency uses `(state, transitionId)`; committed movement succeeds with `commit-provenance-missing`; read-only probe creates no comment; replay schedules repair in the tail; backfill identity is deterministic; and legacy/current mixed visits never order by timestamp.

```js
test('transition commit failure warns without failing a confirmed move', async () => {
  const result = await moveState(ctx({ writeTransitionCommit: reject('github unavailable') }));
  assert.equal(result.exit, null);
  assert.equal(result.boardMoved, true);
  assert.equal(result.sentinelPresent, true);
  assert.deepEqual(
    result.warnings.map(({ code }) => code),
    ['commit-provenance-missing']
  );
});

test('already-complete probe stays read-only and tail repairs provenance', async () => {
  const calls = [];
  const result = await moveState(ctx({ alreadyComplete: true, calls }));
  assert.deepEqual(calls.slice(0, 2), ['probeCompletion', 'runPostCommitTail']);
  assert.equal(calls.includes('probeWritesComment'), false);
  assert.equal(result.alreadyComplete, true);
});
```

- [ ] **Step 2: Run move-state focused tests and confirm missing transition identity**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/move-state/move-state-core.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state/move-state-idempotent.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state/move-state-sentinel-write.test.mjs \
  scripts/tests/unit/task-tracker/lib/stage-entry-markers-reentry.test.mjs
```

Expected: FAIL new transition-ID/provenance assertions.

- [ ] **Step 3: Thread one ID through the unchanged saga order**

Create the ID once per invocation before phase rows. Carry it through phase evidence, `serializeEntryMarker`, and the final sentinel. Keep `probeCompletion` read-only. After sentinel plus board-marker consistency, create and read-back-verify the protected commit comment; catch failure as an ordered warning. On already-complete replay, select `repairTransitionCommit` in `runPostCommitTail` without mutating inside the probe.

- [ ] **Step 4: Implement mixed-corpus visit ordering**

Verified transition-commit comment IDs may order post-migration visits only when body occurrence and visit ordinals do not contradict. Whenever either visit lacks verified provenance, use durable body occurrence plus per-state ordinal; absence is diagnostic, while contradiction is drift. A confirmed current visit never becomes damage solely because its commit comment is missing.

- [ ] **Step 5: Run Task 12 tests to green**

Run the Step 2 command.

Expected: PASS with saga order still phase rows → marker → Status → sentinel → consistency → best-effort commit → tail.

- [ ] **Step 6: Commit Task 12**

```bash
git add scripts/task-tracker/lib/move-state/transition-commit.mjs \
  scripts/task-tracker/lib/move-state/audit-timing.mjs \
  scripts/task-tracker/lib/move-state/github-mutation.mjs \
  scripts/task-tracker/lib/move-state/sentinel.mjs \
  scripts/task-tracker/lib/move-state/move-state-core.mjs \
  scripts/task-tracker/lib/move-state/post-commit-tail.mjs \
  scripts/task-tracker/lib/resident-action-ledger-read.mjs \
  scripts/tests/unit/task-tracker/lib/move-state/move-state-core.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state/move-state-idempotent.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state/move-state-sentinel-write.test.mjs \
  scripts/tests/unit/task-tracker/lib/stage-entry-markers-reentry.test.mjs
git commit -m "[#1117] feat: identify and audit lifecycle transitions"
```

### Task 13: Move final hydration, complete gate, and transition under one boundary lock

**Files:**

- Modify: `scripts/task-tracker/lib/repository-adapter.mjs`
- Modify: `scripts/task-tracker/lib/state-cursor.mjs`
- Modify: `scripts/task-tracker/lib/move-state/guard-execution.mjs`
- Modify: `scripts/task-tracker/lib/move-state/move-state-core.mjs`
- Modify: `scripts/gh/move-state.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/move-state-internal-gate.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/move-state-lock.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/move-state/move-state-board-marker-atomicity.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/move-state/move-state-tail-error-diagnostics.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/issue-lock-reentrancy.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/gh/move-state-host-returns.test.mjs`

**Interfaces:**

- Consumes: shipped `withIssueLock`, `runGuardExecution`, `moveState`, final snapshot, and static transition plan.
- Produces: provenance-aware `withBoundaryLock`, public `ctx.runGuardExecution`, immutable gate context, damage-carry write, and final production boundary.

Run: `node --test scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs`

- [ ] **Step 1: Write failing single-vintage and lock-provenance tests**

Assert the lock spans final hydration, complete gate, damage carry, and `moveState`; pre-action hydration is never reused by guards; current-state drift refuses before gate; one immutable gate context contains skipped action evidence; the transition receives that exact object or a shallow copy adding only verified `damageCarry`; lock acquisition failure maps to exit 7, while `IssueLockError` thrown inside the callback preserves its original provenance.

```js
test('guard and transition consume one locked snapshot vintage', async () => {
  await cursor.execute(forwardRequest());
  assert.deepEqual(repository.callsInBoundary, [
    'hydrateTask',
    'buildMoveContext',
    'runPreMutationGate',
    'requestTransition',
  ]);
  assert.equal(repository.gateSnapshot, repository.transitionSnapshot);
  assert.equal(repository.gateContext, repository.transitionContext);
});

test('only acquisition failure becomes BoundaryLockAcquireError', async () => {
  await assert.rejects(
    () => repository.withBoundaryLock(options, neverRuns),
    BoundaryLockAcquireError
  );
  await assert.rejects(
    () => repository.withBoundaryLock(options, throwsNestedIssueLock),
    IssueLockError
  );
});
```

- [ ] **Step 2: Run boundary/movement tests and observe unlocked-gate failures**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state-internal-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state-lock.test.mjs \
  scripts/tests/unit/task-tracker/gh/move-state-host-returns.test.mjs
```

Expected: FAIL because Story C delegates the old unlocked gate/lock sequence.

- [ ] **Step 3: Implement the final locked algorithm**

Use `withBoundaryLock(lockOptions, callback)`. Inside: rehydrate, compare current state, build and freeze `gateContext`, call the complete `runPreMutationGate`, record damage carry only after a clean gate for reverse/bypass, and call `requestTransition`. Release the boundary lock before fresh target hydration/action execution. Measure and expose hold-time samples; configure bounded retry/backoff from measured p95 plus jitter under an operator-facing maximum without changing the 30-minute stale backstop.

- [ ] **Step 4: Preserve the full gate and move contracts**

`runPreMutationGate` keeps dirty Review warning, body-fetch classification, complete guard context including worktree-aware close deps, targeted contiguity refresh, gate-refused timing, lifecycle warnings, and sized Backlog warning. `moveState` selects `ctx.runGuardExecution ?? ctx._runGuardExecution ?? defaultRunGuardExecution`; the adapter passes a pre-evaluated public function so the saga does not repeat guards.

- [ ] **Step 5: Run Task 13 tests to green**

Run the Step 2 command plus:

```bash
node --test scripts/tests/unit/task-tracker/lib/move-state/move-state-board-marker-atomicity.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state/move-state-tail-error-diagnostics.test.mjs \
  scripts/tests/unit/task-tracker/lib/issue-lock-reentrancy.test.mjs
```

Expected: PASS with preserved exits 3/4/6/7/8, warnings, timing, recovery banners, re-entrancy, and tail isolation.

- [ ] **Step 6: Commit Task 13**

```bash
git add scripts/task-tracker/lib/repository-adapter.mjs \
  scripts/task-tracker/lib/state-cursor.mjs \
  scripts/task-tracker/lib/move-state/guard-execution.mjs \
  scripts/task-tracker/lib/move-state/move-state-core.mjs scripts/gh/move-state.mjs \
  scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state-internal-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state-lock.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state/move-state-board-marker-atomicity.test.mjs \
  scripts/tests/unit/task-tracker/lib/move-state/move-state-tail-error-diagnostics.test.mjs \
  scripts/tests/unit/task-tracker/lib/issue-lock-reentrancy.test.mjs \
  scripts/tests/unit/task-tracker/gh/move-state-host-returns.test.mjs
git commit -m "[#1117] fix: serialize cursor boundary decisions"
```

### Task 14: Route all command triggers, document recovery, and prove complete parity

**Files:**

- Modify: `scripts/task-tracker/verbs/promote.mjs`
- Modify: `scripts/task-tracker/verbs/refine.mjs`
- Modify: `scripts/task-tracker/verbs/plan.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Modify: `scripts/task-tracker/verbs/review.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/verbs/demote.mjs`
- Modify: `scripts/task-tracker/verbs/reject.mjs`
- Modify: `scripts/task-tracker/verbs/shelve.mjs`
- Modify: `scripts/task-tracker/verbs/park.mjs`
- Modify: `scripts/task-tracker/verbs/cancel-plan.mjs`
- Modify: `scripts/task-tracker/verbs/supersede.mjs`
- Modify: `scripts/task-tracker/verbs/plan-approve.mjs`
- Modify: `scripts/task-tracker/verbs/approve.mjs`
- Modify: `scripts/task-tracker/verbs/start.mjs`
- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Modify: `scripts/task-tracker/verbs/switch.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/move-inprocess-parity.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/promote-test-review-alias.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/promote-review-close-agent-review-gate.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/state-cursor-interruption.test.mjs`
- Modify: `docs/architecture/state-machine.md`
- Modify: `docs/guides/workflow.md`

**Interfaces:**

- Consumes: final Cursor triggers and existing command-specific human gates.
- Produces: one common execution entry for movement/resume/callback surfaces, unchanged command semantics, architecture/operator documentation, and final #1117 verification evidence.

Run: `node --test scripts/tests/unit/task-tracker/verbs/move-inprocess-parity.test.mjs`

- [ ] **Step 1: Add table-driven command-to-trigger parity tests**

Pin the accepted mapping: promote/next/refine/plan/test/review-from-Test/close → `advance-forward`; demote/reject/shelve/park/cancel-plan → `advance-reverse`; force/supersede → `bypass`; plan-approve/approve/review-probe/resume/bind/rebind/callback → `actions-only`. Assert each keeps its current target selection and human approval/preflight logic.

- [ ] **Step 2: Run command characterization and record direct-host call sites**

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/move-inprocess-parity.test.mjs \
  scripts/tests/unit/task-tracker/verbs/promote-test-review-alias.test.mjs \
  scripts/tests/unit/task-tracker/verbs/promote-review-close-agent-review-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs
```

Expected: FAIL new trigger assertions for verbs still calling movement/action behavior directly.

- [ ] **Step 3: Replace direct orchestration with thin trigger adapters**

Each verb retains argument parsing, current-state/home-state gates, approval prompts, and presentation, then calls the common Cursor with its explicit target and flags. Never let Cursor infer a second target. Keep `TT_SKIP_NETWORK`, `force`, `supersede`, reverse edges, background tail profile, and command-specific exit/readout mapping.

- [ ] **Step 4: Document stateless operation and recovery**

Update the architecture guide with the three-list component, repository authority, five-signal state reconciliation, resident-action ledger, action/transition lock scopes, one-boundary rule, infrastructure-vs-action distinction, and Review pilot. Update workflow guidance with dormant/wake-up semantics, `actions-only` retry, `action-ledger audit|gc|reconcile`, movement reconcile distinction, missing transition provenance warning, damaged-ledger bypass carry, and crash recovery.

- [ ] **Step 5: Run all focused #1117 suites**

Run:

```bash
node --test scripts/tests/unit/task-tracker/states/state-factory.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-cursor.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-action-resume.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-boundary-order.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-action-conformance.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-cursor-interruption.test.mjs \
  scripts/tests/unit/task-tracker/verbs/review-state-action.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run repository-wide verification**

Run:

```bash
npm run format:check
npm run lint
npm test
npm run test:slow
```

Expected: all commands exit 0. Confirm `git diff --check` prints nothing and `git status --short` lists only intended #1117 files.

- [ ] **Step 7: Commit Story D and documentation**

```bash
git add scripts/task-tracker/verbs/promote.mjs scripts/task-tracker/verbs/refine.mjs \
  scripts/task-tracker/verbs/plan.mjs scripts/task-tracker/verbs/test.mjs \
  scripts/task-tracker/verbs/review.mjs scripts/task-tracker/verbs/close.mjs \
  scripts/task-tracker/verbs/demote.mjs scripts/task-tracker/verbs/reject.mjs \
  scripts/task-tracker/verbs/shelve.mjs scripts/task-tracker/verbs/park.mjs \
  scripts/task-tracker/verbs/cancel-plan.mjs scripts/task-tracker/verbs/supersede.mjs \
  scripts/task-tracker/verbs/plan-approve.mjs scripts/task-tracker/verbs/approve.mjs \
  scripts/task-tracker/verbs/start.mjs scripts/task-tracker/verbs/resume.mjs \
  scripts/task-tracker/verbs/switch.mjs scripts/task-tracker/task-tracker.mjs \
  scripts/task-tracker/lib/command-surface/catalog.mjs scripts/lib/self-doc.mjs \
  scripts/tests/unit/task-tracker/verbs/move-inprocess-parity.test.mjs \
  scripts/tests/unit/task-tracker/verbs/promote-test-review-alias.test.mjs \
  scripts/tests/unit/task-tracker/verbs/promote-review-close-agent-review-gate.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-engine-policy-characterization.test.mjs \
  scripts/tests/unit/task-tracker/lib/state-cursor-interruption.test.mjs \
  docs/architecture/state-machine.md docs/guides/workflow.md
git commit -m "[#1117] refactor: route lifecycle work through the state cursor"
```

## Final Acceptance Map

| #1117 acceptance criterion                                                      | Plan evidence     |
| ------------------------------------------------------------------------------- | ----------------- |
| Eight immutable three-list definitions and stable topology                      | Tasks 1–2         |
| Shared stateless direct method references and no task data in definitions       | Tasks 1–2         |
| Immutable Git/issue/worktree snapshot and no persisted Cursor index             | Tasks 3–4, 7–8    |
| Verify-first idempotent action execution and dormant outcomes                   | Tasks 5–7, 10     |
| Source exit then target entry gate, one commit, target action after move        | Tasks 8, 13–14    |
| Crash-safe transition restart                                                   | Tasks 10, 12–13   |
| Review resident-action proof and retry in place                                 | Task 9            |
| Existing guards and sanctioned forward/rework behavior preserved; #937 excluded | Tasks 2, 8, 13–14 |

## Execution Completion Gate

Before reporting implementation complete:

1. Re-run every focused suite in Task 14 Step 5.
2. Re-run `npm run format:check`, `npm run lint`, `npm test`, and `npm run test:slow` from the issue worktree.
3. Run `git diff --check`, `git status --short --branch`, and `git log --oneline --decorate -15`.
4. Confirm no test or source persists a Cursor/action index and no resident action writes Status or transition markers.
5. Confirm #937 remains blocked until Story D is integrated and independently green.
6. Present exact commits, test outputs, remaining warnings, and local/remote ancestry before requesting approval to push or integrate.
