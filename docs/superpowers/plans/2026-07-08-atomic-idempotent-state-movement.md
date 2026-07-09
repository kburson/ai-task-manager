# Atomic + Idempotent State Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `/task` state transition atomic-in-effect and idempotent behind a single `promote`/`demote` entry point, gated by a re-read-verified `aitm-move-complete` sentinel and backstopped by an independent move auditor.

**Architecture:** A move becomes a Roll-Forward Idempotent-Replay Saga: entry rows + entry markers are written and re-read-verified BEFORE the authoritative `Status` write, the `Status` write is re-read-verified (existing #711 loop), and an `aitm-move-complete state=<target>` sentinel is written LAST after `Status` is confirmed. Completion is defined as `sentinel present AND Status == target AND entry markers present AND both timing rows present`. The saga core lives in one internal `moveState(ctx)` function that `promote`/`demote` call in-process; the standalone `move-state.mjs` script is de-listed as a callable path. An independent `verify-move-invariants` auditor, run on `bind`/`pull-next`, catches out-of-band Status changes (sentinel absent) that no write-time guard can see.

**Tech Stack:** Node.js v18+ ESM, `node --test` + `node:assert/strict`, GitHub CLI (`gh`) Issues REST + Projects GraphQL, existing `scripts/task-tracker/lib/move-state/*` module set.

## Global Constraints

- Node.js v18+, ES modules only (no CommonJS).
- Never widen the public surface of `move-state.mjs`: it must remain INTERNAL and refuse direct invocation. No new public import path to the raw Status writer.
- All issue-body writes go through `mutateIssueBody` / `writeIssueBodyWithRetry`; never `gh issue edit --body`/`--body-file` from a hand-rolled call. Invariant markers must survive every write (`findLostMarkers` / `MarkerLossError`, #361).
- Preserve the #714 invariant: a throw in any best-effort tail step is caught, logged to stderr, and never flips the process exit code or fails-reports a committed move.
- Preserve the #711 fail-closed semantics in `runStatusWrite`: an unconfirmed board write (concrete mismatch OR empty/unreadable read) returns a non-null exit and never proceeds.
- The single-state-mutator intent (`feedback_single_state_mutator`) holds: exactly one audited code path writes `Status`.
- Tests run with `node --test <file>` per file; during Develop use `node scripts/task-tracker/verify-develop.mjs`, never `npm run test:all`.
- No emojis in code/comments except the existing readout glyphs already in this subsystem (`✓`, `⛔`). Currency in backticks.
- Every commit message uses the `[#N]` issue prefix that task-tracker enforces.

## Design source

Full design: [`docs/superpowers/specs/2026-07-08-atomic-idempotent-state-movement-design.md`](../../docs/superpowers/specs/2026-07-08-atomic-idempotent-state-movement-design.md) (commit 8a66416).

## Epic → child mapping (GitHub)

| Child | Scope                                                                                                          | Plan tasks  |
| ----- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| #755  | Consolidate move-state logic into `moveState(ctx)` single internal entry point; verbs call in-process          | Tasks 1–3   |
| #756  | State-move saga: reorder write-then-verify core, `aitm-move-complete` sentinel written last, idempotent replay | Tasks 4–8   |
| #757  | `promote`/`demote` output contract (§9 success readout + failure routing)                                      | Tasks 9–10  |
| #758  | Move auditor `verify-move-invariants` + sentinel tripwire wired into `bind`/`pull-next`                        | Tasks 11–13 |
| #759  | Regression + behavioral coverage for the #741/#752/#753 classes                                                | Task 14     |
| #753  | Folded bug: close noop/converge fast-path strands lifecycle DoD checkboxes                                     | Task 8      |
| #752  | Folded bug: close false "Issue left OPEN" on killed tail after board committed                                 | Tasks 6, 14 |

---

## File Structure

**New files:**

- `scripts/task-tracker/lib/move-state/sentinel.mjs` — the `aitm-move-complete` writer/reader + completion predicate. Pure body transforms + one thin GitHub read.
- `scripts/task-tracker/lib/move-state/move-state-core.mjs` — `moveState(ctx)`: the saga orchestrator extracted from `move-state.mjs`'s `__mutationBlock`. Returns a result object; never calls `process.exit`.
- `scripts/task-tracker/lib/move-state/readout.mjs` — pure §9 success/failure readout formatters.
- `scripts/task-tracker/lib/move-state/verify-move-invariants.mjs` — the independent move auditor (`verifyMoveInvariants(issue)`), pure decision + optional reconcile hook.
- Test files (one per new module): `*.test.mjs` alongside `scripts/task-tracker/tests/unit/` following the repo's existing test-location convention (verify at implementation time — see Task 0).

**Modified files:**

- `scripts/task-tracker/lib/move-state/post-commit-tail.mjs` — remove `stampEntryMarkers` and `emitPhasePairRows` from `DEFAULT_TAIL_STEPS` (they graduate into the atomic core); tail begins at `dispatchOnEnterActions`.
- `scripts/gh/move-state.mjs` — `__mutationBlock` delegates to `moveState(ctx)`; host becomes thin CLI wrapper mapping the result object to exit codes.
- `scripts/task-tracker/verbs/promote.mjs` — `defaultRunMoveState` calls `moveState(ctx)` in-process (no subprocess spawn); surface the readout.
- `scripts/task-tracker/verbs/demote.mjs` — same in-process call (mirror of promote; verify shape at Task 3).
- `scripts/task-tracker/verbs/pull-next.mjs` and the bind path (`rules/bind.md` runtime, `verbs/*` bind handler) — invoke `verifyMoveInvariants` and surface findings.

---

## Task 0: Confirm test-location + demote-verb conventions (spike, no code)

**Files:**

- Read: `scripts/task-tracker/tests/unit/` (or wherever `*.test.mjs` for move-state modules live)
- Read: `scripts/task-tracker/verbs/demote.mjs`
- Read: `scripts/task-tracker/verbs/pull-next.mjs`

- [ ] **Step 1: Locate existing move-state module tests**

Run: `git ls-files 'scripts/**/*move-state*.test.mjs' 'scripts/**/*github-mutation*.test.mjs'`
Expected: a set of existing test files. Note the directory convention (co-located vs `test/`) and reuse it verbatim for every new `*.test.mjs` in this plan.

- [ ] **Step 2: Read `demote.mjs` to confirm it mirrors `promote.mjs`'s `defaultRunMoveState`**

Confirm demote spawns `scripts/gh/move-state.mjs` the same way promote does (env `AITM_VERB_CONTEXT`, `MOVE_STATE_DELEGATE_TIMEOUT_MS`). Record any divergence — Task 3 must patch both.

- [ ] **Step 3: Read `pull-next.mjs` to find the post-selection hook point**

Identify where, after selecting the next issue, an auditor call slots in (Task 13). Record the function name and the `ctx`/`deps` seam it exposes.

No commit — findings feed Tasks 1–13.

---

## Task 1: Extract `moveState(ctx)` core (behavior-preserving)

**Files:**

- Create: `scripts/task-tracker/lib/move-state/move-state-core.mjs`
- Test: `scripts/task-tracker/tests/unit/move-state-core.test.mjs` (adjust per Task 0)
- Modify: `scripts/gh/move-state.mjs:305-330` (the `__mutationBlock`)

**Interfaces:**

- Consumes: `runGuardExecution(ctx)`, `runStatusWrite(ctx)`, `runPostCommitTail(ctx)` (existing, unchanged signatures).
- Produces: `async function moveState(ctx) → { exit: number|null, itemId: string, tail: { failures: Array } }`. `exit` is a number the caller must honor (mirrors the current `process.exit` codes); `null` means success. NO `process.exit` inside this function.

- [ ] **Step 1: Write the failing test**

```js
// move-state-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveState } from '../lib/move-state/move-state-core.mjs';

function baseCtx(overrides = {}) {
  const calls = [];
  return {
    issueArg: '999',
    stateArg: 'test',
    calls,
    // seams injected so the core runs with zero network:
    _runGuardExecution: async () => {
      calls.push('guard');
      return { exit: null };
    },
    _runStatusWrite: async (c) => {
      calls.push('status');
      return { itemId: 'IT_1', exit: null };
    },
    _runPostCommitTail: async (c) => {
      calls.push('tail');
      return { failures: [] };
    },
    ...overrides,
  };
}

test('moveState runs guard → status → tail and returns success', async () => {
  const ctx = baseCtx();
  const res = await moveState(ctx);
  assert.equal(res.exit, null);
  assert.equal(res.itemId, 'IT_1');
  assert.deepEqual(ctx.calls, ['guard', 'status', 'tail']);
});

test('moveState halts on guard refusal and never writes status', async () => {
  const ctx = baseCtx({ _runGuardExecution: async () => ({ exit: 6 }) });
  const res = await moveState(ctx);
  assert.equal(res.exit, 6);
  assert.ok(!ctx.calls.includes('status'));
});

test('moveState halts on status exit and never runs tail', async () => {
  const ctx = baseCtx({ _runStatusWrite: async () => ({ itemId: 'IT_1', exit: 7 }) });
  const res = await moveState(ctx);
  assert.equal(res.exit, 7);
  assert.ok(!ctx.calls.includes('tail'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/task-tracker/tests/unit/move-state-core.test.mjs`
Expected: FAIL — `Cannot find module '../lib/move-state/move-state-core.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/task-tracker/lib/move-state/move-state-core.mjs
// INTERNAL — the state-movement saga core (#755/#756). Extracted from
// scripts/gh/move-state.mjs's __mutationBlock so exactly one code path owns the
// ordered saga. Returns a result object; the HOST maps result.exit to
// process.exit. This function never calls process.exit and never prints usage.
import { runGuardExecution as defaultRunGuardExecution } from './guard-execution.mjs';
import { runStatusWrite as defaultRunStatusWrite } from './github-mutation.mjs';
import { runPostCommitTail as defaultRunPostCommitTail } from './post-commit-tail.mjs';

export async function moveState(ctx) {
  const runGuardExecution = ctx._runGuardExecution || defaultRunGuardExecution;
  const runStatusWrite = ctx._runStatusWrite || defaultRunStatusWrite;
  const runPostCommitTail = ctx._runPostCommitTail || defaultRunPostCommitTail;

  const guard = await runGuardExecution(ctx);
  if (guard.exit !== null && guard.exit !== undefined)
    return { exit: guard.exit, itemId: '', tail: { failures: [] } };

  const writeResult = await runStatusWrite(ctx);
  if (writeResult.exit !== null)
    return { exit: writeResult.exit, itemId: writeResult.itemId, tail: { failures: [] } };
  ctx.itemId = writeResult.itemId;

  const tail = await runPostCommitTail(ctx);
  return { exit: null, itemId: writeResult.itemId, tail };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/task-tracker/tests/unit/move-state-core.test.mjs`
Expected: PASS (3/3).

- [ ] **Step 5: Rewire the host `__mutationBlock` to delegate**

In `scripts/gh/move-state.mjs`, replace the inline `runGuardExecution`/`runStatusWrite`/`runPostCommitTail` sequence in `__mutationBlock` with:

```js
import { moveState } from '../task-tracker/lib/move-state/move-state-core.mjs';
// ...
const result = await moveState(ctx);
if (result.exit !== null) process.exit(result.exit);
ctx.itemId = result.itemId;
```

Delete the now-duplicated inline guard/status/tail calls. Keep the lock handling wrapper (`ISSUE_LOCK_HELD_ENV` / `withIssueLock`) exactly as-is around this block.

- [ ] **Step 6: Run the existing move-state host tests to prove no behavior drift**

Run: `git ls-files 'scripts/**/*move-state*.test.mjs' | xargs -n1 node --test`
Expected: PASS — all existing move-state tests green (this task is a pure extraction; ordering is unchanged in Task 1).

- [ ] **Step 7: Commit**

```bash
git add scripts/task-tracker/lib/move-state/move-state-core.mjs scripts/task-tracker/tests/unit/move-state-core.test.mjs scripts/gh/move-state.mjs
git commit -m "[#755] refactor(move-state): extract moveState(ctx) saga core from host"
```

---

## Task 2: `promote` calls `moveState` in-process (no subprocess spawn)

> **SHAPE (a) OVERRIDE — approved 2026-07-08, supersedes the `assembleMoveCtx` approach below.**
> Rather than duplicate the ~190-line ctx assembly into every verb, the entire
> host body of `scripts/gh/move-state.mjs` (config load → verb-gate → matrix gate →
> ctx build → guard → lock → `moveState` → exit mapping) is lifted into one
> exported `runMoveStateHost({ argv = process.argv, env = process.env, isTty = process.stdin.isTTY } = {})`
> that **returns a numeric exit code and NEVER calls `process.exit`**. `move-state.mjs`
> keeps an `isInvokedAsMain()` shim (`runMoveStateHost().then((c) => process.exit(c))`)
> so the CLI + all 29 spawn/grep tests behave identically. Verbs then call
> `runMoveStateHost` in-process and read the returned code — the _same number_ the
> child exit code gave them, so `runPromote`'s `transitionResult.exitCode` branching
> is unchanged. The future embed-in-aitm hardening (new #754 child, sequenced after
> #759) plugs into this exact seam. No `assembleMoveCtx` is introduced.
>
> **Commit A** — extract `runMoveStateHost` + `isInvokedAsMain()` shim in
> `scripts/gh/move-state.mjs`; every `process.exit(N)` → `return N`; read
> `AITM_VERB_CONTEXT`/`AITM_INTERNAL`/`AITM_ISSUE_LOCK_HELD`/`TT_SKIP_NETWORK` from
> the passed `env`; `return 0` on success. New test
> `tests/unit/move-state-host-returns.test.mjs` proves the host RETURNS codes
> (unknown-state → 1, usage → 1) without exiting the process; the full
> `*move-state*` suite stays green.
> Commit: `[#755] refactor(move-state): lift host body into runMoveStateHost (returns exit code)`
>
> **Commit B** — `defaultRunMoveState` in `promote.mjs` calls
> `runMoveStateHost({ argv: [process.execPath, 'move-state.mjs', String(issueNumber), target], env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'promote' } })`.
> `process.env.AITM_ISSUE_LOCK_HELD` is already `'1'` (set by `verbPromote`'s
> `withIssueLock`, issue-mutator-lock.mjs:225) and is spread into `env`, so the host
> skips re-acquisition — no deadlock. `tests/unit/promote-inprocess.test.mjs` asserts
> no child spawn.
> Commit: `[#755] refactor(promote): call runMoveStateHost in-process, drop subprocess spawn`

**Files:**

- Modify: `scripts/task-tracker/verbs/promote.mjs` (`defaultRunMoveState`)
- Test: `scripts/task-tracker/tests/unit/promote-inprocess.test.mjs`

**Interfaces:**

- Consumes: `moveState(ctx)` from Task 1.
- Produces: `defaultRunMoveState` returns the same `{ status, exitCode }` shape `runPromote` already maps, now sourced from an in-process `moveState` result instead of a spawned child's exit code.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPromote } from '../verbs/promote.mjs';

test('runPromote invokes moveState in-process (no child spawn) and reports promoted on exit null', async () => {
  let spawned = false;
  const deps = {
    // existing promote deps stubbed to reach the move call with target=test:
    assertBound: () => {},
    fetchBody: async () => 'body',
    readLastKnownState: () => 'develop',
    getLiveState: async () => 'develop',
    runGuards: async () => [],
    spawn: () => {
      spawned = true;
      return { status: 0 };
    },
    moveState: async () => ({ exit: null, itemId: 'IT_9', tail: { failures: [] } }),
    readBoardState: async () => 'test',
  };
  const res = await runPromote({ issueNumber: 999, cfg: { repo: 'o/r' }, deps, now: () => 0 });
  assert.equal(spawned, false, 'must not spawn move-state.mjs subprocess');
  assert.match(res.status, /promoted/);
});
```

> Adjust the stubbed `deps` names to the real `runPromote` dependency seam observed in `promote.mjs` at implementation time; the assertion that matters is **`spawned === false`** and **status is a promoted variant**.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/task-tracker/tests/unit/promote-inprocess.test.mjs`
Expected: FAIL — promote still spawns the subprocess (or `deps.moveState` unused).

- [ ] **Step 3: Replace `defaultRunMoveState`'s spawn with an in-process call**

In `promote.mjs`, change `defaultRunMoveState` so that instead of `spawnSync(process.execPath, ['scripts/gh/move-state.mjs', ...])` it builds `ctx` and calls `await moveState(ctx)` directly, mapping `result.exit` to the status codes the wrapper already uses:

```js
import { moveState } from '../lib/move-state/move-state-core.mjs';

async function defaultRunMoveState({ issueNumber, target, cfg, deps }) {
  const ctx = await assembleMoveCtx({ issueNumber, target, cfg, deps }); // factored from the host ctx block
  const result = await (deps.moveState || moveState)(ctx);
  return { exit: result.exit, itemId: result.itemId, tail: result.tail };
}
```

`assembleMoveCtx` is the ctx-assembly currently living in `move-state.mjs:259-283` (issueArg, stateArg, resolvedFromState, plan, cfg, gh, pexec, projectItemForIssue, readBackStatusOptionId, checkDirty, formatSummary, etc.). Extract it into `move-state-core.mjs` as an exported helper so BOTH the host and promote build identical ctx. The issue lock is already held by `verbPromote`'s `withIssueLock`; pass `ISSUE_LOCK_HELD_ENV`-equivalent state so `moveState` does not re-lock.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/task-tracker/tests/unit/promote-inprocess.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run the full promote suite**

Run: `git ls-files 'scripts/**/*promote*.test.mjs' | xargs -n1 node --test`
Expected: PASS — including the #710 "re-read board after alias exit-0, refuse false success" test, which now reads `result.exit`/`readBoardState` instead of a child exit code.

- [ ] **Step 6: Commit**

```bash
git add scripts/task-tracker/verbs/promote.mjs scripts/task-tracker/lib/move-state/move-state-core.mjs scripts/task-tracker/tests/unit/promote-inprocess.test.mjs
git commit -m "[#755] refactor(promote): call moveState in-process, drop move-state subprocess"
```

---

## Task 3: `demote` in-process + de-list the standalone script path

> **SHAPE (a) OVERRIDE — approved 2026-07-08.** Apply the same in-process rewire as
> Task 2 Commit B, but to `demote.mjs`'s move-state delegate, with env
> `AITM_VERB_CONTEXT: 'demote'`. Uses the `runMoveStateHost` extracted in Task 2 —
> no `assembleMoveCtx`. Confirm `bin/aitm-registry.mjs` keeps `move-state` INTERNAL
> (no `SCRIPTS` entry). Test: `tests/unit/demote-inprocess.test.mjs` asserts no child
> spawn.
> Commit: `[#755] refactor(demote): in-process runMoveStateHost; move-state stays internal-only`

**Files:**

- Modify: `scripts/task-tracker/verbs/demote.mjs`
- Modify: `bin/aitm-registry.mjs` (confirm `move-state` stays in the INTERNAL map, unexposed)
- Test: `scripts/task-tracker/tests/unit/demote-inprocess.test.mjs`

- [ ] **Step 1: Write the failing test** — mirror Task 2's test for `runDemote` (assert no subprocess spawn, status is a demoted variant).

- [ ] **Step 2: Run to verify it fails.** Run: `node --test scripts/task-tracker/tests/unit/demote-inprocess.test.mjs` → FAIL.

- [ ] **Step 3: Apply the same in-process rewire to `demote.mjs`** using the shared `assembleMoveCtx` + `moveState` from Task 2. Confirm `bin/aitm-registry.mjs` keeps `move-state` INTERNAL (no `SCRIPTS` entry) — the host script remains runnable by tests but unlisted to `aitm`.

- [ ] **Step 4: Run to verify it passes.** → PASS.

- [ ] **Step 5: Run demote + registry suites.** Run: `git ls-files 'scripts/**/*demote*.test.mjs' 'bin/**/*registry*.test.mjs' | xargs -n1 node --test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/task-tracker/verbs/demote.mjs bin/aitm-registry.mjs scripts/task-tracker/tests/unit/demote-inprocess.test.mjs
git commit -m "[#755] refactor(demote): in-process moveState; move-state stays internal-only"
```

---

## Task 4: Sentinel writer/reader + completion predicate

**Files:**

- Create: `scripts/task-tracker/lib/move-state/sentinel.mjs`
- Test: `scripts/task-tracker/tests/unit/sentinel.test.mjs`

**Interfaces:**

- Produces:
  - `MOVE_COMPLETE_RE` — regex matching `<!-- aitm-move-complete state=<s> ts=<iso> -->`.
  - `writeMoveCompleteMarker(body, state, ts) → string` — pure: upsert the sentinel into a body (single occurrence, replace prior).
  - `readMoveCompleteState(body) → string` — pure: return the `state` in the sentinel, or `''`.
  - `isMoveComplete({ sentinelState, statusState, entryMarkerPresent, exitRowPresent, entryRowPresent, target }) → boolean` — pure completion predicate (spec §5 + option (a) timing rows).

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  writeMoveCompleteMarker,
  readMoveCompleteState,
  isMoveComplete,
} from '../lib/move-state/sentinel.mjs';

test('writeMoveCompleteMarker upserts a single sentinel', () => {
  const b0 = 'Body text';
  const b1 = writeMoveCompleteMarker(b0, 'test', '2026-07-08T00:00:00.000Z');
  assert.match(b1, /<!-- aitm-move-complete state=test ts=2026-07-08T00:00:00\.000Z -->/);
  const b2 = writeMoveCompleteMarker(b1, 'review', '2026-07-08T01:00:00.000Z');
  assert.equal((b2.match(/aitm-move-complete/g) || []).length, 1, 'exactly one sentinel');
  assert.equal(readMoveCompleteState(b2), 'review');
});

test('readMoveCompleteState returns empty when absent', () => {
  assert.equal(readMoveCompleteState('no marker here'), '');
});

test('isMoveComplete requires sentinel AND status AND markers AND both rows', () => {
  const all = {
    sentinelState: 'test',
    statusState: 'test',
    entryMarkerPresent: true,
    exitRowPresent: true,
    entryRowPresent: true,
    target: 'test',
  };
  assert.equal(isMoveComplete(all), true);
  assert.equal(isMoveComplete({ ...all, sentinelState: '' }), false);
  assert.equal(isMoveComplete({ ...all, statusState: 'develop' }), false);
  assert.equal(isMoveComplete({ ...all, entryMarkerPresent: false }), false);
  assert.equal(isMoveComplete({ ...all, entryRowPresent: false }), false);
  assert.equal(isMoveComplete({ ...all, exitRowPresent: false }), false);
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `node --test scripts/task-tracker/tests/unit/sentinel.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/task-tracker/lib/move-state/sentinel.mjs
// INTERNAL — the aitm-move-complete sentinel (#756). Written LAST, after Status
// is re-read-verified at target. It is the signature the completion predicate
// and the move auditor (#758) key on: a Status transition without a matching
// sentinel is, by definition, out-of-band.
export const MOVE_COMPLETE_RE = /<!-- aitm-move-complete state=(\S+) ts=(\S+) -->/;
const GLOBAL_RE = /<!-- aitm-move-complete state=\S+ ts=\S+ -->\n?/g;

export function writeMoveCompleteMarker(body, state, ts) {
  const stripped = String(body ?? '').replace(GLOBAL_RE, '');
  const marker = `<!-- aitm-move-complete state=${state} ts=${ts} -->`;
  const base = stripped.replace(/\s*$/, '');
  return `${base}\n${marker}\n`;
}

export function readMoveCompleteState(body) {
  const m = String(body ?? '').match(MOVE_COMPLETE_RE);
  return m ? m[1] : '';
}

// Completion = sentinel present AND Status==target AND entry marker present AND
// BOTH timing rows present (spec §5 + the option-(a) timing-row amendment).
export function isMoveComplete({
  sentinelState,
  statusState,
  entryMarkerPresent,
  exitRowPresent,
  entryRowPresent,
  target,
}) {
  return (
    sentinelState === target &&
    statusState === target &&
    Boolean(entryMarkerPresent) &&
    Boolean(exitRowPresent) &&
    Boolean(entryRowPresent)
  );
}
```

- [ ] **Step 4: Run test to verify it passes.** → PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/lib/move-state/sentinel.mjs scripts/task-tracker/tests/unit/sentinel.test.mjs
git commit -m "[#756] feat(move-state): aitm-move-complete sentinel writer/reader + completion predicate"
```

---

## Task 5: Reorder the atomic core — markers + rows BEFORE Status write

**Files:**

- Modify: `scripts/task-tracker/lib/move-state/move-state-core.mjs`
- Modify: `scripts/task-tracker/lib/move-state/post-commit-tail.mjs:40-51` (`DEFAULT_TAIL_STEPS`)
- Test: `scripts/task-tracker/tests/unit/move-state-core.test.mjs` (extend)

**Interfaces:**

- Consumes: `emitPhasePairRows(ctx)`, `stampEntryMarkers(ctx)` (existing, moved out of the tail), `runStatusWrite(ctx)`.
- Produces: `moveState` now executes `emitPhasePairRows → stampEntryMarkers → runStatusWrite` as the ordered pre-sentinel core; `DEFAULT_TAIL_STEPS` no longer contains those two.

- [ ] **Step 1: Write the failing test** — extend `move-state-core.test.mjs`:

```js
test('atomic core order: rows → markers → status, all before tail', async () => {
  const calls = [];
  const ctx = {
    issueArg: '999',
    stateArg: 'test',
    _runGuardExecution: async () => {
      calls.push('guard');
      return { exit: null };
    },
    _emitPhasePairRows: async () => {
      calls.push('rows');
    },
    _stampEntryMarkers: async () => {
      calls.push('markers');
    },
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: 'IT', exit: null };
    },
    _runPostCommitTail: async () => {
      calls.push('tail');
      return { failures: [] };
    },
    _writeSentinel: async () => {
      calls.push('sentinel');
      return { verified: true };
    },
  };
  const res = await moveState(ctx);
  assert.equal(res.exit, null);
  assert.deepEqual(calls, ['guard', 'rows', 'markers', 'status', 'sentinel', 'tail']);
});
```

> The `sentinel` step is fully implemented in Task 6; here it is a stubbed seam so the ordering assertion is stable. Keep the assertion’s sentinel-before-tail position.

- [ ] **Step 2: Run test to verify it fails.** → FAIL (core still runs guard→status→tail only).

- [ ] **Step 3: Reorder `moveState` and remove the two steps from the tail**

In `move-state-core.mjs`, between guard and status, call rows then markers; after status, call the sentinel writer (Task 6 fills it), then the tail:

```js
const emitPhasePairRows = ctx._emitPhasePairRows || defaultEmitPhasePairRows;
const stampEntryMarkers = ctx._stampEntryMarkers || defaultStampEntryMarkers;
const writeSentinel = ctx._writeSentinel || defaultWriteSentinel; // Task 6

const guard = await runGuardExecution(ctx);
if (guard.exit != null) return { exit: guard.exit, itemId: '', tail: { failures: [] } };

await emitPhasePairRows(ctx); // exit-flush + entry-row (re-read verify: Task 6)
await stampEntryMarkers(ctx); // entry markers      (re-read verify: Task 6)

const writeResult = await runStatusWrite(ctx); // Status LAST authoritative write (#711 verify)
if (writeResult.exit !== null)
  return { exit: writeResult.exit, itemId: writeResult.itemId, tail: { failures: [] } };
ctx.itemId = writeResult.itemId;

const sentinel = await writeSentinel(ctx); // Task 6 — written after Status verified
if (!sentinel.verified)
  return { exit: sentinel.exit ?? 7, itemId: writeResult.itemId, tail: { failures: [] } };

const tail = await runPostCommitTail(ctx);
return { exit: null, itemId: writeResult.itemId, tail };
```

Import `emitPhasePairRows` from `./audit-timing.mjs` and `stampEntryMarkers` from `./github-mutation.mjs` as `defaultEmitPhasePairRows`/`defaultStampEntryMarkers`.

In `post-commit-tail.mjs`, edit `DEFAULT_TAIL_STEPS` to remove `stampEntryMarkers` and `emitPhasePairRows`. New frozen order:

```js
export const DEFAULT_TAIL_STEPS = Object.freeze([
  { name: 'dispatchOnEnterActions', fn: dispatchOnEnterActions },
  { name: 'refreshKanbanStateCache', fn: refreshKanbanStateCache },
  { name: 'emitFullAutoReviewAudit', fn: emitFullAutoReviewAudit },
  { name: 'unparkDoneDependents', fn: unparkDoneDependents },
  { name: 'emitOutOfBandAudit', fn: emitOutOfBandAudit },
  { name: 'syncTrackerState', fn: syncTrackerState },
  { name: 'syncEventFields', fn: syncEventFields },
  { name: 'endTaskTracking', fn: endTaskTracking },
]);
```

- [ ] **Step 4: Run test to verify it passes.** Run: `node --test scripts/task-tracker/tests/unit/move-state-core.test.mjs` → PASS.

- [ ] **Step 5: Run the tail suite to confirm the two removed steps aren't asserted there anymore**

Run: `git ls-files 'scripts/**/*post-commit-tail*.test.mjs' | xargs -n1 node --test`
Expected: PASS after updating any test that asserted the old 10-step `DEFAULT_TAIL_STEPS` to the new 8-step list. Update those assertions in the same commit.

- [ ] **Step 6: Commit**

```bash
git add scripts/task-tracker/lib/move-state/move-state-core.mjs scripts/task-tracker/lib/move-state/post-commit-tail.mjs scripts/task-tracker/tests/unit/move-state-core.test.mjs scripts/task-tracker/tests/unit/post-commit-tail.test.mjs
git commit -m "[#756] refactor(move-state): rows+markers into atomic core, before Status write"
```

---

## Task 6: Sentinel write-last with re-read verify (closes #752 shape)

**Files:**

- Modify: `scripts/task-tracker/lib/move-state/move-state-core.mjs` (`defaultWriteSentinel`)
- Test: `scripts/task-tracker/tests/unit/move-state-sentinel-write.test.mjs`

**Interfaces:**

- Consumes: `writeMoveCompleteMarker`, `readMoveCompleteState` (Task 4); `writeIssueBodyWithRetry` (existing); a body-fetch seam (`ctx.fetchBody`).
- Produces: `async function defaultWriteSentinel(ctx) → { verified: boolean, exit?: number }`. Writes the sentinel via a body update, RE-READS the body, confirms `readMoveCompleteState === target`. Runs AFTER `runStatusWrite` returned `exit:null`, so a failure here means "board moved, completion not yet stamped, re-run to converge" (spec §12).

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultWriteSentinel } from '../lib/move-state/move-state-core.mjs';

function ctxWith(bodyRef) {
  return {
    issueArg: '999',
    stateArg: 'test',
    cfg: { repo: 'o/r' },
    fetchBody: async () => bodyRef.body,
    _writeBody: async ({ body }) => {
      bodyRef.body = body;
    },
  };
}

test('sentinel is written and re-read-verified as target', async () => {
  const bodyRef = { body: 'existing body' };
  const res = await defaultWriteSentinel(ctxWith(bodyRef));
  assert.equal(res.verified, true);
  assert.match(bodyRef.body, /aitm-move-complete state=test/);
});

test('sentinel verify fails closed when re-read does not show target', async () => {
  const bodyRef = { body: 'existing body' };
  const ctx = ctxWith(bodyRef);
  ctx._writeBody = async () => {
    /* dropped write — body unchanged */
  };
  const res = await defaultWriteSentinel(ctx);
  assert.equal(res.verified, false);
  assert.equal(res.exit, 7);
});
```

- [ ] **Step 2: Run test to verify it fails.** → FAIL (`defaultWriteSentinel` not exported).

- [ ] **Step 3: Implement `defaultWriteSentinel`**

```js
import { writeMoveCompleteMarker, readMoveCompleteState } from './sentinel.mjs';

export async function defaultWriteSentinel(ctx) {
  const { issueArg, stateArg, cfg } = ctx;
  const ts = new Date().toISOString();
  const before = await ctx.fetchBody({ issueNumber: issueArg, repo: cfg.repo });
  const next = writeMoveCompleteMarker(before, stateArg, ts);
  const writeBody =
    ctx._writeBody ||
    (async ({ body }) => {
      const { writeIssueBodyWithRetry } = await import('../state-recording.mjs');
      await writeIssueBodyWithRetry({
        issueNumber: issueArg,
        repo: cfg.repo,
        body,
        bodyBefore: before,
        target: stateArg,
      });
    });
  await writeBody({ body: next });
  const after = await ctx.fetchBody({ issueNumber: issueArg, repo: cfg.repo });
  if (readMoveCompleteState(after) === stateArg) return { verified: true };
  process.stderr.write(
    `⛔ #${issueArg} → ${stateArg}: board moved but aitm-move-complete sentinel did NOT ` +
      `confirm on re-read. Move is NOT stamped complete; re-run to converge.\n`
  );
  return { verified: false, exit: 7 };
}
```

- [ ] **Step 4: Run test to verify it passes.** → PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/lib/move-state/move-state-core.mjs scripts/task-tracker/tests/unit/move-state-sentinel-write.test.mjs
git commit -m "[#756] feat(move-state): write aitm-move-complete last with re-read verify"
```

