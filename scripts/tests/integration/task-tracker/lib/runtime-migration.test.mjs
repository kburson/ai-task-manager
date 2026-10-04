// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const parent = path.resolve('.ai-task-manager/runtime/test-fixtures');
mkdirSync(parent, { recursive: true });
const root = mkdtempSync(path.join(parent, 'migration-1857-'));
execFileSync('git', ['init', '-q', root]);
test.after(() => rmSync(root, { recursive: true, force: true }));
const executable = fileURLToPath(new URL('../../../../../bin/aitm.mjs', import.meta.url));
const physicalRoots = { projectRoot: root, mainRoot: root };
const digest = 'sha256:' + 'a'.repeat(64);
const admission = () => import('../../../../task-tracker/lib/runtime-migration-admission.mjs');

test('migration bootstrap admits exact registered forms without reading corrupt runtime', async () => {
  const { classifyRuntimeMigrationInvocation: classify } = await admission();
  mkdirSync(path.join(root, '.ai-task-manager/runtime'), { recursive: true });
  writeFileSync(path.join(root, '.ai-task-manager/runtime/control.json'), '{');
  for (const mode of ['plan', 'status']) {
    assert.equal(
      classify({ executable, physicalRoots, argv: ['migrate-runtime', mode] }).mode,
      mode
    );
  }
  for (const mode of ['apply', 'resume']) {
    const argv = [
      'migrate-runtime',
      mode,
      '--transaction',
      'transaction-1',
      '--approved-plan',
      digest,
      ...(mode === 'apply' ? ['--plan-file', path.join(root, 'approved-plan.json')] : []),
    ];
    assert.equal(classify({ executable, physicalRoots, argv }).approvedPlanDigest, digest);
    assert.equal(classify({ executable, physicalRoots, argv: argv.slice(0, -2) }), null);
  }
});

test('bootstrap rejects wrong executable, wrappers, extra tokens and ambiguous arguments', async () => {
  const { classifyRuntimeMigrationInvocation: classify } = await admission();
  const bad = [
    ['promote', '1857'],
    ['echo', 'migrate-runtime', 'plan'],
    ['migrate-runtime', 'plan', ';', 'touch', 'source.mjs'],
    ['migrate-runtime', 'plan', '--unknown'],
    ['migrate-runtime', 'status', '--transaction', '../escape'],
    [
      'migrate-runtime',
      'apply',
      '--transaction',
      'one',
      '--approved-plan',
      digest,
      '--transaction',
      'two',
    ],
    ['migrate-runtime', 'apply', '--transaction', 'one', '--approved-plan', 'wrong'],
  ];
  for (const argv of bad) assert.equal(classify({ executable, physicalRoots, argv }), null);
  assert.equal(
    classify({ executable: process.execPath, physicalRoots, argv: ['migrate-runtime', 'plan'] }),
    null
  );
  assert.equal(classify({ executable, physicalRoots, argv: 'migrate-runtime plan' }), null);
});

test('bootstrap accepts exact-hash legacy trust planning and never requires volatile input on resume', async () => {
  const { classifyRuntimeMigrationInvocation: classify } = await admission();
  const file = path.join(root, 'observed-plan.json');
  const argv = ['migrate-runtime', 'plan', '--trust-plan', file, '--approved-plan', digest];
  const selected = classify({ executable, physicalRoots, argv });
  assert.equal(selected?.trustPlanFile, file);
  assert.equal(selected.approvedPlanDigest, digest);
  assert.equal(classify({ executable, physicalRoots, argv: argv.slice(0, -2) }), null);
  assert.equal(
    classify({ executable, physicalRoots, argv: ['migrate-runtime', 'plan', '--plan-file', file] }),
    null
  );
  assert.equal(
    classify({
      executable,
      physicalRoots,
      argv: ['migrate-runtime', 'apply', '--transaction', 'one', '--approved-plan', digest],
    }),
    null
  );
  assert.equal(
    classify({
      executable,
      physicalRoots,
      argv: [
        'migrate-runtime',
        'resume',
        '--transaction',
        'one',
        '--approved-plan',
        digest,
        '--plan-file',
        file,
      ],
    }),
    null
  );
});

