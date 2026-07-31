// @story #1049
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import * as closeModule from '../../../verbs/close.mjs';

function state(active = '#1049') {
  return {
    active,
    lastActive: active,
    entryStartTs: new Date(Date.now() - 60_000).toISOString(),
    wordsAtEntryStart: 0,
    lastWordMarker: 0,
    lease: {
      projectId: 'P',
      leaseId: 'lease-1049',
      fencingToken: 7,
      worktreeId: 'wt-1049',
    },
  };
}

async function runOfflineClose({
  active = '#1049',
  rest = ['#1049'],
  drainResult = { delivered: 0, retained: 0, authorityRefused: 0 },
  flushResult = { delivered: 0, discarded: 0, authorityRefused: 0 },
  reverifyFailureAt = null,
  duringDrain,
} = {}) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-close-governed-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify(state(active)));
  const events = [];
  const options = { roots: [], timing: [], moves: [], logs: [] };
  let reverifyCount = 0;
  const continuation = async (authorityOptions, callback) => {
    events.push(`continue:${authorityOptions.issueId}:${authorityOptions.operation}`);
    assert.equal(authorityOptions.heartbeat, true);
    reverifyCount += 1;
    events.push(`reverify:${reverifyCount}`);
    if (reverifyCount === reverifyFailureAt) {
      const error = new Error('stale close fence');
      error.code = 'fence-stale';
      throw error;
    }
    return callback({ reverify: async () => {} });
  };
  const ctx = {
    cfg: { repo: 'o/r' },
    statePath,
    projectDir: dir,
    rest,
    SKIP_NETWORK: true,
    closeBody: '',
    pexec: async () => ({ stdout: '{}', stderr: '' }),
    drainQueueIfAny: async () => {
      events.push('drain');
      await duringDrain?.({ statePath });
      return drainResult;
    },
    flushAndForgetQueueFor: async () => {
      events.push('targeted-flush');
      return flushResult;
    },
    safePostTiming: async (_target, _row, authorityOptions = {}) => {
      options.timing.push(authorityOptions);
      return authorityOptions.withGovernedEffect(
        {
          issueId: '1049',
          operation: authorityOptions.operation,
          heartbeat: true,
        },
        async () => events.push('timing')
      );
    },
    runMoveState: async () => ({ ok: true, benign: false }),
    runMoveStateDone: async (_target, authorityOptions = {}) => {
      options.moves.push(authorityOptions);
      return authorityOptions.withGovernedEffect(
        {
          issueId: '1049',
          operation: authorityOptions.operation,
          heartbeat: true,
        },
        async () => {
          events.push('done');
          return { ok: true, benign: false };
        }
      );
    },
    runLogIssueTime: async (_target, authorityOptions = {}) => {
      options.logs.push(authorityOptions);
      return authorityOptions.withGovernedEffect(
        {
          issueId: '1049',
          operation: authorityOptions.operation,
          heartbeat: true,
        },
        async () => events.push('log')
      );
    },
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => 'review',
    getIssueClosedState: async () => false,
    uncheckedPreCloseCheckboxes: () => [],
    tickLifecycleOnClose: async () => {
      events.push('lifecycle');
      return { ok: true };
    },
    nowIso: () => new Date().toISOString(),
    withIssueLock: async (lockOptions, callback) => {
      events.push('lock');
      assert.deepEqual(lockOptions, { issue: '1049', verb: 'close', projDir: dir });
      try {
        return await callback();
      } finally {
        events.push('release');
      }
    },
    withGovernedEffect: async (rootOptions, callback) => {
      options.roots.push(rootOptions);
      events.push('root');
      try {
        return await callback({
          leaseContext: state().lease,
          reverify: async () => {
            reverifyCount += 1;
            events.push(`reverify:${reverifyCount}`);
            if (reverifyCount === reverifyFailureAt) {
              const error = new Error('stale close fence');
              error.code = 'fence-stale';
              throw error;
            }
          },
        });
      } finally {
        events.push('heartbeat-stop');
      }
    },
  };
  const previousDirty = process.env.TT_SKIP_DIRTY_CHECK;
  const previousExitCode = process.exitCode;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  process.exitCode = 0;
  try {
    const result = await closeModule.verbClose(ctx);
    return {
      dir,
      events,
      options,
      result,
      state: JSON.parse(readFileSync(statePath, 'utf8')),
    };
  } catch (error) {
    return { dir, events, options, error, state: JSON.parse(readFileSync(statePath, 'utf8')) };
  } finally {
    if (previousDirty === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = previousDirty;
    process.exitCode = previousExitCode;
  }
}

