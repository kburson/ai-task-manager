# State-Engine Policy Characterization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an executable, machine-readable baseline of AITM's current lifecycle, timing-event, action, command-entry, and bug-bash behavior without moving production policy authority.

**Architecture:** Keep every new policy record under `scripts/task-tracker/tests/fixtures/`; production modules remain unchanged. Focused tests compare the fixtures bidirectionally with the unrefactored production exports and shipped-file inventory, so later policy children can reuse the fixtures as compatibility oracles while stale or incomplete records fail CI.

**Tech Stack:** Node.js 22+, ECMAScript modules, `node:test`, `node:assert/strict`, repository-native static file scans.

## Global Constraints

- Preserve current behavior; #1007 introduces no canonical production policy.
- Keep executable, entry-history, and timing-history transition projections separate.
- Cover all 64 ordered state pairs in each lifecycle projection.
- Classify every shipped executable entry point exactly once.
- Give every issue in the 53-row evidence register one disposition, target, and regression owner.
- Use repo-local scratch helpers; never use `/tmp` or `os.tmpdir()`.
- Run focused tests red before adding their fixtures, then green before continuing.

---

### Task 1: Lifecycle and Action Baseline

**Files:**

- Create: `scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/state-engine-policy-characterization.test.mjs`

**Interfaces:**

- Consumes: `STATES`, `validateTransition`, `LEGAL_TRANSITIONS`, `VERB_HOME_STATE`, `ALIAS_VERB`, demote `LEGAL_FROM`/`DEMOTE_TARGET`, and park `LEGAL_FROM`/`PARK_TARGET`.
- Produces: frozen `STATE_IDS`, `EXECUTABLE_MATRIX`, `ENTRY_HISTORY_MATRIX`, `TIMING_HISTORY_MATRIX`, and `ACTION_BASELINE` records for C2-C6 tests.

- [ ] **Step 1: Write the failing lifecycle characterization test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATE_IDS,
  EXECUTABLE_MATRIX,
  ENTRY_HISTORY_MATRIX,
  TIMING_HISTORY_MATRIX,
  ACTION_BASELINE,
} from '../../fixtures/state-engine-policy-baseline.mjs';

test('each lifecycle projection covers all 64 ordered pairs', () => {
  assert.equal(STATE_IDS.length, 8);
  for (const matrix of [EXECUTABLE_MATRIX, ENTRY_HISTORY_MATRIX, TIMING_HISTORY_MATRIX]) {
    assert.equal(Object.keys(matrix).length, 64);
  }
});

test('current action policy remains explicitly distributed', () => {
  assert.deepEqual(ACTION_BASELINE.demote, {
    from: ['test', 'review'],
    to: 'develop',
    requires: 'rework-reason',
  });
  assert.deepEqual(ACTION_BASELINE.park, {
    from: ['refine', 'plan'],
    to: 'backlog',
    requires: 'reason',
  });
});
```

- [ ] **Step 2: Run the lifecycle test and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/state-engine-policy-characterization.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `state-engine-policy-baseline.mjs`.

- [ ] **Step 3: Add the minimal baseline fixture**

```js
export const STATE_IDS = Object.freeze([
  'backlog',
  'on-deck',
  'refine',
  'plan',
  'develop',
  'test',
  'review',
  'done',
]);

function matrixFrom(predicate) {
  return Object.freeze(
    Object.fromEntries(
      STATE_IDS.flatMap((from) =>
        STATE_IDS.map((to) => [`${from}->${to}`, Object.freeze(predicate(from, to))])
      )
    )
  );
}

