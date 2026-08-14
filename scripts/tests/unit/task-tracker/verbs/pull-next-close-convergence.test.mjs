// @story #925
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runPullNext } from '../../../../task-tracker/verbs/pull-next.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function ready(number, rank) {
  return {
    number,
    state: 'ready-for-plan',
    boardState: 'ready-for-plan',
    closeReason: null,
    rank,
    blockedBy: [],
    hasCurrentRefinement: true,
  };
}

function terminal(number, rank, extra = {}) {
  return {
    number,
    state: 'done',
    boardState: 'done',
    issueState: 'closed',
    closeReason: 'completed',
    rank,
    blockedBy: [],
    hasCurrentRefinement: false,
    ...extra,
  };
}

function harness({ children, outcomes = {} } = {}) {
  const calls = [];
  const deps = {
    projectDir: process.cwd(),
    withIssueLock: async (_options, fn) => fn(),
    childIssueLock: async (_options, fn) => fn(),
    getLiveState: async () => 'develop',
    getChildLiveState: async () => 'plan',
    audit: async () => {
      calls.push('audit');
      return { ok: true };
    },
    epicChildren: {
      fetchSiblings: async () => {
        calls.push('fetch');
        return children;
      },
    },
    enrich: {
      fetchBody: async ({ issueNumber }) => {
        calls.push(`enrich:${issueNumber}`);
        return '';
      },
    },
    convergeClosedIssue: async (input) => {
      calls.push(`converge:${input.issueNumber}:${input.stateReason}:${input.boardState}`);
      return outcomes[input.issueNumber];
    },
    promote: async ([issueNumber]) => {
      calls.push(`promote:${issueNumber}`);
      return { status: 'ok' };
    },
  };
  return { calls, deps };
}

test('finalizes a completed closed child before selecting the next ranked child', async () => {
  const { calls, deps } = harness({
    children: [terminal(101, 1, { boardState: 'review' }), ready(102, 2)],
    outcomes: {
      101: { action: 'finalize', status: 'completed', steps: ['moveToDone'] },
    },
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.deepEqual(result.sweep, {
    checked: [101],
    finalized: [101],
    recovered: [],
    dead: [],
    failed: [],
  });
  assert.ok(calls.indexOf('converge:101:completed:review') < calls.indexOf('promote:102'));
});

test('leaves a dead-disposition child untouched and continues selection', async () => {
  const { calls, deps } = harness({
    children: [
      terminal(101, 1, { boardState: 'refine', closeReason: 'not_planned' }),
      ready(102, 2),
    ],
    outcomes: {
      101: { action: 'dead', status: 'untouched', steps: [] },
    },
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.deepEqual(result.sweep.dead, [101]);
  assert.ok(calls.includes('promote:102'));
});

test('an aberration recovery pauses without promoting another child', async () => {
  const { calls, deps } = harness({
    children: [terminal(101, 1, { boardState: 'review' }), ready(102, 2)],
    outcomes: {
      101: { action: 'aberration', status: 'recovered', steps: ['reopenIssue'] },
    },
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'self-heal-paused');
  assert.deepEqual(result.sweep.recovered, [101]);
  assert.equal(
    calls.some((entry) => entry.startsWith('promote:')),
    false
  );
});

test('a failed convergence pauses selection and reports the child', async () => {
  const { calls, deps } = harness({
    children: [terminal(101, 1, { boardState: 'develop' }), ready(102, 2)],
    outcomes: {
      101: { action: 'finalize', status: 'failed', failedStep: 'moveToDone' },
    },
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'self-heal-paused');
  assert.deepEqual(result.sweep.failed, [101]);
  assert.equal(
    calls.some((entry) => entry.startsWith('promote:')),
    false
  );
});

test('a pending durable recovery is converged and pauses before promotion', async () => {
  const { calls, deps } = harness({
    children: [
      {
        number: 101,
        state: 'review',
        boardState: 'review',
        closeReason: null,
        recoveryPhase: 'timing',
        recoveryTx: 'tx-101',
        rank: 1,
      },
      ready(102, 2),
    ],
    outcomes: {
      101: {
        action: 'aberration',
        status: 'recovered',
        durablePhase: 'complete',
        steps: ['postTimingAudit'],
      },
    },
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'self-heal-paused');
  assert.deepEqual(result.sweep.checked, [101]);
  assert.deepEqual(result.sweep.recovered, [101]);
  assert.ok(calls.includes('converge:101:null:review'));
  assert.equal(
    calls.some((entry) => entry.startsWith('promote:')),
    false
  );
});

test('a completed durable recovery is not pending and selection may continue', async () => {
  const { calls, deps } = harness({
    children: [terminal(101, 1, { recoveryPhase: 'complete', recoveryTx: null }), ready(102, 2)],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.deepEqual(result.sweep.checked, []);
  assert.equal(
    calls.some((entry) => entry.startsWith('converge:')),
    false
  );
  assert.ok(calls.includes('promote:102'));
});

test('already-Done closed children and open children are not convergence candidates', async () => {
  const { calls, deps } = harness({
    children: [terminal(101, 1), ready(102, 2)],
  });
  const result = await runPullNext({ epicNumber: 100, cfg, deps });
  assert.equal(result.status, 'pulled');
  assert.deepEqual(result.sweep.checked, []);
  assert.equal(
    calls.some((entry) => entry.startsWith('converge:')),
    false
  );
  assert.ok(calls.includes('promote:102'));
});