test('bootstrap rejects artifact-root identity even when it contains a real Git repository', async () => {
  const { classifyRuntimeMigrationInvocation: classify } = await admission();
  const unsafe = path.join(root, '.tmp', 'forged');
  mkdirSync(unsafe, { recursive: true });
  execFileSync('git', ['init', '-q', unsafe]);
  assert.equal(
    classify({
      executable,
      argv: ['migrate-runtime', 'plan'],
      physicalRoots: { projectRoot: unsafe, mainRoot: unsafe },
    }),
    null
  );
});

test('bootstrap compares executable physical identity and rejects copied package entrypoints', async () => {
  const { classifyRuntimeMigrationInvocation: classify } = await admission();
  const { copyFileSync, symlinkSync } = await import('node:fs');
  const copied = path.join(root, 'aitm.mjs');
  copyFileSync(executable, copied);
  const alias = path.join(root, 'registered-alias.mjs');
  symlinkSync(executable, alias);
  const copiedAlias = path.join(root, 'copied-alias.mjs');
  symlinkSync(copied, copiedAlias);
  const argv = ['migrate-runtime', 'status'];
  assert.equal(classify({ executable: copied, physicalRoots, argv }), null);
  assert.equal(classify({ executable: copiedAlias, physicalRoots, argv }), null);
  assert.equal(classify({ executable: alias, physicalRoots, argv }).executable, executable);
  assert.equal(
    classify({
      executable,
      argv,
      physicalRoots: { projectRoot: root, mainRoot: path.dirname(root) },
    }),
    null
  );
});

test('writer leases are durable, scoped and removed after successful or failed operations', async () => {
  const { withRuntimeWriterLease } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const { readdirSync } = await import('node:fs');
  const adapters = {
    identity: () => ({
      provider: 'fixture',
      sid: 'writer',
      pid: 1001,
      processToken: 'fixture-process',
    }),
  };
  const leases = path.join(root, '.ai-task-manager/runtime/migrations/writers');
  await withRuntimeWriterLease({ ...physicalRoots, adapters }, async () => {
    assert.equal(readdirSync(leases).length, 1);
  });
  assert.deepEqual(readdirSync(leases), []);
  await assert.rejects(
    withRuntimeWriterLease({ ...physicalRoots, adapters }, async () => {
      throw new Error('operation failed');
    }),
    new RegExp('operation failed')
  );
  assert.deepEqual(readdirSync(leases), []);
});

test('fencing drains existing leases and prevents new writers without accepting unknown older writers', async () => {
  const { withRuntimeWriterLease, fenceRuntimeWriters } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const writer = { provider: 'fixture', sid: 'writer', pid: 1001, processToken: 'writer-process' };
  const owner = {
    provider: 'fixture',
    sid: 'migrator',
    pid: 1002,
    processToken: 'migration-process',
  };
  const base = { ...physicalRoots, transactionId: 'fence-1', approvedPlanDigest: digest };
  const adapters = {
    identity: () => owner,
    writerCensus: () => ({ complete: true, writers: [], claims: [] }),
  };
  await assert.rejects(
    fenceRuntimeWriters({
      ...base,
      adapters: { ...adapters, writerCensus: () => ({ complete: false }) },
    }),
    { code: 'RUNTIME_WRITER_CENSUS_UNKNOWN' }
  );
  await assert.rejects(
    fenceRuntimeWriters({
      ...base,
      adapters: {
        ...adapters,
        writerCensus: () => ({
          complete: true,
          writers: [{ ...writer, cooperative: false }],
          claims: [],
        }),
      },
    }),
    { code: 'RUNTIME_WRITERS_ACTIVE' }
  );
  await withRuntimeWriterLease(
    { ...physicalRoots, adapters: { identity: () => writer } },
    async () => {
      const result = await fenceRuntimeWriters({ ...base, adapters });
      assert.equal(result.status, 'draining');
      assert.equal(result.leases.length, 1);
      await assert.rejects(
        withRuntimeWriterLease(
          {
            ...physicalRoots,
            adapters: { identity: () => ({ ...writer, processToken: 'new-writer' }) },
          },
          async () => {}
        ),
        { code: 'RUNTIME_TRANSACTION_INCOMPLETE' }
      );
    }
  );
  assert.equal((await fenceRuntimeWriters({ ...base, adapters })).status, 'quiesced');
  await assert.rejects(fenceRuntimeWriters({ ...base, transactionId: 'other', adapters }), {
    code: 'RUNTIME_MIGRATION_CONFLICT',
  });
});

