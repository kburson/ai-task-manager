#!/usr/bin/env node
// #254 — Unit tests for the bounded setup retry + durable abort diagnostics
// added to scripts/task-tracker/verbs/test.mjs.
//
// Covers three behaviors:
//   1. retry-then-succeed — a transient `npm ci` throw on the first attempt is
//      retried and the run still reaches `test` (status `passed`).
//   2. real-red first occurrence — a genuine verification red (execInSandbox
//      returns exit 1) rolls the board back on the FIRST occurrence; the VC is
//      run exactly once (reds are never retried).
//   3. durable diagnostics — when every setup attempt fails, the `test-aborted`
//      audit comment carries the failing step, exit code, and stderr tail, and
//      the verb re-throws.
//
// All I/O is stubbed; no real worktree, npm, or gh.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';

import { runVerbTest } from '../verbs/test.mjs';

const cfg = { repo: 'o/r' };

function bodyWithVc(commands) {
  const items = commands.map((c) => `- [ ] \`${c}\``).join('\n');
  return [
    '## Scope',
    'stuff',
    '',
    '## Verification Commands',
    items,
    '',
    '## Plan Metadata',
    '',
  ].join('\n');
}

// A transient-shaped error mirroring how execFile rejects (numeric `.code`
// exit, populated `.stderr`).
function transientError(message, { code = 1, stderr = '' } = {}) {
  const err = new Error(message);
  err.code = code;
  err.stderr = stderr;
  return err;
}

function makeDeps({
  commands = ['node scripts/run-tests.mjs', 'npm run lint'],
  execResults = {},
  npmCiFailTimes = 0,
  npmCiError = () => transientError('npm ci transient', { code: 1, stderr: 'registry 503\n' }),
} = {}) {
  const calls = {
    moves: [],
    comments: [],
    bodyWrites: [],
    sandboxRuns: [],
    worktreesCreated: 0,
    worktreesRemoved: 0,
    npmCiCalls: 0,
    seedCalls: 0,
  };
  let npmCiFailsRemaining = npmCiFailTimes;
  return {
    calls,
    deps: {
      fetchBody: async () => bodyWithVc(commands),
      // #295 — closure form. base built from same fixture.
      mutateBody: async ({ mutate }) => {
        const base = bodyWithVc(commands);
        const next = mutate(base);
        if (next === base) return { status: 'no-op' };
        calls.bodyWrites.push(next);
        return { status: 'ok' };
      },
      postComment: async ({ body }) => {
        calls.comments.push(body);
      },
      getHeadSha: async () => 'abc1234deadbeef',
      createWorktree: async () => {
        calls.worktreesCreated++;
      },
      removeWorktree: async () => {
        calls.worktreesRemoved++;
      },
      seedWorktree: async () => {
        calls.seedCalls++;
      },
      npmCi: async () => {
        calls.npmCiCalls++;
        if (npmCiFailsRemaining > 0) {
          npmCiFailsRemaining--;
          throw npmCiError();
        }
      },
      execInSandbox: async ({ argv }) => {
        const key = argv.join(' ');
        calls.sandboxRuns.push(key);
        return execResults[key] || { exit: 0, stdout: '', stderr: '' };
      },
      moveState: async ({ target }) => {
        calls.moves.push(target);
      },
      logIssueTime: async () => {},
    },
  };
}

function withTmpDir(fn) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'test-verb-retry-'));
  return Promise.resolve(fn(dir)).finally(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
}

test('retry-then-succeed: transient npm ci failure is retried, run reaches Test', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps({ npmCiFailTimes: 1 });
    const r = await runVerbTest({
      cfg,
      issueNumber: 254,
      projectDir,
      deps,
      now: () => '2026-06-01T21:30:00.000Z',
    });
    assert.equal(r.status, 'passed', 'a single transient setup failure must not abort the run');
    assert.equal(calls.npmCiCalls, 2, 'npm ci must be retried once (fail then succeed)');
    assert.equal(calls.worktreesCreated, 2, 'setup chain re-runs on retry (fresh worktree add)');
    assert.deepEqual(calls.moves, ['test'], 'green path advances develop→test only, no rollback');
    assert.ok(
      !calls.comments.some((c) => /test-aborted/.test(c)),
      'a recovered transient failure must not leave a test-aborted comment'
    );
  });
});

test('real-red first occurrence: a genuine verification red rolls back without retry', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps({
      commands: ['node scripts/run-tests.mjs'],
      execResults: {
        'node scripts/run-tests.mjs': { exit: 1, stdout: 'out\n', stderr: 'assertion failed\n' },
      },
    });
    const r = await runVerbTest({ cfg, issueNumber: 254, projectDir, deps });
    assert.equal(r.status, 'failed', 'a real red must fail the run');
    assert.equal(
      calls.sandboxRuns.length,
      1,
      'the failing VC must run exactly once — reds are never retried'
    );
    assert.equal(
      calls.npmCiCalls,
      1,
      'setup must not retry when the failure is a verification red'
    );
    assert.deepEqual(calls.moves, ['test', 'develop'], 'red rolls the board back to develop');
    assert.ok(
      !calls.comments.some((c) => /test-aborted/.test(c)),
      'a red is a normal result, not an abort — no test-aborted comment'
    );
  });
});

test('durable diagnostics: exhausted setup retries record step + exit + stderr tail and re-throw', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps({
      npmCiFailTimes: 99, // never succeeds — exhaust all attempts
      npmCiError: () =>
        transientError('npm ci boom', {
          code: 137,
          stderr: 'npm ERR! network timeout\nnpm ERR! registry unreachable\n',
        }),
    });
    await assert.rejects(
      () => runVerbTest({ cfg, issueNumber: 254, projectDir, deps }),
      'setup that never recovers must surface a non-zero exit (re-throw)'
    );
    assert.equal(calls.npmCiCalls, 3, 'setup must be attempted exactly SETUP_MAX_ATTEMPTS times');
    const aborted = calls.comments.find((c) => /test-aborted/.test(c));
    assert.ok(aborted, 'must post a durable test-aborted diagnostics comment');
    assert.match(aborted, /Failed step:\*\*\s*`npm ci`/, 'comment names the failing step');
    assert.match(aborted, /Exit code:\*\*\s*`137`/, 'comment records the exit code');
    assert.match(aborted, /registry unreachable/, 'comment includes the stderr tail');
    assert.match(aborted, /Attempts:\*\*\s*3\/3/, 'comment records the attempt count');
    assert.match(aborted, /aitm-test-aborted/, 'comment carries the audit marker');
    assert.deepEqual(
      calls.moves,
      ['test', 'develop'],
      'aborted setup rolls the board back to develop'
    );
  });
});

console.log('test-verb-retry.test.mjs: all tests registered');
