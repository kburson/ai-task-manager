#!/usr/bin/env node
// @story #1261
// withIssueLock re-entrancy — #1261.
//
// `promote` wraps its whole run in `withIssueLock`, then spawns the `test`
// delegate, which acquires the SAME per-issue lock with `retries: 0`. Before
// this fix `withIssueLock` published `AITM_ISSUE_LOCK_HELD` but never read it,
// so the delegate's `mkdirSync` hit `EEXIST`, `tryReclaimStale` refused (the
// holder PID is the live parent), and the child threw `IssueLockError` on its
// first attempt — a deterministic self-deadlock that blocked every Develop →
// Test transition.
//
// The escape has to be issue-SCOPED: a bare boolean would let a nested
// acquisition for issue #B run unlocked merely because an outer frame holds
// #A. So the published token names the held issue, and every reader goes
// through `isIssueLockHeld`. It also has to distinguish nesting from
// concurrency, which the process-global env cannot do on its own — hence the
// async-context held set.
//
// Covers:
//   1. Nested same-issue acquisition runs its callback instead of throwing,
//      and creates no second lock directory.
//   2. The published env value names the held issue and is restored afterwards.
//   3. Nested acquisition for a DIFFERENT issue still takes its own real lock.
//   4. A foreign live holder still raises IssueLockError when the flag is absent
//      — cross-session protection intact.
//   5. A first, unnested acquisition with `retries: 0` still takes the lock,
//      preserving the #1169 entry interlock for a direct `npx aitm test <N>`.
//   6. Two CONCURRENT same-issue frames in one process still contend, even
//      though the holding frame has published the token process-globally.
//   7. `isIssueLockHeld` token semantics: normalization, legacy `'1'`, absent.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  ISSUE_LOCK_HELD_ENV,
  IssueLockError,
  THIS_HOST,
  isIssueLockHeld,
  issueLockPath,
  issueLockToken,
  withIssueLock,
} from '../../../../task-tracker/issue-mutator-lock.mjs';