---

## Task 7: Idempotent replay — complete move is a no-op, partial rolls forward

**Files:**

- Modify: `scripts/task-tracker/lib/move-state/move-state-core.mjs` (front-of-`moveState` short-circuit)
- Test: `scripts/task-tracker/tests/unit/move-state-idempotent.test.mjs`

**Interfaces:**

- Consumes: `isMoveComplete` (Task 4); a completion-probe seam `ctx.probeCompletion(ctx) → { sentinelState, statusState, entryMarkerPresent, exitRowPresent, entryRowPresent }`.
- Produces: `moveState` reads completion state FIRST. If `isMoveComplete` is true → return `{ exit: null, alreadyComplete: true }` after running only reconcilable tail gaps. If a partial state is detected (sentinel absent but some elements present) → proceed through the saga (each step idempotent) to converge forward.

- [ ] **Step 1: Write the failing test**

```js
test('re-run of a complete move is a no-op (no rows/markers/status rewrite)', async () => {
  const calls = [];
  const ctx = {
    issueArg: '999',
    stateArg: 'test',
    _runGuardExecution: async () => ({ exit: null }),
    _probeCompletion: async () => ({
      sentinelState: 'test',
      statusState: 'test',
      entryMarkerPresent: true,
      exitRowPresent: true,
      entryRowPresent: true,
    }),
    _emitPhasePairRows: async () => calls.push('rows'),
    _stampEntryMarkers: async () => calls.push('markers'),
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: 'IT', exit: null };
    },
    _writeSentinel: async () => {
      calls.push('sentinel');
      return { verified: true };
    },
    _runPostCommitTail: async () => {
      calls.push('tail');
      return { failures: [] };
    },
  };
  const res = await moveState(ctx);
  assert.equal(res.alreadyComplete, true);
  assert.equal(res.exit, null);
  assert.ok(
    !calls.includes('rows') && !calls.includes('status') && !calls.includes('sentinel'),
    'complete move must not rewrite core elements'
  );
});

test('partial move (sentinel absent) rolls forward through the saga', async () => {
  const calls = [];
  const ctx = {
    issueArg: '999',
    stateArg: 'test',
    _runGuardExecution: async () => ({ exit: null }),
    _probeCompletion: async () => ({
      sentinelState: '',
      statusState: 'test',
      entryMarkerPresent: true,
      exitRowPresent: true,
      entryRowPresent: true,
    }),
    _emitPhasePairRows: async () => calls.push('rows'),
    _stampEntryMarkers: async () => calls.push('markers'),
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: 'IT', exit: null };
    },
    _writeSentinel: async () => {
      calls.push('sentinel');
      return { verified: true };
    },
    _runPostCommitTail: async () => {
      calls.push('tail');
      return { failures: [] };
    },
  };
  const res = await moveState(ctx);
  assert.equal(res.alreadyComplete, undefined);
  assert.ok(calls.includes('sentinel'), 'partial move converges to sentinel write');
});
```

