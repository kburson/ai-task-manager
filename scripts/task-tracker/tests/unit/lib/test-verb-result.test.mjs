// @story #310
// Unit tests for scripts/task-tracker/verbs/test.mjs — the sandboxed /task test
// runner (#137). All I/O is stubbed; no real worktree, npm, or gh.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

import { runVerbTest, buildPassedMessage, buildReverifiedMessage } from '../../../verbs/test.mjs';
import { parseVerificationCommands } from '../../../lib/verification-commands.mjs';
import { hasDodVerifiedMarker, parseDodVerifiedMarker } from '../../../lib/markers.mjs';

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

// #406 — noisy-success regression. `runVerbTest` must treat the structured
// `moveState` result as authoritative: a genuine refusal (ok:false and not the
// benign done→done self-loop) yields a distinct `move-failed` status so the
// caller suppresses the "verified in sandbox — moved to Test" banner. The
// sandbox itself genuinely passed, so the green table and time-log still fire.
test('verbTest #406: sandbox green but moveState refuses → status move-failed, no passed banner', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    deps.moveState = async ({ target }) => {
      calls.moves.push(target);
      return {
        ok: false,
        benign: false,
        status: 5,
        stderr: '⛔ illegal-transition: develop → test refused',
      };
    };
    const r = await runVerbTest({ cfg, issueNumber: 406, projectDir, deps });
    assert.equal(r.status, 'move-failed', 'refused move must NOT report passed');
    assert.equal(r.move.status, 5, 'carries the move-state child exit code');
    assert.match(r.move.stderr, /illegal-transition/, 'carries the real refusal reason');
    // Sandbox genuinely passed: green table posted and time logged before the
    // move was attempted.
    assert.equal(calls.comments.length, 1);
    assert.match(calls.comments[0], /Sandboxed verification passed/);
    assert.deepEqual(calls.logs, ['406']);
  });
});

// #444 — a benign move result from the test verb can only be a test→test
// self-loop (the verb always targets 'test'), which is the supported in-place
// re-verify path: the sandbox already re-ran the current VC set; the board
// column stays put. This must NOT be a failure and must NOT claim a fresh
// develop→test promotion — it returns the distinct `reverified` status.
test('verbTest #444: benign test→test self-loop → status reverified (in-place re-verify)', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    deps.moveState = async ({ target }) => {
      calls.moves.push(target);
      return {
        ok: false,
        benign: true,
        status: 5,
        stderr: '⛔ illegal transition: test → test. Allowed: review, develop.',
      };
    };
    const r = await runVerbTest({ cfg, issueNumber: 444, projectDir, deps });
    assert.equal(r.status, 'reverified', 'benign test→test self-loop is an in-place re-verify');
    assert.equal(r.target, 'test');
    // AC2 — the re-verify exercised the full VC set and re-stamped results:
    // the green table is posted and time is logged on the same path as a fresh
    // develop→test pass.
    assert.equal(calls.comments.length, 1);
    assert.match(calls.comments[0], /Sandboxed verification passed/);
    assert.deepEqual(calls.logs, ['444']);
  });
});

test('verbTest #406: structured ok:true move → status passed', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps, calls } = makeDeps();
    deps.moveState = async ({ target }) => {
      calls.moves.push(target);
      return { ok: true, status: 0 };
    };
    const r = await runVerbTest({ cfg, issueNumber: 406, projectDir, deps });
    assert.equal(r.status, 'passed');
  });
});

test('verbTest #406: legacy stub moveState returning undefined still reports passed', async () => {
  await withTmpDir(async (projectDir) => {
    // makeDeps()'s default moveState returns undefined — only an explicit
    // ok===false is treated as a failure, so existing stubs keep passing.
    const { deps } = makeDeps();
    const r = await runVerbTest({ cfg, issueNumber: 406, projectDir, deps });
    assert.equal(r.status, 'passed');
  });
});

test('#1015 successful Test entry posts the New Automated Tests report', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps } = makeDeps();
    const posts = [];
    deps.moveState = async () => ({ ok: true, status: 0 });
    deps.postNewAutomatedTestsComment = async (args) => {
      posts.push(args);
      return { status: 'posted' };
    };

    const r = await runVerbTest({ cfg, issueNumber: 1015, projectDir, deps });

    assert.equal(r.status, 'passed');
    assert.deepEqual(r.newTestsPost, { status: 'posted' });
    assert.deepEqual(posts, [{ cfg, issueNumber: '1015', cwd: projectDir }]);
  });
});

test('#1015 Test self-loop runs the idempotent New Automated Tests poster', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps } = makeDeps();
    let postCalls = 0;
    deps.moveState = async () => ({ ok: true, noop: true, status: 0 });
    deps.postNewAutomatedTestsComment = async () => {
      postCalls += 1;
      return { status: 'duplicate' };
    };

    const r = await runVerbTest({ cfg, issueNumber: 1015, projectDir, deps });

    assert.equal(r.status, 'reverified');
    assert.deepEqual(r.newTestsPost, { status: 'duplicate' });
    assert.equal(postCalls, 1);
  });
});

test('#1015 New Automated Tests post failure does not reverse a successful Test entry', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps } = makeDeps();
    deps.moveState = async () => ({ ok: true, status: 0 });
    deps.postNewAutomatedTestsComment = async () => {
      throw new Error('comment API unavailable');
    };

    const r = await runVerbTest({ cfg, issueNumber: 1015, projectDir, deps });

    assert.equal(r.status, 'passed');
    assert.deepEqual(r.newTestsPost, {
      status: 'post-failed',
      error: 'comment API unavailable',
    });
  });
});

test('#1015 refused Test move does not post New Automated Tests', async () => {
  await withTmpDir(async (projectDir) => {
    const { deps } = makeDeps();
    let postCalls = 0;
    deps.moveState = async () => ({ ok: false, benign: false, status: 5 });
    deps.postNewAutomatedTestsComment = async () => {
      postCalls += 1;
      return { status: 'posted' };
    };

    const r = await runVerbTest({ cfg, issueNumber: 1015, projectDir, deps });

    assert.equal(r.status, 'move-failed');
    assert.equal(r.newTestsPost, undefined);
    assert.equal(postCalls, 0);
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
