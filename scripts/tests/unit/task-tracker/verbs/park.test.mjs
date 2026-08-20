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
} from '../../../../task-tracker/verbs/park.mjs';

const CFG = { repo: 'owner/repo', projectId: 'PVT_target' };

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