function coordinationFixture() {
  const directory = mkdtempSync(path.join(root, 'coordination-'));
  execFileSync('git', ['init', '-q', directory]);
  return { projectRoot: directory, mainRoot: directory };
}

test('known cooperative in-flight writers drain under a fence while unknown older processes refuse', async () => {
  const { withRuntimeWriterLease, fenceRuntimeWriters } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const roots = coordinationFixture();
  const writer = { provider: 'fixture', sid: 'writer', pid: 1001, processToken: 'writer-process' };
  const owner = {
    provider: 'fixture',
    sid: 'migrator',
    pid: 1002,
    processToken: 'migration-process',
  };
  const adapters = {
    identity: () => owner,
    writerCensus: () => ({
      complete: true,
      writers: [{ ...writer, cooperative: true }],
      claims: [],
    }),
  };
  const input = { ...roots, transactionId: 'cooperative-1', approvedPlanDigest: digest, adapters };
  await assert.rejects(fenceRuntimeWriters(input), { code: 'RUNTIME_WRITERS_ACTIVE' });
  await withRuntimeWriterLease({ ...roots, adapters: { identity: () => writer } }, async () => {
    assert.equal((await fenceRuntimeWriters(input)).status, 'draining');
  });
  adapters.writerCensus = () => ({
    complete: true,
    writers: [],
    claims: [{ provider: owner.provider, sid: owner.sid }],
  });
  assert.equal((await fenceRuntimeWriters(input)).status, 'quiesced');
});

test('nested synchronous and asynchronous writers share the outer lease through publication', async () => {
  const { withRuntimeWriterLease, withRuntimeWriterLeaseSync, fenceRuntimeWriters } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const { readdirSync } = await import('node:fs');
  const roots = coordinationFixture();
  const owner = {
    provider: 'fixture',
    sid: 'nested',
    pid: process.pid,
    processToken: 'nested-process',
  };
  const selected = { ...roots, adapters: { identity: () => owner } };
  const directory = path.join(roots.mainRoot, '.ai-task-manager/runtime/migrations/writers');
  await withRuntimeWriterLease(selected, async () => {
    const original = readdirSync(directory);
    assert.equal(original.length, 1);
    await fenceRuntimeWriters({
      ...roots,
      transactionId: 'nested-fence',
      approvedPlanDigest: digest,
      adapters: {
        identity: () => owner,
        writerCensus: () => ({ complete: true, writers: [], claims: [] }),
      },
    });
    assert.equal(
      withRuntimeWriterLeaseSync(selected, () => {
        assert.deepEqual(readdirSync(directory), original);
        return 17;
      }),
      17
    );
    await withRuntimeWriterLease(selected, async () => {
      await Promise.resolve();
      assert.deepEqual(readdirSync(directory), original);
    });
    assert.deepEqual(readdirSync(directory), original);
  });
  assert.deepEqual(readdirSync(directory), []);
});

