// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { openSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { claimHookStamp, hookStampKey } from '../../../../task-tracker/lib/hook-idempotency.mjs';
import { inspectRuntimeWriterLeases } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';

test('hook idempotency uses durable physical stamps and leases actual exclusive publication', async () => {
  const root = await createActivatedRuntimeRootFixture('hook-stamp-durable-');
  const request = { projectDir: root, sid: 'fixture-1857', hookEventName: 'PostToolUse', promptId: 'p1', eventTimestamp: '2026-10-01T00:00:00Z' };
  const expected = path.join(root, '.ai-task-manager', 'runtime', 'store', 'locks', hookStampKey(request));
  try {
    const first = claimHookStamp({ ...request, openFile: (...args) => {
      assert.equal(inspectRuntimeWriterLeases({ projectRoot: root, mainRoot: root }).length, 1);
      return openSync(...args);
    } });
    assert.equal(first.claimed, true);
    assert.equal(first.stampPath, expected);
    assert.equal(claimHookStamp(request).claimed, false);
    assert.equal(inspectRuntimeWriterLeases({ projectRoot: root, mainRoot: root }).length, 0);
    writeFileSync(expected, 'corrupt');
    assert.throws(() => claimHookStamp(request), { code: 'RUNTIME_STATE_CORRUPT' });
    rmSync(expected);
    const volatile = path.join(root, '.tmp', 'fake-stamp');
    mkdirSync(path.dirname(volatile), { recursive: true });
    writeFileSync(volatile, '');
    symlinkSync(volatile, expected);
    assert.throws(() => claimHookStamp(request), { code: 'RUNTIME_OVERRIDE_UNSAFE' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
