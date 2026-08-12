// @story #1215
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArgs,
  runShelve,
  verbShelve,
  SHELVE_TARGET,
  LEGAL_FROM,
} from '../../../verbs/shelve.mjs';
import { runPark } from '../../../verbs/park.mjs';
import { PREFLIGHT_MODE } from '../../../task-tracker.mjs';
import { commandByName, routeIdentityForCommand } from '../../../lib/command-surface/catalog.mjs';
import { EXECUTABLE_ENTRYPOINTS } from '../../../lib/command-surface/entrypoints.mjs';

const CFG = { repo: 'owner/repo', projectId: 'PVT_target' };

test('Shelve exports the Backlog target and Refine/R4P source boundary', () => {
  assert.equal(SHELVE_TARGET, 'backlog');
  assert.deepEqual([...LEGAL_FROM], ['refine', 'ready-for-plan']);
});

test('strict Shelve argv accepts explicit optional owner removal', () => {
  assert.deepEqual(parseArgs(['#1215', '--reason', 'stale refinement']), {
    issueNumber: 1215,
    reason: 'stale refinement',
    removeOwner: false,
  });
  assert.deepEqual(parseArgs(['1215', '--reason=stale refinement', '--remove-owner']), {
    issueNumber: 1215,
    reason: 'stale refinement',
    removeOwner: true,
  });
  assert.throws(() => parseArgs(['1215', '--unexpected']), /unrecognized argument/);
  assert.throws(() => parseArgs(['1215', '1216', '--reason', 'x']), /unexpected positional/);
});

test('runShelve refuses blank reasons before binding, network, or writes', async () => {
  let called = false;
  const result = await runShelve({
    issueNumber: 1215,
    reason: '  ',
    cfg: CFG,
    deps: {
      assertBound: () => {
        called = true;
      },
      runTransaction: async () => {
        called = true;
      },
    },
  });
  assert.deepEqual(result, { status: 'reason-required' });
  assert.equal(called, false);
});

test('runShelve preserves one transaction authority and threads exact intent', async () => {
  const calls = [];
  const result = await runShelve({
    issueNumber: 1215,
    reason: '  stale refinement  ',
    removeOwner: true,
    cfg: CFG,
    deps: {
      assertBound: (issue) => calls.push(['bound', issue]),
      runTransaction: async (args) => {
        calls.push(['transaction', args]);
        return { status: 'shelved', from: 'refine', to: 'backlog' };
      },
    },
  });
  assert.equal(result.status, 'shelved');
  assert.deepEqual(calls[0], ['bound', 1215]);
  assert.equal(calls[1][1].issueNumber, 1215);
  assert.equal(calls[1][1].reason, 'stale refinement');
  assert.equal(calls[1][1].removeOwner, true);
  assert.equal(calls[1][1].cfg, CFG);
  assert.ok(calls[1][1].deps);
});

test('park is only a compatibility alias for the same Shelve transaction', async () => {
  const calls = [];
  const result = await runPark({
    issueNumber: 1215,
    reason: 'stale refinement',
    removeOwner: false,
    cfg: CFG,
    deps: {
      assertBound: () => {},
      runTransaction: async (args) => {
        calls.push(args);
        return { status: 'shelved', from: 'ready-for-plan', to: 'backlog' };
      },
    },
  });
  assert.equal(result.status, 'shelved');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reason, 'stale refinement');
});

test('Shelve is canonical across routing, catalog, and executable entrypoints', () => {
  const shelve = commandByName('shelve');
  assert.equal(shelve.name, 'shelve');
  assert.equal(shelve.routing, 'verbs/shelve.mjs');
  assert.match(shelve.purpose, /immutable refinement history/i);
  assert.equal(routeIdentityForCommand('shelve').verb, 'shelve');
  assert.equal(
    EXECUTABLE_ENTRYPOINTS.find((entry) => entry.command === 'shelve').path,
    'scripts/task-tracker/verbs/shelve.mjs'
  );

  const park = commandByName('park');
  assert.match(park.purpose, /compatibility alias/i);
  assert.doesNotMatch(park.purpose, /keeps Priority|retaining estimate/i);
});

test('Shelve uses target preflight and one issue lock before entering the transaction', async () => {
  assert.equal(PREFLIGHT_MODE.shelve, 'target-required');
  const calls = [];
  const originalWrite = process.stdout.write;
  const originalExitCode = process.exitCode;
  process.stdout.write = () => true;
  process.exitCode = undefined;
  try {
    await verbShelve(['1215', '--reason', 'stale refinement'], CFG, {
      assertBound: (issue) => calls.push(['bound', issue]),
      projectDir: '/project',
      withIssueLock: async (options, fn) => {
        calls.push(['lock', options]);
        return fn();
      },
      runTransaction: async () => ({
        status: 'shelved',
        from: 'refine',
        to: 'backlog',
        tx: 'tx-1215',
      }),
    });
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = originalExitCode;
  }
  assert.deepEqual(calls[0], ['lock', { issue: 1215, verb: 'shelve', projDir: '/project' }]);
  assert.deepEqual(calls[1], ['bound', 1215]);
});
