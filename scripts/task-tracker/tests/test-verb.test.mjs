#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/test.mjs — the sandboxed /task test
// runner (#137). All I/O is stubbed; no real worktree, npm, or gh.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { runVerbTest } from '../verbs/test.mjs';
import { parseVerificationCommands } from '../lib/verification-commands.mjs';
import { hasDodVerifiedMarker, parseDodVerifiedMarker } from '../lib/markers.mjs';

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

function makeDeps({ execResults = {}, shouldThrowOnExec = false } = {}) {
  const calls = {
    moves: [],
    logs: [],
    comments: [],
    bodyWrites: [],
    sandboxRuns: [],
    worktreesCreated: 0,
    worktreesRemoved: 0,
    npmCiCalls: 0,
  };
  return {
    calls,
    deps: {
      fetchBody: async () => bodyWithVc(['node scripts/run-tests.mjs', 'npm run lint']),
      writeBody: async ({ body }) => {
        calls.bodyWrites.push(body);
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
      seedWorktree: async () => {},
      npmCi: async () => {
        calls.npmCiCalls++;
      },
      execInSandbox: async ({ argv }) => {
        calls.sandboxRuns.push(argv.join(' '));
        if (shouldThrowOnExec) throw new Error('sandbox boom');
        const key = argv.join(' ');
        const r = execResults[key];
        if (r) return r;
        return { exit: 0, stdout: '', stderr: '' };
      },
      moveState: async ({ target }) => {
        calls.moves.push(target);
      },
      logIssueTime: async (n) => {
        calls.logs.push(n);
      },
    },
  };
}

function withTmpDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'test-verb-'));
  return Promise.resolve(fn(dir)).finally(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
}

test('parseVerificationCommands: extracts VC checkboxes only, in order', () => {
  const body = [
    '## Acceptance Criteria',
    '- [x] `should not be picked up`',
    '',
    '## Verification Commands',
    '',
    '- [ ] `node scripts/run-tests.mjs`',
    '- [x] `npm run lint`',
    '- [ ] not a backtick command',
    '',
    '## Plan',
    '- [ ] `should not be picked up either`',
  ].join('\n');
  const vcs = parseVerificationCommands(body);
  assert.equal(vcs.length, 2);
  assert.equal(vcs[0].command, 'node scripts/run-tests.mjs');
  assert.equal(vcs[0].checked, false);
  assert.equal(vcs[1].command, 'npm run lint');
  assert.equal(vcs[1].checked, true);
});

test('verbTest: green path stamps marker, posts success comment, moves test→review, logs time', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    const r = await runVerbTest({
      cfg,
      issueNumber: 137,
      projectDir,
      deps,
      now: () => '2026-05-17T01:23:45.000Z',
    });
    assert.equal(r.status, 'passed');
    assert.equal(calls.worktreesCreated, 1);
    assert.equal(calls.worktreesRemoved, 1);
    assert.equal(calls.npmCiCalls, 1);
    assert.equal(calls.sandboxRuns.length, 2);
    // Two writes: aitm-test-started (entry, before sandbox) + aitm-dod-verified (exit, on green).
    assert.equal(calls.bodyWrites.length, 2);
    assert.match(calls.bodyWrites[0], /aitm-test-started:/, 'entry marker stamped before sandbox');
    assert.ok(
      !hasDodVerifiedMarker(calls.bodyWrites[0]),
      'dod-verified must NOT be present on entry write'
    );
    const stamped = calls.bodyWrites[calls.bodyWrites.length - 1];
    assert.ok(hasDodVerifiedMarker(stamped), 'body must carry dod-verified marker after green');
    assert.match(stamped, /aitm-entered-test:/, 'must stamp aitm-entered-test on green');
    assert.match(stamped, /aitm-entered-review:/, 'must stamp aitm-entered-review on green');
    const parsed = parseDodVerifiedMarker(stamped);
    assert.equal(parsed.sha, 'abc1234deadbeef');
    assert.equal(parsed.ts, '2026-05-17T01:23:45.000Z');
    assert.equal(calls.comments.length, 1);
    assert.match(calls.comments[0], /Sandboxed verification passed/);
    assert.deepEqual(calls.moves, ['test', 'review']);
    assert.deepEqual(calls.logs, ['137']);
  });
});

