#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/test.mjs — the sandboxed /task test
// runner (#137). All I/O is stubbed; no real worktree, npm, or gh.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';

import { runVerbTest, buildPassedMessage } from '../verbs/test.mjs';
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

test('verbTest: no-vc body returns no-vc status (does not create worktree)', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    deps.fetchBody = async () => '## Scope\n\nno VC section here.\n';
    const r = await runVerbTest({ cfg, issueNumber: 137, projectDir, deps });
    assert.equal(r.status, 'no-vc');
    assert.equal(calls.worktreesCreated, 0);
    assert.equal(calls.worktreesRemoved, 0);
    // #386 — the no-vc path must be a LOUD refusal, not a benign
    // "nothing to verify" shrug: the message names the refusal and the
    // missing section so an orchestrator cannot mistake it for a green run.
    assert.match(r.message, /REFUSING/);
    assert.match(r.message, /Verification Commands/);
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

// #270 — Gate-first ordering: every body write happens BEFORE moveState, and
// every write goes through `mutateBody` (which re-fetches FRESH base inside
// the helper). The #210 read-modify-write hazard is structurally impossible
// in the gate-first flow because moveState is the last side-effect — there
// is no post-move body write to clobber the `aitm-last-known-state` marker.
test('verbTest #270: gate-first flow stamps dod-verified BEFORE moveState (no post-move body write to clobber)', async () => {
  await withTmpDir(async (projectDir) => {
    const events = [];
    const baseBody = bodyWithVc(['npm test']);
    const preTransitionBody = `<!-- aitm-last-known-state: develop -->\n${baseBody}`;
    const deps = {
      fetchBody: async () => preTransitionBody,
      mutateBody: async ({ mutate }) => {
        const next = mutate(preTransitionBody);
        if (next === preTransitionBody) return { status: 'no-op' };
        events.push({ kind: 'write', body: next });
        return { status: 'ok' };
      },
      postComment: async () => {},
      getHeadSha: async () => 'sha12345',
      createWorktree: async () => {},
      removeWorktree: async () => {},
      seedWorktree: async () => {},
      npmCi: async () => {},
      execInSandbox: async () => ({ exit: 0, stdout: '', stderr: '' }),
      moveState: async ({ target }) => {
        events.push({ kind: 'move', target });
      },
      logIssueTime: async () => {},
    };

    const r = await runVerbTest({ cfg, issueNumber: 270, projectDir, deps });
    assert.equal(r.status, 'passed');

    // Locate the dod-verified write and the test-move. The write MUST precede
    // the move — that is the whole point of gate-first.
    const moveIdx = events.findIndex((e) => e.kind === 'move' && e.target === 'test');
    const dodIdx = events.findIndex(
      (e) => e.kind === 'write' && /aitm-dod-verified[: ]/.test(e.body)
    );
    assert.ok(moveIdx >= 0, 'expected a moveState→test call');
    assert.ok(dodIdx >= 0, 'expected a body write containing aitm-dod-verified');
    assert.ok(
      dodIdx < moveIdx,
      `gate-first: dod-verified write (idx ${dodIdx}) must precede moveState→test (idx ${moveIdx})`
    );
    // No body writes after the move.
    const writesAfterMove = events.slice(moveIdx + 1).filter((e) => e.kind === 'write');
    assert.equal(
      writesAfterMove.length,
      0,
      'gate-first: no body writes after moveState — nothing can clobber post-transition markers'
    );
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
    // #270 — gate-first: red verdict means no moveState call ever happened.
    assert.deepEqual(calls.moves, []);
    assert.match(calls.comments[0], /MISSING_ENV not set/);
  });
});
