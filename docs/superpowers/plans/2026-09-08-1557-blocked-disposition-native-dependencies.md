# BLOCKED Disposition and Native Dependency Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace AITM's legacy blocker carriers with GitHub native issue dependencies, project unfinished dependencies into Disposition `BLOCKED`, and preserve dependency safety across the governed lifecycle.

**Architecture:** A new native dependency adapter owns complete graph reads and exact set mutations. A separate projector combines that graph with AITM Project Status, preserves terminal Dispositions, and is reused by commands, lifecycle guards, bind, pull-next, and Done fan-out. Legacy parsers remain only for explicit migration and historical snapshot compatibility.

**Tech Stack:** Node.js ESM, GitHub CLI 2.97+, GitHub GraphQL Projects v2, `node:test`, AITM versioned issue writers and lifecycle guard registry.

## Global Constraints

- GitHub native `blockedBy` and `blocking` relationships are the sole live dependency authority.
- A dependency is satisfied only when its configured-project AITM Status normalizes to `done`.
- Missing, incomplete, paginated, malformed, or unreadable dependency and Status evidence fails closed.
- `Disposition = BLOCKED` is transient; all Done dependencies or an empty dependency set clears it.
- Never overwrite or clear `Delivered`, `Replaced`, `Discarded`, `Duplicate`, or `Incorporated`.
- Keep native dependency links after they become satisfied.
- Do not add a webhook, daemon, poller, commit hook, or per-commit gate.
- Do not delete existing `Blocked By` Project fields or `BLOCKED` label definitions.
- Closed issue history and ambiguous label-only issues remain untouched by migration.
- Migration removes the strict legacy body marker last so interrupted work stays retryable.
- Implement in the recorded #1557 worktree and preserve unrelated changes.

---

## File structure

### New production modules

- `scripts/task-tracker/lib/native-dependencies.mjs`: provider-shape validation, canonical relation reads, and exact desired-set convergence.
- `scripts/task-tracker/lib/dependency-disposition.mjs`: dependency Status resolution and terminal-safe Disposition reconciliation.
- `scripts/task-tracker/verbs/migrate-dependencies.mjs`: repository-wide dry-run/apply migration orchestration.

### Existing production modules

- `config/project-fields.default.json` and `.ai-task-manager/project-fields.json`: canonical field definitions.
- `scripts/gh/init-repair.mjs`: additive Disposition option repair.
- `scripts/task-tracker/verbs/block.mjs` and `scripts/task-tracker/verbs/unblock.mjs`: public set operations.
- `scripts/task-tracker/lib/blocked-by-guard.mjs`: universal native dependency exit guard.
- `scripts/task-tracker/lib/epic-children-gate.mjs`, `scripts/task-tracker/verbs/pull-next.mjs`, and `scripts/gh/lib/wave-admission.mjs`: dependency-aware child admission.
- `scripts/task-tracker/lib/unpark-dependents.mjs` and `scripts/task-tracker/lib/move-state/cache-unpark.mjs`: Done-triggered projection fan-out.
- `scripts/task-tracker/verbs/switch.mjs` and `scripts/task-tracker/verbs/resume.mjs`: lazy bind reconciliation.
- `scripts/task-tracker/lib/refinement-snapshot.mjs`, `scripts/task-tracker/lib/refinement-history.mjs`, and `scripts/task-tracker/lib/shelve-transaction.mjs`: schema-3 dependency-free snapshots and legacy compatibility.
- `scripts/task-tracker/verbs/close.mjs` and `scripts/task-tracker/verify-delivery-incident-reconciliation.mjs`: remove live legacy-carrier assumptions.
- `scripts/task-tracker/task-tracker.mjs`, `scripts/task-tracker/lib/command-surface/catalog.mjs`, `scripts/task-tracker/lib/command-surface/routing.mjs`, `scripts/task-tracker/verbs/help-data.mjs`, and `scripts/lib/self-doc.mjs`: migration command registration and public contract.

### Test and documentation files

- Create `scripts/tests/unit/task-tracker/lib/native-dependencies.test.mjs`.
- Create `scripts/tests/unit/task-tracker/lib/native-dependency-projection.test.mjs`.
- Create `scripts/tests/unit/task-tracker/lib/native-dependency-reconciliation.test.mjs`.
- Create `scripts/tests/unit/task-tracker/verbs/migrate-dependencies.test.mjs`.
- Create `scripts/tests/unit/task-tracker/lib/native-dependency-docs.test.mjs`.
- Extend the existing block, unblock, guard, pull-next, epic-child, refinement-snapshot, init-repair, and lineage tests named in #1557.
- Update `docs/DESIGN.md`, `docs/guides/workflow.md`, `docs/guides/guard-architecture.md`, `docs/guides/parallel-agents.md`, and `.ai-task-manager/templates/references/pickup-directive-rationale.md`.

---

### Task 1: Canonical field definition and native dependency adapter

**Files:**

- Modify: `config/project-fields.default.json`
- Modify: `.ai-task-manager/project-fields.json`
- Create: `scripts/task-tracker/lib/native-dependencies.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/native-dependencies.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/gh/disposition-install-repair.test.mjs`

**Interfaces:**

- Consumes: shared `pexec` from `scripts/gh/lib/gh-client.mjs` and configured repository strings.
- Produces: `normalizeDependencyConnection(connection, options)`, `readNativeDependencies(options)`, and `convergeBlockedBySet(options)` for every later task.