test('close exports the prepare, execute, and post-unwind finalize boundaries', () => {
  assert.equal(typeof closeModule.prepareClose, 'function');
  assert.equal(typeof closeModule.executeClosePlan, 'function');
  assert.equal(typeof closeModule.finalizeCloseOutcome, 'function');
});

test('no-target close is pure and does not drain queue or open mutation authority', async () => {
  const run = await runOfflineClose({ active: null, rest: [] });
  try {
    assert.equal(run.error, undefined);
    assert.deepEqual(run.events, []);
    assert.equal(run.state.active, null);
  } finally {
    rmSync(run.dir, { recursive: true, force: true });
  }
});

test('invalid disposition refusal is pure and does not drain queue or open mutation authority', async () => {
  const run = await runOfflineClose({ rest: ['#1049', '--as', 'not-a-disposition'] });
  try {
    assert.equal(run.error, undefined);
    assert.deepEqual(run.events, []);
    assert.equal(run.result.status, 'invalid-disposition');
    assert.equal(run.state.active, '#1049');
  } finally {
    rmSync(run.dir, { recursive: true, force: true });
  }
});

for (const malformedTarget of ['#abc', '#0', '#01']) {
  test(`malformed explicit target ${malformedTarget} refuses before fallback, queue, or authority`, async () => {
    const run = await runOfflineClose({ active: '#1049', rest: [malformedTarget] });
    try {
      assert.equal(run.error, undefined);
      assert.equal(run.result.status, 'invalid-target');
      assert.deepEqual(run.events, []);
      assert.equal(run.state.active, '#1049');
    } finally {
      rmSync(run.dir, { recursive: true, force: true });
    }
  });
}

test('ordinary close uses one lock and one heartbeat root through the final effect', async () => {
  const run = await runOfflineClose();
  try {
    assert.equal(run.error, undefined);
    assert.deepEqual(run.options.roots, [{ issueId: '1049', operation: 'close', heartbeat: true }]);
    assert.equal(run.events.filter((event) => event === 'lock').length, 1);
    assert.equal(run.events.filter((event) => event === 'root').length, 1);
    assert.deepEqual(run.events.slice(-2), ['heartbeat-stop', 'release']);
    for (const authorityOptions of [
      ...run.options.timing,
      ...run.options.moves,
      ...run.options.logs,
    ]) {
      assert.equal(authorityOptions.operation, 'close');
      assert.equal(typeof authorityOptions.withGovernedEffect, 'function');
    }
    assert.equal(run.state.active, null);
    assert.deepEqual(run.state.lease, state().lease, 'clearActive must retain lease context');
  } finally {
    rmSync(run.dir, { recursive: true, force: true });
  }
});