test('corrupt and aliased fence records cannot be treated as an absent fence', async () => {
  const { withRuntimeWriterLease } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const { symlinkSync } = await import('node:fs');
  const roots = coordinationFixture();
  const base = path.join(roots.mainRoot, '.ai-task-manager/runtime/migrations');
  mkdirSync(base, { recursive: true });
  const fence = path.join(base, 'fence.json');
  const adapters = {
    identity: () => ({
      provider: 'fixture',
      sid: 'writer',
      pid: 1001,
      processToken: 'writer-process',
    }),
  };
  writeFileSync(fence, '{');
  await assert.rejects(
    withRuntimeWriterLease({ ...roots, adapters }, async () => assert.fail('must not execute')),
    { code: 'RUNTIME_CONTROL_INVALID' }
  );
  rmSync(fence);
  symlinkSync(path.join(roots.mainRoot, '.tmp/missing'), fence);
  await assert.rejects(
    withRuntimeWriterLease({ ...roots, adapters }, async () => assert.fail('must not execute')),
    { code: 'RUNTIME_CONTROL_INVALID' }
  );
});

test('unknown coordinator ownership is retained rather than reclaimed by age', async () => {
  const { withRuntimeWriterLease } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const { existsSync } = await import('node:fs');
  const roots = coordinationFixture();
  const lock = path.join(roots.mainRoot, '.ai-task-manager/runtime/migrations/coordinator.lock');
  mkdirSync(lock, { recursive: true });
  writeFileSync(path.join(lock, 'unknown.json'), '{}');
  const adapters = {
    identity: () => ({
      provider: 'fixture',
      sid: 'writer',
      pid: 1001,
      processToken: 'writer-process',
    }),
  };
  await assert.rejects(
    withRuntimeWriterLease({ ...roots, adapters }, async () => assert.fail('must not execute')),
    { code: 'RUNTIME_MIGRATION_BUSY' }
  );
  assert.equal(existsSync(path.join(lock, 'unknown.json')), true);
});

test('coordinator release preserves replaced ownership instead of unlinking another owner', async () => {
  const { fenceRuntimeWriters } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const { readFileSync, existsSync } = await import('node:fs');
  const roots = coordinationFixture();
  const ownerFile = path.join(
    roots.mainRoot,
    '.ai-task-manager/runtime/migrations/coordinator.lock'
  );
  const owner = {
    provider: 'fixture',
    sid: 'migrator',
    pid: 1002,
    processToken: 'migration-process',
  };
  const replacement = { ...owner, processToken: 'replacement-process' };
  await assert.rejects(
    fenceRuntimeWriters({
      ...roots,
      transactionId: 'tamper-1',
      approvedPlanDigest: digest,
      adapters: {
        identity: () => owner,
        writerCensus: () => {
          const record = JSON.parse(readFileSync(ownerFile, 'utf8'));
          writeFileSync(ownerFile, JSON.stringify({ ...record, owner: replacement }));
          return { complete: true, writers: [], claims: [] };
        },
      },
    }),
    { code: 'RUNTIME_MIGRATION_CONFLICT' }
  );
  assert.equal(existsSync(ownerFile), true);
  assert.deepEqual(JSON.parse(readFileSync(ownerFile, 'utf8')).owner, replacement);
});

test('malformed owners and foreign-root lease records fail closed before fencing', async () => {
  const { fenceRuntimeWriters } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const roots = coordinationFixture();
  const directory = path.join(roots.mainRoot, '.ai-task-manager/runtime/migrations/writers');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'abcd.json');
  const owner = {
    provider: 'fixture',
    sid: 'migrator',
    pid: 1002,
    processToken: 'migration-process',
  };
  const input = {
    ...roots,
    transactionId: 'invalid-lease-1',
    approvedPlanDigest: digest,
    adapters: {
      identity: () => owner,
      writerCensus: () => ({ complete: true, writers: [], claims: [] }),
    },
  };
  for (const lease of [
    { owner: {}, projectRoot: roots.projectRoot },
    { owner, projectRoot: root },
  ]) {
    writeFileSync(
      file,
      JSON.stringify({ schema: 'aitm.runtime-writer/v1', leaseId: 'abcd', ...lease })
    );
    await assert.rejects(fenceRuntimeWriters(input), { code: 'RUNTIME_CONTROL_INVALID' });
  }
});

