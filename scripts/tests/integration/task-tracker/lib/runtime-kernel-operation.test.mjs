// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, rmSync, utimesSync, existsSync } from 'node:fs';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { withRuntimeOperation } from '../../../../task-tracker/lib/runtime-writer.mjs';
import { inspectRuntimeWriterLeases } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';

test('kernel operation critical section retains its writer lease through awaited work', async () => {
  const root = await createActivatedRuntimeRootFixture('runtime-locks-');
  const roots = { projectRoot: root, mainRoot: root };
  try {
    await withRuntimeOperation(
      path.join(root, '.ai-task-manager/runtime/store/timing/issue-1857.lock'),
      async () => {
        assert.equal(
          inspectRuntimeWriterLeases(roots).length,
          1,
          'timing publication is a live runtime writer'
        );
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(inspectRuntimeWriterLeases(roots).length, 1);
      }
    );
    assert.equal(inspectRuntimeWriterLeases(roots).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kernel operation locks preserve unknown old ownership rather than treating age as recovery authority', async () => {
  const root = await createActivatedRuntimeRootFixture('runtime-old-lock-');
  const file = path.join(root, '.ai-task-manager/runtime/store/timing/issue-1857.lock');
  try {
    mkdirSync(file, { recursive: true });
    utimesSync(file, new Date(0), new Date(0));
    assert.throws(() => withRuntimeOperation(file, async () => assert.fail('must not enter')), {
      code: 'RUNTIME_LOCK_RECOVERY_REQUIRED',
    });
    assert.equal(existsSync(file), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
