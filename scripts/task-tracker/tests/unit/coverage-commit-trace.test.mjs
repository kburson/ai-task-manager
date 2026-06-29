#!/usr/bin/env node
// @story #611
// Coverage tests for scripts/task-tracker/verbs/commit-trace.mjs.
//
// Two exported functions:
//   - runCommitTrace({issueNumber,cfg,projectDir,deps}) — pure orchestration
//     with injectable `gitInfo` / `postCommitTrail` deps. Tested directly: the
//     happy path, both required-arg throws, the `#`-prefix normalization, and
//     the `getProjectDir()` cwd fallback.
//   - verbCommitTrace(ctx) — the CLI verb. Its usage (no target) and catch
//     (runCommitTrace throws) branches are driven by trapping `process.exit`
//     with an ExitError sentinel; cfg without a repo makes runCommitTrace throw
//     synchronously, so the catch path is exercised without any real `gh` call.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';

import { runCommitTrace, verbCommitTrace } from '../../verbs/commit-trace.mjs';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

const tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'commit-trace-cov-'));

let stateCounter = 0;
function stateFile(active) {
  const p = path.join(tmpRoot, `state-${stateCounter++}.json`);
  writeFileSync(p, JSON.stringify({ active, lastActive: active }));
  return p;
}

class ExitError extends Error {
  constructor(code) {
    super(`exit(${code})`);
    this.code = code;
  }
}

async function runVerb(ctx) {
  const realExit = process.exit;
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  try {
    await verbCommitTrace(ctx);
    return { exitCode: null };
  } catch (err) {
    if (err instanceof ExitError) return { exitCode: err.code };
    throw err;
  } finally {
    process.exit = realExit;
  }
}

// ===========================================================================
// runCommitTrace
// ===========================================================================

test('runCommitTrace: happy path threads info through injected deps', async () => {
  const calls = {};
  const result = await runCommitTrace({
    issueNumber: 42,
    cfg: { repo: 'o/r' },
    projectDir: '/tmp/proj',
    deps: {
      gitInfo: async (cwd) => {
        calls.cwd = cwd;
        return { sha: 'abc123', subject: 'feat: x' };
      },
      postCommitTrail: async (args) => {
        calls.post = args;
        return { action: 'created' };
      },
    },
  });
  assert.equal(result.action, 'created');
  assert.equal(calls.cwd, '/tmp/proj');
  assert.equal(calls.post.issueNumber, '42');
  assert.equal(calls.post.repo, 'o/r');
  assert.deepEqual(calls.post.info, { sha: 'abc123', subject: 'feat: x' });
});

test('runCommitTrace: strips leading # from issueNumber', async () => {
  let seen;
  await runCommitTrace({
    issueNumber: '#77',
    cfg: { repo: 'o/r' },
    projectDir: '/tmp/p',
    deps: {
      gitInfo: async () => ({}),
      postCommitTrail: async (args) => {
        seen = args.issueNumber;
        return { action: 'updated' };
      },
    },
  });
  assert.equal(seen, '77');
});

test('runCommitTrace: throws without issueNumber', async () => {
  await assert.rejects(() => runCommitTrace({ cfg: { repo: 'o/r' } }), /issueNumber is required/);
});

test('runCommitTrace: throws without cfg.repo', async () => {
  await assert.rejects(() => runCommitTrace({ issueNumber: 1 }), /cfg\.repo is required/);
  await assert.rejects(() => runCommitTrace({ issueNumber: 1, cfg: {} }), /cfg\.repo is required/);
});

test('runCommitTrace: falls back to getProjectDir() when projectDir omitted', async () => {
  let seenCwd;
  const result = await runCommitTrace({
    issueNumber: 5,
    cfg: { repo: 'o/r' },
    deps: {
      gitInfo: async (cwd) => {
        seenCwd = cwd;
        return {};
      },
      postCommitTrail: async () => ({ action: 'created' }),
    },
  });
  assert.equal(result.action, 'created');
  assert.equal(typeof seenCwd, 'string');
  assert.ok(seenCwd.length > 0);
});

// ===========================================================================
// verbCommitTrace
// ===========================================================================

test('verbCommitTrace: no target → usage, exit 1', async () => {
  const r = await runVerb({
    cfg: { repo: 'o/r' },
    statePath: stateFile(null),
    projectDir: tmpRoot,
    rest: [],
  });
  assert.equal(r.exitCode, 1);
});

test('verbCommitTrace: discover bucket active + no positional → usage, exit 1', async () => {
  const r = await runVerb({
    cfg: { repo: 'o/r' },
    statePath: stateFile('discover'),
    projectDir: tmpRoot,
    rest: [],
  });
  assert.equal(r.exitCode, 1);
});

test('verbCommitTrace: positional target but runCommitTrace throws → catch, exit 1', async () => {
  // cfg without repo makes runCommitTrace throw synchronously, so the catch
  // branch runs with no real gh side-effect.
  const r = await runVerb({
    cfg: {},
    statePath: stateFile(null),
    projectDir: tmpRoot,
    rest: ['#999'],
  });
  assert.equal(r.exitCode, 1);
});

test('verbCommitTrace: target resolved from state.active, then catch → exit 1', async () => {
  const r = await runVerb({
    cfg: {},
    statePath: stateFile('#321'),
    projectDir: tmpRoot,
    rest: [],
  });
  assert.equal(r.exitCode, 1);
});

console.log('coverage-commit-trace.test.mjs: defined');