- [x] **Step 1: Add failing field-definition assertions**

Extend `disposition-install-repair.test.mjs` to load both canonical definition files and assert:

```js
for (const defs of [workspaceDefs, defaultDefs]) {
  const disposition = defs.find((field) => field.key === 'disposition');
  const blocked = disposition.options.find((option) => option.name === 'BLOCKED');
  assert.deepEqual(blocked, {
    name: 'BLOCKED',
    color: 'RED',
    description: 'Waiting on unfinished issue dependencies.',
  });
  assert.equal(
    defs.some((field) => field.key === 'blockedBy'),
    false
  );
}
```

Retain the existing repair test that supplies observed option IDs and assert the GraphQL update preserves those IDs while appending only `BLOCKED`.

- [x] **Step 2: Run the field test and observe RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/gh/disposition-install-repair.test.mjs
```

Expected: FAIL because `BLOCKED` is absent and `blockedBy` is still provisioned.

- [x] **Step 3: Add failing native connection tests**

Create `native-dependencies.test.mjs` with injected I/O and these concrete cases:

```js
test('normalizes a complete connection into sorted unique repository issue refs', () => {
  const result = normalizeDependencyConnection(
    {
      nodes: [
        { number: 9, repository: { nameWithOwner: 'o/r' } },
        { number: 4, repository: { nameWithOwner: 'o/r' } },
      ],
      totalCount: 2,
    },
    { repo: 'o/r', issueNumber: 12, relation: 'blockedBy' }
  );
  assert.deepEqual(result, [4, 9]);
});

for (const connection of [
  null,
  { nodes: [], totalCount: 1 },
  { nodes: [{ number: 0 }], totalCount: 1 },
  { nodes: [{ number: 4, repository: { nameWithOwner: 'x/y' } }], totalCount: 1 },
]) {
  test(`refuses incomplete or invalid connection ${JSON.stringify(connection)}`, () => {
    assert.throws(
      () =>
        normalizeDependencyConnection(connection, {
          repo: 'o/r',
          issueNumber: 12,
          relation: 'blockedBy',
        }),
      /native-dependencies:/
    );
  });
}
```

Add async tests showing `readNativeDependencies` parses `{blockedBy, blocking}` and `convergeBlockedBySet` calls only missing `--add-blocked-by` or present `--remove-blocked-by` edges before exact readback.

- [x] **Step 4: Run the adapter test and observe RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/native-dependencies.test.mjs
```

Expected: FAIL with module-not-found for `native-dependencies.mjs`.

- [x] **Step 5: Implement the field and adapter minimum**

Add the exact `BLOCKED` option to both Disposition definitions and remove the `blockedBy` field object from both arrays.

Implement this public shape in `native-dependencies.mjs`:

```js
export function normalizeDependencyConnection(connection, { repo, issueNumber, relation } = {}) {
  if (!connection || !Array.isArray(connection.nodes)) fail(`${relation}-connection`);
  if (!Number.isSafeInteger(connection.totalCount) || connection.totalCount < 0)
    fail(`${relation}-count`);
  if (connection.nodes.length !== connection.totalCount) fail(`${relation}-incomplete`);
  const refs = connection.nodes.map((node) => {
    if (!Number.isSafeInteger(node?.number) || node.number <= 0) fail(`${relation}-node`);
    const observedRepo = node.repository?.nameWithOwner;
    if (observedRepo && observedRepo !== repo) fail(`${relation}-repository`);
    if (node.number === issueNumber) fail(`${relation}-self`);
    return node.number;
  });
  if (new Set(refs).size !== refs.length) fail(`${relation}-duplicate`);
  return refs.sort((left, right) => left - right);
}

export async function readNativeDependencies({ issueNumber, repo, deps = {} } = {}) {
  // Run gh issue view --json blockedBy,blocking, parse JSON, and normalize both connections.
  return { blockedBy, blocking };
}

export async function convergeBlockedBySet({ issueNumber, repo, desired, deps = {} } = {}) {
  // Fresh-read existing; add/remove the set delta; fresh-read and require exact equality.
  return { status, existing, desired: canonicalDesired, added, removed };
}
```

Use one `gh issue edit` call per relationship so partial mutation results can be attributed precisely. Keep all process calls injectable.

- [x] **Step 6: Run focused tests and observe GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/gh/disposition-install-repair.test.mjs scripts/tests/unit/task-tracker/lib/native-dependencies.test.mjs
```

Expected: PASS with zero failed tests.

- [x] **Step 7: Commit the adapter**

```bash
git add config/project-fields.default.json .ai-task-manager/project-fields.json scripts/task-tracker/lib/native-dependencies.mjs scripts/tests/unit/task-tracker/lib/native-dependencies.test.mjs scripts/tests/unit/task-tracker/gh/disposition-install-repair.test.mjs
git commit -m "[#1557] feat: add native dependency adapter"
```

---

### Task 2: Terminal-safe Disposition projection

**Files:**

- Create: `scripts/task-tracker/lib/dependency-disposition.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/native-dependency-projection.test.mjs`
- Modify: `scripts/task-tracker/lib/terminal-disposition.mjs`

**Interfaces:**

- Consumes: `readNativeDependencies({issueNumber, repo, deps})`, `fetchAssignmentSnapshot`, `projectItemForIssue`, `fieldOptionMap`, `writeProjectFieldValue`, and `clearProjectFieldValue`.
- Produces: `deriveDependencyProjection({blockedBy, states})` and `reconcileDependencyDisposition({issueNumber, cfg, observation, deps})`.

- [x] **Step 1: Write failing pure projection tests**

Create tests for this exact result model:

```js
assert.deepEqual(
  deriveDependencyProjection({
    blockedBy: [4, 9],
    states: new Map([
      [4, 'done'],
      [9, 'test'],
    ]),
  }),
  { status: 'blocked', unfinished: [{ ref: 9, state: 'test' }] }
);

