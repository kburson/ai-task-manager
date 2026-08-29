# #1412 Stale Test Sandbox Reaper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete #1412 AC4 by lazily reaping only registered, project-local
test sandboxes whose tokenized owner PID is provably dead.

**Architecture:** A new focused library parses Git's NUL-delimited worktree
inventory, classifies exact current-format test sandbox paths with a pure
fail-safe predicate, and best-effort removes proven stale registrations through
an injected remover. The `/task test` engine invokes that recovery dependency
before creating its current sandbox; the CLI entrypoint supplies the production
adapter while unit-level engine tests retain fully injected I/O.

**Tech Stack:** Node.js 25, ECMAScript modules, `node:test`, `node:assert`, Git
worktree porcelain output, existing AITM PID-liveness and sandbox cleanup
primitives.

## Global Constraints

- Work only in the recorded #1412 worktree on
  `codex/1412-stale-sandbox-reaper`, rooted at the verified current
  `origin/trunk` baseline.
- Preserve the existing prototype-copy implementation, sandbox naming,
  `finally` cleanup, lifecycle transitions, evidence receipts, and production
  locking semantics.
- Select only direct children of the exact project `.tmp/` directory matching
  `.task-test-<positive issue>-<8 lowercase hexadecimal SHA>-<positive
PID>-<8 lowercase hexadecimal random token>`.
- Treat only an explicit `false` liveness result as proof of death. Retain an
  entry when matching, PID parsing, or liveness is ambiguous.
- Never use age, broad globs, filesystem-only discovery, or legacy deterministic
  names as deletion authority.
- Inventory and per-candidate removal failures are non-fatal; one failure must
  not widen the predicate or prevent later candidates from being attempted.
- Follow strict RED-GREEN-REFACTOR: no production change before its focused test
  has failed for the expected missing behavior.
- Use `apply_patch` for hand-authored file changes and commit each independently
  reviewable TDD increment with `[#1412]` attribution.

## Verified planning baseline

At `origin/trunk` SHA `fd87359db995fd29825a46b9947b9ad99405584e`, the
existing affected contracts passed before implementation: `test-verb-sandbox`
8/8, `test-verb-sandbox-worktree-path` 3/3, and
`verb-test-remove-worktree` 1/1. The worktree environment also passed the
repository-owned setup and self-link verifier under Node.js 25.6.0.

---

### Task 1: Pure stale-sandbox classifier and best-effort adapter

**Files:**

- Create: `scripts/task-tracker/lib/test-sandbox-reaper.mjs`
- Create: `scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs`

**Interfaces:**

- Consumes: `isProcessAlive(pid)` from
  `scripts/task-tracker/issue-mutator-lock.mjs`; an injected
  `removeWorktree({ projectDir, path })` function.
- Produces:
  `parseRegisteredWorktreePaths(porcelain: string): string[]`,
  `selectStaleTestSandboxPaths({ projectDir, worktreePaths, isPidAlive }): string[]`,
  `listRegisteredWorktreePaths({ projectDir }): Promise<string[]>`, and
  `reapStaleTestSandboxes({ projectDir, removeWorktree, listWorktrees,
isPidAlive }): Promise<{ candidates: string[], attempted: string[] }>`.

- [ ] **Step 1: Write the failing focused test**

Create `scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs` with
this complete content:

