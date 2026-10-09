// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, rmSync, utimesSync, existsSync } from 'node:fs';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { withLock } from '../../../../task-tracker/locks.mjs';
import { withIssueLock, isIssueLockHeld } from '../../../../task-tracker/issue-mutator-lock.mjs';
import { timingLockPath } from '../../../../task-tracker/paths.mjs';
import { inspectRuntimeWriterLeases } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';

test('a caller supplied inherited flag cannot grant issue mutation authority', () => {
  assert.equal(isIssueLockHeld(1857, { AITM_ISSUE_LOCK_HELD: '1857' }), false);
  assert.equal(isIssueLockHeld(1857, { AITM_ISSUE_LOCK_HELD: '1' }), false);
});

test('real async timing and issue critical sections retain writer leases through awaited work', async () => {
  const root = await createActivatedRuntimeRootFixture('runtime-locks-');
  const roots = { projectRoot: root, mainRoot: root };
  try {
    await withLock(timingLockPath(1857, root), async () => {
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1, 'timing publication is a live runtime writer');
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
    });
    await withIssueLock({ issue: 1857, verb: 'fixture', projDir: root, sessionId: 'fixture' }, async () => {
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1, 'whole issue mutation must remain visible to drain');
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
    });
    assert.equal(inspectRuntimeWriterLeases(roots).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('timing locks preserve unknown old ownership rather than treating age as recovery authority', async () => {
  const root = await createActivatedRuntimeRootFixture('runtime-old-lock-');
  const file = timingLockPath(1857, root);
  try {
    mkdirSync(file, { recursive: true });
    utimesSync(file, new Date(0), new Date(0));
    await assert.rejects(withLock(file, async () => assert.fail('must not enter'), { timeoutMs: 1 }), { code: 'RUNTIME_LOCK_RECOVERY_REQUIRED' });
    assert.equal(existsSync(file), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