assert.deepEqual(deriveDependencyProjection({ blockedBy: [4], states: new Map([[4, 'done']]) }), {
  status: 'ready',
  unfinished: [],
});

assert.deepEqual(deriveDependencyProjection({ blockedBy: [], states: new Map() }), {
  status: 'ready',
  unfinished: [],
});
```

Add an assertion that missing state for ref 9 returns `status: 'unknown'` and includes ref 9.

- [x] **Step 2: Write failing reconciliation tests**

Cover the following injected scenarios:

```js
await reconcileDependencyDisposition({
  issueNumber: 12,
  cfg,
  observation: { blockedBy: [9], states: new Map([[9, 'develop']]) },
  deps: harness.deps,
});
assert.deepEqual(harness.writes, ['BLOCKED']);

await reconcileDependencyDisposition({
  issueNumber: 12,
  cfg,
  observation: { blockedBy: [9], states: new Map([[9, 'done']]) },
  deps: harness.depsWithCurrent('BLOCKED'),
});
assert.equal(harness.clears, 1);
```

Loop over `TERMINAL_DISPOSITIONS` and assert zero writes/clears with result
`terminal-preserved`. Assert an unexpected non-terminal value refuses mutation.
Assert a missing field, missing option, write failure, clear failure, and readback
mismatch return or throw a stable `dependency-disposition:` category.

- [x] **Step 3: Run the projection test and observe RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/native-dependency-projection.test.mjs
```

Expected: FAIL with module-not-found.

- [x] **Step 4: Implement the projector**

Implement:

```js
export function deriveDependencyProjection({ blockedBy = [], states = new Map() } = {}) {
  const unfinished = [];
  const unknown = [];
  for (const ref of blockedBy) {
    const state = states.get(ref);
    if (state == null) unknown.push({ ref, state: null });
    else if (String(state).toLowerCase() !== 'done') unfinished.push({ ref, state });
  }
  if (unknown.length) return { status: 'unknown', unfinished: [...unfinished, ...unknown] };
  return unfinished.length
    ? { status: 'blocked', unfinished }
    : { status: 'ready', unfinished: [] };
}
```

`reconcileDependencyDisposition` accepts a supplied observation to avoid duplicate
provider reads in guards and pull-next. Without one, it reads the graph and each
dependency Status. It reads current Disposition first, preserves terminal values,
writes or clears only when needed, and confirms readback. Return structured
`projected`, `cleared`, `idempotent`, or `terminal-preserved` results.

Keep `TERMINAL_DISPOSITIONS` unchanged and export a reusable
`isTerminalDisposition(value)` predicate from `terminal-disposition.mjs`.

- [x] **Step 5: Run focused tests and observe GREEN**

```bash
node --test scripts/tests/unit/task-tracker/lib/native-dependency-projection.test.mjs scripts/tests/unit/task-tracker/lib/terminal-disposition.test.mjs
```

Expected: PASS.

- [x] **Step 6: Commit the projector**

```bash
git add scripts/task-tracker/lib/dependency-disposition.mjs scripts/task-tracker/lib/terminal-disposition.mjs scripts/tests/unit/task-tracker/lib/native-dependency-projection.test.mjs scripts/tests/unit/task-tracker/lib/terminal-disposition.test.mjs
git commit -m "[#1557] feat: project dependency readiness"
```

---

### Task 3: Native set semantics for block and unblock

**Files:**

- Modify: `scripts/task-tracker/verbs/block.mjs`
- Modify: `scripts/task-tracker/verbs/unblock.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/block-verb.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/coverage-block.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/coverage-unblock.test.mjs`
- Modify: `scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs`
- Modify: `scripts/tests/slow/task-tracker/verbs/deadlock-regression.test.mjs`

**Interfaces:**

- Consumes: `readNativeDependencies`, `convergeBlockedBySet`, and `reconcileDependencyDisposition`.
- Produces: public `runBlock` and `runUnblock` results with exact native deltas and projection status.

- [x] **Step 1: Replace block fixtures with failing set-union cases**

Drive `runBlock` with an injected existing set `[4, 9]` and requested refs
`[9, 12, 12]`. Assert:

```js
assert.deepEqual(convergeCalls[0].desired, [4, 9, 12]);
assert.deepEqual(result.added, [12]);
assert.deepEqual(result.remaining, [4, 9, 12]);
assert.equal(commentBodies.length, 1);
assert.match(commentBodies[0], /#12/);
```

Add cases for all-requested-existing idempotence, self-refusal before mutation,
invalid issue refusal, projection partial failure after a verified native union,
and retry convergence with no second audit comment.

- [x] **Step 2: Replace unblock fixtures with failing set-subtraction cases**

For existing `[4, 9, 12]` and `--by 9,99`, assert desired `[4, 12]`, removed
`[9]`, one comment, and no removal call for 99. For `refs === null`, assert
desired `[]`. Repeating either operation must be idempotent but still call the
projector.

