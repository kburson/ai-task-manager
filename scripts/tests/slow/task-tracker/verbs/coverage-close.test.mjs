#!/usr/bin/env node
// @story #613
// Coverage for verbs/close.mjs. Drives the real `verbClose` against a FLAT ctx
// of injected fakes + a real temp state file, trapping process.exit so guard
// exits are observable. `tickLifecycleOnClose` is hit directly via its
// deps.mutateIssueBody seam. The gate block's interior needs the session
// review-gate ON (disabled here), so its write throws and is caught — covered
// as the fail-closed / force-continue branches, not its happy interior.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import '../../../fixtures/offline-gh-auto.mjs';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  assertFieldsPersisted,
  verbClose,
  tickLifecycleOnClose,
} from '../../../../task-tracker/verbs/close.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

// Review-approval marker + populated aitm-fields (engagedTime non-null) so
// assertFieldsPersisted passes and shouldEmitReviewApprovedRow is true.
const APPROVED_BODY =
  '## Done\n\n<!-- aitm-review-approved ts="2026-06-28T00:00:00Z" full-auto="yes" -->\n<!-- aitm-fields: {"engagedTime":3600,"size":"M","estimate":3} -->\n';
const FORECAST_ID = '01J00000000000000000000005';
const READY_BODY = [
  APPROVED_BODY,
  `<!-- aitm-plan-approved ts="2026-06-28T00:00:00Z" forecast-record-id="${FORECAST_ID}" -->`,
  `<!-- aitm-estimation-forecast-ready record-id="${FORECAST_ID}" -->`,
  '',
].join('\n');

const baseState = (active = '#5') => ({
  active,
  lastActive: active,
  entryStartTs: new Date(Date.now() - 60_000).toISOString(),
  wordsAtEntryStart: 0,
  lastWordMarker: 0,
});

function tmpState(state) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-613-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state));
  return { statePath, dir };
}

function makeDirtyRepo() {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-613-dirty-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  writeFileSync(join(dir, 'dirty.txt'), 'uncommitted\n'); // untracked → dirty
  return dir;
}

function makeCtx(statePath, dir, over = {}) {
  const ctx = {
    cfg: { repo: 'o/r', lifecycleCheckboxesRequired: false },
    statePath,
    projectDir: dir,
    rest: ['#5'],
    SKIP_NETWORK: true,
    closeBody: '',
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    drainQueueIfAny: async () => {},
    flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    safePostTiming: async () => {},
    runMoveState: async () => ({ ok: true, benign: false }),
    runMoveStateDone: async () => ({ ok: true, benign: false }),
    writeTerminalDisposition: async () => ({ disposition: 'Delivered' }),
    readTerminalDisposition: async () => null,
    readCloseLabels: async () => [],
    inspectTerminalIssueBindingRelease: async () => ({ status: 'pending' }),
    resumeTerminalIssueBindingRelease: async () => ({ status: 'released' }),
    runLogIssueTime: async () => {},
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => 'review',
    getIssueClosedState: async () => false,
    uncheckedPreCloseCheckboxes: () => [],
    nowIso: () => new Date().toISOString(),
    // Keep this broad close-coverage harness on its injected timing boundary.
    // The real approval reconciler is covered by approve-timing-boundary and
    // requires a populated Review timing log that these legacy fixtures omit.
    reconcileReviewApprovedTiming: async () => ({ status: 'present' }),
    applyReviewDelta: async () => ({ status: 'skipped-test' }),
    assertFieldsPersisted: async () => {},
    tickLifecycleOnClose: async () => ({ ok: true }),
    loadCloseDeliveryBody: async () => APPROVED_BODY,
    locateAuthoritySource: () => ({ kind: 'legacy-body/v1' }),
    loadCloseDeliveryGateInput: async () => ({
      issueNumber: 5,
      lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
      branch: 'feature/5',
      acceptedSha: 'a'.repeat(40),
      localHeadSha: 'a'.repeat(40),
      pullRequests: [],
      records: null,
    }),
    resolveReviewAuthorization: () => ({ mode: 'human', standing: true, source: 'test' }),
    // Receipt enforcement has dedicated #1381 coverage. This broad legacy close
    // harness models the explicit no-PR local lane so unrelated close branches
    // remain observable without manufacturing delivery evidence.
    requireDeliveryReceipt: () => ({ skipped: true, receipt: null }),
    ...over,
  };
  if (!ctx.issueBodyMutator) {
    let currentBody = ctx.closeBody || APPROVED_BODY;
    ctx.issueBodyMutator = {
      mutate: async (args) => {
        currentBody = args.mutate(currentBody);
        ctx.closeBody = currentBody;
        return { status: 'ok', body: currentBody };
      },
    };
  }
  return ctx;
}