for (const bindingCase of [
  { name: 'bound same remains same', prepared: '#1049', refreshed: '#1049', status: 'completed' },
  { name: 'unbound remains unbound', prepared: null, refreshed: null, status: 'completed' },
  { name: 'bound disappears', prepared: '#1049', refreshed: null, status: 'binding-changed' },
  {
    name: 'bound changes foreign',
    prepared: '#1049',
    refreshed: '#1050',
    status: 'binding-changed',
  },
  { name: 'unbound becomes target', prepared: null, refreshed: '#1049', status: 'binding-changed' },
  {
    name: 'unbound becomes foreign',
    prepared: null,
    refreshed: '#1050',
    status: 'binding-changed',
  },
]) {
  test(`prepared/live binding matrix: ${bindingCase.name}`, async () => {
    const run = await runOfflineClose({
      active: bindingCase.prepared,
      duringDrain:
        bindingCase.refreshed === bindingCase.prepared
          ? undefined
          : async ({ statePath }) => {
              writeFileSync(statePath, JSON.stringify(state(bindingCase.refreshed)));
            },
    });
    try {
      assert.equal(run.error, undefined);
      assert.equal(run.result.status, bindingCase.status);
      if (bindingCase.status === 'binding-changed') {
        assert.equal(run.state.active, bindingCase.refreshed);
        for (const forbidden of ['targeted-flush', 'timing', 'done', 'log', 'lifecycle']) {
          assert.ok(!run.events.includes(forbidden), `must not emit ${forbidden}`);
        }
        assert.deepEqual(run.events.slice(-2), ['heartbeat-stop', 'release']);
      } else {
        assert.ok(run.events.includes('done'));
      }
    } finally {
      rmSync(run.dir, { recursive: true, force: true });
    }
  });
}

test('explicit target state is not saved until authority has been reverified', async () => {
  const run = await runOfflineClose({ active: null, rest: ['#1049'], reverifyFailureAt: 2 });
  try {
    assert.equal(run.error?.code, 'fence-stale');
    assert.equal(run.state.active, null);
    assert.deepEqual(run.events.slice(-2), ['heartbeat-stop', 'release']);
  } finally {
    rmSync(run.dir, { recursive: true, force: true });
  }
});

test('queue receipt authority refusal retains rows and aborts before lock or close authority', async () => {
  const run = await runOfflineClose({
    drainResult: { delivered: 0, retained: 3, authorityRefused: 3 },
  });
  try {
    assert.equal(run.error, undefined);
    assert.equal(run.result.status, 'queue-authority-refused');
    assert.deepEqual(run.events, ['drain']);
    assert.equal(run.state.active, '#1049');
  } finally {
    rmSync(run.dir, { recursive: true, force: true });
  }
});

test('ordinary pre-root queue delivery failures remain retained and do not block close', async () => {
  const run = await runOfflineClose({
    drainResult: { delivered: 0, retained: 2, authorityRefused: 0 },
  });
  try {
    assert.equal(run.error, undefined);
    assert.equal(run.result.status, 'completed');
    assert.ok(run.events.includes('root'));
    assert.equal(run.state.active, null);
  } finally {
    rmSync(run.dir, { recursive: true, force: true });
  }
});

test('targeted queue authority refusal blocks terminal close and retains active state', async () => {
  const run = await runOfflineClose({
    flushResult: { delivered: 0, discarded: 0, authorityRefused: 1 },
  });
  try {
    assert.equal(run.state.active, '#1049');
    assert.ok(!run.events.includes('done'));
    assert.ok(!run.events.includes('lifecycle'));
  } finally {
    rmSync(run.dir, { recursive: true, force: true });
  }
});

test('close --as targeted authority refusal aborts before disposition or terminal effects', async () => {
  const run = await runOfflineClose({
    rest: ['#1049', '--as', 'not-planned'],
    flushResult: { delivered: 0, discarded: 0, authorityRefused: 1 },
  });
  try {
    assert.equal(run.error, undefined);
    assert.equal(run.result.status, 'queue-authority-refused');
    assert.equal(run.state.active, '#1049');
    assert.ok(!run.events.includes('done'));
    assert.ok(!run.events.includes('lifecycle'));
    assert.deepEqual(run.events.slice(-2), ['heartbeat-stop', 'release']);
  } finally {
    rmSync(run.dir, { recursive: true, force: true });
  }
});

test('a stale Nth close fence rethrows identity and stops later effects', async () => {
  const run = await runOfflineClose({ reverifyFailureAt: 2 });
  try {
    assert.equal(run.error?.code, 'fence-stale');
    assert.ok(!run.events.includes('done'));
    assert.ok(!run.events.includes('lifecycle'));
    assert.equal(run.state.active, '#1049');
    assert.deepEqual(run.events.slice(-2), ['heartbeat-stop', 'release']);
  } finally {
    rmSync(run.dir, { recursive: true, force: true });
  }
});