- [x] **Step 3: Run command tests and observe RED**

```bash
node --test scripts/tests/unit/task-tracker/verbs/block-verb.test.mjs scripts/tests/unit/task-tracker/lib/coverage-block.test.mjs scripts/tests/unit/task-tracker/lib/coverage-unblock.test.mjs
```

Expected: FAIL because the verbs still mutate body markers, labels, and the
`Blocked By` field.

- [x] **Step 4: Rewrite `runBlock`**

Preserve `parseByList`, `resolveTargetIssue`, and CLI validation. Replace the
mutation sequence with:

```js
const graph = await readNativeDependencies({ issueNumber: target, repo: cfg.repo, deps });
const desired = [...new Set([...graph.blockedBy, ...refs])].sort((a, b) => a - b);
const convergence = await convergeBlockedBySet({
  issueNumber: target,
  repo: cfg.repo,
  desired,
  deps,
});
const projection = await reconcileDependencyDisposition({ issueNumber: target, cfg, deps });
```

Validate requested issue existence before graph mutation. Do not require a
blocker to be GitHub-open; AITM Status, not issue open state, decides readiness.
Post comments only for `convergence.added`.

- [x] **Step 5: Rewrite `runUnblock`**

Use the same fresh-read/converge/project sequence. Calculate desired as empty for
`refs === null`, otherwise filter only requested numbers. Post comments only for
`convergence.removed`. Remove every import and call involving `mutateIssueBody`,
`blocked-marker`, `blocked-by-field`, or label edit arguments.

- [x] **Step 6: Update recovery tests and run GREEN**

Inject native graph harnesses in the two slow recovery tests and prove unblock
allows the next lifecycle guard without a body mutation.

Run:

```bash
node --test scripts/tests/unit/task-tracker/verbs/block-verb.test.mjs scripts/tests/unit/task-tracker/lib/coverage-block.test.mjs scripts/tests/unit/task-tracker/lib/coverage-unblock.test.mjs scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs scripts/tests/slow/task-tracker/verbs/deadlock-regression.test.mjs
```

Expected: PASS.

- [x] **Step 7: Commit native commands**

```bash
git add scripts/task-tracker/verbs/block.mjs scripts/task-tracker/verbs/unblock.mjs scripts/tests/unit/task-tracker/verbs/block-verb.test.mjs scripts/tests/unit/task-tracker/lib/coverage-block.test.mjs scripts/tests/unit/task-tracker/lib/coverage-unblock.test.mjs scripts/tests/slow/task-tracker/verbs/recovery-path-independence.test.mjs scripts/tests/slow/task-tracker/verbs/deadlock-regression.test.mjs
git commit -m "[#1557] feat: make blocker commands set based"
```

---

### Task 4: Lifecycle, pull-next, bind, and Done reconciliation

**Files:**

- Modify: `scripts/task-tracker/lib/blocked-by-guard.mjs`
- Modify: `scripts/task-tracker/lib/epic-children-gate.mjs`
- Modify: `scripts/task-tracker/verbs/pull-next.mjs`
- Modify: `scripts/gh/lib/wave-admission.mjs`
- Modify: `scripts/task-tracker/lib/unpark-dependents.mjs`
- Modify: `scripts/task-tracker/lib/move-state/cache-unpark.mjs`
- Modify: `scripts/task-tracker/verbs/switch.mjs`
- Modify: `scripts/task-tracker/verbs/resume.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/native-dependency-reconciliation.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/blocked-by-guard.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/epic-children-gate-blocked.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/unpark-dependents.test.mjs`

**Interfaces:**

- Consumes: native graph and projector APIs from Tasks 1 and 2.
- Produces: `observeDependencyReadiness`, native-enriched child records, and Done/bind reconciliation results.

- [x] **Step 1: Write failing universal guard tests**

Replace body-marker contexts with injected `readDependencies`, `fetchBlockerState`,
and `reconcileDisposition`. Assert:

```js
const refused = await blockedByGuard.run(
  makeCtx({ blockedBy: [5, 7], states: { 5: 'done', 7: 'test' } })
);
assert.equal(refused.ok, false);
assert.match(refused.reason, /#7 \(test\)/);
```

Add graph-read failure, state-read failure, projection failure, all-Done, and no
dependency cases. Iterate the state registry and assert the guard remains on all
five forward exits.

- [x] **Step 2: Write failing pull-next and Done tests**

Use a child with no legacy marker and injected native `blockedBy: [88]`. Return
Status `develop` for #88 and assert the child is not selected. Return `done` and
assert selection succeeds. Include a dependency outside the sibling list.

For Done fan-out, inject `blocking: [21, 22]`, reconcile both, throw for #22,
and assert results preserve both relationships while surfacing one error.

- [x] **Step 3: Write failing bind reconciliation tests**

In `native-dependency-reconciliation.test.mjs`, drive switch and resume seams and
assert reconciliation runs only after successful binding. A projector failure
must leave the binding active and emit a warning naming the issue and retryable
projection step.