function freshProjDir(label) {
  const dir = path.join(
    projectScratchDir('inspect'),
    `issue-lock-reentrancy-${label}-${process.pid}`
  );
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Every test runs with the ambient flag scrubbed: this suite may itself execute
// inside a held `withIssueLock` frame (the `/task test` sandbox is spawned under
// promote's lock), and an inherited value would short-circuit the very
// acquisitions being asserted.
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

test('nested same-issue acquisition runs the callback and creates no second lock', async () => {
  await withScrubbedEnv(async () => {
    const projDir = freshProjDir('nested');
    const lockPath = issueLockPath(1261, projDir);
    let innerRan = false;

    await withIssueLock({ issue: 1261, verb: 'promote', projDir }, async () => {
      assert.equal(existsSync(lockPath), true, 'outer frame holds the lock dir');
      // retries: 0 is exactly what the `test` delegate uses — the shape that
      // used to throw immediately.
      await withIssueLock({ issue: 1261, verb: 'test', projDir, retries: 0 }, async () => {
        innerRan = true;
        assert.equal(existsSync(lockPath), true, 'the outer lock dir is untouched');
      });
      assert.equal(innerRan, true, 'nested delegate body executed');
      // The nested frame must not run the teardown: if it had, the parent's
      // lock would already be gone here.
      assert.equal(existsSync(lockPath), true, 'nested frame did not release the parent lock');
    });

    assert.equal(existsSync(lockPath), false, 'outer frame released the lock');
  });
});

test('the held flag names the issue and is restored after the frame exits', async () => {
  await withScrubbedEnv(async () => {
    const projDir = freshProjDir('env');
    let seen;
    await withIssueLock({ issue: 1261, verb: 'promote', projDir }, async () => {
      seen = process.env[ISSUE_LOCK_HELD_ENV];
      // Nested frames mutate nothing — the outer frame owns the env restore.
      await withIssueLock({ issue: '#1261', verb: 'test', projDir, retries: 0 }, async () => {
        assert.equal(process.env[ISSUE_LOCK_HELD_ENV], '1261', 'nested frame left the token alone');
      });
    });
    assert.equal(seen, '1261', 'published the held issue, not a bare boolean');
    assert.equal(process.env[ISSUE_LOCK_HELD_ENV], undefined, 'flag restored to absent');
  });
});

test('a nested acquisition for a different issue still takes its own lock', async () => {
  await withScrubbedEnv(async () => {
    const projDir = freshProjDir('scoped');
    const outerLock = issueLockPath(1261, projDir);
    const otherLock = issueLockPath(871, projDir);

    await withIssueLock({ issue: 1261, verb: 'promote', projDir }, async () => {
      await withIssueLock({ issue: 871, verb: 'promote', projDir }, async () => {
        assert.equal(existsSync(otherLock), true, '#871 acquired its own lock dir');
        assert.equal(existsSync(outerLock), true, '#1261 still held');
        assert.equal(process.env[ISSUE_LOCK_HELD_ENV], '871', 'inner frame republished for #871');
      });
      assert.equal(existsSync(otherLock), false, '#871 released its own lock');
      assert.equal(
        process.env[ISSUE_LOCK_HELD_ENV],
        '1261',
        'inner frame restored the outer token'
      );
    });
  });
});

test('a foreign live holder still raises IssueLockError when the flag is absent', async () => {
  await withScrubbedEnv(async () => {
    const projDir = freshProjDir('foreign');
    const lockPath = issueLockPath(1261, projDir);
    mkdirSync(lockPath, { recursive: true });
    // A live PID on this host that is not us: our own parent-of-record. Using
    // process.pid would also read as alive, but pointing at a distinct pid makes
    // the "different session" framing explicit.
    writeFileSync(
      path.join(lockPath, 'holder.json'),
      JSON.stringify({
        sessionId: 'some-other-session',
        pid: process.pid,
        host: THIS_HOST,
        startToken: 'not-this-process',
        acquiredAt: new Date().toISOString(),
        verb: 'promote',
      }),
      'utf8'
    );

    await assert.rejects(
      () => withIssueLock({ issue: 1261, verb: 'test', projDir, retries: 0 }, async () => 'ran'),
      (err) => {
        assert.ok(err instanceof IssueLockError, 'cross-session contention still throws');
        assert.match(err.message, /issue 1261 locked by session some-other-session \(held since /);
        return true;
      }
    );

    rmSync(lockPath, { recursive: true, force: true });
  });
});

test('an unnested retries:0 acquisition still takes the lock (#1169 entry interlock)', async () => {
  await withScrubbedEnv(async () => {
    const projDir = freshProjDir('interlock');
    const lockPath = issueLockPath(1261, projDir);
    let ran = false;
    await withIssueLock({ issue: 1261, verb: 'test', projDir, retries: 0 }, async () => {
      ran = true;
      assert.equal(existsSync(lockPath), true, 'a direct `aitm test` still acquires for real');
    });
    assert.equal(ran, true);
    assert.equal(existsSync(lockPath), false, 'and releases on exit');
  });
});

test('two concurrent same-issue frames in one process still contend', async () => {
  await withScrubbedEnv(async () => {
    const projDir = freshProjDir('concurrent');
    let releaseFirst;
    const released = new Promise((r) => {
      releaseFirst = r;
    });
    let entered;
    const inside = new Promise((r) => {
      entered = r;
    });

    // The holding frame publishes AITM_ISSUE_LOCK_HELD process-globally, so a
    // naive env-only check would wave this sibling through and silently defeat
    // the #1169 Test entry interlock. The held set is async-context-scoped, and
    // a sibling context is not a descendant — so it contends for real.
    const first = withIssueLock(
      { issue: 1261, verb: 'test', projDir, sessionId: 'holder' },
      async () => {
        entered();
        await released;
        return 'first';
      }
    );
    await inside;

    await assert.rejects(
      () => withIssueLock({ issue: 1261, verb: 'test', projDir, retries: 0 }, async () => 'second'),
      (err) => {
        assert.ok(err instanceof IssueLockError);
        assert.match(err.message, /issue 1261 locked by session holder \(held since /);
        return true;
      }
    );

    releaseFirst();
    assert.equal(await first, 'first');
  });
});

test('isIssueLockHeld token semantics', () => {
  assert.equal(issueLockToken('#1261'), '1261');
  assert.equal(issueLockToken(' 1261 '), '1261');
  assert.equal(issueLockToken(1261), '1261');

  const held = { [ISSUE_LOCK_HELD_ENV]: '1261' };
  assert.equal(isIssueLockHeld(1261, held), true);
  assert.equal(isIssueLockHeld('#1261', held), true);
  assert.equal(isIssueLockHeld(871, held), false, 'issue-scoped: a different issue is not held');
  assert.equal(isIssueLockHeld(undefined, held), true, 'issue-less query: any held frame counts');

  // Legacy unscoped value from a mixed-version process tree degrades to the
  // pre-#1261 behavior rather than double-acquiring.
  const legacy = { [ISSUE_LOCK_HELD_ENV]: '1' };
  assert.equal(isIssueLockHeld(1261, legacy), true);
  assert.equal(isIssueLockHeld(871, legacy), true);

  assert.equal(isIssueLockHeld(1261, {}), false);
  assert.equal(isIssueLockHeld(1261, { [ISSUE_LOCK_HELD_ENV]: '' }), false);
  assert.equal(isIssueLockHeld(1261, { [ISSUE_LOCK_HELD_ENV]: '  ' }), false);
});