export const EXECUTABLE_MATRIX = matrixFrom((from, to) => ({
  allowed:
    from === to ||
    [
      'backlog->on-deck',
      'on-deck->refine',
      'refine->plan',
      'plan->develop',
      'develop->test',
      'test->review',
      'review->done',
      'on-deck->backlog',
      'refine->backlog',
      'plan->backlog',
      'test->develop',
      'review->develop',
      'review->test',
    ].includes(`${from}->${to}`),
  noop: from === to,
}));
```

Add separate explicit edge sets for entry history and timing history, then build both matrices with the same `matrixFrom` helper. Add `ACTION_BASELINE` entries for Test/Review/Close home states, Refine entry, Promote delegation, Demote, Park, and null-state bootstrap.

- [ ] **Step 4: Compare all fixture cells with current production**

For executable cells, call `validateTransition(from, to)` and compare `{allowed, noop}`. For entry-history cells, compare `LEGAL_TRANSITIONS.has(key)`. For timing-history cells, feed two-row timing-log walks into `timing-log-sequence.mjs#validate` and assert the expected transition result. Assert the exact action exports and bootstrap behavior independently.

- [ ] **Step 5: Run the lifecycle test and verify GREEN**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/state-engine-policy-characterization.test.mjs
```

Expected: PASS with 64 cells checked in each of three matrices.

- [ ] **Step 6: Commit the lifecycle baseline**

```bash
git add scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs scripts/task-tracker/tests/unit/lib/state-engine-policy-characterization.test.mjs
git commit -m "test(state-engine): characterize lifecycle matrices [#1007]"
```

### Task 2: Timing Vocabulary and Producer Baseline

**Files:**

- Modify: `scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/timing-event-emitter-characterization.test.mjs`

**Interfaces:**

- Consumes: `PHASE_EVENTS`, `PHASE_EVENT_SLUGS`, `classifyTimingEvent`, `isCanonicalPhaseSlug`, and timing-producing source files.
- Produces: `TIMING_EVENT_BASELINE` with exact lifecycle/audit/legacy/retired slugs, parameterized families, and producer locations.

- [ ] **Step 1: Write a failing catalog-completeness test**

```js
test('every current production timing emitter maps to a known rule', () => {
  for (const emitter of TIMING_EVENT_BASELINE.emitters) {
    const matched =
      TIMING_EVENT_BASELINE.exact.includes(emitter.event) ||
      TIMING_EVENT_BASELINE.parameterized.some(({ pattern }) => pattern.test(emitter.event));
    assert.equal(matched, true, `${emitter.file}: ${emitter.event}`);
  }
});
```

- [ ] **Step 2: Run the timing test and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/timing-event-emitter-characterization.test.mjs
```

Expected: FAIL because `TIMING_EVENT_BASELINE` is not exported.

- [ ] **Step 3: Add current timing records**

Record:

```js
export const TIMING_EVENT_BASELINE = Object.freeze({
  exact: Object.freeze([
    'backlog:created',
    'on-deck:started',
    'refine:started',
    'refine:completed',
    'plan:started',
    'plan:completed',
    'develop:started',
    'develop:completed',
    'test:started',
    'test:passed',
    'review:started',
    'review:approved',
    'issue:wrap',
    'issue:closed',
    'demoted',
    'out-of-band-move',
    'gate-refused',
    'update',
  ]),
  parameterized: Object.freeze([
    Object.freeze({ name: 'demoted-target', pattern: /^demoted:[a-z-]+$/ }),
    Object.freeze({ name: 'pause-reason', pattern: /^pause:.+$/ }),
    Object.freeze({ name: 'resume-reason', pattern: /^resume:.+$/ }),
    Object.freeze({ name: 'switch-out-issue', pattern: /^switch-out:#\d+$/ }),
  ]),
  retired: Object.freeze(['idle', 'active-work']),
});
```

Derive the full emitter list with a deterministic source scan; keep file, line, expression, and resolved rule in each record. Assert all 14 `PHASE_EVENTS` entries are present and unique, strict-reader canonical slugs are accepted, parameterized families classify correctly, and retired slugs remain neutral read-side history only.

