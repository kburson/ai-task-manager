// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import path from 'node:path';
import { runtimeOperationKey } from '../../../../task-tracker/lib/runtime-writer.mjs';
import * as coordination from '../../../../task-tracker/lib/runtime-migration-lock.mjs';

const writerModule = new URL('../../../../task-tracker/lib/runtime-writer.mjs', import.meta.url)
  .href;
const executable = fileURLToPath(new URL('../../../../../bin/aitm.mjs', import.meta.url));
const cleanEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith('GIT_') &&
        ![
          'AI_TASK_MANAGER_PROJECT_DIR',
          'TASK_TRACKER_PROJECT_DIR',
          'CLAUDE_PROJECT_DIR',
          'AITM_CAPTURE_PROJECT_DIR',
        ].includes(key)
    )
  );

test('registered bootstrap observes and recovers an exact SIGKILLed operation without age or manual lock edits', async () => {
  const root = await createActivatedRuntimeRootFixture('operation-killed-');
  const roots = { projectRoot: root, mainRoot: root };
  const target = path.join(root, '.ai-task-manager/runtime/store/timing/issue-1857.lock');
  const recordKey = runtimeOperationKey(target);
  const code =
    'import {withRuntimeOperation} from ' +
    JSON.stringify(writerModule) +
    '; setInterval(()=>{},1000); await withRuntimeOperation(process.argv[1], async()=>{process.stdout.write("HELD");await new Promise(()=>{});});';
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, target], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanEnv(),
  });
  const exited = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const cli = (args) =>
    spawnSync(process.execPath, [executable, 'migrate-runtime', ...args], {
      cwd: root,
      env: cleanEnv(),
      encoding: 'utf8',
      timeout: 10000,
    });
  try {
    await Promise.race([
      new Promise((resolve) => child.stdout.once('data', resolve)),
      exited.then(() => assert.fail(stderr)),
    ]);
    const before = coordination.inspectRuntimeOperationLock({ ...roots, recordKey });
    const status = cli(['status']);
    assert.equal(status.status, 0, status.stderr);
    assert.ok(
      JSON.parse(status.stdout).operationLocks.some(
        (row) => row.recordKey === recordKey && row.digest === before.digest
      )
    );
    const recoverArgs = ['recover-operation', '--record', recordKey, '--observed', before.digest];
    const live = cli(recoverArgs);
    assert.notEqual(live.status, 0);
    assert.match(live.stderr, /RUNTIME_MIGRATION_OWNER_UNCONFIRMED/);
    child.kill('SIGKILL');
    assert.equal((await exited)[1], 'SIGKILL');
    const wrong = cli([
      'recover-operation',
      '--record',
      recordKey,
      '--observed',
      'sha256:' + 'a'.repeat(64),
    ]);
    assert.match(wrong.stderr, /RUNTIME_MIGRATION_CONFLICT/);
    const recovered = cli(recoverArgs);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(JSON.parse(recovered.stdout).status, 'recovered');
    const [lease] = coordination.inspectRuntimeWriterLeases(roots);
    const release = cli([
      'recover-writer',
      '--lease',
      lease.record.leaseId,
      '--observed',
      lease.digest,
    ]);
    assert.equal(release.status, 0, release.stderr);
    assert.equal(
      coordination.inspectRuntimeOperationLock({ ...roots, recordKey }).status,
      'absent'
    );
  } finally {
    child.kill('SIGKILL');
    await exited;
    rmSync(root, { recursive: true, force: true });
  }
});
