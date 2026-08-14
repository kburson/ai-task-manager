// @story #310 #1089
// Unit tests for scripts/task-tracker/verbs/test.mjs — the sandboxed /task test
// runner (#137). All I/O is stubbed; no real worktree, npm, or gh.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

import {
  runVerbTest,
  buildPassedMessage,
  buildReverifiedMessage,
} from '../../../../task-tracker/verbs/test.mjs';
import { parseVerificationCommands } from '../../../../task-tracker/lib/verification-commands.mjs';
import {
  hasDodVerifiedMarker,
  parseDodVerifiedMarker,
} from '../../../../task-tracker/lib/markers.mjs';

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
  const deps = {
    fetchBody: async () => bodyWithVc(['node scripts/run-tests.mjs', 'npm run lint']),
  };
  // #295 — verb writes via mutateBody({mutate}); closure runs on FRESH base
  // pulled from the current `deps.fetchBody` so tests that override it
  // (e.g. lifecycle pretick) see their override reflected in mutate's base.
  deps.mutateBody = async ({ mutate }) => {
    const base = await deps.fetchBody();
    const next = mutate(base);
    if (next === base) return { status: 'no-op' };
    calls.bodyWrites.push(next);
    return { status: 'ok' };
  };
  Object.assign(deps, {
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
  });
  return { calls, deps };
}

function withTmpDir(fn) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'test-verb-'));
  return Promise.resolve(fn(dir)).finally(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
}

test('buildPassedMessage: develop→test promotion success message names "Test", not "Review"', () => {
  // Regression for the leftover-rename bug: the test verb advances develop→test
  // (one forward step). The success line emitted by `/task test` must name the
  // resolved target ("Test"), never the old pre-rename target ("Review").
  const msg = buildPassedMessage(137, 'test');
  assert.match(msg, /moved to Test\b/, 'success message must say "moved to Test"');
  assert.doesNotMatch(msg, /moved to Review\b/, 'success message must NOT say "moved to Review"');
  assert.equal(msg, '✓ #137 verified in sandbox — moved to Test.');
});

test('buildReverifiedMessage #444: in-place re-verify banner is loud and does not claim a move', () => {
  const msg = buildReverifiedMessage(444);
  assert.match(msg, /re-verified in sandbox/, 'must announce a re-verify');
  assert.match(msg, /board unchanged/, 'must state the board column did not move');
  assert.doesNotMatch(msg, /moved to/, 'must NOT claim a develop→test promotion');
  assert.equal(
    msg,
    '✓ #444 re-verified in sandbox — already in Test (in-place re-verify, board unchanged).'
  );
});

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

test('verbTest: green path stamps marker, posts success comment, moves develop→test, logs time', async () => {
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
    assert.match(
      calls.bodyWrites[0],
      /aitm-test-started[: ]/,
      'entry marker stamped before sandbox'
    );
    assert.ok(
      !hasDodVerifiedMarker(calls.bodyWrites[0]),
      'dod-verified must NOT be present on entry write'
    );
    const stamped = calls.bodyWrites[calls.bodyWrites.length - 1];
    assert.ok(hasDodVerifiedMarker(stamped), 'body must carry dod-verified marker after green');
    // verbTest stamps the 'test' entry marker defensively (move-state.mjs is
    // the production source, but the stubbed moveState in this test does not
    // stamp markers). 'review' must NOT be stamped — verbTest stops at Test.
    assert.match(
      stamped,
      /aitm-entered-test(?::|\s+ts=")/,
      'must stamp aitm-entered-test on green'
    );
    assert.ok(
      !/aitm-entered-review(?::|\s+ts=")/.test(stamped),
      'aitm-entered-review must not be stamped by verbTest — Test→Review is a separate verb'
    );
    const parsed = parseDodVerifiedMarker(stamped);
    assert.equal(parsed.sha, 'abc1234deadbeef');
    assert.equal(parsed.ts, '2026-05-17T01:23:45.000Z');
    assert.equal(calls.comments.length, 1);
    assert.match(calls.comments[0], /Sandboxed verification passed/);
    assert.deepEqual(
      calls.moves,
      ['test'],
      'verbTest moves develop→test only; review is a separate verb'
    );
    assert.equal(
      r.target,
      'test',
      'result.target drives the success message — must be "test", not "review"'
    );
    assert.deepEqual(calls.logs, ['137']);
  });
});

test('verbTest #270: red path posts failure comment, does NOT move board, does NOT stamp dod marker', async () => {
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
    assert.match(
      calls.bodyWrites[0],
      /aitm-test-started[: ]/,
      'entry marker stamped before sandbox'
    );
    assert.ok(
      !hasDodVerifiedMarker(calls.bodyWrites[0]),
      'must NOT stamp dod-verified marker on red'
    );
    assert.equal(calls.comments.length, 1);
    assert.match(calls.comments[0], /Sandboxed verification failed/);
    assert.match(calls.comments[0], /boom/);
    // #270 — gate-first: board never moved on red, so nothing to undo.
    assert.deepEqual(
      calls.moves,
      [],
      'gate-first: moveState must not be called when sandbox is red'
    );
  });
});

test('verbTest: worktree cleanup runs even when sandbox exec throws', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps({ shouldThrowOnExec: true });
    await assert.rejects(() => runVerbTest({ cfg, issueNumber: 137, projectDir, deps }));
    assert.equal(calls.worktreesRemoved, 1, 'finally must remove worktree on exception');
  });
});

// #270 — Gate-first replaces the provisional-move-then-rollback flow from
// #210 Fix A. The sandbox runs while the board is still on `develop`; on any
// crash before a green/red verdict, no `moveState` call is ever made. The
// `test-aborted` audit comment must still be posted so operators have
// diagnostics.
test('verbTest #270: sandbox-setup crash → board stays on develop (no move) + posts test-aborted audit', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    // Override createWorktree to throw — simulates a sandbox-setup failure
    // (the most likely real-world cause of an exit-1 mid-test).
    deps.createWorktree = async () => {
      throw new Error('worktree create failed');
    };
    await assert.rejects(() => runVerbTest({ cfg, issueNumber: 2102, projectDir, deps }));
    assert.deepEqual(
      calls.moves,
      [],
      'gate-first: setup crash must not call moveState — board stays on develop'
    );
    assert.ok(
      calls.comments.some((c) => /test-aborted/.test(c) && /aitm-test-aborted/.test(c)),
      'must post a `test-aborted` audit comment on sandbox-setup failure'
    );
  });
});

test('verbTest #270: sandbox-exec crash → board stays on develop (no move)', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps({ shouldThrowOnExec: true });
    await assert.rejects(() => runVerbTest({ cfg, issueNumber: 2103, projectDir, deps }));
    assert.deepEqual(
      calls.moves,
      [],
      'gate-first: exec crash must not call moveState — board stays on develop'
    );
  });
});