- [ ] **Step 4: Run the timing test and verify GREEN**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/timing-event-emitter-characterization.test.mjs
```

Expected: PASS with every discovered emitter resolved.

- [ ] **Step 5: Commit the timing baseline**

```bash
git add scripts/task-tracker/tests/fixtures/state-engine-policy-baseline.mjs scripts/task-tracker/tests/unit/lib/timing-event-emitter-characterization.test.mjs
git commit -m "test(state-engine): inventory timing event emitters [#1007]"
```

### Task 3: Shipped Executable Entry-Point Classification

**Files:**

- Create: `scripts/task-tracker/tests/fixtures/executable-entrypoint-classification.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/executable-entrypoint-classification.test.mjs`

**Interfaces:**

- Consumes: `package.json#files`, `package.json#bin`, `COMMAND_MANIFEST`, `SELF_DOC`, `INTERNAL`, and shipped JavaScript sources.
- Produces: frozen `EXECUTABLE_ENTRYPOINTS`, one row per discovered executable, with `path`, `classification`, `command`, and `reason`.

- [ ] **Step 1: Write the failing discovery/classification test**

```js
test('each shipped executable entry point has exactly one classification', () => {
  const discovered = discoverShippedEntrypoints(ROOT);
  assert.deepEqual(
    EXECUTABLE_ENTRYPOINTS.map(({ path }) => path).sort(),
    discovered.sort()
  );
  for (const entry of EXECUTABLE_ENTRYPOINTS) {
    assert.ok(ALLOWED_CLASSIFICATIONS.has(entry.classification));
    assert.ok(entry.command || entry.reason);
  }
});
```

- [ ] **Step 2: Run the entry-point test and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/executable-entrypoint-classification.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the classification fixture.

- [ ] **Step 3: Implement deterministic discovery**

Walk only package-shipped `bin/`, `hooks/`, and `scripts/` paths. Select files declared by `package.json#bin`, beginning with a Node shebang, or carrying a real `isMain`/`process.argv[1]` execution guard. Exclude tests and files omitted by `package.json#files` before comparison.

- [ ] **Step 4: Add the exact classification fixture**

Use only these approved values:

```js
export const ENTRYPOINT_CLASSIFICATIONS = Object.freeze([
  'agent-callable-verb',
  'agent-callable-standalone',
  'package-lifecycle-cli',
  'live-maintenance-or-migration',
  'internal-hook-or-guard',
  'internal-library-or-orchestration',
  'test-fixture-or-retired-one-shot',
]);
```

Each public row must resolve through `COMMAND_MANIFEST`, `SELF_DOC`, or `package.json#bin`; each internal row must have a non-empty reason. The fixture is exhaustive rather than generated from those partial registries, preserving the gap C5 will later close.

- [ ] **Step 5: Run the entry-point test and verify GREEN**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/executable-entrypoint-classification.test.mjs
```

Expected: PASS with discovered and classified path sets exactly equal.

- [ ] **Step 6: Commit the entry-point inventory**

```bash
git add scripts/task-tracker/tests/fixtures/executable-entrypoint-classification.mjs scripts/task-tracker/tests/unit/lib/executable-entrypoint-classification.test.mjs
git commit -m "test(state-engine): classify shipped entry points [#1007]"
```

### Task 4: Bug-Bash Disposition and Regression Ownership

**Files:**

- Create: `scripts/task-tracker/tests/fixtures/state-engine-bug-bash-dispositions.mjs`
- Create: `scripts/task-tracker/tests/unit/lib/bug-bash-disposition.test.mjs`
- Modify: `docs/superpowers/specs/2026-07-27-state-engine-bug-bash-evidence.md`

**Interfaces:**

- Consumes: the 53 evidence-table issue rows and the parent design's allowed disposition vocabulary.
- Produces: frozen `BUG_BASH_DISPOSITIONS`, reused by later children and rendered as the evidence document's durable disposition table.

- [ ] **Step 1: Write the failing register-bijection test**

```js
test('every evidence issue has one disposition and one regression owner', () => {
  const evidenceIssues = parseEvidenceIssueIds(readFileSync(EVIDENCE_PATH, 'utf8'));
  const dispositionIssues = BUG_BASH_DISPOSITIONS.map(({ issue }) => issue);
  assert.equal(new Set(dispositionIssues).size, dispositionIssues.length);
  assert.deepEqual([...dispositionIssues].sort((a, b) => a - b), evidenceIssues);
  for (const row of BUG_BASH_DISPOSITIONS) {
    assert.ok(ALLOWED_DISPOSITIONS.has(row.disposition));
    assert.ok(row.target.length > 0);
    assert.ok(row.regressionOwner.length > 0);
  }
});
```

- [ ] **Step 2: Run the disposition test and verify RED**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/bug-bash-disposition.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the disposition fixture.

- [ ] **Step 3: Add all 53 disposition records**

Each record has this complete shape:

```js
Object.freeze({
  issue: 999,
  theme: 'LP',
  disposition: 'direct-child',
  target: '#1008 executable topology',
  regressionOwner: 'state-engine-policy-characterization.test.mjs',
});
```

Use only `direct-child`, `1006-audit-input`, `verification-constraint`, `already-centralized`, and `independent-concern`. Map policy defects to C1-C6, operational mechanisms to #1006, delivery-only issues to verification constraints, and existing shared authorities to already centralized.

- [ ] **Step 4: Render the same records into the evidence document**

Add a `## 6. Disposition and Regression Ownership` table with Issue, Disposition, Target, and Regression owner columns in issue-number order. Do not duplicate or omit a source register row.

