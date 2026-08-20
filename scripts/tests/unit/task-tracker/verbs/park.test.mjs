#!/usr/bin/env node
// @story #848 #1215
// Park remains as a compatibility spelling, but its old estimate-preserving
// Refine|Plan behavior was intentionally replaced by Shelve.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGAL_FROM,
  PARK_TARGET,
  parseArgs,
  runPark,
  verbPark,
} from '../../../../task-tracker/verbs/park.mjs';

const CFG = { repo: 'owner/repo', projectId: 'PVT_target' };

async function captureVerb(run) {
  let stdout = '';
  let stderr = '';
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const originalExitCode = process.exitCode;
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += String(chunk);
    return true;
  };
  process.exitCode = undefined;
  try {
    await run();
    return { stdout, stderr, exitCode: process.exitCode };
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
    process.exitCode = originalExitCode;
  }
}

test('Park compatibility boundary is the canonical Shelve boundary', () => {
  assert.equal(PARK_TARGET, 'backlog');
  assert.deepEqual([...LEGAL_FROM], ['refine', 'ready-for-plan']);
});

test('Park strict argv accepts the Shelve owner-removal flag', () => {
  assert.deepEqual(parseArgs(['#848', '--reason', 'premise falsified']), {
    issueNumber: 848,
    reason: 'premise falsified',
    removeOwner: false,
    refreshStaleBlockers: false,
  });
  assert.deepEqual(parseArgs(['848', '--reason=deprioritized', '--remove-owner']), {
    issueNumber: 848,
    reason: 'deprioritized',
    removeOwner: true,
    refreshStaleBlockers: false,
  });
});

test('Park strict argv refuses the Shelve-only stale-blocker migration flag', () => {
  assert.throws(
    () => parseArgs(['848', '--reason', 'premise falsified', '--refresh-stale-blockers']),
    /unrecognized argument: --refresh-stale-blockers/
  );
});

test('Park refuses the Shelve-only migration flag before it obtains a lock or starts a transaction', async () => {
  let lockCalls = 0;
  let transactionCalls = 0;
  const result = await captureVerb(() =>
    verbPark(['848', '--reason', 'premise falsified', '--refresh-stale-blockers'], CFG, {
      withIssueLock: async () => {
        lockCalls += 1;
      },
      runTransaction: async () => {
        transactionCalls += 1;
      },
    })
  );

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /unrecognized argument: --refresh-stale-blockers/);
  assert.match(result.stderr, /Usage: park <N> --reason <text> \[--remove-owner\]/);
  assert.equal(lockCalls, 0);
  assert.equal(transactionCalls, 0);
});

test('Park delegates to the one Shelve transaction authority', async () => {
  const calls = [];
  const result = await runPark({
    issueNumber: 848,
    reason: 'premise falsified',
    removeOwner: true,
    cfg: CFG,
    deps: {
      assertBound: () => {},
      runTransaction: async (args) => {
        calls.push(args);
        return { status: 'shelved', from: 'refine', to: 'backlog', tx: 'tx-848' };
      },
    },
  });
  assert.equal(result.status, 'shelved');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reason, 'premise falsified');
  assert.equal(calls[0].removeOwner, true);
});

test('Park no longer accepts Plan and no longer has an estimate-preserving path', async () => {
  const result = await runPark({
    issueNumber: 848,
    reason: 'planning was interrupted',
    cfg: CFG,
    deps: {
      assertBound: () => {},
      runTransaction: async () => ({ status: 'invalid-source-refused', from: 'plan' }),
    },
  });
  assert.deepEqual(result, { status: 'invalid-source-refused', from: 'plan' });
});