- [ ] **Step 2: Run test to verify it fails.** → FAIL (no short-circuit yet).

- [ ] **Step 3: Add the completion probe short-circuit at the top of `moveState`**

```js
import { isMoveComplete } from './sentinel.mjs';
// after guard passes, before emitPhasePairRows:
const probeCompletion = ctx._probeCompletion || defaultProbeCompletion; // reads GitHub state
const state = await probeCompletion(ctx);
if (isMoveComplete({ ...state, target: ctx.stateArg })) {
  const tail = await runPostCommitTail(ctx); // reconcile-only; every step idempotent (#753)
  return { exit: null, itemId: '', alreadyComplete: true, tail };
}
// else fall through: each saga step is individually idempotent, so a partial
// move converges forward (rows/markers/status/sentinel re-assert to target).
```

`defaultProbeCompletion` fetches the body + live Status + timing rows once and maps them to the predicate inputs (reuse `resolveLiveStateName`, `readMoveCompleteState`, `getStageVisitCount`, and the timing-row reader from `audit-timing.mjs`).

- [ ] **Step 4: Run test to verify it passes.** → PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/lib/move-state/move-state-core.mjs scripts/task-tracker/tests/unit/move-state-idempotent.test.mjs
git commit -m "[#756] feat(move-state): idempotent replay — complete=no-op, partial rolls forward"
```

---

## Task 8: Close-path converge reconciles lifecycle DoD boxes (closes #753)

**Files:**

- Modify: `scripts/task-tracker/verbs/close.mjs` (the `noop`/converge fast-path)
- Test: `scripts/task-tracker/tests/unit/close-reconcile-lifecycle.test.mjs`

**Interfaces:**

- Consumes: the idempotent short-circuit from Task 7 (`alreadyComplete`); the existing lifecycle-box ensure helper (`ensureChecked` / DoD lifecycle stamp used by close).
- Produces: when close takes the idempotent no-op path on an already-`done` issue, it STILL runs the lifecycle-box reconcile (re-tick any unchecked `### Lifecycle` DoD boxes) rather than short-circuiting before it.