// Drive verbClose with managed state/env/cleanup; trap process.exit + capture
// console. Dirty tests need the check ON (env unset); others skip it so the
// real (possibly dirty) worktree never trips the guard.
async function run({ state = baseState(), over = {}, ci, dirty = false } = {}) {
  const prevSkip = process.env.TT_SKIP_DIRTY_CHECK;
  const prevCI = process.env.CI;
  const prevProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  const setEnv = (k, v) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  setEnv('TT_SKIP_DIRTY_CHECK', dirty ? undefined : '1');
  setEnv('CI', ci);
  const { statePath, dir } = tmpState(state);
  setEnv('AI_TASK_MANAGER_PROJECT_DIR', dir);
  const ctx = makeCtx(statePath, dir, over);
  let repo;
  if (dirty) ctx.projectDir = repo = makeDirtyRepo();
  const real = { exit: process.exit, log: console.log, err: console.error, warn: console.warn };
  let exitCode = null;
  const stdout = [];
  const stderr = [];
  process.exit = (code) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}__`);
  };
  console.log = (...a) => stdout.push(a.join(' '));
  console.error = console.warn = (...a) => stderr.push(a.join(' '));
  let thrown = null;
  let finalState = null;
  try {
    await verbClose(ctx);
  } catch (err) {
    if (!/__exit_\d+__/.test(err.message)) thrown = err;
  } finally {
    finalState = JSON.parse(readFileSync(statePath, 'utf8'));
    process.exit = real.exit;
    console.log = real.log;
    console.error = real.err;
    console.warn = real.warn;
    rmSync(dir, { recursive: true, force: true });
    if (repo) rmSync(repo, { recursive: true, force: true });
    setEnv('TT_SKIP_DIRTY_CHECK', prevSkip);
    setEnv('CI', prevCI);
    setEnv('AI_TASK_MANAGER_PROJECT_DIR', prevProjectDir);
  }
  return {
    exitCode,
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
    thrown,
    finalState,
  };
}

const exitOf = (r) => r.exitCode ?? process.exitCode;
const resetExit = () => (process.exitCode = 0);

// --json body view (closeBody) + --jq re-read (assertFieldsPersisted),
// independently controllable; the --json view always yields APPROVED_BODY so
// the gate block throws → caught under --force.
function forceFieldsPexec({ jqBody, jqThrows }) {
  return async (cmd, args) => {
    const a = args.join(' ');
    if (cmd === 'gh' && a.includes('issue view') && a.includes('--jq')) {
      if (jqThrows) throw new Error('gh view jq boom');
      return { stdout: jqBody, stderr: '' };
    }
    if (cmd === 'gh' && a.includes('issue view'))
      return { stdout: JSON.stringify({ body: APPROVED_BODY }), stderr: '' };
    return { stdout: '', stderr: '' };
  };
}
const forceFieldsOver = (opts) => ({
  SKIP_NETWORK: false,
  rest: ['#5', '--force'],
  getIssueClosedState: async () => false,
  getIssueBoardState: async () => 'review',
  fetchSubIssues: async () => [],
  pexec: forceFieldsPexec(opts),
  assertFieldsPersisted,
});

// --- Early returns ---
test('no active task', async () => {
  const r = await run({ state: { active: null }, over: { rest: [] } });
  assert.match(r.stdout, /no active task/);
});
test('discover bucket → discarded', async () => {
  const r = await run({ state: { active: 'discover' }, over: { rest: [] } });
  assert.match(r.stdout, /Discarded discovery bucket/);
});
test('target adopted into empty state → Closed', async () => {
  const r = await run({
    state: { active: null },
    over: { rest: ['#7'], closeBody: APPROVED_BODY },
  });
  assert.ifError(r.thrown);
  assert.match(r.stdout, /Closed #7/);
});

// --- Convergence (#425): SKIP_NETWORK:false, returns before the gate block ---
test('convergence close-issue: board Done + issue OPEN → gh close', async () => {
  const calls = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      getIssueBoardState: async () => 'done',
      estimationOutcomeWriter: {
        ensure: async () => {
          calls.push('outcome 5');
          return { status: 'written' };
        },
      },
      writeTerminalDisposition: async ({ issueNumber, disposition }) => {
        calls.push(`disposition ${issueNumber} ${disposition}`);
      },
      pexec: async (cmd, args) => {
        calls.push(`${cmd} ${args.join(' ')}`);
        if (cmd === 'gh' && args.join(' ').includes('issue view')) {
          return { stdout: JSON.stringify({ body: READY_BODY }), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    },
  });
  assert.ifError(r.thrown);
  assert.match(r.stdout, /Closed #5/);
  const dispositionIndex = calls.indexOf('disposition 5 Delivered');
  const outcomeIndex = calls.indexOf('outcome 5');
  const closeIndex = calls.findIndex((c) => c.includes('issue close 5'));
  assert.ok(dispositionIndex >= 0, `expected Delivered write; got ${JSON.stringify(calls)}`);
  assert.ok(
    outcomeIndex >= 0 && dispositionIndex > outcomeIndex && closeIndex > dispositionIndex,
    `expected outcome, Delivered write, then close; got ${JSON.stringify(calls)}`
  );
});
test('convergence close-issue: outcome failure leaves the issue OPEN and active', async () => {
  resetExit();
  const calls = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      getIssueBoardState: async () => 'done',
      estimationOutcomeWriter: {
        ensure: async () => {
          calls.push('outcome 5');
          throw new Error('outcome unavailable');
        },
      },
      writeTerminalDisposition: async () => calls.push('disposition'),
      pexec: async (cmd, args) => {
        calls.push(`${cmd} ${args.join(' ')}`);
        if (cmd === 'gh' && args.join(' ').includes('issue view')) {
          return { stdout: JSON.stringify({ body: READY_BODY }), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    },
  });
  assert.equal(exitOf(r), 1);
  assert.equal(r.finalState.active, '#5');
  assert.ok(calls.includes('outcome 5'));
  assert.ok(!calls.includes('disposition'));
  assert.ok(!calls.some((call) => call.includes('issue close 5')));
  assert.match(r.stderr, /outcome unavailable/);
  resetExit();
});
test('convergence close-issue: disposition failure leaves issue OPEN and active', async () => {
  resetExit();
  const calls = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      getIssueBoardState: async () => 'done',
      writeTerminalDisposition: async () => {
        throw new Error('Disposition field missing');
      },
      pexec: async (cmd, args) => (
        calls.push(`${cmd} ${args.join(' ')}`),
        { stdout: '', stderr: '' }
      ),
    },
  });
  assert.equal(exitOf(r), 1);
  assert.equal(r.finalState.active, '#5');
  assert.ok(!calls.some((c) => c.includes('issue close 5')));
  assert.match(r.stderr, /Disposition field missing/);
  resetExit();
});
test('convergence close-issue: gh close fails → exit 1', async () => {
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      getIssueBoardState: async () => 'done',
      pexec: async () => {
        throw new Error('gh boom');
      },
    },
  });
  assert.equal(exitOf(r), 1);
  assert.match(r.stderr, /Failed to close .* on GitHub/);
  resetExit();
});
test('convergence noop + boardDrift: issue CLOSED, board behind → converge', async () => {
  let moved = false;
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      getIssueBoardState: async () => 'develop',
      getIssueClosedState: async () => true,
      runMoveStateDone: async () => ((moved = true), { ok: true, benign: false }),
    },
  });
  assert.ok(moved);
  assert.match(r.stdout, /converged the board to Done/);
});
test('convergence noop + boardDrift: move fails + board not Done → exit 1', async () => {
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      getIssueClosedState: async () => true,
      getIssueBoardState: async () => 'develop',
      runMoveStateDone: async () => ({ ok: false, benign: false, stderr: 'nope' }),
    },
  });
  assert.equal(exitOf(r), 1);
  assert.match(r.stderr, /board move to Done failed/);
  resetExit();
});
test('convergence noop, no drift: issue CLOSED + board Done → already closed', async () => {
  const calls = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      getIssueBoardState: async () => 'done',
      getIssueClosedState: async () => true,
      estimationOutcomeWriter: {
        ensure: async () => {
          calls.push('outcome 5');
          return { status: 'existing' };
        },
      },
      pexec: async (cmd, args) => {
        if (cmd === 'gh' && args.join(' ').includes('issue view')) {
          return { stdout: JSON.stringify({ body: READY_BODY }), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
      writeTerminalDisposition: async () => {
        throw new Error('already-closed noop must not infer Delivered');
      },
    },
  });
  assert.deepEqual(calls, ['outcome 5']);
  assert.match(r.stdout, /already fully closed/);
});

// --- SKIP_NETWORK tail: emission + final move ---
test('happy tail: approval marker present → emitted, Closed', async () => {
  const rows = [];
  const r = await run({
    over: { closeBody: APPROVED_BODY, safePostTiming: async (_t, row) => rows.push(String(row)) },
  });
  assert.match(r.stdout, /Closed #5/);
  assert.ok(rows.length >= 2);
});
test('happy tail: no approval marker → review:approved suppressed', async () => {
  const rows = [];
  const r = await run({
    over: {
      closeBody: '## Done\n\nno marker here\n',
      safePostTiming: async (_t, row) => rows.push(String(row)),
    },
  });
  assert.match(r.stdout, /Closed #5/);
  assert.equal(rows.filter((row) => /review:approved/.test(row)).length, 0);
});
test('happy-tail candidate refuses close when terminal timing is only queued', async () => {
  const r = await run({
    over: {
      closeBody: APPROVED_BODY,
      safePostTiming: async () => ({ ok: false, queued: true, err: 'network down' }),
    },
  });
  assert.doesNotMatch(r.stdout, /Closed #5/);
  assert.match(r.stderr, /terminal timing .* was not durably posted/);
  assert.equal(exitOf(r), 1);
  resetExit();
});
test('final move non-benign failure + board not Done → exit 1', async () => {
  const r = await run({
    over: {
      closeBody: APPROVED_BODY,
      runMoveStateDone: async () => ({ ok: false, benign: false, stderr: 'move failed' }),
      getIssueBoardState: async () => 'develop',
    },
  });
  assert.equal(exitOf(r), 1);
  assert.match(r.stderr, /Refusing offline close #5: move failed/);
  resetExit();
});
test('offline final move cannot verify board Done → refuses non-benign failure', async () => {
  const r = await run({
    over: {
      closeBody: APPROVED_BODY,
      runMoveStateDone: async () => ({ ok: false, benign: false, stderr: 'race' }),
      getIssueBoardState: async () => 'done',
    },
  });
  assert.equal(exitOf(r), 1);
  assert.match(r.stderr, /Refusing offline close #5: race/);
  resetExit();
});

// --- Dirty-workspace block: real dirty git repo, TT_SKIP_DIRTY_CHECK unset ---
test('dirty + CI headless, no --answer → exit 5', async () => {
  const r = await run({ dirty: true, ci: '1' });
  assert.equal(r.exitCode, 5);
  assert.match(r.stderr, /running headless/);
});
test('dirty + --answer cancel → left in Review', async () => {
  const r = await run({ dirty: true, over: { rest: ['#5', '--answer', 'cancel'] } });
  assert.match(r.stdout, /Cancelled close/);
});
test('dirty + --answer yes → refuse, exit 6', async () => {
  const r = await run({ dirty: true, over: { rest: ['#5', '--answer', 'yes'] } });
  assert.equal(r.exitCode, 6);
});
test('dirty + invalid --answer → exit 1', async () => {
  const r = await run({ dirty: true, over: { rest: ['#5', '--answer', 'maybe'] } });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /Invalid --answer/);
});
test('dirty + interactive (no CI, no answer) → PROMPT_REQUIRED', async () => {
  const r = await run({ dirty: true, ci: undefined });
  assert.match(r.stdout, /PROMPT_REQUIRED: dirty-close-confirm #5/);
});
test('dirty + --answer no → audit row, continues to Closed', async () => {
  const rows = [];
  const r = await run({
    dirty: true,
    over: {
      rest: ['#5', '--answer', 'no'],
      closeBody: APPROVED_BODY,
      safePostTiming: async (_t, row) => rows.push(String(row)),
    },
  });
  assert.match(r.stdout, /Closed #5/);
  assert.ok(rows.some((row) => /closed-with-dirty-tree/.test(row)));
});

// --- Gate-eval block (#510): bypass-marker write throws (gate disabled here) ---
test('gate-eval failure, no --force → fail-closed exit 3', async () => {
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      getIssueBoardState: async () => 'review',
      pexec: async (cmd, args) =>
        cmd === 'gh' && args.join(' ').includes('issue view')
          ? { stdout: JSON.stringify({ body: APPROVED_BODY }), stderr: '' }
          : { stdout: '', stderr: '' },
    },
  });
  assert.equal(r.exitCode, 3);
  assert.match(r.stderr, /close-gate evaluation failed/);
});
test('--force: gate-eval throw swallowed → cascade + close pipeline → Closed', async () => {
  const calls = [];
  const parentDoneOptions = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      rest: ['#5', '--force'],
      getIssueBoardState: async (n) =>
        String(n).replace(/^#/, '') === '102' ? 'develop' : 'review',
      fetchSubIssues: async () => ['101', '102'],
      estimationOutcomeWriter: {
        ensure: async ({ issueNumber }) => {
          calls.push(`outcome ${issueNumber}`);
          return { status: 'written' };
        },
      },
      writeTerminalDisposition: async ({ issueNumber, disposition }) => {
        calls.push(`disposition ${issueNumber} ${disposition}`);
      },
      runMoveState: async (issueNumber, state) => {
        calls.push(`move ${issueNumber} ${state}`);
        return { ok: true, benign: false };
      },
      runMoveStateDone: async (issueNumber, options) => {
        parentDoneOptions.push(options);
        calls.push(`move ${String(issueNumber).replace(/^#/, '')} done`);
        return { ok: true, benign: false };
      },
      pexec: async (cmd, args) => {
        const a = args.join(' ');
        calls.push(`${cmd} ${a}`);
        if (cmd === 'gh' && a.includes('issue view') && a.includes('--jq'))
          return { stdout: APPROVED_BODY, stderr: '' };
        if (cmd === 'gh' && a.includes('issue view'))
          return { stdout: JSON.stringify({ body: APPROVED_BODY }), stderr: '' };
        return { stdout: '', stderr: '' };
      },
    },
  });
  assert.match(r.stdout, /Closed #5/);
  const childDispositionIndex = calls.indexOf('disposition 101 Delivered');
  const childOutcomeIndex = calls.indexOf('outcome 101');
  const childDoneIndex = calls.indexOf('move 101 done');
  const childCloseIndex = calls.findIndex((c) => /issue close 101/.test(c));
  const parentDispositionIndex = calls.indexOf('disposition 5 Delivered');
  const parentOutcomeIndex = calls.indexOf('outcome 5');
  const parentDoneIndex = calls.indexOf('move 5 done');
  const parentCloseIndex = calls.findIndex((c) => /issue close 5/.test(c));
  assert.ok(childDispositionIndex >= 0, `expected child Delivered write; got ${calls}`);
  assert.ok(
    childOutcomeIndex >= 0 &&
      childDoneIndex > childOutcomeIndex &&
      childDispositionIndex > childDoneIndex &&
      childCloseIndex > childDispositionIndex,
    `expected child outcome before Done, Delivered write, and close; got ${calls}`
  );
  assert.ok(parentDispositionIndex >= 0, `expected parent Delivered write; got ${calls}`);
  assert.ok(
    parentOutcomeIndex >= 0 &&
      parentDoneIndex > parentOutcomeIndex &&
      parentDispositionIndex > parentDoneIndex &&
      parentCloseIndex > parentDispositionIndex,
    `expected parent outcome before Done, Delivered write, and close; got ${calls}`
  );
  assert.equal(parentDoneOptions.length, 1, 'durable board step must not repeat the final move');
  assert.deepEqual(parentDoneOptions[0].extraArgs, ['--force']);
  assert.equal(parentDoneOptions[0].reviewAuthority, 'human-gate');
});
test('cascade: disposition failure leaves child and parent OPEN and active', async () => {
  resetExit();
  const ghCalls = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      rest: ['#5', '--force'],
      getIssueBoardState: async () => 'review',
      fetchSubIssues: async () => ['101'],
      writeTerminalDisposition: async ({ issueNumber }) => {
        if (String(issueNumber) === '101') throw new Error('Delivered option missing');
      },
      pexec: async (cmd, args) => {
        const a = args.join(' ');
        ghCalls.push(`${cmd} ${a}`);
        if (cmd === 'gh' && a.includes('issue view') && a.includes('--jq')) {
          return { stdout: APPROVED_BODY, stderr: '' };
        }
        if (cmd === 'gh' && a.includes('issue view')) {
          return { stdout: JSON.stringify({ body: APPROVED_BODY }), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    },
  });
  assert.equal(exitOf(r), 1);
  assert.equal(r.finalState.active, '#5');
  assert.ok(!ghCalls.some((c) => /issue close (101|5)/.test(c)));
  assert.doesNotMatch(r.stdout, /✓ #101 closed/);
  assert.match(r.stderr, /Delivered option missing/);
  resetExit();
});

test('cascade: outcome failure leaves child in Review and parent OPEN and active', async () => {
  resetExit();
  const calls = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      rest: ['#5', '--force'],
      getIssueBoardState: async () => 'review',
      fetchSubIssues: async () => ['101'],
      estimationOutcomeWriter: {
        ensure: async ({ issueNumber }) => {
          calls.push(`outcome ${issueNumber}`);
          if (String(issueNumber) === '101') throw new Error('child outcome unavailable');
          return { status: 'written' };
        },
      },
      runMoveState: async (issueNumber, state) => {
        calls.push(`move ${issueNumber} ${state}`);
        return { ok: true, benign: false };
      },
      writeTerminalDisposition: async ({ issueNumber, disposition }) => {
        calls.push(`disposition ${issueNumber} ${disposition}`);
      },
      pexec: async (cmd, args) => {
        const rendered = `${cmd} ${args.join(' ')}`;
        calls.push(rendered);
        if (cmd === 'gh' && rendered.includes('issue view') && rendered.includes('--jq')) {
          return { stdout: APPROVED_BODY, stderr: '' };
        }
        if (cmd === 'gh' && rendered.includes('issue view')) {
          return { stdout: JSON.stringify({ body: APPROVED_BODY }), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    },
  });
  assert.equal(exitOf(r), 1);
  assert.equal(r.finalState.active, '#5');
  assert.ok(calls.includes('outcome 101'));
  assert.ok(!calls.includes('move 101 done'));
  assert.ok(!calls.includes('disposition 101 Delivered'));
  assert.ok(!calls.some((call) => /issue close (101|5)/.test(call)));
  assert.match(r.stderr, /child outcome unavailable/);
  resetExit();
});

test('cascade: queued terminal timing leaves child in Review and retains evidence for retry', async () => {
  resetExit();
  const calls = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      rest: ['#5', '--force'],
      getIssueBoardState: async () => 'review',
      fetchSubIssues: async () => ['101'],
      safePostTiming: async (target) => {
        calls.push(`timing ${target}`);
        return { ok: false, queued: true, err: 'network down' };
      },
      flushQueueFor: async (target) => {
        calls.push(`flush ${target}`);
        return { delivered: 0, pending: 1 };
      },
      estimationOutcomeWriter: {
        ensure: async ({ issueNumber }) => {
          calls.push(`outcome ${issueNumber}`);
          return { status: 'written' };
        },
      },
      runMoveState: async (issueNumber, state) => {
        calls.push(`move ${issueNumber} ${state}`);
        return { ok: true, benign: false };
      },
      pexec: async (cmd, args) => {
        const rendered = `${cmd} ${args.join(' ')}`;
        calls.push(rendered);
        if (cmd === 'gh' && rendered.includes('issue view')) {
          return rendered.includes('--jq')
            ? { stdout: APPROVED_BODY, stderr: '' }
            : { stdout: JSON.stringify({ body: APPROVED_BODY }), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    },
  });
  assert.equal(exitOf(r), 1);
  assert.equal(r.finalState.active, '#5');
  assert.ok(calls.includes('timing #101'));
  assert.ok(!calls.includes('outcome 101'));
  assert.ok(!calls.includes('move 101 done'));
  assert.ok(!calls.some((call) => /issue close (101|5)/.test(call)));
  assert.match(r.stderr, /terminal timing issue:wrap was not durably posted/);
  resetExit();
});

test('cascade: each child outcome uses its own resolved worktree', async () => {
  const calls = [];
  const r = await run({
    over: {
      SKIP_NETWORK: false,
      rest: ['#5', '--force'],
      closeBody: READY_BODY,
      getIssueBoardState: async () => 'review',
      fetchSubIssues: async () => ['101'],
      resolveIssueWorkspace: ({ issueRef }) => `/dedicated/${issueRef.replace('#', '')}`,
      createEstimationOutcomeWriter: ({ projectDir }) => ({
        ensure: async ({ issueNumber }) => {
          calls.push(`outcome ${issueNumber} ${projectDir}`);
          return { status: 'written' };
        },
      }),
      runMoveState: async () => ({ ok: true, benign: false }),
      runMoveStateDone: async () => ({ ok: true, benign: false }),
      pexec: async (cmd, args) => {
        const rendered = `${cmd} ${args.join(' ')}`;
        if (cmd === 'gh' && rendered.includes('issue view') && rendered.includes('--jq')) {
          return { stdout: READY_BODY, stderr: '' };
        }
        if (cmd === 'gh' && rendered.includes('issue view')) {
          return { stdout: JSON.stringify({ body: READY_BODY }), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      },
    },
  });
  assert.match(r.stdout, /Closed #5/);
  assert.ok(calls.includes('outcome 101 /dedicated/101'), JSON.stringify(calls));
  assert.ok(
    calls.some((call) => /^outcome 5 /.test(call)),
    JSON.stringify(calls)
  );
});

// --- assertFieldsPersisted throw branches via the --force tail ---
test('assertFieldsPersisted: aitm-fields marker missing → throws', async () => {
  const r = await run({ over: forceFieldsOver({ jqBody: '## Done\n\nno marker\n' }) });
  assert.ok(r.thrown);
  assert.match(r.thrown.message, /marker missing/);
});
test('assertFieldsPersisted: engagedTime null → throws', async () => {
  const r = await run({
    over: forceFieldsOver({ jqBody: '## Done\n\n<!-- aitm-fields: {"engagedTime":null} -->\n' }),
  });
  assert.ok(r.thrown);
  assert.match(r.thrown.message, /engagedTime is still null/);
});
test('assertFieldsPersisted: body re-read fails → throws', async () => {
  const r = await run({ over: forceFieldsOver({ jqThrows: true }) });
  assert.ok(r.thrown);
  assert.match(r.thrown.message, /could not re-read body/);
});

// --- tickLifecycleOnClose: exported helper, deps.mutateIssueBody seam ---
test('tickLifecycleOnClose: ticks story-closed + timing-flushed via mutate', async () => {
  let captured = null;
  await tickLifecycleOnClose({
    cfg: { repo: 'o/r' },
    issueNum: '5',
    pexec: async () => ({ stdout: '', stderr: '' }),
    deps: {
      mutateIssueBody: async (args) => {
        captured = args;
        args.mutate('## Lifecycle\n\n- [ ] story-closed\n- [ ] timing-flushed\n');
        return { status: 'ok' };
      },
    },
  });
  assert.ok(captured);
  assert.equal(captured.issueNumber, '5');
  assert.equal(captured.allowUnverifiedTicks, true);
});
test('tickLifecycleOnClose: mutate throws → best-effort swallow', async () => {
  await assert.doesNotReject(() =>
    tickLifecycleOnClose({
      cfg: { repo: 'o/r' },
      issueNum: '5',
      pexec: async () => ({ stdout: '', stderr: '' }),
      deps: {
        mutateIssueBody: async () => {
          throw new Error('boom');
        },
      },
    })
  );
});

console.log('coverage-close.test.mjs: defined');
