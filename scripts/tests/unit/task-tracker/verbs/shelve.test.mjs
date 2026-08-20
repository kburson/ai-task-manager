// @story #1215
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  parseArgs,
  runShelve,
  verbShelve,
  SHELVE_TARGET,
  LEGAL_FROM,
} from '../../../../task-tracker/verbs/shelve.mjs';
import { runPark, verbPark } from '../../../../task-tracker/verbs/park.mjs';
import { PREFLIGHT_MODE } from '../../../../task-tracker/task-tracker.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  commandByName,
  routeIdentityForCommand,
} from '../../../../task-tracker/lib/command-surface/catalog.mjs';
import { EXECUTABLE_ENTRYPOINTS } from '../../../../task-tracker/lib/command-surface/entrypoints.mjs';

const CFG = { repo: 'owner/repo', projectId: 'PVT_target' };
const pexec = promisify(execFile);
const VERBS_DIR = path.dirname(
  fileURLToPath(new URL('../../../../task-tracker/verbs/shelve.mjs', import.meta.url))
);

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

test('Shelve exports the Backlog target and Refine/R4P source boundary', () => {
  assert.equal(SHELVE_TARGET, 'backlog');
  assert.deepEqual([...LEGAL_FROM], ['refine', 'ready-for-plan']);
});

test('strict Shelve argv accepts one explicit stale-blocker refresh flag', () => {
  assert.deepEqual(parseArgs(['#1215', '--reason', 'stale refinement']), {
    issueNumber: 1215,
    reason: 'stale refinement',
    removeOwner: false,
    refreshStaleBlockers: false,
  });
  assert.deepEqual(parseArgs(['1215', '--reason=stale refinement', '--remove-owner']), {
    issueNumber: 1215,
    reason: 'stale refinement',
    removeOwner: true,
    refreshStaleBlockers: false,
  });
  assert.deepEqual(
    parseArgs(['1215', '--reason', 'stale refinement', '--refresh-stale-blockers']),
    {
      issueNumber: 1215,
      reason: 'stale refinement',
      removeOwner: false,
      refreshStaleBlockers: true,
    }
  );
});

test('strict Shelve argv refuses a duplicate stale-blocker refresh flag', () => {
  assert.throws(
    () =>
      parseArgs([
        '1215',
        '--reason',
        'stale refinement',
        '--refresh-stale-blockers',
        '--refresh-stale-blockers',
      ]),
    /duplicate flag: --refresh-stale-blockers/
  );
});

test('runShelve preserves ordinary transaction intent when no migration flag is supplied', async () => {
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
  assert.equal(calls[1][1].refreshStaleBlockers, false);
  assert.equal(calls[1][1].cfg, CFG);
  assert.ok(calls[1][1].deps);
});

test('runShelve threads explicit stale-blocker migration intent into the transaction', async () => {
  let received;
  const result = await runShelve({
    issueNumber: 1215,
    reason: 'stale refinement',
    refreshStaleBlockers: true,
    cfg: CFG,
    deps: {
      assertBound: () => {},
      runTransaction: async (args) => {
        received = args;
        return { status: 'shelved', from: 'ready-for-plan', to: 'backlog' };
      },
    },
  });
  assert.equal(result.status, 'shelved');
  assert.equal(received.refreshStaleBlockers, true);
});

test('Shelve reports the explicit stale-blocker migration in its success audit output', async () => {
  const result = await captureVerb(() =>
    verbShelve(['1215', '--reason', 'stale refinement', '--refresh-stale-blockers'], CFG, {
      withIssueLock: async (_options, fn) => fn(),
      assertBound: () => {},
      runTransaction: async (args) => {
        assert.equal(args.refreshStaleBlockers, true);
        return { status: 'shelved', from: 'ready-for-plan', to: 'backlog', tx: 'tx-1215' };
      },
    })
  );
  assert.match(result.stdout, /#1215 ready-for-plan → backlog/);
  assert.match(result.stdout, /schema-1 stale-blocker migration/i);
  assert.equal(result.exitCode, undefined);
});

test('strict Shelve argv retains deterministic unknown-argument refusal', () => {
  assert.throws(() => parseArgs(['1215', '--unexpected']), /unrecognized argument: --unexpected/);
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

test('Park retains alias-aware usage, success, and refusal diagnostics', async () => {
  const usage = await captureVerb(() => verbPark(['1215'], CFG));
  assert.match(usage.stderr, /Usage: park /);
  assert.doesNotMatch(usage.stderr, /Usage: shelve /);

  const success = await captureVerb(() =>
    verbPark(['1215', '--reason', 'stale refinement'], CFG, {
      withIssueLock: async (_options, fn) => fn(),
      assertBound: () => {},
      runTransaction: async () => ({
        status: 'shelved',
        from: 'refine',
        to: 'backlog',
        tx: 'tx-1215',
      }),
    })
  );
  assert.match(success.stdout, /^park: #1215 /);
  assert.doesNotMatch(success.stdout, /^shelve:/);

  const refusal = await captureVerb(() =>
    verbPark(['1215', '--reason', 'stale refinement'], CFG, {
      withIssueLock: async (_options, fn) => fn(),
      assertBound: () => {},
      runTransaction: async () => ({ status: 'foreign-owner-refused' }),
    })
  );
  assert.match(refusal.stderr, /^park: refused \(foreign-owner-refused\)/);
  assert.doesNotMatch(refusal.stderr, /^shelve:/);
});

test('direct Shelve and Park executable entrypoints are inert and require the hub', async () => {
  const projectDir = mkdtempProjectIsolated('aitm-shelve-direct-');
  try {
    for (const verb of ['shelve', 'park']) {
      await assert.rejects(
        pexec(
          process.execPath,
          [path.join(VERBS_DIR, `${verb}.mjs`), '1215', '--reason', 'must not execute'],
          {
            cwd: projectDir,
            env: { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: projectDir },
          }
        ),
        (error) => {
          assert.match(error.stderr, new RegExp(`^${verb}: direct execution refused`, 'i'));
          assert.match(error.stderr, new RegExp(`npx aitm ${verb}`, 'i'));
          return true;
        }
      );
    }
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
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
  let lockActive = false;
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
        lockActive = true;
        try {
          return await fn();
        } finally {
          lockActive = false;
        }
      },
      runTransaction: async () => {
        assert.equal(lockActive, true);
        return {
          status: 'shelved',
          from: 'refine',
          to: 'backlog',
          tx: 'tx-1215',
        };
      },
    });
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = originalExitCode;
  }
  assert.deepEqual(calls[0], ['lock', { issue: 1215, verb: 'shelve', projDir: '/project' }]);
  assert.deepEqual(calls[1], ['bound', 1215]);
  assert.equal(lockActive, false);
});