- [ ] **Step 1: Write the failing test**

```js
test('close on already-done issue re-ticks strayed lifecycle DoD boxes', async () => {
  let reconciled = false;
  const deps = {
    getLiveState: async () => 'done',
    moveState: async () => ({ exit: null, alreadyComplete: true, tail: { failures: [] } }),
    reconcileLifecycleBoxes: async () => {
      reconciled = true;
    },
    // ...other close deps stubbed to reach the converge path
  };
  await runClose({ issueNumber: 999, cfg: { repo: 'o/r' }, deps });
  assert.equal(reconciled, true, 'converge path must reconcile lifecycle boxes (#753)');
});
```

> Match the real `runClose` dependency seam at implementation time; the invariant is that the converge/no-op path calls the lifecycle-box reconcile.

- [ ] **Step 2: Run test to verify it fails.** → FAIL (fast-path returns before reconcile).

- [ ] **Step 3: Move the lifecycle-box reconcile so it runs on the converge path too**

In `close.mjs`, ensure the `ensureChecked` lifecycle reconcile is invoked whenever the move resolves as `alreadyComplete` (idempotent no-op) — not only on a fresh transition. This closes #753: a close that bailed pre-ticker and thereafter took the noop path now re-ticks the DoD lifecycle boxes on every re-run.

