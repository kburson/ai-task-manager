// @story #1049
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ISSUE_LOCK_HELD_ENV, issueLockPath, withIssueLock } from '../../../issue-mutator-lock.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

test('governed verification runs after lock acquisition and immediately wraps the callback', async () => {
  const projectDir = mkdtempProjectIsolated('aitm-governed-lock-');
  const events = [];
  try {
    const result = await withIssueLock(
      {
        issue: 1049,
        verb: 'review',
        projDir: projectDir,
        authorize: async (callback) => {
          assert.equal(existsSync(issueLockPath(1049, projectDir)), true);
          assert.equal(process.env[ISSUE_LOCK_HELD_ENV], '1');
          events.push('verify');
          return callback();
        },
      },
      async () => {
        events.push('mutate');
        return 'done';
      }
    );
    assert.equal(result, 'done');
    assert.deepEqual(events, ['verify', 'mutate']);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('governed refusal releases the lock and restores the prior lock environment', async () => {
  const projectDir = mkdtempProjectIsolated('aitm-governed-refuse-');
  const prior = process.env[ISSUE_LOCK_HELD_ENV];
  process.env[ISSUE_LOCK_HELD_ENV] = 'outer-value';
  let callbacks = 0;
  try {
    await assert.rejects(
      () =>
        withIssueLock(
          {
            issue: 1049,
            verb: 'close',
            projDir: projectDir,
            authorize: async () => {
              const error = new Error('stale fence');
              error.code = 'fence-stale';
              throw error;
            },
          },
          async () => {
            callbacks += 1;
          }
        ),
      (error) => error.code === 'fence-stale'
    );
    assert.equal(callbacks, 0);
    assert.equal(existsSync(issueLockPath(1049, projectDir)), false);
    assert.equal(process.env[ISSUE_LOCK_HELD_ENV], 'outer-value');
  } finally {
    if (prior === undefined) delete process.env[ISSUE_LOCK_HELD_ENV];
    else process.env[ISSUE_LOCK_HELD_ENV] = prior;
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('a lock wait obtains a fresh governed proof only after acquisition', async () => {
  const projectDir = mkdtempProjectIsolated('aitm-governed-wait-');
  const lockPath = issueLockPath(1049, projectDir);
  mkdirSync(lockPath, { recursive: true });
  writeFileSync(
    path.join(lockPath, 'holder.json'),
    JSON.stringify({
      sessionId: 'other',
      pid: process.pid,
      host: 'different-host',
      acquiredAt: new Date().toISOString(),
      verb: 'other',
    })
  );
  let verifications = 0;
  let callbacks = 0;
  const release = setTimeout(() => rmSync(lockPath, { recursive: true, force: true }), 20);
  try {
    await withIssueLock(
      {
        issue: 1049,
        verb: 'promote',
        projDir: projectDir,
        timeoutMs: 10,
        retries: 10,
        authorize: async (callback) => {
          verifications += 1;
          assert.equal(existsSync(lockPath), true);
          return callback();
        },
      },
      async () => {
        callbacks += 1;
      }
    );
    assert.equal(verifications, 1, 'proof is created only after the wait and acquisition');
    assert.equal(callbacks, 1);
  } finally {
    clearTimeout(release);
    rmSync(projectDir, { recursive: true, force: true });
  }
});