test('verbTest: red path posts failure comment, rolls back to develop, does NOT stamp marker', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps({
      execResults: {
        'node scripts/run-tests.mjs': { exit: 1, stdout: 'output line\n', stderr: 'boom\n' },
      },
    });
    const r = await runVerbTest({
      cfg,
      issueNumber: 137,
      projectDir,
      deps,
    });
    assert.equal(r.status, 'failed');
    assert.equal(calls.worktreesRemoved, 1, 'worktree must be cleaned up on red');
    // Entry marker (aitm-test-started) is stamped before sandbox runs — survives on red.
    // The dod-verified exit marker must NOT be stamped on red.
    assert.equal(calls.bodyWrites.length, 1, 'only entry marker write on red');
    assert.match(calls.bodyWrites[0], /aitm-test-started:/, 'entry marker stamped before sandbox');
    assert.ok(
      !hasDodVerifiedMarker(calls.bodyWrites[0]),
      'must NOT stamp dod-verified marker on red'
    );
    assert.equal(calls.comments.length, 1);
    assert.match(calls.comments[0], /Sandboxed verification failed/);
    assert.match(calls.comments[0], /boom/);
    assert.deepEqual(calls.moves, ['test', 'develop']);
  });
});

test('verbTest: worktree cleanup runs even when sandbox exec throws', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps({ shouldThrowOnExec: true });
    await assert.rejects(() => runVerbTest({ cfg, issueNumber: 137, projectDir, deps }));
    assert.equal(calls.worktreesRemoved, 1, 'finally must remove worktree on exception');
  });
});

test('verbTest: no-vc body returns no-vc status (does not create worktree)', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    deps.fetchBody = async () => '## Scope\n\nno VC section here.\n';
    const r = await runVerbTest({ cfg, issueNumber: 137, projectDir, deps });
    assert.equal(r.status, 'no-vc');
    assert.equal(calls.worktreesCreated, 0);
    assert.equal(calls.worktreesRemoved, 0);
  });
});

test('verbTest: detects lifecycle pretick → un-ticks, writes body, posts regression comment (#139)', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    const prebody = [
      '## Scope',
      'x',
      '',
      '## Verification Commands',
      '- [ ] `node scripts/run-tests.mjs`',
      '',
      '#### Lifecycle (auto-ticked at Review/Close)',
      '- [x] Passed final human review',
      '- [x] Story closed and moved to Done',
      '- [ ] Timing data flushed to issue',
      '',
    ].join('\n');
    deps.fetchBody = async () => prebody;
    const r = await runVerbTest({ cfg, issueNumber: 139, projectDir, deps });
    assert.equal(r.status, 'passed');
    const regressionComment = calls.comments.find((c) => /Lifecycle DoD regression/.test(c));
    assert.ok(regressionComment, 'must post regression comment when pretick detected');
    assert.match(regressionComment, /Passed final human review/);
    assert.match(regressionComment, /Story closed and moved to Done/);
    // First body write is the pretick un-tick; later writes contain markers.
    assert.ok(calls.bodyWrites.length >= 2, 'pretick un-tick + green-path marker stamp');
    assert.match(calls.bodyWrites[0], /- \[ \] Passed final human review/);
    assert.match(calls.bodyWrites[0], /- \[ \] Story closed and moved to Done/);
  });
});

test('verbTest: no pretick → no regression comment posted (#139)', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    const r = await runVerbTest({ cfg, issueNumber: 139, projectDir, deps });
    assert.equal(r.status, 'passed');
    assert.equal(calls.comments.filter((c) => /Lifecycle DoD regression/.test(c)).length, 0);
  });
});

test('verbTest: sandbox isolation — locally-passing env-dependent command fails in sandbox', async () => {
  // Models the spec: a command that relies on a local-only env var passes
  // when run in the author's shell but fails in the clean worktree. We do
  // not check process.env here — we just verify that the sandbox exec stub
  // is the source of truth (no fallback to host-side execution).
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps({
      execResults: {
        'node scripts/run-tests.mjs': { exit: 2, stdout: '', stderr: 'MISSING_ENV not set' },
      },
    });
    const r = await runVerbTest({ cfg, issueNumber: 137, projectDir, deps });
    assert.equal(r.status, 'failed');
    assert.deepEqual(calls.moves, ['test', 'develop']);
    assert.match(calls.comments[0], /MISSING_ENV not set/);
  });
});