- [ ] **Step 4: Run test to verify it passes.** → PASS.

- [ ] **Step 5: Run the close suite.** Run: `git ls-files 'scripts/**/*close*.test.mjs' | xargs -n1 node --test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/task-tracker/verbs/close.mjs scripts/task-tracker/tests/unit/close-reconcile-lifecycle.test.mjs
git commit -m "[#753] fix(close): reconcile lifecycle DoD boxes on idempotent converge path"
```

---

## Task 9: Success readout formatter (spec §9)

**Files:**

- Create: `scripts/task-tracker/lib/move-state/readout.mjs`
- Test: `scripts/task-tracker/tests/unit/readout.test.mjs`

**Interfaces:**

- Produces:
  - `formatMoveSuccess({ issue, from, to, verified, tail }) → string` — the §9 success block.
  - `formatMoveFailure({ issue, from, to, failedElement, afterStatusWrite, sentinelPresent, recommendation }) → string` — the §9 failure block with routing.

- [ ] **Step 1: Write the failing test**

```js
import { formatMoveSuccess, formatMoveFailure } from '../lib/move-state/readout.mjs';

test('success readout asserts each element verified + sentinel-written-last', () => {
  const out = formatMoveSuccess({
    issue: 42,
    from: 'develop',
    to: 'test',
    verified: { exitFlush: true, entryStamp: true, entryRow: true, status: true },
    tail: { ok: 8, total: 8, deferred: [] },
  });
  assert.match(out, /move #42 develop→test complete/);
  assert.match(out, /status\s*:.*verified/);
  assert.match(out, /sentinel\s*:.*written last/);
  assert.match(out, /tail\s*:\s*8\/8/);
});

test('failure readout routes by sentinel presence', () => {
  const absent = formatMoveFailure({
    issue: 42,
    from: 'develop',
    to: 'test',
    failedElement: 'status',
    afterStatusWrite: false,
    sentinelPresent: false,
    recommendation: 're-run',
  });
  assert.match(absent, /before the Status write/);
  assert.match(absent, /safe to re-run/i);
  const present = formatMoveFailure({
    issue: 42,
    from: 'develop',
    to: 'test',
    failedElement: 'tail',
    afterStatusWrite: true,
    sentinelPresent: true,
    recommendation: 'reconcile',
  });
  assert.match(present, /move is (actually )?complete/i);
});
```