```js
#!/usr/bin/env node
// @story #1412

import { strict as assert } from 'node:assert';
import path from 'node:path';
import test from 'node:test';

import {
  parseRegisteredWorktreePaths,
  reapStaleTestSandboxes,
  selectStaleTestSandboxPaths,
} from '../../../../task-tracker/lib/test-sandbox-reaper.mjs';

const projectDir = path.resolve('/repo');
const tmpDir = path.join(projectDir, '.tmp');
const staleA = path.join(tmpDir, '.task-test-1412-deadbeef-41001-a1b2c3d4');
const staleB = path.join(tmpDir, '.task-test-1408-cafebabe-41002-deadbeef');
const live = path.join(tmpDir, '.task-test-1411-0123abcd-41003-1234abcd');

test('parses only worktree records from NUL-delimited porcelain', () => {
  const porcelain = [
    `worktree ${projectDir}`,
    'HEAD abcdef',
    'branch refs/heads/trunk',
    '',
    `worktree ${staleA}`,
    'HEAD deadbeef',
    'detached',
    '',
  ].join('\0');
  assert.deepEqual(parseRegisteredWorktreePaths(porcelain), [projectDir, staleA]);
});

test('selects exact project-local tokenized sandboxes only when their PID is dead', () => {
  const candidates = [
    staleA,
    live,
    path.join(tmpDir, '.task-test-1412-deadbeef'),
    path.join(tmpDir, '.task-test-1412-DEADBEEF-41004-a1b2c3d4'),
    path.join(tmpDir, '.task-test-1412-deadbeef-0-a1b2c3d4'),
    path.join(tmpDir, '.task-test-1412-deadbeef-41004-A1B2C3D4'),
    path.join(tmpDir, 'nested', '.task-test-1412-deadbeef-41004-a1b2c3d4'),
    path.join(projectDir, '.tmp-sibling', '.task-test-1412-deadbeef-41004-a1b2c3d4'),
    path.resolve('/other/.tmp/.task-test-1412-deadbeef-41004-a1b2c3d4'),
    path.join(tmpDir, 'ordinary-worktree'),
  ];
  const selected = selectStaleTestSandboxPaths({
    projectDir,
    worktreePaths: candidates,
    isPidAlive: (pid) => pid === 41003,
  });
  assert.deepEqual(selected, [staleA]);
});

test('retains a candidate when the liveness probe cannot prove death', () => {
  const selected = selectStaleTestSandboxPaths({
    projectDir,
    worktreePaths: [staleA],
    isPidAlive: () => {
      throw new Error('permission denied');
    },
  });
  assert.deepEqual(selected, []);
});

test('attempts every proven stale registration even when one removal fails', async () => {
  const attempted = [];
  const result = await reapStaleTestSandboxes({
    projectDir,
    listWorktrees: async () => [staleA, staleB, live],
    isPidAlive: (pid) => pid === 41003,
    removeWorktree: async ({ path: worktreePath }) => {
      attempted.push(worktreePath);
      if (worktreePath === staleA) throw new Error('already changed');
    },
  });
  assert.deepEqual(result.candidates, [staleA, staleB]);
  assert.deepEqual(result.attempted, [staleA, staleB]);
  assert.deepEqual(attempted, [staleA, staleB]);
});

test('inventory failure is non-fatal and performs no removal', async () => {
  let removals = 0;
  const result = await reapStaleTestSandboxes({
    projectDir,
    listWorktrees: async () => {
      throw new Error('git unavailable');
    },
    removeWorktree: async () => {
      removals += 1;
    },
  });
  assert.deepEqual(result, { candidates: [], attempted: [] });
  assert.equal(removals, 0);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`scripts/task-tracker/lib/test-sandbox-reaper.mjs`. This is the required proof
that the new test detects the missing behavior.

- [ ] **Step 3: Implement the minimal library**

Create `scripts/task-tracker/lib/test-sandbox-reaper.mjs` with this complete
content:

```js
// @story #1412
// Lazy crash recovery for detached worktrees created by `/task test`.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { isProcessAlive } from '../issue-mutator-lock.mjs';

const pexec = promisify(execFile);
const TOKENIZED_SANDBOX_RE = /^\.task-test-([1-9]\d*)-([0-9a-f]{8})-([1-9]\d*)-([0-9a-f]{8})$/;

export function parseRegisteredWorktreePaths(porcelain) {
  return String(porcelain || '')
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => field.slice('worktree '.length));
}

export function selectStaleTestSandboxPaths({
  projectDir,
  worktreePaths = [],
  isPidAlive = isProcessAlive,
} = {}) {
  if (!projectDir) throw new TypeError('test-sandbox-reaper: projectDir is required');
  const expectedParent = path.join(path.resolve(projectDir), '.tmp');
  const selected = [];

  for (const candidate of worktreePaths) {
    const resolved = path.resolve(String(candidate || ''));
    if (path.dirname(resolved) !== expectedParent) continue;
    const match = path.basename(resolved).match(TOKENIZED_SANDBOX_RE);
    if (!match) continue;
    const pid = Number(match[3]);
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;

    let alive = true;
    try {
      alive = isPidAlive(pid) !== false;
    } catch {
      alive = true;
    }
    if (!alive) selected.push(resolved);
  }
  return selected;
}

