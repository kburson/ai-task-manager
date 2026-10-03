// @story #1861
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rmSync } from 'node:fs';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import {
  withRuntimeWriterLease,
  inspectRuntimeWriterLeases,
  inspectRuntimeCoordinator,
} from '../../../../task-tracker/lib/runtime-migration-lock.mjs';

test('writer release waits for transient coordinator contention without replaying its operation', async () => {
  const root = await createActivatedRuntimeRootFixture('writer-release-contention-');
  const roots = { projectRoot: root, mainRoot: root };
  const adapters = {
    identity: () => ({
      provider: 'fixture',
      sid: 'release-parent',
      pid: process.pid,
      processToken: 'release-parent-process',
    }),
  };
  const moduleUrl = new URL(
    '../../../../task-tracker/lib/runtime-migration-lock.mjs',
    import.meta.url
  ).href;
  let child;
  let completion;
  let calls = 0;
  try {
    const result = await withRuntimeWriterLease({ ...roots, adapters }, async () => {
      calls++;
      const code = `import {withRuntimeWriterLeaseSync, withRuntimeStoreLockSync} from ${JSON.stringify(moduleUrl)};
        const roots = ${JSON.stringify(roots)};
        const adapters = {identity: () => ({provider:'fixture',sid:'release-peer',pid:process.pid,processToken:'release-peer-process'})};
        withRuntimeWriterLeaseSync({...roots,adapters}, () => withRuntimeStoreLockSync({...roots,adapters}, () => {
          process.send('coordinator-held');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);
        }));
        process.disconnect();`;
      child = spawn(process.execPath, ['--input-type=module', '-e', code], {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
      completion = once(child, 'exit');
      const message = await once(child, 'message');
      assert.equal(message[0], 'coordinator-held');
      return 'operation-complete';
    });
    assert.equal(result, 'operation-complete');
    assert.equal(calls, 1);
    assert.deepEqual(await completion, [0, null]);
    assert.deepEqual(inspectRuntimeWriterLeases(roots), []);
    assert.equal(inspectRuntimeCoordinator(roots).status, 'absent');
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGKILL');
      await completion;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
