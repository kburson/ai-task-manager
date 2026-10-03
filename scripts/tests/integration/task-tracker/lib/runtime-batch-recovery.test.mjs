// @story #1861
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import {
  writeRuntimeJsonBatch,
  writeRuntimeRecordBatch,
  readRuntimeJsonRecord,
} from '../../../../task-tracker/lib/runtime-writer.mjs';
import {
  inspectRuntimeBatch,
  resumeRuntimeBatch,
} from '../../../../task-tracker/lib/runtime-batch.mjs';

const statePath = (root) =>
  path.join(root, '.ai-task-manager/runtime/store/state/task-tracker-state.json');
const bindingPath = (root) =>
  path.join(root, '.ai-task-manager/runtime/store/sessions/batch-test/active-task.json');

test('a supported batch publishes a complete durable receipt and preserves synchronous return', async () => {
  const root = await createActivatedRuntimeRootFixture('1861-batch-');
  try {
    const result = writeRuntimeJsonBatch([
      { target: statePath(root), value: { lastWordMarker: 42 } },
      { target: bindingPath(root), value: { issue: '#1861', boundAt: '2026-10-02T00:00:00Z' } },
    ]);
    assert.equal(result.status, 'complete');
    assert.equal(result?.then, undefined);
    assert.deepEqual(readRuntimeJsonRecord(statePath(root)), { lastWordMarker: 42 });
    assert.equal(readRuntimeJsonRecord(bindingPath(root)).issue, '#1861');
    const observed = inspectRuntimeBatch({
      projectRoot: root,
      mainRoot: root,
      operationId: result.operationId,
    });
    assert.equal(observed.record.status, 'complete');
    assert.equal(observed.record.members.length, 2);
    assert.equal(observed.record.members[1].before, null);
    const unchanged = readFileSync(statePath(root));
    assert.equal(
      resumeRuntimeBatch({
        projectRoot: root,
        mainRoot: root,
        operationId: result.operationId,
        observedDigest: observed.digest,
      }).status,
      'complete'
    );
    assert.deepEqual(readFileSync(statePath(root)), unchanged);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the complete validation set and expected-before assertion refuse before any member changes', async () => {
  const root = await createActivatedRuntimeRootFixture('1861-batch-refuse-');
  try {
    const original = readFileSync(statePath(root));
    assert.throws(
      () =>
        writeRuntimeJsonBatch([
          { target: statePath(root), value: { lastWordMarker: 42 } },
          { target: bindingPath(root), value: { schema: 'unsupported', issue: '#1861' } },
        ]),
      { code: 'RUNTIME_STATE_CORRUPT' }
    );
    assert.deepEqual(readFileSync(statePath(root)), original);
    assert.throws(
      () => writeRuntimeJsonBatch([{ target: statePath(root), value: {}, expectedDigest: null }]),
      { code: 'RUNTIME_BATCH_CONFLICT' }
    );
    assert.deepEqual(readFileSync(statePath(root)), original);
    assert.throws(
      () =>
        writeRuntimeRecordBatch([
          { target: statePath(root), bytes: Promise.resolve(Buffer.from('{}')) },
        ]),
      { code: 'RUNTIME_BATCH_INVALID' }
    );
    assert.deepEqual(readFileSync(statePath(root)), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const mandatoryRecords = [
  'state/task-tracker-state.json',
  'state/task-tracker-queue.json',
  'fleet/task-fleet.json',
  'fleet/occupancy.json',
];
for (const relative of mandatoryRecords) {
  test(`batch deletion refuses mandatory ${relative} before changing any records`, async () => {
    const root = await createActivatedRuntimeRootFixture('1861-batch-required-');
    try {
      const store = path.join(root, '.ai-task-manager/runtime/store');
      const before = mandatoryRecords.map((record) => readFileSync(path.join(store, record)));
      assert.throws(
        () => writeRuntimeRecordBatch([{ target: path.join(store, relative), bytes: null }]),
        { code: 'RUNTIME_STATE_CORRUPT' }
      );
      for (const [index, record] of mandatoryRecords.entries())
        assert.deepEqual(readFileSync(path.join(store, record)), before[index]);
      assert.deepEqual(readRuntimeJsonRecord(statePath(root)), {});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('deletion remains journaled and completed retry cannot restore an older outcome over later writes', async () => {
  const root = await createActivatedRuntimeRootFixture('1861-batch-delete-');
  try {
    writeRuntimeJsonBatch([{ target: bindingPath(root), value: { issue: '#1861' } }]);
    const result = writeRuntimeRecordBatch([{ target: bindingPath(root), bytes: null }]);
    const observed = inspectRuntimeBatch({
      projectRoot: root,
      mainRoot: root,
      operationId: result.operationId,
    });
    assert.equal(observed.record.members[0].after, null);
    assert.equal(readRuntimeJsonRecord(bindingPath(root), { optional: true }), null);
    writeRuntimeJsonBatch([{ target: bindingPath(root), value: { issue: '#1862' } }]);
    resumeRuntimeBatch({
      projectRoot: root,
      mainRoot: root,
      operationId: result.operationId,
      observedDigest: observed.digest,
    });
    assert.equal(readRuntimeJsonRecord(bindingPath(root)).issue, '#1862');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unfinished batch fences even its lease holder and exact resume completes the original outcome', async () => {
  const root = await createActivatedRuntimeRootFixture('1861-batch-interrupted-');
  try {
    assert.throws(
      () =>
        writeRuntimeJsonBatch(
          [
            { target: statePath(root), value: { lastWordMarker: 42 } },
            { target: bindingPath(root), value: { issue: '#1861' } },
          ],
          {
            adapters: {
              faultSync: (point) => {
                if (point === 'after-batch-member-0') throw new Error('interrupt');
              },
            },
          }
        ),
      /interrupt/
    );
    assert.throws(() => readRuntimeJsonRecord(statePath(root)), {
      code: 'RUNTIME_BATCH_INCOMPLETE',
    });
    const { readdirSync } = await import('node:fs');
    const [operationId] = readdirSync(path.join(root, '.ai-task-manager/runtime/batches'));
    const input = { projectRoot: root, mainRoot: root, operationId };
    const observed = inspectRuntimeBatch(input);
    assert.equal(observed.record.status, 'publishing');
    assert.throws(
      () => resumeRuntimeBatch({ ...input, observedDigest: 'sha256:' + '0'.repeat(64) }),
      { code: 'RUNTIME_BATCH_CONFLICT' }
    );
    assert.equal(
      resumeRuntimeBatch({ ...input, observedDigest: observed.digest }).status,
      'complete'
    );
    assert.equal(readRuntimeJsonRecord(bindingPath(root)).issue, '#1861');
    assert.equal(
      resumeRuntimeBatch({ ...input, observedDigest: observed.digest }).status,
      'complete'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const point of [
  'after-batch-journal',
  'after-batch-member-0',
  'after-batch-member-1',
  'after-batch-member-stage-0',
  'after-batch-journal-stage-publishing',
  'after-batch-journal-stage-prepared',
  'after-batch-journal-stage-complete',
]) {
  test(
    'SIGKILL at ' + point + ' preserves read refusal and exact confirmed-death replay',
    async () => {
      const { spawn, execFileSync } = await import('node:child_process');
      const { once } = await import('node:events');
      const { readdirSync, writeFileSync, mkdirSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const coordination = await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
      const root = await createActivatedRuntimeRootFixture('1861-batch-kill-');
      const roots = { projectRoot: root, mainRoot: root };
      const writer = new URL('../../../../task-tracker/lib/runtime-writer.mjs', import.meta.url)
        .href;
      const code = `import { writeRuntimeJsonBatch } from ${JSON.stringify(writer)};
      const [records, point] = JSON.parse(process.argv[1]);
      writeRuntimeJsonBatch(records, { adapters: { faultSync: (actual) => { if (actual === point) process.kill(process.pid, 'SIGKILL'); } } });`;
      const child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          code,
          JSON.stringify([
            [
              { target: statePath(root), value: { lastWordMarker: 42 } },
              { target: bindingPath(root), value: { issue: '#1861' } },
            ],
            point,
          ]),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      const exited = once(child, 'exit');
      try {
        const [exitCode, signal] = await exited;
        assert.equal(exitCode, null, stderr);
        assert.equal(signal, 'SIGKILL', stderr);
        const [operationId] = readdirSync(path.join(root, '.ai-task-manager/runtime/batches'));
        const input = { ...roots, operationId };
        const observed = inspectRuntimeBatch(input);
        assert.equal(observed.record.owner.pid, child.pid);
        assert.throws(() => readRuntimeJsonRecord(statePath(root)), {
          code: 'RUNTIME_BATCH_INCOMPLETE',
        });
        const cli = fileURLToPath(new URL('../../../../../bin/aitm.mjs', import.meta.url));
        const env = Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) =>
              !key.startsWith('GIT_') &&
              ![
                'AI_TASK_MANAGER_PROJECT_DIR',
                'TASK_TRACKER_PROJECT_DIR',
                'CLAUDE_PROJECT_DIR',
              ].includes(key)
          )
        );
        const status = JSON.parse(
          execFileSync(
            process.execPath,
            [cli, 'migrate-runtime', 'batch-status', '--operation', operationId],
            { cwd: root, env, encoding: 'utf8' }
          )
        );
        assert.equal(status.digest, observed.digest);
        const coordinator = coordination.inspectRuntimeCoordinator(roots);
        coordination.recoverRuntimeCoordinator({ ...roots, expectedDigest: coordinator.digest });
        for (const lease of coordination.inspectRuntimeWriterLeases(roots))
          coordination.recoverRuntimeWriterLease({
            ...roots,
            leaseId: lease.record.leaseId,
            expectedDigest: lease.digest,
          });
        const original = readFileSync(statePath(root));
        mkdirSync(path.dirname(bindingPath(root)), { recursive: true });
        writeFileSync(bindingPath(root), JSON.stringify({ issue: '#1862' }));
        assert.throws(() => resumeRuntimeBatch({ ...input, observedDigest: observed.digest }), {
          code: 'RUNTIME_BATCH_CONFLICT',
        });
        assert.deepEqual(
          readFileSync(statePath(root)),
          original,
          'validate every member before replay'
        );
        if (
          observed.record.members[1].before === null &&
          point !== 'after-batch-member-1' &&
          observed.record.status !== 'complete'
        )
          rmSync(bindingPath(root));
        else
          writeFileSync(
            bindingPath(root),
            Buffer.from(observed.record.members[1].after.bytes, 'base64')
          );
        const resumed = JSON.parse(
          execFileSync(
            process.execPath,
            [
              cli,
              'migrate-runtime',
              'batch-resume',
              '--operation',
              operationId,
              '--observed',
              observed.digest,
            ],
            { cwd: root, env, encoding: 'utf8' }
          )
        );
        assert.equal(resumed.status, 'complete');
        assert.equal(readRuntimeJsonRecord(statePath(root)).lastWordMarker, 42);
        assert.equal(readRuntimeJsonRecord(bindingPath(root)).issue, '#1861');
        assert.equal(
          resumeRuntimeBatch({ ...input, observedDigest: observed.digest }).status,
          'complete'
        );
      } finally {
        child.kill('SIGKILL');
        await exited;
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
}

test('unsupported caller identities and nonabsolute targets refuse without creating an unreadable journal', async () => {
  const root = await createActivatedRuntimeRootFixture('1861-batch-input-');
  try {
    const original = readFileSync(statePath(root));
    assert.throws(
      () =>
        writeRuntimeRecordBatch([
          {
            target: statePath(root),
            bytes: Buffer.from('{}'),
            actorIdentity: { provider: 'fixture', sid: 'one', forged: true },
          },
        ]),
      { code: 'RUNTIME_BATCH_INVALID' }
    );
    assert.throws(() => writeRuntimeRecordBatch([{ target: 42, bytes: Buffer.from('{}') }]), {
      code: 'RUNTIME_BATCH_INVALID',
    });
    assert.deepEqual(readFileSync(statePath(root)), original);
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(path.join(root, '.ai-task-manager/runtime/batches')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a live publisher cannot be taken over and a changed journal observation preserves every member', async () => {
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const { readdirSync, writeFileSync } = await import('node:fs');
  const root = await createActivatedRuntimeRootFixture('1861-batch-live-');
  const roots = { projectRoot: root, mainRoot: root };
  const writer = new URL('../../../../task-tracker/lib/runtime-writer.mjs', import.meta.url).href;
  const code = `import { writeRuntimeJsonBatch } from ${JSON.stringify(writer)};
    writeRuntimeJsonBatch(JSON.parse(process.argv[1]), { adapters: { faultSync: (point) => {
      if (point === 'after-batch-journal') { process.stdout.write('HELD'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); }
    } } });`;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      code,
      JSON.stringify([{ target: statePath(root), value: { lastWordMarker: 99 } }]),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const exited = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    await Promise.race([
      new Promise((resolve) => child.stdout.once('data', resolve)),
      exited.then(() => assert.fail(stderr)),
    ]);
    const [operationId] = readdirSync(path.join(root, '.ai-task-manager/runtime/batches'));
    const observed = inspectRuntimeBatch({ ...roots, operationId });
    const original = readFileSync(statePath(root));
    assert.throws(
      () => resumeRuntimeBatch({ ...roots, operationId, observedDigest: observed.digest }),
      { code: 'RUNTIME_MIGRATION_OWNER_UNCONFIRMED' }
    );
    writeFileSync(
      observed.file,
      JSON.stringify({ ...observed.record, observations: ['sha256:' + 'a'.repeat(64)] })
    );
    assert.throws(
      () => resumeRuntimeBatch({ ...roots, operationId, observedDigest: observed.digest }),
      { code: 'RUNTIME_BATCH_CONFLICT' }
    );
    assert.deepEqual(readFileSync(statePath(root)), original);
  } finally {
    child.kill('SIGKILL');
    await exited;
    rmSync(root, { recursive: true, force: true });
  }
});

test('binary capture validates proposed metadata and deletes the complete recorded bundle', async () => {
  const { createHash } = await import('node:crypto');
  const { existsSync } = await import('node:fs');
  const root = await createActivatedRuntimeRootFixture('1861-batch-binary-');
  try {
    const directory = path.join(
      root,
      '.ai-task-manager/runtime/store/action-capture/repositories/fixture__repo/issue-1861/000001-01ARZ3NDEKTSV4RRFFQ69G5FAV'
    );
    const bytes = Buffer.from([255, 0, 128, 42]);
    const stdout = {
      file: 'stdout.bin',
      bytes: 4,
      sha256: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
      stored: true,
      redacted: false,
    };
    const metadata = {
      schema: 'aitm.github-action-capture/v1',
      actionId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      sequence: 1,
      finishedAt: '2026-10-02T00:00:00Z',
      durationMs: 1,
      exitCode: 0,
      signal: null,
      stdout,
      stderr: {
        file: null,
        bytes: 0,
        sha256: 'sha256:' + createHash('sha256').update('').digest('hex'),
        stored: false,
        redacted: false,
      },
      readback: {},
    };
    const binary = path.join(directory, 'stdout.bin');
    const outcome = path.join(directory, 'outcome.json');
    writeRuntimeRecordBatch([
      { target: binary, bytes },
      { target: outcome, bytes: Buffer.from(JSON.stringify(metadata)) },
    ]);
    assert.deepEqual(readFileSync(binary), bytes);
    assert.throws(
      () => writeRuntimeRecordBatch([{ target: binary, bytes: Buffer.from('wrong') }]),
      { code: 'RUNTIME_STATE_CORRUPT' }
    );
    assert.deepEqual(readFileSync(binary), bytes);
    writeRuntimeRecordBatch([
      { target: binary, bytes: null },
      { target: outcome, bytes: null },
    ]);
    assert.equal(existsSync(binary), false);
    assert.equal(existsSync(outcome), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a killed resumer retains its genuine owner and excludes a competing recovery until confirmed death', async () => {
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const { readdirSync } = await import('node:fs');
  const coordination = await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const root = await createActivatedRuntimeRootFixture('1861-batch-resumer-');
  const roots = { projectRoot: root, mainRoot: root };
  const writer = new URL('../../../../task-tracker/lib/runtime-writer.mjs', import.meta.url).href;
  const batch = new URL('../../../../task-tracker/lib/runtime-batch.mjs', import.meta.url).href;
  const children = [];
  const launch = (code, input) => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', code, JSON.stringify(input)],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const exited = once(child, 'exit');
    children.push({ child, exited });
    return { child, exited };
  };
  const recoverCoordination = () => {
    const coordinator = coordination.inspectRuntimeCoordinator(roots);
    if (coordinator.status === 'owned')
      coordination.recoverRuntimeCoordinator({ ...roots, expectedDigest: coordinator.digest });
    for (const lease of coordination.inspectRuntimeWriterLeases(roots))
      coordination.recoverRuntimeWriterLease({
        ...roots,
        leaseId: lease.record.leaseId,
        expectedDigest: lease.digest,
      });
  };
  try {
    const publisher = launch(
      `import { writeRuntimeJsonBatch } from ${JSON.stringify(writer)};
      writeRuntimeJsonBatch(JSON.parse(process.argv[1]), { adapters: { faultSync: (point) => { if (point === 'after-batch-journal') process.kill(process.pid, 'SIGKILL'); } } });`,
      [{ target: statePath(root), value: { lastWordMarker: 1861 } }]
    );
    assert.equal((await publisher.exited)[1], 'SIGKILL');
    const [operationId] = readdirSync(path.join(root, '.ai-task-manager/runtime/batches'));
    const original = inspectRuntimeBatch({ ...roots, operationId });
    recoverCoordination();
    const recovering = launch(
      `import { resumeRuntimeBatch } from ${JSON.stringify(batch)};
      resumeRuntimeBatch({ ...JSON.parse(process.argv[1]), adapters: { faultSync: (point) => {
        if (point === 'after-batch-journal-stage-publishing') { process.stdout.write('HELD'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); }
      } } });`,
      { ...roots, operationId, observedDigest: original.digest }
    );
    let stderr = '';
    recovering.child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    await Promise.race([
      new Promise((resolve) => recovering.child.stdout.once('data', resolve)),
      recovering.exited.then(() => assert.fail(stderr)),
    ]);
    const claimed = inspectRuntimeBatch({ ...roots, operationId });
    assert.equal(claimed.record.owner.pid, recovering.child.pid);
    assert.equal(claimed.record.ownerHistory.length, 2);
    assert.throws(
      () => resumeRuntimeBatch({ ...roots, operationId, observedDigest: claimed.digest }),
      { code: 'RUNTIME_MIGRATION_OWNER_UNCONFIRMED' }
    );
    recovering.child.kill('SIGKILL');
    assert.equal((await recovering.exited)[1], 'SIGKILL');
    recoverCoordination();
    assert.equal(
      resumeRuntimeBatch({ ...roots, operationId, observedDigest: claimed.digest }).status,
      'complete'
    );
    assert.equal(readRuntimeJsonRecord(statePath(root)).lastWordMarker, 1861);
    assert.equal(
      resumeRuntimeBatch({ ...roots, operationId, observedDigest: original.digest }).status,
      'complete'
    );
    assert.equal(inspectRuntimeBatch({ ...roots, operationId }).record.ownerHistory.length, 3);
  } finally {
    for (const { child, exited } of children) {
      child.kill('SIGKILL');
      await exited;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

for (const mode of ['record', 'optional-absence']) {
  test(
    'ordinary reading rechecks batch admission for ' + mode + ' after its initial check',
    async () => {
      const filesystem = await import('node:fs');
      const { syncBuiltinESMExports } = await import('node:module');
      const { execFileSync } = await import('node:child_process');
      const root = await createActivatedRuntimeRootFixture('1861-batch-read-race-');
      const originalRead = filesystem.default.readFileSync;
      const writer = new URL('../../../../task-tracker/lib/runtime-writer.mjs', import.meta.url)
        .href;
      let inserted = false;
      try {
        filesystem.default.readFileSync = function (target, ...args) {
          if (!inserted && target === statePath(root)) {
            inserted = true;
            const code = `import { writeRuntimeJsonBatch } from ${JSON.stringify(writer)};
          try { writeRuntimeJsonBatch(JSON.parse(process.argv[1]), { adapters: { faultSync: (point) => {
            if (point === 'after-batch-member-0') throw new Error('fixture partial publication');
          } } }); } catch (error) { if (error.message !== 'fixture partial publication') throw error; }`;
            execFileSync(
              process.execPath,
              [
                '--input-type=module',
                '-e',
                code,
                JSON.stringify([
                  { target: statePath(root), value: { lastWordMarker: 42 } },
                  { target: bindingPath(root), value: { issue: '#1861' } },
                ]),
              ],
              { stdio: 'pipe' }
            );
          }
          return originalRead(target, ...args);
        };
        syncBuiltinESMExports();
        assert.throws(
          () =>
            readRuntimeJsonRecord(mode === 'record' ? statePath(root) : bindingPath(root), {
              optional: mode === 'optional-absence',
            }),
          { code: 'RUNTIME_BATCH_INCOMPLETE' }
        );
        assert.equal(inserted, true);
        assert.equal(
          JSON.parse(originalRead(statePath(root))).lastWordMarker,
          42,
          'real writer published its first member'
        );
      } finally {
        filesystem.default.readFileSync = originalRead;
        syncBuiltinESMExports();
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
}

test('one batch joins main global state with linked binding and actor timing authority', async () => {
  const { execFileSync } = await import('node:child_process');
  const { planRuntimeInitialization, applyRuntimeInitialization } =
    await import('../../../../task-tracker/lib/runtime-initialize.mjs');
  const { actorTimingStateRecord } =
    await import('../../../../task-tracker/lib/actor-timing-state.mjs');
  const mainRoot = await createActivatedRuntimeRootFixture('1861-batch-linked-');
  const linked = mainRoot + '-linked';
  const actorIdentity = { provider: 'fixture', sid: 'batch-test' };
  const adapters = {
    identity: () => ({ ...actorIdentity, pid: process.pid, processToken: 'linked-batch-fixture' }),
  };
  try {
    execFileSync('git', [
      '-C',
      mainRoot,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture',
    ]);
    execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', linked], { stdio: 'pipe' });
    const plan = planRuntimeInitialization({ projectRoot: linked, mainRoot });
    await applyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters });
    const { timingActorKey } = await import('../../../../task-tracker/lib/timing-actor.mjs');
    const timing = path.join(
      linked,
      '.ai-task-manager/runtime/store/sessions',
      actorIdentity.sid,
      'timing',
      timingActorKey(actorIdentity).slice(3) + '.json'
    );
    const before = readFileSync(statePath(mainRoot));
    assert.throws(
      () =>
        writeRuntimeJsonBatch(
          [
            { target: statePath(mainRoot), value: { lastWordMarker: 1861 } },
            {
              target: path.join(linked, '.ai-task-manager/runtime/store/fleet/occupancy.json'),
              value: {},
            },
          ],
          { adapters }
        ),
      { code: 'RUNTIME_STATE_CORRUPT' }
    );
    assert.deepEqual(readFileSync(statePath(mainRoot)), before);
    const result = writeRuntimeJsonBatch(
      [
        { target: statePath(mainRoot), value: { lastWordMarker: 1861 } },
        { target: bindingPath(linked), value: { issue: '#1861' } },
        {
          target: timing,
          actorIdentity,
          value: actorTimingStateRecord(actorIdentity, { active: '#1861', lastWordMarker: 1861 }),
        },
      ],
      { adapters }
    );
    assert.equal(result.status, 'complete');
    assert.equal(readRuntimeJsonRecord(statePath(mainRoot)).lastWordMarker, 1861);
    assert.equal(readRuntimeJsonRecord(bindingPath(linked)).issue, '#1861');
    assert.deepEqual(readRuntimeJsonRecord(timing, { actorIdentity }).state, {
      active: '#1861',
      lastWordMarker: 1861,
    });
    const observation = inspectRuntimeBatch({
      projectRoot: linked,
      mainRoot,
      operationId: result.operationId,
    });
    assert.equal(observation.record.roots.length, 2);
    assert.equal(observation.record.members.length, 3);
    assert.equal(observation.record.members[2].projectRoot, linked);
    assert.deepEqual(observation.record.members[2].actorIdentity, actorIdentity);
  } finally {
    rmSync(linked, { recursive: true, force: true });
    rmSync(mainRoot, { recursive: true, force: true });
  }
});