- [ ] **Step 5: Run the disposition test and verify GREEN**

Run:

```bash
node --test scripts/task-tracker/tests/unit/lib/bug-bash-disposition.test.mjs
```

Expected: PASS with 53 unique source rows and 53 unique disposition rows.

- [ ] **Step 6: Commit the disposition register**

```bash
git add docs/superpowers/specs/2026-07-27-state-engine-bug-bash-evidence.md scripts/task-tracker/tests/fixtures/state-engine-bug-bash-dispositions.mjs scripts/task-tracker/tests/unit/lib/bug-bash-disposition.test.mjs
git commit -m "docs(state-engine): disposition bug-bash evidence [#1007]"
```

### Task 5: Verification, Evidence, and Delivery

**Files:**

- Modify only if checks require formatting: files created or modified in Tasks 1-4.

**Interfaces:**

- Consumes: all C1 fixtures and focused tests.
- Produces: a committed characterization suite ready for AITM Test, Review, epic merge-back, approval, and close.

- [ ] **Step 1: Run Develop verification**

Run:

```bash
npx aitm verify-develop
```

Expected: JavaScript lint/format and all changed focused tests pass.

- [ ] **Step 2: Run all four issue-specific commands independently**

```bash
node --test scripts/task-tracker/tests/unit/lib/state-engine-policy-characterization.test.mjs
node --test scripts/task-tracker/tests/unit/lib/timing-event-emitter-characterization.test.mjs
node --test scripts/task-tracker/tests/unit/lib/executable-entrypoint-classification.test.mjs
node --test scripts/task-tracker/tests/unit/lib/bug-bash-disposition.test.mjs
```

Expected: each command exits 0; read each output before stamping its VC/AC.

- [ ] **Step 3: Run repository quality gates**

```bash
npm run lint
npm run format:check
npm test
npm run test:slow
```

Expected: all commands exit 0.

- [ ] **Step 4: Verify branch delta against the epic parent**

```bash
git fetch origin trunk
git log --left-right --cherry-pick --oneline feature/epic/1005...feature/child/1007
git diff --name-status feature/epic/1005...feature/child/1007
git diff --stat feature/epic/1005...feature/child/1007
git diff --check feature/epic/1005...feature/child/1007
```

Expected: only #1007 plan, fixtures, tests, and evidence-register changes; no whitespace errors.

- [ ] **Step 5: Commit any final formatting-only changes**

```bash
git add docs/superpowers scripts/task-tracker/tests
git commit -m "test(state-engine): complete characterization oracle [#1007]"
```

Skip this commit when the tree is already clean.

- [ ] **Step 6: Complete AITM evidence and lifecycle**

Run each numbered VC through its evidence stamper, complete AC and Functional DoD evidence individually, enter Test, run orchestrator Review, merge the child branch into `feature/epic/1005`, record Full-Auto approval, push the integrated issue-tagged commit, and close #1007 through `npx aitm close 1007`.