- [ ] **Step 2: Run test to verify it fails.** → FAIL (module missing).

- [ ] **Step 3: Implement the two formatters** as pure string builders matching the §9 layout (element-per-line success block; failure block naming the failed element, before/after-Status position, sentinel presence, and the one-line recommendation: file a bug / re-run / demote to fix code).

- [ ] **Step 4: Run test to verify it passes.** → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/lib/move-state/readout.mjs scripts/task-tracker/tests/unit/readout.test.mjs
git commit -m "[#757] feat(move-state): §9 success + failure readout formatters"
```

---

## Task 10: Wire readout into `promote`/`demote` output

**Files:**

- Modify: `scripts/task-tracker/verbs/promote.mjs`, `scripts/task-tracker/verbs/demote.mjs`
- Modify: `scripts/task-tracker/lib/move-state/move-state-core.mjs` (return the verified-element map + tail summary for the readout)
- Test: `scripts/task-tracker/tests/unit/promote-readout.test.mjs`

- [ ] **Step 1: Write the failing test** — assert that a successful `runPromote` emits (via a `deps.print` seam) the §9 success readout containing `move #N ...→... complete` and the `sentinel : ... written last` line; a failure emits the failure block.

- [ ] **Step 2: Run to verify it fails.** → FAIL.

- [ ] **Step 3: Thread the readout** — have `moveState` include in its result the `verified` element map + `tail` summary; `promote`/`demote` call `formatMoveSuccess`/`formatMoveFailure` and print. Keep the existing `✓ Issue #N moved to: <state>` line from `runStatusWrite` OR replace it with the richer readout (decide at Task 10; if replaced, update `runStatusWrite`'s `console.log` and its tests).

- [ ] **Step 4: Run to verify it passes.** → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/verbs/promote.mjs scripts/task-tracker/verbs/demote.mjs scripts/task-tracker/lib/move-state/move-state-core.mjs scripts/task-tracker/tests/unit/promote-readout.test.mjs
git commit -m "[#757] feat(promote/demote): emit §9 move readout"
```

---

## Task 11: Move auditor `verifyMoveInvariants` (pure decision)

**Files:**

- Create: `scripts/task-tracker/lib/move-state/verify-move-invariants.mjs`
- Test: `scripts/task-tracker/tests/unit/verify-move-invariants.test.mjs`

**Interfaces:**

- Consumes: `readMoveCompleteState`, `getStageVisitCount`/entry-marker reader, live Status reader.
- Produces: `verifyMoveInvariants({ body, statusState, lastKnownState }) → { ok: boolean, kind: 'consistent'|'out-of-band'|'incomplete', detail: string }`. `out-of-band` = Status changed but no matching sentinel (and Status != lastKnownState); `incomplete` = sentinel absent but markers/rows partial; `consistent` = sentinel ⟺ Status ⟺ markers.

- [ ] **Step 1: Write the failing test**

```js
import { verifyMoveInvariants } from '../lib/move-state/verify-move-invariants.mjs';

test('consistent when sentinel matches Status', () => {
  const body = 'x\n<!-- aitm-entered-test: t -->\n<!-- aitm-move-complete state=test ts=t -->';
  const r = verifyMoveInvariants({ body, statusState: 'test', lastKnownState: 'test' });
  assert.equal(r.kind, 'consistent');
  assert.equal(r.ok, true);
});

test('out-of-band when Status advanced with no matching sentinel', () => {
  const body = 'x\n<!-- aitm-move-complete state=develop ts=t -->';
  const r = verifyMoveInvariants({ body, statusState: 'review', lastKnownState: 'develop' });
  assert.equal(r.kind, 'out-of-band');
  assert.equal(r.ok, false);
  assert.match(r.detail, /review/);
});
```

- [ ] **Step 2: Run to verify it fails.** → FAIL.

- [ ] **Step 3: Implement `verifyMoveInvariants`** as a pure function comparing `readMoveCompleteState(body)` against `statusState`, classifying `consistent`/`out-of-band`/`incomplete` per spec §12.

- [ ] **Step 4: Run to verify it passes.** → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/lib/move-state/verify-move-invariants.mjs scripts/task-tracker/tests/unit/verify-move-invariants.test.mjs
git commit -m "[#758] feat(auditor): verifyMoveInvariants pure decision (sentinel⟺Status⟺markers)"
```

---

## Task 12: Auditor reconcile action (optional heal)

**Files:**

- Modify: `scripts/task-tracker/lib/move-state/verify-move-invariants.mjs`
- Test: `scripts/task-tracker/tests/unit/verify-move-invariants-reconcile.test.mjs`

**Interfaces:**

- Produces: `async function reconcileMoveInvariants(finding, { deps }) → { action: 'none'|'reported'|'reconciled', detail }`. For `out-of-band`, posts an audit comment (via `deps.postComment`) recording the bypass; optionally converges by re-running the saga forward or reverting Status (report-only in v1 — reconcile is behind an explicit flag).

- [ ] **Step 1: Write the failing test** — `out-of-band` finding with `reconcile:false` → `{ action: 'reported' }` and `deps.postComment` called once with a body containing the out-of-band Status; `consistent` finding → `{ action: 'none' }`, no comment.

- [ ] **Step 2: Run to verify it fails.** → FAIL.

- [ ] **Step 3: Implement `reconcileMoveInvariants`** — report-only default; comment body names the out-of-band Status and the recovery command. Never throws (degrade to stderr), mirroring `postStampFailureAudit`.

- [ ] **Step 4: Run to verify it passes.** → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/task-tracker/lib/move-state/verify-move-invariants.mjs scripts/task-tracker/tests/unit/verify-move-invariants-reconcile.test.mjs
git commit -m "[#758] feat(auditor): report/reconcile out-of-band Status transitions"
```

---

## Task 13: Wire the auditor into `bind` and `pull-next`

**Files:**

- Modify: `scripts/task-tracker/verbs/pull-next.mjs`
- Modify: the bind handler (the runtime path behind `/task #N`; confirm exact file at Task 0)
- Test: `scripts/task-tracker/tests/unit/bind-auditor.test.mjs`, `scripts/task-tracker/tests/unit/pull-next-auditor.test.mjs`

**Interfaces:**

- Consumes: `verifyMoveInvariants`, `reconcileMoveInvariants` (Tasks 11–12).
- Produces: on `bind`/`pull-next`, after resolving the issue's live Status + body, call `verifyMoveInvariants`; if `!ok`, surface the finding (stderr banner) and call `reconcileMoveInvariants` (report-only). Never block bind/pull-next on a finding — it reports, it does not wall.

- [ ] **Step 1: Write the failing tests** — stub the issue read so Status advanced with no sentinel; assert bind/pull-next emit the out-of-band banner and call the reporter, and STILL complete their primary action (bind registers the task; pull-next returns the selection).

- [ ] **Step 2: Run to verify they fail.** → FAIL.

- [ ] **Step 3: Add the auditor call** at the post-read hook point found in Task 0 for each verb. Guard behind a `SKIP_NETWORK` / test seam so unit tests stay offline.

- [ ] **Step 4: Run to verify they pass.** → PASS.

- [ ] **Step 5: Run bind + pull-next suites.** Run: `git ls-files 'scripts/**/*bind*.test.mjs' 'scripts/**/*pull-next*.test.mjs' | xargs -n1 node --test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/task-tracker/verbs/pull-next.mjs scripts/task-tracker/verbs/<bind-handler>.mjs scripts/task-tracker/tests/unit/bind-auditor.test.mjs scripts/task-tracker/tests/unit/pull-next-auditor.test.mjs
git commit -m "[#758] feat(auditor): run verifyMoveInvariants on bind + pull-next"
```

---

## Task 14: Regression coverage for #741 / #752 / #753 (closes #759)

**Files:**

- Create: `scripts/task-tracker/tests/unit/regression-atomic-move.test.mjs`
- Test: itself

**Interfaces:**

- Consumes: `moveState` with injected failure points; `verifyMoveInvariants`.

- [ ] **Step 1: Write the regression tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveState } from '../lib/move-state/move-state-core.mjs';
import { verifyMoveInvariants } from '../lib/move-state/verify-move-invariants.mjs';