test(
  'a separate live process lease drains before migration can become quiescent',
  { timeout: 15000 },
  async () => {
    const { fenceRuntimeWriters } =
      await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
    const { spawn } = await import('node:child_process');
    const { once } = await import('node:events');
    const roots = coordinationFixture();
    const moduleUrl = new URL(
      '../../../../task-tracker/lib/runtime-migration-lock.mjs',
      import.meta.url
    ).href;
    const childSource = [
      'import { withRuntimeWriterLease } from ' + JSON.stringify(moduleUrl) + ';',
      'const roots = ' + JSON.stringify(roots) + ';',
      'const owner = {provider:"fixture",sid:"child-writer",pid:process.pid,processToken:"child-process"};',
      'await withRuntimeWriterLease({...roots,adapters:{identity:()=>owner}}, async()=>{process.stdout.write("ready");await new Promise(resolve=>process.stdin.once("data",resolve));});',
    ].join('\n');
    const child = spawn(process.execPath, ['--input-type=module', '-e', childSource], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const finished = once(child, 'exit');
    const deadline = setTimeout(() => child.kill(), 10000);
    deadline.unref();
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    try {
      const ready = once(child.stdout, 'data');
      const first = await Promise.race([ready.then(() => 'ready'), finished.then(() => 'exit')]);
      assert.equal(first, 'ready', stderr);
      const owner = {
        provider: 'fixture',
        sid: 'migrator',
        pid: process.pid,
        processToken: 'parent-process',
      };
      const childOwner = {
        provider: 'fixture',
        sid: 'child-writer',
        pid: child.pid,
        processToken: 'child-process',
        cooperative: true,
      };
      const adapters = {
        identity: () => owner,
        writerCensus: () => ({ complete: true, writers: [childOwner], claims: [] }),
      };
      const input = {
        ...roots,
        transactionId: 'cross-process-1',
        approvedPlanDigest: digest,
        adapters,
      };
      assert.equal((await fenceRuntimeWriters(input)).status, 'draining');
      child.stdin.end('finish');
      const [code] = await finished;
      assert.equal(code, 0, stderr);
      adapters.writerCensus = () => ({ complete: true, writers: [], claims: [] });
      assert.equal((await fenceRuntimeWriters(input)).status, 'quiesced');
    } finally {
      clearTimeout(deadline);
      if (child.exitCode === null) child.kill();
    }
  }
);

test('synchronous writers retain a lease through byte publication and return synchronously', async () => {
  const { withRuntimeWriterLeaseSync } =
    await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
  const { readdirSync, readFileSync } = await import('node:fs');
  const roots = coordinationFixture();
  const adapters = {
    identity: () => ({
      provider: 'fixture',
      sid: 'sync-writer',
      pid: 1001,
      processToken: 'sync-process',
    }),
  };
  const leases = path.join(roots.mainRoot, '.ai-task-manager/runtime/migrations/writers');
  const file = path.join(roots.projectRoot, 'published.txt');
  const result = withRuntimeWriterLeaseSync({ ...roots, adapters }, () => {
    assert.equal(readdirSync(leases).length, 1);
    writeFileSync(file, 'published bytes');
    assert.equal(readFileSync(file, 'utf8'), 'published bytes');
    assert.equal(readdirSync(leases).length, 1);
    return 17;
  });
  assert.equal(result, 17);
  assert.deepEqual(readdirSync(leases), []);
  assert.throws(
    () =>
      withRuntimeWriterLeaseSync({ ...roots, adapters }, () => {
        throw new Error('sync failure');
      }),
    new RegExp('sync failure')
  );
  assert.deepEqual(readdirSync(leases), []);
});
