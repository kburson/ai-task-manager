#!/usr/bin/env node
// @story #1261
// promote → test delegation must not self-deadlock — #1261.
//
// This is the end-to-end shape of the reported p0: `verbPromote` holds
// `withIssueLock({issue, verb: 'promote'})` for its entire run, and inside it
// the develop→test delegate calls `runTestWithEntryInterlock`, which acquires
// the same per-issue lock with `retries: 0`. Both locks are in the path here —
// the real `withIssueLock` on both sides, only the terminal `runVerbTest` body
// stubbed — so the assertion is that the delegate body actually executes rather
// than dying on `IssueLockError` before it starts.
//
// The companion unit coverage of the primitive itself lives in
// `../lib/issue-lock-reentrancy.test.mjs`.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  ISSUE_LOCK_HELD_ENV,
  issueLockPath,
  withIssueLock,
} from '../../../../task-tracker/issue-mutator-lock.mjs';
import { runTestWithEntryInterlock } from '../../../../task-tracker/verbs/test.mjs';

const ISSUE = 1261;

function freshProjDir(label) {
  const dir = path.join(
    projectScratchDir('inspect'),
    `promote-test-delegation-${label}-${process.pid}`
  );
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

// This suite can itself run inside a held frame (the `/task test` sandbox is
// spawned under promote's lock), so scrub the inherited flag before asserting.
function withScrubbedEnv(fn) {
  const prior = process.env[ISSUE_LOCK_HELD_ENV];
  delete process.env[ISSUE_LOCK_HELD_ENV];
  try {
    return fn();
  } finally {
    if (prior === undefined) delete process.env[ISSUE_LOCK_HELD_ENV];
    else process.env[ISSUE_LOCK_HELD_ENV] = prior;
  }
}

test('the test delegate runs inside promote-held lock instead of deadlocking', async () => {
  await withScrubbedEnv(async () => {
    const projectDir = freshProjDir('delegate');
    const lockPath = issueLockPath(ISSUE, projectDir);
    let delegateRan = false;

    const result = await withIssueLock({ issue: ISSUE, verb: 'promote', projDir: projectDir }, () =>
      runTestWithEntryInterlock({
        cfg: { repo: 'kburson/ai-task-manager' },
        issueNumber: ISSUE,
        projectDir,
        deps: {
          runVerbTest: async ({ issueNumber, projectDir: dir }) => {
            delegateRan = true;
            assert.equal(issueNumber, ISSUE);
            assert.equal(dir, projectDir);
            assert.equal(existsSync(lockPath), true, 'promote still holds the lock');
            return { status: 'ok' };
          },
        },
      })
    );

    assert.equal(delegateRan, true, 'delegate body executed — no IssueLockError');
    assert.deepEqual(result, { status: 'ok' }, 'the delegate result propagates to promote');
    assert.equal(existsSync(lockPath), false, 'promote released the lock on exit');
  });
});

test('the test delegate still acquires for real when promote is not holding', async () => {
  await withScrubbedEnv(async () => {
    const projectDir = freshProjDir('standalone');
    const lockPath = issueLockPath(ISSUE, projectDir);
    let delegateRan = false;

    // A direct `npx aitm test <N>` has no outer frame: the #1169 entry
    // interlock must still take the lock for real.
    await runTestWithEntryInterlock({
      cfg: { repo: 'kburson/ai-task-manager' },
      issueNumber: ISSUE,
      projectDir,
      deps: {
        runVerbTest: async () => {
          delegateRan = true;
          assert.equal(existsSync(lockPath), true, 'delegate holds the lock itself');
          return { status: 'ok' };
        },
      },
    });

    assert.equal(delegateRan, true);
    assert.equal(existsSync(lockPath), false, 'and releases it');
  });
});

test('a promote frame on a different issue does not wave the delegate through', async () => {
  await withScrubbedEnv(async () => {
    const projectDir = freshProjDir('cross-issue');
    const ownLock = issueLockPath(ISSUE, projectDir);

    await withIssueLock({ issue: 871, verb: 'promote', projDir: projectDir }, () =>
      runTestWithEntryInterlock({
        cfg: { repo: 'kburson/ai-task-manager' },
        issueNumber: ISSUE,
        projectDir,
        deps: {
          runVerbTest: async () => {
            assert.equal(existsSync(ownLock), true, 'the #1261 delegate took its own lock');
            return { status: 'ok' };
          },
        },
      })
    );

    assert.equal(existsSync(ownLock), false);
  });
});