// #741 — marker cannot outrun the board: markers/rows write BEFORE Status, and
// Status write fails closed → the move does NOT report success, and on re-read
// the sentinel is absent (auditor would flag, not a silent split-brain).
test('#741 marker cannot outrun the board', async () => {
  const calls = [];
  const ctx = {
    issueArg: '1',
    stateArg: 'test',
    _runGuardExecution: async () => ({ exit: null }),
    _probeCompletion: async () => ({
      sentinelState: '',
      statusState: 'develop',
      entryMarkerPresent: false,
      exitRowPresent: false,
      entryRowPresent: false,
    }),
    _emitPhasePairRows: async () => calls.push('rows'),
    _stampEntryMarkers: async () => calls.push('markers'),
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: '', exit: 7 };
    }, // fail closed
    _writeSentinel: async () => {
      calls.push('sentinel');
      return { verified: true };
    },
    _runPostCommitTail: async () => calls.push('tail'),
  };
  const res = await moveState(ctx);
  assert.equal(res.exit, 7, 'status failure fails the move');
  assert.ok(!calls.includes('sentinel'), 'no sentinel on failed Status → no false-complete');
});

// #752 — killed tail after board committed + sentinel written ⇒ still complete.
test('#752 killed tail does not un-report a complete move', async () => {
  const ctx = {
    issueArg: '2',
    stateArg: 'test',
    _runGuardExecution: async () => ({ exit: null }),
    _probeCompletion: async () => ({
      sentinelState: '',
      statusState: 'develop',
      entryMarkerPresent: false,
      exitRowPresent: false,
      entryRowPresent: false,
    }),
    _emitPhasePairRows: async () => {},
    _stampEntryMarkers: async () => {},
    _runStatusWrite: async () => ({ itemId: 'IT', exit: null }),
    _writeSentinel: async () => ({ verified: true }),
    _runPostCommitTail: async () => {
      throw new Error('SIGKILL-shaped tail death');
    },
  };
  // runPostCommitTail's #714 isolation catches the throw; move stays complete.
  const res = await moveState(ctx);
  assert.equal(res.exit, null, 'tail death never fails-reports a committed move');
});