- [x] **Step 4: Run focused tests and observe RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/blocked-by-guard.test.mjs scripts/tests/unit/task-tracker/lib/epic-children-gate-blocked.test.mjs scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs scripts/tests/unit/task-tracker/lib/unpark-dependents.test.mjs scripts/tests/unit/task-tracker/lib/native-dependency-reconciliation.test.mjs
```

Expected: FAIL against legacy marker behavior.

- [x] **Step 5: Implement one shared observation path**

In `dependency-disposition.mjs`, expose:

```js
export async function observeDependencyReadiness({ issueNumber, cfg, deps = {} } = {}) {
  const { blockedBy } = await readNativeDependencies({
    issueNumber,
    repo: cfg.repo,
    deps: deps.nativeDependencies,
  });
  const states = new Map();
  for (const ref of blockedBy) {
    const snapshot = await (deps.fetchAssignmentSnapshot || fetchAssignmentSnapshot)({
      issueNumber: ref,
      cfg,
      deps: deps.assignmentSnapshot,
    });
    states.set(ref, normalizeStateId(snapshot?.state));
  }
  return { blockedBy, states, ...deriveDependencyProjection({ blockedBy, states }) };
}
```

Make the guard consume this observation, run projector reconciliation from it,
and fail closed when either operation fails.

- [x] **Step 6: Rewire child admission**

Replace `enrichChildrenWithBlockedBy` body fetches with native observations.
Each enriched child carries:

```js
{
  blockedBy: [88],
  dependencyStates: new Map([[88, 'done']]),
  dependencyReadiness: 'ready',
  hasCurrentRefinement: true
}
```

Keep the current refinement and rank gates. `findNextEligibleChild` requires
`dependencyReadiness === 'ready'`; it no longer derives Done solely from sibling
membership. Update wave admission to query native relations and use the same
readiness rule.

- [x] **Step 7: Rewire eager and lazy reconciliation**

Change `unparkDependents` to read the Done issue's native `blocking` set and call
the projector for each dependent. Do not mutate body, label, field mirror, or
native relationship.

Call lazy reconciliation after successful paths in `switch.mjs` and `resume.mjs`.
Catch and print a single retryable warning without rolling back the binding.
Keep `cache-unpark.mjs` best-effort after the committed Done transition, but
rename its log language from released/cleared to reconciled/partial.

- [x] **Step 8: Run focused tests and observe GREEN**

```bash
node --test scripts/tests/unit/task-tracker/lib/blocked-by-guard.test.mjs scripts/tests/unit/task-tracker/lib/epic-children-gate-blocked.test.mjs scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs scripts/tests/unit/task-tracker/lib/unpark-dependents.test.mjs scripts/tests/unit/task-tracker/lib/native-dependency-reconciliation.test.mjs
```

Expected: PASS.

- [x] **Step 9: Commit lifecycle reconciliation**

```bash
git add scripts/task-tracker/lib/blocked-by-guard.mjs scripts/task-tracker/lib/epic-children-gate.mjs scripts/task-tracker/verbs/pull-next.mjs scripts/gh/lib/wave-admission.mjs scripts/task-tracker/lib/unpark-dependents.mjs scripts/task-tracker/lib/move-state/cache-unpark.mjs scripts/task-tracker/verbs/switch.mjs scripts/task-tracker/verbs/resume.mjs scripts/tests/unit/task-tracker/lib/blocked-by-guard.test.mjs scripts/tests/unit/task-tracker/lib/epic-children-gate-blocked.test.mjs scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs scripts/tests/unit/task-tracker/lib/unpark-dependents.test.mjs scripts/tests/unit/task-tracker/lib/native-dependency-reconciliation.test.mjs
git commit -m "[#1557] feat: gate lifecycle on native dependencies"
```

---

### Task 5: Dependency-free refinement snapshots and legacy consumer retirement

**Files:**

- Modify: `scripts/task-tracker/lib/refinement-snapshot.mjs`
- Modify: `scripts/task-tracker/lib/refinement-history.mjs`
- Modify: `scripts/task-tracker/lib/shelve-transaction.mjs`
- Modify: `scripts/task-tracker/verbs/close.mjs`
- Modify: `scripts/task-tracker/verify-delivery-incident-reconciliation.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/refinement-snapshot-schema.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/shelve-boundaries.test.mjs`
- Modify: `scripts/tests/integration/task-tracker/lib/shelve-stale-refinement-recovery.integration.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/verify-delivery-incident-reconciliation.test.mjs`

**Interfaces:**

- Consumes: historical `parseBlockedByStrict` only when validating schema-1/schema-2 or explicit legacy evidence.
- Produces: `REFINEMENT_SNAPSHOT_SCHEMA = '3'` with no blocker property or dependency digest input.

- [x] **Step 1: Write failing schema-3 tests**

Update `refinement-snapshot-schema.test.mjs` to assert a new snapshot:

```js
const stamped = stampRefinementSnapshot(bodyWithNoMarker, { labels: ['enhancement'], ts: TS });
assert.match(stamped, /aitm-refinement-snapshot schema="3"/);
assert.doesNotMatch(stamped, /blocked-by=/);
assert.equal(verifyRefinementSnapshot(stamped, { labels: ['enhancement'] }).ok, true);
```

Add a test that adding or removing a native dependency observation does not
change snapshot verification because no graph data enters the body digest.
Retain fixtures proving valid schema-1/schema-2 markers still parse and verify
with their historical semantics.

- [x] **Step 2: Run snapshot tests and observe RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/refinement-snapshot-schema.test.mjs scripts/tests/unit/task-tracker/lib/shelve-boundaries.test.mjs
```

Expected: FAIL because writers still emit schema 2 and `blocked-by`.