export async function listRegisteredWorktreePaths({ projectDir } = {}) {
  const { stdout } = await pexec('git', ['worktree', 'list', '--porcelain', '-z'], {
    cwd: projectDir,
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return parseRegisteredWorktreePaths(stdout);
}

export async function reapStaleTestSandboxes({
  projectDir,
  removeWorktree,
  listWorktrees = listRegisteredWorktreePaths,
  isPidAlive = isProcessAlive,
} = {}) {
  if (typeof removeWorktree !== 'function') {
    throw new TypeError('test-sandbox-reaper: removeWorktree is required');
  }

  let worktreePaths;
  try {
    worktreePaths = await listWorktrees({ projectDir });
  } catch {
    return { candidates: [], attempted: [] };
  }

  const candidates = selectStaleTestSandboxPaths({
    projectDir,
    worktreePaths,
    isPidAlive,
  });
  const attempted = [];
  for (const worktreePath of candidates) {
    attempted.push(worktreePath);
    try {
      await removeWorktree({ projectDir, path: worktreePath });
    } catch {
      // Best-effort crash recovery; normal sandbox creation must still run.
    }
  }
  return { candidates, attempted };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs
```

Expected: 5 tests pass, 0 fail, with no Git mutation because every side-effect
dependency used by adapter tests is injected.

- [ ] **Step 5: Run formatting and lint checks for the new files**

Run:

```bash
npx prettier --check scripts/task-tracker/lib/test-sandbox-reaper.mjs scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs
npx eslint scripts/task-tracker/lib/test-sandbox-reaper.mjs scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the classifier increment and trace it**

Run:

```bash
git add scripts/task-tracker/lib/test-sandbox-reaper.mjs scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs
git commit -m "[#1412] fix(test): classify stale verification sandboxes"
npx aitm commit-trace 1412
```

Expected: one commit containing only the library and its focused test; commit
trace updates successfully.

### Task 2: Wire lazy recovery before current sandbox creation

**Files:**

- Modify: `scripts/task-tracker/verbs/test.mjs:23-31,401-440,680-690,1230-1250`
- Modify: `scripts/tests/unit/task-tracker/lib/test-verb-sandbox.test.mjs:1-80,130-190`

**Interfaces:**

- Consumes:
  `reapStaleTestSandboxes({ projectDir, removeWorktree }): Promise<object>` from
  Task 1 and the existing
  `defaultRemoveWorktree({ projectDir, path }): Promise<void>`.
- Produces: `runVerbTest` calls its injected recovery dependency after state and
  HEAD validation but before `createWorktree`; `verbTest` supplies Task 1's real
  adapter for production CLI execution.

- [ ] **Step 1: Add the failing ordering test**

In `scripts/tests/unit/task-tracker/lib/test-verb-sandbox.test.mjs`, add `#1412`
to the first-line story tag. Extend `makeDeps` so `calls` contains
`events: []` and `reaperRuns: 0`; replace its `createWorktree` stub and add the
reaper stub exactly as follows:

```js
    reapStaleTestSandboxes: async ({ projectDir: recoveredProjectDir, removeWorktree }) => {
      assert.equal(recoveredProjectDir.length > 0, true);
      assert.equal(typeof removeWorktree, 'function');
      calls.reaperRuns += 1;
      calls.events.push('reap');
      return { candidates: [], attempted: [] };
    },
    createWorktree: async () => {
      calls.events.push('create');
      calls.worktreesCreated++;
    },
```

Then add this test immediately before the existing green-path test:

```js
test('verbTest #1412: crash recovery runs before the current sandbox is created', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    const result = await runVerbTest({ cfg, issueNumber: 1412, projectDir, deps });
    assert.equal(result.status, 'passed');
    assert.equal(calls.reaperRuns, 1);
    assert.deepEqual(calls.events.slice(0, 2), ['reap', 'create']);
  });
});
```

- [ ] **Step 2: Run the ordering test and verify RED**

Run:

```bash
node --test --test-name-pattern='crash recovery runs before' scripts/tests/unit/task-tracker/lib/test-verb-sandbox.test.mjs
```

Expected: FAIL because `calls.reaperRuns` is `0`; `runVerbTest` does not yet
invoke the dependency.

- [ ] **Step 3: Add the minimal production wiring**

In `scripts/task-tracker/verbs/test.mjs`, add this import beside the other
`../lib` imports:

```js
import { reapStaleTestSandboxes as defaultReapStaleTestSandboxes } from '../lib/test-sandbox-reaper.mjs';
```

In `runVerbTest`, immediately after resolving `removeWorktree`, add:

```js
const recoverStaleTestSandboxes =
  deps.reapStaleTestSandboxes || (async () => ({ candidates: [], attempted: [] }));
```

Immediately after `const sha = await getHeadSha({ projectDir });`, add:

```js
await recoverStaleTestSandboxes({ projectDir, removeWorktree });
```

In the production dependency object passed by `verbTest` to
`runTestWithEntryInterlock`, add:

```js
        reapStaleTestSandboxes: defaultReapStaleTestSandboxes,
```

Do not change `sandboxWorktreePath`, `defaultRemoveWorktree`, setup retry,
receipt handling, or the existing `finally` block.

- [ ] **Step 4: Run the ordering and focused reaper tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern='crash recovery runs before' scripts/tests/unit/task-tracker/lib/test-verb-sandbox.test.mjs
node --test scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs
```

Expected: the ordering test passes with `['reap', 'create']`; all 5 classifier
and adapter tests pass.

- [ ] **Step 5: Run the complete affected test files**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/test-verb-sandbox.test.mjs
node --test scripts/tests/unit/task-tracker/verbs/test-verb-sandbox-worktree-path.test.mjs
node --test scripts/tests/slow/task-tracker/verbs/verb-test-remove-worktree.test.mjs
```

Expected: all three commands exit 0. The existing unique-token and two-stage
cleanup contracts remain green.

- [ ] **Step 6: Run formatting and lint checks for all touched code**

Run:

```bash
npx prettier --check scripts/task-tracker/lib/test-sandbox-reaper.mjs scripts/task-tracker/verbs/test.mjs scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs scripts/tests/unit/task-tracker/lib/test-verb-sandbox.test.mjs
npx eslint scripts/task-tracker/lib/test-sandbox-reaper.mjs scripts/task-tracker/verbs/test.mjs scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs scripts/tests/unit/task-tracker/lib/test-verb-sandbox.test.mjs
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit the wiring increment and trace it**

Run:

```bash
git add scripts/task-tracker/verbs/test.mjs scripts/tests/unit/task-tracker/lib/test-verb-sandbox.test.mjs
git commit -m "[#1412] fix(test): reap crashed verification worktrees"
npx aitm commit-trace 1412
```

Expected: one commit containing only production wiring and its ordering
regression test; commit trace updates successfully.

### Task 3: Govern the verifier repair and complete repository verification

**Files:**

- Create transient operation file:
  `.tmp/gh/1412-vc2-reaper-operation.json`
- Modify remotely through sanctioned AITM operation: GitHub issue #1412
- Update after execution: roadmap checkpoint in
  `.tmp/plan/2026-08-28-backlog-defect-roadmap.md`

**Interfaces:**

- Consumes: issue body version 21 and the exact stale verifier string
  `` `node --test scripts/tests/unit/task-tracker/lib/test-git-isolation.test.mjs` ``.
- Produces: a current VC2 path pointing at
  `scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs`, plus fresh
  Test-stage evidence for #1412.

- [ ] **Step 1: Verify the branch delta before issue mutation**

Run:

```bash
git status --short --branch
git log --oneline origin/trunk..HEAD
git diff --stat origin/trunk...HEAD
```

Expected: a clean #1412 branch containing the approved design, plan, and the two
implementation commits only. Stop if unrelated changes appear.

- [ ] **Step 2: Replace the stale VC2 path through the governed fresh-base API**

Create `.tmp/gh/1412-vc2-reaper-operation.json` with:

```json
{
  "schema": "aitm.issue-body-operation/v1",
  "kind": "replace-exact",
  "expected": "`node --test scripts/tests/unit/task-tracker/lib/test-git-isolation.test.mjs`",
  "replacement": "`node --test scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs`",
  "expectedVersion": 21
}
```

Run:

```bash
npx aitm issue-body 1412 --operation-file .tmp/gh/1412-vc2-reaper-operation.json
```

Expected: the governed mutation succeeds and reports a verified new body
version. If version 21 is stale, re-read the live body and prove that only AITM
markers changed before regenerating the operation with the new exact version;
never bypass the precondition.

- [ ] **Step 3: Run the issue-specific focused verifiers**

Run:

```bash
node --test scripts/tests/unit/task-tracker/lib/close-repair.test.mjs
node --test scripts/tests/unit/task-tracker/lib/test-sandbox-reaper.test.mjs
```

Expected: close-repair passes 3/3 and the reaper passes 5/5.

- [ ] **Step 4: Run the repository verification required by #1412**

Run each command separately and preserve its exit result:

```bash
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
```

Expected: every command exits 0; HEAD is the latest `[#1412]` implementation
commit or a later `[#1412]` documentation-only plan commit with both
implementation commits reachable.

- [ ] **Step 5: Run the governed Test-stage sandbox**

Run:

```bash
npx aitm test 1412
```

Expected: the sandbox runs the current VC list, stamps fresh evidence, and moves
issue #1412 from Develop to Test. If it fails, preserve diagnostics and return
to the RED-GREEN cycle; do not tick acceptance criteria manually.

- [ ] **Step 6: Record the roadmap checkpoint**

Update `.tmp/plan/2026-08-28-backlog-defect-roadmap.md` from live evidence:
record AC4's focused result, the governed Test transition, current HEAD, and the
next lifecycle gate. Keep #1411 pending until #1412 is actually Done.

- [ ] **Step 7: Hand off to branch completion**

Invoke `superpowers:finishing-a-development-branch`. Re-run its required
verification, present the supported integration choices, and do not push,
deliver, close, or clean the retained carrier without the applicable explicit
gate and exact ref evidence.