// #753 — re-run of a complete move reconciles tail-owned artifacts only.
test('#753 complete move re-run is a reconcile no-op', async () => {
  const calls = [];
  const ctx = {
    issueArg: '3',
    stateArg: 'done',
    _runGuardExecution: async () => ({ exit: null }),
    _probeCompletion: async () => ({
      sentinelState: 'done',
      statusState: 'done',
      entryMarkerPresent: true,
      exitRowPresent: true,
      entryRowPresent: true,
    }),
    _emitPhasePairRows: async () => calls.push('rows'),
    _stampEntryMarkers: async () => calls.push('markers'),
    _runStatusWrite: async () => {
      calls.push('status');
      return { itemId: 'IT', exit: null };
    },
    _writeSentinel: async () => {
      calls.push('sentinel');
      return { verified: true };
    },
    _runPostCommitTail: async () => calls.push('tail'),
  };
  const res = await moveState(ctx);
  assert.equal(res.alreadyComplete, true);
  assert.deepEqual(calls, ['tail'], 'only reconcilable tail runs; core is untouched');
});

// Auditor: a legitimate saga move is not flagged; an out-of-band one is.
test('auditor: saga move consistent, bypass flagged', () => {
  const good = verifyMoveInvariants({
    body: '<!-- aitm-move-complete state=test ts=t -->',
    statusState: 'test',
    lastKnownState: 'test',
  });
  assert.equal(good.ok, true);
  const bad = verifyMoveInvariants({
    body: '<!-- aitm-move-complete state=develop ts=t -->',
    statusState: 'review',
    lastKnownState: 'develop',
  });
  assert.equal(bad.ok, false);
});
```

- [ ] **Step 2: Run the regression suite.** Run: `node --test scripts/task-tracker/tests/unit/regression-atomic-move.test.mjs`
      Expected: PASS (4/4). If any fails, fix the corresponding production module (Tasks 5–12), not the test.

- [ ] **Step 3: Run the full move-state + verb test set** to confirm the whole epic is green together:

Run: `git ls-files 'scripts/**/*move-state*.test.mjs' 'scripts/**/*promote*.test.mjs' 'scripts/**/*demote*.test.mjs' 'scripts/**/*close*.test.mjs' 'scripts/**/*sentinel*.test.mjs' 'scripts/**/*verify-move*.test.mjs' 'scripts/**/*auditor*.test.mjs' | sort -u | xargs -n1 node --test`
Expected: PASS across the board.

- [ ] **Step 4: Commit**

```bash
git add scripts/task-tracker/tests/unit/regression-atomic-move.test.mjs
git commit -m "[#759] test(move-state): regression coverage for #741/#752/#753 atomic-move classes"
```

---

## Self-Review

**Spec coverage:**

- §4 Roll-Forward Saga → Tasks 5, 7 (reorder + idempotent replay).
- §5 sentinel + completion predicate (+ option-(a) timing rows) → Task 4.
- §6 consolidation into single entry point → Tasks 1–3.
- §7 atomic core vs best-effort tail (tail begins after sentinel) → Tasks 5, 6.
- §8 enforcement audit trail (sentinel tripwire) → Tasks 11–13.
- §9 output contract → Tasks 9–10.
- §10 components (`moveState`, verbs, sentinel writer/reader, `verify-move-invariants`, tail) → Tasks 1–13.
- §11 data flow → Task 5 ordering test.
- §12 error handling (pre-Status / post-Status-pre-sentinel / tail / out-of-band) → Tasks 6, 7, 11, 14.
- §13 testing (unit/guard/auditor/regression/behavioral) → Tasks 1–14.
- §14 relationship: supersedes #747, closes #741/#752/#753, extends #361 auditor tier → Tasks 8, 11, 14.
- §15 deferred (GitHub Action mirror, credential isolation) → out of scope, not tasked (correct).

**Placeholder scan:** Every code step carries real code or a named seam. Tasks 2, 3, 8, 10, 13 flag that exact dependency-seam names must be confirmed against the live verb files at implementation time (Task 0 does this) — the invariant each asserts is concrete.

**Type consistency:** `moveState(ctx) → { exit, itemId, tail, alreadyComplete? }` is stable across Tasks 1, 5, 6, 7, 10, 14. `writeMoveCompleteMarker`/`readMoveCompleteState`/`isMoveComplete` names match across Tasks 4, 6, 7, 11. `verifyMoveInvariants` return `{ ok, kind, detail }` matches across Tasks 11, 13, 14.

## Open items to resolve during Refine/Plan on the epic

1. **Exact test directory** — co-located vs `scripts/task-tracker/tests/unit/` (Task 0, Step 1).
2. **Whether `runStatusWrite`'s `✓ Issue #N moved to:` line is replaced by the §9 readout** (Task 10, Step 3) or kept alongside it.
3. **Bind handler file** — confirm the runtime module behind `/task #N` where the auditor call slots in (Task 0, Step 3).
4. **`assembleMoveCtx` extraction boundary** — how much of `move-state.mjs:259-283` moves into `move-state-core.mjs` vs stays host-only (Task 2, Step 3).