- [x] **Step 3: Implement schema 3**

Set:

```js
export const REFINEMENT_SNAPSHOT_SCHEMA = '3';
const LEGACY_REFINEMENT_SNAPSHOT_SCHEMAS = new Set(['1', '2']);
```

For schema 3, compute inputs from Scope, acceptance criteria, required fields,
labels, and provenance only. Do not parse the blocker marker. Parse historical
`blocked-by` only inside the schema-1/schema-2 branch. Ensure the marker parser
accepts all three schemas but only exposes `fields.blockedBy` for historical
ones.

- [x] **Step 4: Remove live carrier assumptions**

Refinement history records schema-3 fields without `blockedBy`. Shelving uses
native observations for current dependency safety and limits marker/field/label
agreement checks to an explicit historical migration branch. Incorporated-close
and delivery-incident reconciliation no longer require live label, text-field,
and body-marker clearance; use native graph/projector state where a current
dependency check is required.

Keep `blocked-marker.mjs` and `blocked-by-field.mjs` available for Task 6's
migration, but remove their imports from ordinary runtime modules.

- [x] **Step 5: Run compatibility tests and observe GREEN**

```bash
node --test scripts/tests/unit/task-tracker/lib/refinement-snapshot-schema.test.mjs scripts/tests/unit/task-tracker/lib/shelve-boundaries.test.mjs scripts/tests/integration/task-tracker/lib/shelve-stale-refinement-recovery.integration.test.mjs scripts/tests/unit/task-tracker/core/verify-delivery-incident-reconciliation.test.mjs
```

Expected: PASS.

- [x] **Step 6: Audit production imports**

Run:

```bash
rg -n "from ['\"].*(blocked-marker|blocked-by-field)" scripts/task-tracker scripts/gh -g '*.mjs'
```

Expected: imports remain only in the migration verb and explicitly named
historical compatibility modules. `block`, `unblock`, guards, pull-next, wave
admission, and Done reconciliation must not appear.

- [x] **Step 7: Commit snapshot migration**

```bash
git add scripts/task-tracker/lib/refinement-snapshot.mjs scripts/task-tracker/lib/refinement-history.mjs scripts/task-tracker/lib/shelve-transaction.mjs scripts/task-tracker/verbs/close.mjs scripts/task-tracker/verify-delivery-incident-reconciliation.mjs scripts/tests/unit/task-tracker/lib/refinement-snapshot-schema.test.mjs scripts/tests/unit/task-tracker/lib/shelve-boundaries.test.mjs scripts/tests/integration/task-tracker/lib/shelve-stale-refinement-recovery.integration.test.mjs scripts/tests/unit/task-tracker/core/verify-delivery-incident-reconciliation.test.mjs
git commit -m "[#1557] refactor: retire legacy blocker authority"
```

---

### Task 6: Explicit interruption-safe dependency migration

**Files:**

- Create: `scripts/task-tracker/verbs/migrate-dependencies.mjs`
- Modify: `scripts/task-tracker/task-tracker.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/catalog.mjs`
- Modify: `scripts/task-tracker/lib/command-surface/routing.mjs`
- Modify: `scripts/task-tracker/verbs/help-data.mjs`
- Modify: `scripts/lib/self-doc.mjs`
- Create: `scripts/tests/unit/task-tracker/verbs/migrate-dependencies.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/core/command-manifest.test.mjs`
- Modify: `scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs`

**Interfaces:**

- Consumes: `parseBlockedByStrict`, `removeBlockedBy`, native set convergence, projector reconciliation, Project field clear, label removal, and `mutateIssueBody`.
- Produces: `classifyLegacyDependencyIssue`, `migrateLegacyDependencyIssue`, `runDependencyMigration`, and public `migrate-dependencies` CLI.

- [x] **Step 1: Write failing classification tests**

Create fixtures for:

```js
assert.equal(classifyLegacyDependencyIssue(openStrict).kind, 'strict-open');
assert.equal(classifyLegacyDependencyIssue(closedStrict).kind, 'closed-history');
assert.equal(classifyLegacyDependencyIssue(openLabelOnly).kind, 'ambiguous-label-only');
assert.equal(classifyLegacyDependencyIssue(openMalformed).kind, 'malformed');
```

The classifier must ignore marker-looking examples in code fences by using the
existing strict parser rather than a new regular expression.

- [x] **Step 2: Write failing dry-run and apply-order tests**

Dry-run must emit intended native additions and cleanup without invoking any
mutation seam. Apply must record this exact call sequence:

```js
assert.deepEqual(calls, [
  'native-converge',
  'native-readback',
  'projection-reconcile',
  'legacy-field-clear',
  'legacy-label-remove',
  'legacy-marker-remove',
]);
```

Inject a failure at every step and assert the marker-remove call is absent until
all earlier calls have succeeded. Rerun from each partial state and assert final
convergence without duplicate edges.

- [x] **Step 3: Run migration tests and observe RED**

```bash
node --test scripts/tests/unit/task-tracker/verbs/migrate-dependencies.test.mjs
```

Expected: FAIL with module-not-found.

- [x] **Step 4: Implement classification and per-issue migration**

Use the existing paginated issue enumeration pattern. Fetch open and closed
issues read-only, classify all carriers, and expose a stable result:

```js
{
  issue: 842,
  kind: 'strict-open',
  refs: [845],
  nativeBefore: [],
  nativeAfter: [845],
  actions: ['add-native:#845', 'project:BLOCKED', 'clear-field', 'remove-label', 'remove-marker'],
  status: 'migrated'
}
```

For `--dry-run`, compute actions only. For `--apply`, perform the ordered steps
and use `mutateIssueBody` to remove only the verified strict marker last. If the
legacy field is not configured, report `field-not-configured` as an idempotent
cleanup state rather than provisioning it.

- [x] **Step 5: Register the public command**

Add `migrate-dependencies` to routing, dispatch, preflight/init exemptions,
command contract, help data, positional metadata, and self-documentation. Parse
exactly one of `--dry-run` or `--apply`; default to a usage refusal rather than
implicit mutation.

Use exit codes:

- `0`: completed dry-run, clean apply, or idempotent no-op;
- `1`: provider/runtime failure or partial apply;
- `2`: invalid flags;
- `3`: ambiguous/malformed candidates reported during apply.

- [x] **Step 6: Run migration and command-surface tests GREEN**

```bash
node --test scripts/tests/unit/task-tracker/verbs/migrate-dependencies.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs
```

Expected: PASS.

- [x] **Step 7: Commit migration command**

```bash
git add scripts/task-tracker/verbs/migrate-dependencies.mjs scripts/task-tracker/task-tracker.mjs scripts/task-tracker/lib/command-surface/catalog.mjs scripts/task-tracker/lib/command-surface/routing.mjs scripts/task-tracker/verbs/help-data.mjs scripts/lib/self-doc.mjs scripts/tests/unit/task-tracker/verbs/migrate-dependencies.test.mjs scripts/tests/unit/task-tracker/core/command-manifest.test.mjs scripts/tests/unit/task-tracker/lib/command-catalog-policy.test.mjs
git commit -m "[#1557] feat: migrate legacy dependencies"
```

---

### Task 7: Documentation and static contract coverage

**Files:**

- Modify: `docs/DESIGN.md`
- Modify: `docs/guides/workflow.md`
- Modify: `docs/guides/guard-architecture.md`
- Modify: `docs/guides/parallel-agents.md`
- Modify: `.ai-task-manager/templates/references/pickup-directive-rationale.md`
- Create: `scripts/tests/unit/task-tracker/lib/native-dependency-docs.test.mjs`

**Interfaces:**

- Consumes: final public command names, result language, and authority boundaries from Tasks 1-6.
- Produces: operator-facing documentation and a static regression test preventing legacy authority claims from returning.

- [x] **Step 1: Write the failing static documentation test**

Create `native-dependency-docs.test.mjs` to read the five documents and assert:

```js
for (const file of requiredDocs) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /GitHub native (?:issue )?dependencies/i);
}
assert.doesNotMatch(workflow, /body marker is (?:the )?(?:canonical|authoritative)/i);
assert.doesNotMatch(parallelAgents, /BLOCKED label.*Blocked By.*aitm-blocked-by/is);
assert.match(workflow, /migrate-dependencies --dry-run/);
assert.match(workflow, /migrate-dependencies --apply/);
assert.match(workflow, /feature branch/i);
assert.match(workflow, /no webhook|without a webhook/i);
```

- [x] **Step 2: Run the static test and observe RED**

```bash
node --test scripts/tests/unit/task-tracker/lib/native-dependency-docs.test.mjs
```

Expected: FAIL on legacy carrier language.

- [x] **Step 3: Update operator documentation**

Document:

- native graph authority and AITM Done satisfaction;
- feature-branch child Done behavior;
- `block` union and `unblock` subtraction/remove-all;
- Disposition BLOCKED/empty projection and terminal preservation;
- all eager and lazy reconciliation touch points;
- UI-added dependency eventual projection repair;
- no webhook and no commit-level gate;
- dry-run/apply migration and ambiguous label-only handling; and
- retained-but-unused legacy field/label definitions.

Update the guard table evidence source but keep guard registration unchanged.

- [x] **Step 4: Run documentation tests and formatting GREEN**

```bash
node --test scripts/tests/unit/task-tracker/lib/native-dependency-docs.test.mjs
npx prettier --check docs/DESIGN.md docs/guides/workflow.md docs/guides/guard-architecture.md docs/guides/parallel-agents.md .ai-task-manager/templates/references/pickup-directive-rationale.md
```

Expected: both commands pass.

- [x] **Step 5: Commit documentation**

```bash
git add docs/DESIGN.md docs/guides/workflow.md docs/guides/guard-architecture.md docs/guides/parallel-agents.md .ai-task-manager/templates/references/pickup-directive-rationale.md scripts/tests/unit/task-tracker/lib/native-dependency-docs.test.mjs
git commit -m "[#1557] docs: adopt native dependency workflow"
```

---

### Task 8: Full verification and governed handoff

**Files:**

- Verify all files changed in Tasks 1-7.
- Update issue evidence through AITM commands only.

**Interfaces:**

- Consumes: every focused verifier and repository quality command.
- Produces: clean commit-bound evidence ready for AITM Test and Review gates.

- [x] **Step 1: Run issue-focused verification**

