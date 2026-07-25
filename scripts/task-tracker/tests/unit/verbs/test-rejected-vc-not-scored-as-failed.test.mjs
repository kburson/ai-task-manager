// cspell:ignore metachar
// @story #973
// A VC blocked by the security allowlist (`rejected`, before execution) must
// not be scored the same as a VC that ran and returned nonzero (`failed`).
// Regression for the promote gate that folded both into one failure count.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

import { runVerbTest } from '../../../verbs/test.mjs';

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

function makeDeps() {
  const calls = { comments: [], moves: [] };
  const deps = {
    fetchBody: async () => bodyWithVc(['npm run lint', 'npm install']),
    mutateBody: async ({ mutate }) => {
      const base = await deps.fetchBody();
      const next = mutate(base);
      return next === base ? { status: 'no-op' } : { status: 'ok' };
    },
    postComment: async ({ body }) => {
      calls.comments.push(body);
    },
    getHeadSha: async () => 'abc1234deadbeef',
    createWorktree: async () => {},
    removeWorktree: async () => {},
    npmCi: async () => {},
    execInSandbox: async () => ({ exit: 0, stdout: '', stderr: '' }),
    moveState: async ({ target }) => {
      calls.moves.push(target);
    },
    logIssueTime: async () => {},
  };
  return { calls, deps };
}

function withTmpDir(fn) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'test-rejected-vc-'));
  return Promise.resolve(fn(dir)).finally(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
}

test('runVerbTest: an allowlist-rejected VC alongside a passing VC yields status "passed", not "failed"', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    const r = await runVerbTest({ cfg, issueNumber: 973, projectDir, deps });
    assert.equal(r.status, 'passed');
    assert.equal(calls.moves[0], 'test');
    const comment = calls.comments[0];
    assert.match(comment, /Sandboxed verification passed/);
    // #973 AC2 — the rejection is still visibly surfaced, not silently dropped.
    assert.match(comment, /⚠/);
    assert.match(comment, /npm install/);
  });
});

test('runVerbTest: an allowlist-rejected VC alone (no other commands) yields status "passed"', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps } = makeDeps();
    deps.fetchBody = async () => bodyWithVc(['npm install']);
    const r = await runVerbTest({ cfg, issueNumber: 973, projectDir, deps });
    assert.equal(r.status, 'passed');
  });
});

test('runVerbTest: a genuine nonzero-exit failure alongside a rejected VC still yields status "failed"', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps } = makeDeps();
    deps.fetchBody = async () => bodyWithVc(['npm run lint', 'npm install']);
    deps.execInSandbox = async () => ({ exit: 1, stdout: '', stderr: 'lint broke' });
    const r = await runVerbTest({ cfg, issueNumber: 973, projectDir, deps });
    assert.equal(r.status, 'failed');
  });
});

// #973 — a rejection from the shell-metachar/injection scan (as opposed to a
// per-bin shape mismatch like `npm install`) must NOT be excluded from the
// gate. Regression guard for story #137's security invariant: a blocked
// injection payload must still report the run as failed, not passed.
test('runVerbTest: a metacharacter/injection-vector rejection is NOT excluded from the gate — status stays "failed"', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps } = makeDeps();
    deps.fetchBody = async () => bodyWithVc(['node --version', 'node x; touch PWNED']);
    const r = await runVerbTest({ cfg, issueNumber: 973, projectDir, deps });
    assert.equal(r.status, 'failed');
  });
});