```bash
node --test scripts/tests/unit/task-tracker/gh/disposition-install-repair.test.mjs scripts/tests/unit/task-tracker/lib/native-dependency-projection.test.mjs
node --test scripts/tests/unit/task-tracker/lib/native-dependency-docs.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/block-verb.test.mjs scripts/tests/unit/task-tracker/lib/coverage-unblock.test.mjs
node --test scripts/tests/unit/task-tracker/lib/blocked-by-guard.test.mjs scripts/tests/unit/task-tracker/verbs/pull-next-verb.test.mjs scripts/tests/unit/task-tracker/lib/native-dependency-reconciliation.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/migrate-dependencies.test.mjs
node --test scripts/tests/unit/task-tracker/lib/close-gates-lineage.test.mjs
```

Expected: every command exits zero with zero failed tests.

- [x] **Step 2: Run format and lint before suites**

```bash
npm run lint
npm run format:check
```

Expected: both exit zero. If either formatter changes files, commit those exact
mechanical changes and rerun both commands before continuing.

- [x] **Step 3: Run repository suites**

```bash
npm test
npm run test:slow
```

Expected: both exit zero with zero failures.

- [x] **Step 4: Audit legacy runtime imports and worktree state**

```bash
rg -n "from ['\"].*(blocked-marker|blocked-by-field)" scripts/task-tracker scripts/gh -g '*.mjs'
git diff --check
git status --short --branch
git log --oneline origin/trunk..HEAD
```

Expected: only migration/historical compatibility imports remain; no whitespace
errors; no uncommitted tracked changes; every issue commit contains `[#1557]`.

- [ ] **Step 5: Record verification evidence**

Use `npx aitm ac-stamp 1557 "<exact criterion label>"` once per root acceptance
criterion so AITM runs and records its cited focused command. Then run:

```bash
npx aitm dod-stamp 1557 tests
npx aitm dod-stamp 1557 lint
npx aitm dod-stamp 1557 commits
```

Expected: each command writes a verified evidence marker and checks only its
owned criterion or DoD item.

- [ ] **Step 6: Produce the Develop completion receipt**

```bash
node scripts/task-tracker/verify-develop.mjs --mode final --issue 1557
npx aitm test 1557
```

Expected: the final receipt binds evidence to clean HEAD, then the sanctioned
Develop-to-Test transition succeeds.

- [ ] **Step 7: Respect terminal governance**

At Test completion, report `CODE_COMPLETE` with exact duration and word delta.
Do not fabricate human review evidence. Continue through orchestrator-owned
review automation only where AITM authorizes it; if AITM requires a human
approval or close action, leave the issue at that enforced gate with exact
instructions rather than bypassing it.

---

### Task 9: Repair demotion-stranded evidence provenance

**Files:**

- Modify: `scripts/task-tracker/lib/proof-marker.mjs`
- Modify: `scripts/task-tracker/lib/evidence-invalidation.mjs`
- Modify: `scripts/task-tracker/verbs/test.mjs`
- Test: `scripts/tests/unit/task-tracker/verbs/demote.test.mjs`
- Test: `scripts/tests/unit/task-tracker/verbs/test-verb-lane-split-migration.test.mjs`

**Interfaces:**

- Consumes: consolidated `aitm-verified` declarations and the governed Test
  body mutation seam.
- Produces: complete demotion invalidation for new cycles and a narrow
  compatibility repair for already-unchecked provenance-only declarations.

- [x] **Step 1: Write failing invalidation and Test-entry recovery tests**

Extend the demotion fixture with `worktree`, `branch`, and `bound-issue`, then
assert all three are stripped with the run proof. Add a Test-verb case whose
unchecked tests declaration has only those three stale properties; assert the
fresh-base body is normalized before the Develop-to-Test move.

- [x] **Step 2: Verify both tests fail for the stranded provenance shape**

```bash
node --test scripts/tests/unit/task-tracker/verbs/demote.test.mjs scripts/tests/unit/task-tracker/verbs/test-verb-lane-split-migration.test.mjs
```

Expected: the new assertions fail because execution-context properties remain.

- [x] **Step 3: Implement the narrow repair**

Treat `worktree`, `branch`, and `bound-issue` as execution-owned properties in
`stripExecutionProof`. Export an idempotent fresh-base normalizer that applies
that stripping only to unchecked checkbox declarations with no execution proof,
and call it from `aitm test` before the entry move using `evidenceStamp: true`.

- [x] **Step 4: Verify focused and repository regressions**

```bash
node --test scripts/tests/unit/task-tracker/verbs/demote.test.mjs scripts/tests/unit/task-tracker/verbs/test-verb-lane-split-migration.test.mjs scripts/tests/integration/task-tracker/lib/evidence-branch-reachability.test.mjs
npm test
npm run test:slow
```

Expected: every command exits zero; malformed checked/proof-bearing evidence
continues to fail closed.

- [x] **Step 5: Commit and repeat exact-SHA evidence**

```bash
git add scripts/task-tracker/lib/proof-marker.mjs scripts/task-tracker/lib/evidence-invalidation.mjs scripts/task-tracker/verbs/test.mjs scripts/tests/unit/task-tracker/verbs/demote.test.mjs scripts/tests/unit/task-tracker/verbs/test-verb-lane-split-migration.test.mjs docs/superpowers/specs/2026-09-08-1557-blocked-disposition-native-dependencies-design.md docs/superpowers/plans/2026-09-08-1557-blocked-disposition-native-dependencies.md
git commit -m "[#1557] fix: recover demotion-stranded evidence"
```

Expected: the final committed SHA has fresh Develop-final, AC, DoD, Test, and
Review evidence before delivery.
