// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';

const parent = path.resolve('.ai-task-manager/runtime/test-fixtures');
mkdirSync(parent, { recursive: true });
const fixture = mkdtempSync(path.join(parent, 'transaction-1857-'));
test.after(() => rmSync(fixture, { recursive: true, force: true }));
function repository(name) {
  const root = path.join(fixture, name);
  mkdirSync(root);
  execFileSync('git', ['init', '-q', root]);
  return { projectRoot: root, mainRoot: root };
}
function seed(roots) {
  const source = path.join(roots.projectRoot, '.tmp/aitm/state/task-tracker-state.json');
  mkdirSync(path.dirname(source), { recursive: true });
  writeFileSync(
    source,
    JSON.stringify({ active: 1857, entryStartTs: '2026-09-30T00:00:00Z' }) + '\n'
  );
  writeFileSync(path.join(path.dirname(source), 'task-tracker-queue.json'), '[]');
  const fleet = path.join(roots.mainRoot, '.tmp/aitm/fleet');
  mkdirSync(fleet, { recursive: true });
  writeFileSync(path.join(fleet, 'task-fleet.json'), '{}');
  writeFileSync(path.join(fleet, 'occupancy.json'), '{}');
  return source;
}
const engine = () => import('../../../../task-tracker/lib/runtime-migration.mjs');
const adapters = {
  classifyLegacy: ({ relative }) => {
    const records = {
      'state/task-tracker-state.json': ['state', 'local', 'object'],
      'state/task-tracker-queue.json': ['queue', 'local', 'array'],
      'fleet/task-fleet.json': ['fleet', 'shared', 'object'],
      'fleet/occupancy.json': ['occupancy', 'shared', 'object'],
    };
    const record = records[relative];
    if (!record) return null;
    return {
      destination: relative,
      family: record[0],
      scope: record[1],
      validate: (bytes) => {
        const value = JSON.parse(bytes);
        return record[2] === 'array'
          ? Array.isArray(value)
          : value !== null &&
              typeof value === 'object' &&
              !Array.isArray(value) &&
              value.schema === undefined;
      },
    };
  },
  trustLegacy: () => 'explicit-operator-trust',
  writerCensus: () => ({ complete: true, writers: [], claims: [] }),
};

test('migration planning hashes exact sources and census without creating runtime records', async () => {
  const { planRuntimeMigration } = await engine();
  const roots = repository('plan');
  const source = seed(roots);
  const original = readFileSync(source);
  const plan = await planRuntimeMigration({ ...roots, adapters });
  assert.equal(plan.schema, 'aitm.runtime-migration-plan/v1');
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.files.length, 4);
  assert.ok(plan.files.some((file) => file.source === source));
  assert.match(plan.files[0].digest, new RegExp('^sha256:[a-f0-9]{64}$'));
  assert.match(plan.digest, new RegExp('^sha256:[a-f0-9]{64}$'));
  assert.deepEqual(plan.roots, [roots.projectRoot]);
  assert.equal(existsSync(path.join(roots.projectRoot, '.ai-task-manager/runtime')), false);
  assert.deepEqual(readFileSync(source), original);
});

test('planning retains unknown, unsupported, aliased and untrusted input as explicit blockers', async () => {
  const { planRuntimeMigration } = await engine();
  for (const kind of ['unknown', 'schema', 'alias', 'trust', 'census']) {
    const roots = repository(kind);
    const source = seed(roots);
    if (kind === 'unknown') writeFileSync(path.join(path.dirname(source), 'unexpected.json'), '{}');
    if (kind === 'schema') writeFileSync(source, JSON.stringify({ schema: 'unsupported/v99' }));
    if (kind === 'alias') {
      rmSync(source);
      symlinkSync(path.join(roots.projectRoot, 'missing.json'), source);
    }
    const selected = { ...adapters };
    if (kind === 'trust') delete selected.trustLegacy;
    if (kind === 'census') delete selected.writerCensus;
    const plan = await planRuntimeMigration({ ...roots, adapters: selected });
    const expected = {
      unknown: 'unknown-source',
      schema: 'unsupported-schema',
      alias: 'source-alias',
      trust: 'legacy-trust-required',
      census: 'writer-census-unknown',
    }[kind];
    assert.ok(
      plan.blockers.some((item) => item.code === expected),
      JSON.stringify(plan.blockers)
    );
  }
});

test('planning refuses aliases above the legacy directory and records active writer blockers', async () => {
  const { planRuntimeMigration } = await engine();
  const roots = repository('parent-alias');
  const target = path.join(roots.projectRoot, 'redirect');
  mkdirSync(path.join(target, 'aitm/state'), { recursive: true });
  writeFileSync(path.join(target, 'aitm/state/task-tracker-state.json'), '{}');
  symlinkSync(target, path.join(roots.projectRoot, '.tmp'));
  const aliased = await planRuntimeMigration({ ...roots, adapters });
  assert.ok(aliased.blockers.some((item) => item.code === 'source-alias'));
  assert.equal(aliased.files.length, 0);

  const activeRoots = repository('active-writer');
  seed(activeRoots);
  const active = await planRuntimeMigration({
    ...activeRoots,
    adapters: {
      ...adapters,
      writerCensus: () => ({
        complete: true,
        writers: [
          { provider: 'fixture', sid: 'other', pid: 91, processToken: 'older', cooperative: false },
        ],
        claims: [],
      }),
    },
  });
  assert.ok(active.blockers.some((item) => item.code === 'writers-active'));
});

test('duplicate source destinations and existing stores are never silently overwritten', async () => {
  const { planRuntimeMigration } = await engine();
  const roots = repository('duplicate');
  seed(roots);
  const second = path.join(roots.projectRoot, '.db/aitm/state/task-tracker-state.json');
  mkdirSync(path.dirname(second), { recursive: true });
  writeFileSync(second, '{}');
  const plan = await planRuntimeMigration({ ...roots, adapters });
  assert.ok(plan.blockers.some((item) => item.code === 'ambiguous-source'));
  const destination = path.join(roots.projectRoot, '.ai-task-manager/runtime/store');
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, 'preserve'), 'existing bytes');
  const conflict = await planRuntimeMigration({ ...roots, adapters });
  assert.ok(conflict.blockers.some((item) => item.code === 'destination-exists'));
  assert.equal(readFileSync(path.join(destination, 'preserve'), 'utf8'), 'existing bytes');
});

test('classifier scope/family is closed and old shared or Claude state cannot disappear from inventory', async () => {
  const { planRuntimeMigration } = await engine();
  const roots = repository('classification');
  seed(roots);
  for (const classification of [
    { scope: 'elsewhere', family: 'state' },
    { scope: 'local', family: 'invented-authority' },
  ]) {
    const plan = await planRuntimeMigration({
      ...roots,
      adapters: {
        ...adapters,
        classifyLegacy: () => ({
          ...classification,
          destination: 'state/task-tracker-state.json',
          validate: () => true,
        }),
      },
    });
    assert.ok(plan.blockers.some((item) => item.code === 'unsupported-classification'));
  }
  for (const directory of ['.claude', '.ai-task-manager']) {
    const file = path.join(roots.projectRoot, directory, 'task-tracker-state.json');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '{}');
  }
  const plan = await planRuntimeMigration({ ...roots, adapters });
  assert.equal(plan.blockers.filter((item) => item.code === 'unknown-source').length, 2);
});

function transactionAdapters(extra = {}) {
  return {
    ...adapters,
    identity: () => ({
      provider: 'fixture',
      sid: 'migrator',
      pid: process.pid,
      processToken: 'first-process',
    }),
    publishTiming: async () => ({ status: 'confirmed' }),
    ...extra,
  };
}

test('apply requires the exact approved plan and unchanged source bytes before publication', async () => {
  const { planRuntimeMigration, applyRuntimeMigration } = await engine();
  const roots = repository('apply-preconditions');
  const source = seed(roots);
  const selected = transactionAdapters();
  const plan = await planRuntimeMigration({ ...roots, adapters: selected });
  await assert.rejects(
    applyRuntimeMigration({
      plan,
      approvedPlanDigest: 'sha256:' + '0'.repeat(64),
      adapters: selected,
    }),
    { code: 'RUNTIME_MIGRATION_APPROVAL_REQUIRED' }
  );
  writeFileSync(source, JSON.stringify({ active: 9 }));
  await assert.rejects(
    applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: selected }),
    { code: 'RUNTIME_MIGRATION_PLAN_CHANGED' }
  );
  assert.equal(existsSync(path.join(roots.projectRoot, '.ai-task-manager/runtime/store')), false);
});

test('complete publication preserves original bytes and reconciles timing once', async () => {
  const { planRuntimeMigration, applyRuntimeMigration, readRuntimeMigrationStatus } =
    await engine();
  const roots = repository('apply-complete');
  const source = seed(roots);
  const original = readFileSync(source);
  const publications = [];
  const selected = transactionAdapters({
    publishTiming: async (record) => {
      publications.push(record);
      return { status: 'confirmed' };
    },
  });
  const plan = await planRuntimeMigration({ ...roots, adapters: selected });
  const result = await applyRuntimeMigration({
    plan,
    approvedPlanDigest: plan.digest,
    adapters: selected,
  });
  assert.equal(result.status, 'complete');
  assert.deepEqual(readFileSync(source), original);
  assert.deepEqual(
    readFileSync(plan.files.find((file) => file.source === source).destination),
    original
  );
  const status = await readRuntimeMigrationStatus({
    ...roots,
    transactionId: result.transactionId,
  });
  assert.equal(status.status, 'complete');
  assert.equal(publications.length, 1);
  assert.equal(status.timing.publication.status, 'confirmed');
  assert.equal(
    existsSync(path.join(roots.projectRoot, '.ai-task-manager/runtime/migrations/fence.json')),
    false
  );
});

test('interrupted multi-root publication resumes from durable plan after confirmed owner death', async () => {
  const {
    planRuntimeMigration,
    applyRuntimeMigration,
    resumeRuntimeMigration,
    readRuntimeMigrationStatus,
  } = await engine();
  const roots = repository('resume-main');
  execFileSync('git', [
    '-C',
    roots.projectRoot,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  const linked = path.join(fixture, 'resume-linked');
  execFileSync('git', [
    '-C',
    roots.projectRoot,
    'worktree',
    'add',
    '-qb',
    'fixture-linked',
    linked,
  ]);
  const originals = [seed(roots), seed({ projectRoot: linked, mainRoot: roots.mainRoot })].map(
    (source) => [source, readFileSync(source)]
  );
  const firstOwner = {
    provider: 'fixture',
    sid: 'first',
    pid: 1001,
    processToken: 'first-process',
  };
  const selected = transactionAdapters({
    identity: () => firstOwner,
    fault: (point) => {
      if (point === 'after-root-publish') throw new Error('injected publication crash');
    },
  });
  const plan = await planRuntimeMigration({ ...roots, adapters: selected });
  await assert.rejects(
    applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: selected }),
    new RegExp('injected publication crash')
  );
  const transactionId = 'migration-' + plan.digest.slice(7, 39);
  assert.equal(
    (await readRuntimeMigrationStatus({ ...roots, transactionId })).status,
    'publishing'
  );
  const calls = [];
  const next = transactionAdapters({
    identity: () => ({ provider: 'fixture', sid: 'next', pid: 1002, processToken: 'next-process' }),
    observeOwner: () => ({ status: 'dead', identity: firstOwner }),
    publishTiming: async (record) => {
      calls.push(record);
      return { status: 'confirmed' };
    },
  });
  for (const status of ['unknown', 'alive', 'pid-reused']) {
    await assert.rejects(
      resumeRuntimeMigration({
        ...roots,
        transactionId,
        approvedPlanDigest: plan.digest,
        adapters: { ...next, observeOwner: () => ({ status, identity: firstOwner }) },
      }),
      { code: 'RUNTIME_MIGRATION_OWNER_UNCONFIRMED' }
    );
  }
  const result = await resumeRuntimeMigration({
    ...roots,
    transactionId,
    approvedPlanDigest: plan.digest,
    adapters: next,
  });
  assert.equal(result.status, 'complete');
  for (const [source, original] of originals) assert.deepEqual(readFileSync(source), original);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].intervals[0].durationMs, null);
  assert.equal(calls[0].intervals[0].completeness, 'interrupted-end-unknown');
  assert.equal(calls[0].intervals.length, 2);
  await resumeRuntimeMigration({
    ...roots,
    transactionId,
    approvedPlanDigest: plan.digest,
    adapters: next,
  });
  assert.equal(calls.length, 1);
});

test('a crash before ordinary manifest creation retains an exact durable bootstrap plan', async () => {
  const {
    planRuntimeMigration,
    applyRuntimeMigration,
    resumeRuntimeMigration,
    readRuntimeMigrationStatus,
  } = await engine();
  const roots = repository('bootstrap-crash');
  seed(roots);
  const owner = { provider: 'fixture', sid: 'before', pid: 1001, processToken: 'before-process' };
  const selected = transactionAdapters({
    identity: () => owner,
    faultSync: (point) => {
      if (point === 'after-bootstrap') throw new Error('injected bootstrap crash');
    },
  });
  const plan = await planRuntimeMigration({ ...roots, adapters: selected });
  await assert.rejects(
    applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: selected }),
    new RegExp('injected bootstrap crash')
  );
  const transactionId = 'migration-' + plan.digest.slice(7, 39);
  const status = await readRuntimeMigrationStatus({ ...roots, transactionId });
  assert.equal(status.status, 'prepared');
  assert.equal(status.checkpoint, 'bootstrap-only');
  const { readRuntimeMigrationSnapshot } =
    await import('../../../../task-tracker/lib/runtime-migration-apply.mjs');
  const snapshot = readRuntimeMigrationSnapshot({ ...roots, transactionId });
  assert.deepEqual(snapshot.plan, plan);
  assert.equal(snapshot.manifest.checkpoint, 'bootstrap-only');
  assert.equal(
    existsSync(path.join(roots.mainRoot, '.ai-task-manager/runtime/migrations/fence.json')),
    false
  );
  const next = transactionAdapters({
    identity: () => ({
      provider: 'fixture',
      sid: 'after',
      pid: 1002,
      processToken: 'after-process',
    }),
    observeOwner: () => ({ status: 'dead', identity: owner }),
  });
  assert.equal(
    (
      await resumeRuntimeMigration({
        ...roots,
        transactionId,
        approvedPlanDigest: plan.digest,
        adapters: next,
      })
    ).status,
    'complete'
  );
});

test('post-fence failure retains a journal and pending timing retries ignore later mutable store changes', async () => {
  const {
    planRuntimeMigration,
    applyRuntimeMigration,
    resumeRuntimeMigration,
    readRuntimeMigrationStatus,
  } = await engine();
  const roots = repository('after-fence');
  const source = seed(roots);
  const selected = transactionAdapters({
    fault: (point) => {
      if (point === 'after-fence') throw new Error('injected fence crash');
    },
  });
  const plan = await planRuntimeMigration({ ...roots, adapters: selected });
  await assert.rejects(
    applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: selected }),
    new RegExp('injected fence crash')
  );
  const transactionId = 'migration-' + plan.digest.slice(7, 39);
  assert.equal((await readRuntimeMigrationStatus({ ...roots, transactionId })).status, 'prepared');
  const keys = [];
  const pending = transactionAdapters({
    publishTiming: async ({ idempotencyKey }) => {
      keys.push(idempotencyKey);
      throw new Error('outcome unknown');
    },
  });
  const first = await resumeRuntimeMigration({
    ...roots,
    transactionId,
    approvedPlanDigest: plan.digest,
    adapters: pending,
  });
  assert.equal(first.timing.publication.status, 'pending');
  writeFileSync(
    plan.files.find((file) => file.source === source).destination,
    JSON.stringify({ active: 12 })
  );
  writeFileSync(source, 'inert legacy tampering');
  const confirmed = transactionAdapters({
    publishTiming: async ({ idempotencyKey }) => {
      keys.push(idempotencyKey);
      return { status: 'confirmed' };
    },
  });
  const result = await resumeRuntimeMigration({
    ...roots,
    transactionId,
    approvedPlanDigest: plan.digest,
    adapters: confirmed,
  });
  assert.equal(result.timing.publication.status, 'confirmed');
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test('completed transaction crash boundaries retain a recoverable exact-owner fence', async () => {
  const {
    planRuntimeMigration,
    applyRuntimeMigration,
    resumeRuntimeMigration,
    readRuntimeMigrationStatus,
  } = await engine();
  for (const boundary of [
    'after-manifest-complete',
    'after-timing-publish',
    'before-fence-release',
  ]) {
    const roots = repository(boundary);
    const legacy = seed(roots);
    const owner = {
      provider: 'fixture',
      sid: 'completed',
      pid: 2001,
      processToken: 'completed-first',
    };
    const calls = [];
    const selected = transactionAdapters({
      identity: () => owner,
      publishTiming: async ({ idempotencyKey }) => {
        calls.push(idempotencyKey);
        return { status: 'confirmed' };
      },
      fault: (point) => {
        if (point === boundary) throw new Error('injected completed crash');
      },
    });
    const plan = await planRuntimeMigration({ ...roots, adapters: selected });
    await assert.rejects(
      applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: selected }),
      new RegExp('injected completed crash')
    );
    const transactionId = 'migration-' + plan.digest.slice(7, 39);
    const input = { ...roots, transactionId, approvedPlanDigest: plan.digest };
    const fence = path.join(roots.mainRoot, '.ai-task-manager/runtime/migrations/fence.json');
    assert.equal((await readRuntimeMigrationStatus(input)).status, 'complete');
    assert.equal(existsSync(fence), true);
    writeFileSync(legacy, 'inert legacy after activation');
    writeFileSync(
      plan.files.find((file) => file.source === legacy).destination,
      JSON.stringify({ active: 99 })
    );
    const next = {
      ...selected,
      fault: undefined,
      identity: () => ({
        provider: 'fixture',
        sid: 'recovery',
        pid: 2002,
        processToken: 'completed-next',
      }),
    };
    for (const status of ['unknown', 'alive', 'pid-reused']) {
      await assert.rejects(
        resumeRuntimeMigration({
          ...input,
          adapters: { ...next, observeOwner: () => ({ status, identity: owner }) },
        }),
        { code: 'RUNTIME_MIGRATION_OWNER_UNCONFIRMED' }
      );
      assert.equal(existsSync(fence), true);
    }
    const recovered = { ...next, observeOwner: () => ({ status: 'dead', identity: owner }) };
    assert.equal(
      (await resumeRuntimeMigration({ ...input, adapters: recovered })).status,
      'complete'
    );
    assert.equal(existsSync(fence), false);
    await resumeRuntimeMigration({ ...input, adapters: recovered });
    assert.equal(calls.length, 1);
  }
});

test('recovery refuses malformed protected journals and controls without changing evidence', async () => {
  const { planRuntimeMigration, applyRuntimeMigration, resumeRuntimeMigration } = await engine();
  const roots = repository('corrupt-completed');
  seed(roots);
  const selected = transactionAdapters();
  const plan = await planRuntimeMigration({ ...roots, adapters: selected });
  const { transactionId } = await applyRuntimeMigration({
    plan,
    approvedPlanDigest: plan.digest,
    adapters: selected,
  });
  const runtime = path.join(roots.mainRoot, '.ai-task-manager/runtime');
  const manifestPath = path.join(runtime, 'migrations', transactionId, 'manifest.json');
  const bootstrapPath = path.join(runtime, 'migrations', transactionId, 'bootstrap.json');
  const controlPath = path.join(runtime, 'control.json');
  const originals = new Map(
    [manifestPath, bootstrapPath, controlPath].map((file) => [file, readFileSync(file)])
  );
  const cases = [
    [manifestPath, () => null],
    [manifestPath, (record) => ({ ...record, status: 'invented' })],
    [manifestPath, (record) => ({ ...record, schema: 'unknown' })],
    [manifestPath, (record) => ({ ...record, publishedRoots: undefined })],
    [manifestPath, (record) => ({ ...record, publishedRoots: [] })],
    [manifestPath, (record) => ({ ...record, timing: undefined })],
    [manifestPath, (record) => ({ ...record, timing: { ...record.timing, intervals: [{}] } })],
    [manifestPath, (record) => ({ ...record, owner: { pid: -1 } })],
    [manifestPath, (record) => ({ ...record, roots: [path.join(roots.mainRoot, 'other')] })],
    [bootstrapPath, () => null],
    [bootstrapPath, (record) => ({ ...record, manifest: null })],
    [controlPath, () => null],
    [controlPath, (record) => ({ ...record, schema: 'unknown' })],
    [controlPath, (record) => ({ ...record, projectRoot: path.join(roots.mainRoot, 'other') })],
  ];
  for (const [file, mutate] of cases) {
    const corrupt = JSON.stringify(mutate(JSON.parse(originals.get(file))));
    writeFileSync(file, corrupt);
    const before = new Map([...originals.keys()].map((target) => [target, readFileSync(target)]));
    await assert.rejects(
      resumeRuntimeMigration({
        ...roots,
        transactionId,
        approvedPlanDigest: plan.digest,
        adapters: selected,
      }),
      { code: 'RUNTIME_CONTROL_INVALID' }
    );
    for (const [target, bytes] of before) assert.deepEqual(readFileSync(target), bytes);
    writeFileSync(file, originals.get(file));
  }
});

test('a corrupt retained fence cannot masquerade as an already released fence', async () => {
  const { planRuntimeMigration, applyRuntimeMigration, resumeRuntimeMigration } = await engine();
  const roots = repository('corrupt-fence');
  seed(roots);
  const selected = transactionAdapters({
    fault: (point) => {
      if (point === 'after-manifest-complete') throw new Error('retained fence');
    },
  });
  const plan = await planRuntimeMigration({ ...roots, adapters: selected });
  await assert.rejects(
    applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: selected }),
    new RegExp('retained fence')
  );
  const transactionId = 'migration-' + plan.digest.slice(7, 39);
  const fence = path.join(roots.mainRoot, '.ai-task-manager/runtime/migrations/fence.json');
  const original = readFileSync(fence);
  for (const value of [null, [], {}, { ...JSON.parse(original), owner: null }]) {
    const bytes = JSON.stringify(value);
    writeFileSync(fence, bytes);
    await assert.rejects(
      resumeRuntimeMigration({
        ...roots,
        transactionId,
        approvedPlanDigest: plan.digest,
        adapters: transactionAdapters(),
      }),
      { code: 'RUNTIME_CONTROL_INVALID' }
    );
    assert.equal(readFileSync(fence, 'utf8'), bytes);
  }
  writeFileSync(fence, original);
  await resumeRuntimeMigration({
    ...roots,
    transactionId,
    approvedPlanDigest: plan.digest,
    adapters: transactionAdapters(),
  });
  assert.equal(existsSync(fence), false);
});

test('protected migration timing keeps pending provenance and confirms later ordinary coverage without a second charge', async () => {
  const { planRuntimeMigration, applyRuntimeMigration, resumeRuntimeMigration } = await engine();
  const { reconcileRuntimeMigrationTiming } =
    await import('../../../../task-tracker/lib/runtime-migration-timing.mjs');
  const { buildRow } = await import('../../../../task-tracker/gh-timing-comment.mjs');
  const { timingActorKey } = await import('../../../../task-tracker/lib/timing-actor.mjs');
  const roots = repository('timing-canonical-coverage');
  seed(roots);
  let visible = false;
  const selected = transactionAdapters({
    writerCensus: () => ({
      complete: true,
      writers: [],
      claims: [
        {
          provider: 'fixture',
          sid: 'migrator',
          projectRoot: roots.projectRoot,
          issue: '1857',
          entryStartTs: '2026-09-30T00:00:00Z',
          reason: 'session-binding',
        },
      ],
    }),
    publishTiming: (record) =>
      reconcileRuntimeMigrationTiming({
        ...record,
        repository: 'o/r',
        readTimingSource: async () => {
          if (!visible) return { status: 'absent' };
          const interval = record.intervals[0];
          const body =
            buildRow({
              ts: interval.endedAt,
              event: 'pause:blocked',
              actorKey: timingActorKey(interval.owner),
              activeSec: null,
              idleSec: 0,
              wordMarker: 0,
              engagement: {
                startMs: Date.parse(interval.startedAt),
                endMs: Date.parse(interval.endedAt),
                activeEstimateSec: null,
                wordStart: null,
                wordEnd: null,
                fullWordStart: null,
                fullWordEnd: null,
              },
            }) + '\n';
          return {
            status: 'found',
            source: { repository: 'o/r', issue: 1857, commentNodeId: 'IC_fixture', body },
          };
        },
      }),
  });
  const plan = await planRuntimeMigration({ ...roots, adapters: selected });
  const first = await applyRuntimeMigration({
    plan,
    approvedPlanDigest: plan.digest,
    adapters: selected,
  });
  assert.equal(first.timing.publication.status, 'pending');
  assert.equal(first.timing.publication.reason, 'canonical-timing-unavailable');
  visible = true;
  const resumed = await resumeRuntimeMigration({
    ...roots,
    transactionId: first.transactionId,
    approvedPlanDigest: plan.digest,
    adapters: selected,
  });
  assert.equal(resumed.timing.publication.status, 'confirmed');
  assert.equal(resumed.timing.publication.basis, 'canonical-ordinary-actor-coverage');
  assert.equal(resumed.timing.publication.coverage[0].addedMs, 0);
  assert.equal(resumed.timing.completionTail.status, 'unresolved');
  assert.equal(resumed.timing.intervals.length, 1);
});

for (const boundary of [
  'after-bootstrap',
  'after-fence',
  'after-root-stage',
  'after-root-publish',
  'before-activation',
  'after-manifest-complete',
  'after-timing-publish',
  'before-fence-release',
]) {
  test(
    'real SIGKILL migration boundary ' +
      boundary +
      ' retains exact source and eventually completes',
    async () => {
      const { spawn } = await import('node:child_process');
      const { once } = await import('node:events');
      const { assertRuntimeReadable } =
        await import('../../../../task-tracker/lib/runtime-storage.mjs');
      const coordination = await import('../../../../task-tracker/lib/runtime-migration-lock.mjs');
      const { planRuntimeMigration, resumeRuntimeMigration, readRuntimeMigrationStatus } =
        await engine();
      const roots = repository('kill-' + boundary);
      const source = seed(roots);
      const original = readFileSync(source);
      const selected = {
        trustLegacy: () => 'explicit-operator-trust',
        writerCensus: () => ({ complete: true, writers: [], claims: [] }),
        observeOwner: coordination.observeLocalRuntimeOwner,
        publishTiming: async () => ({ status: 'confirmed' }),
      };
      const plan = await planRuntimeMigration({ ...roots, adapters: selected });
      const url = new URL(
        '../../../../task-tracker/lib/runtime-migration-apply.mjs',
        import.meta.url
      ).href;
      const code = `import { applyRuntimeMigration } from ${JSON.stringify(url)};
      const [plan, boundary] = JSON.parse(process.argv[1]);
      const die = (point) => { if (point === boundary) process.kill(process.pid, 'SIGKILL'); };
      await applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: {
        trustLegacy: () => 'explicit-operator-trust', writerCensus: () => ({ complete: true, writers: [], claims: [] }),
        publishTiming: async () => ({ status: 'confirmed' }), fault: die, faultSync: die
      } });`;
      const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', code, JSON.stringify([plan, boundary])],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const exited = once(child, 'exit');
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      try {
        const [exitCode, signal] = await exited;
        assert.equal(exitCode, null, stderr);
        assert.equal(signal, 'SIGKILL', stderr);
        assert.deepEqual(readFileSync(source), original);
        const transactionId = 'migration-' + plan.digest.slice(7, 39);
        const status = await readRuntimeMigrationStatus({ ...roots, transactionId });
        assert.equal(status.owner.pid, child.pid);
        if (status.status !== 'complete')
          assert.throws(
            () => assertRuntimeReadable(roots),
            (error) => error.code?.startsWith('RUNTIME_')
          );
        const coordinator = coordination.inspectRuntimeCoordinator(roots);
        if (coordinator.status === 'owned')
          coordination.recoverRuntimeCoordinator({
            ...roots,
            expectedDigest: coordinator.digest,
            transactionId: coordinator.record.transactionId,
            approvedPlanDigest: coordinator.record.planDigest,
          });
        const input = {
          ...roots,
          transactionId,
          approvedPlanDigest: plan.digest,
          adapters: selected,
        };
        assert.equal((await resumeRuntimeMigration(input)).status, 'complete');
        assertRuntimeReadable(roots);
        for (const file of plan.files)
          assert.deepEqual(readFileSync(file.destination), readFileSync(file.source));
        assert.equal(coordination.inspectRuntimeFence(roots), null);
        assert.equal((await resumeRuntimeMigration(input)).status, 'complete');
        assert.deepEqual(readFileSync(source), original);
      } finally {
        child.kill('SIGKILL');
        await exited;
      }
    }
  );
}

test('sparse legacy migration refuses before creating any publication authority', async () => {
  const { planRuntimeMigration, applyRuntimeMigration } = await engine();
  const roots = repository('sparse-required');
  const source = seed(roots);
  rmSync(path.join(roots.projectRoot, '.tmp/aitm/state/task-tracker-queue.json'));
  const before = readFileSync(source);
  const plan = await planRuntimeMigration({ ...roots, adapters });
  assert.ok(plan.blockers.some((item) => item.code === 'required-record-missing'));
  await assert.rejects(applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters }), {
    code: 'RUNTIME_MIGRATION_BLOCKED',
  });
  assert.deepEqual(readFileSync(source), before);
  assert.equal(existsSync(path.join(roots.projectRoot, '.ai-task-manager/runtime')), false);
});

for (const replacement of ['foreign', 'malformed', 'missing']) {
  test(`migration resume preserves ${replacement} control on an already published root`, async () => {
    const { planRuntimeMigration, applyRuntimeMigration, resumeRuntimeMigration } = await engine();
    const roots = repository('published-control-' + replacement);
    seed(roots);
    const selected = transactionAdapters({
      fault: (point) => {
        if (point === 'after-root-publish') throw new Error('fixture publication interruption');
      },
    });
    const plan = await planRuntimeMigration({ ...roots, adapters: selected });
    await assert.rejects(
      applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: selected }),
      /fixture publication interruption/
    );
    const control = path.join(roots.projectRoot, '.ai-task-manager/runtime/control.json');
    const state = path.join(
      roots.projectRoot,
      '.ai-task-manager/runtime/store/state/task-tracker-state.json'
    );
    const before = readFileSync(state);
    if (replacement === 'missing') rmSync(control);
    else
      writeFileSync(
        control,
        replacement === 'malformed'
          ? '{broken'
          : JSON.stringify({ ...JSON.parse(readFileSync(control)), transactionId: 'foreign' })
      );
    const conflicting = existsSync(control) ? readFileSync(control) : null;
    await assert.rejects(
      resumeRuntimeMigration({
        ...roots,
        transactionId: 'migration-' + plan.digest.slice(7, 39),
        approvedPlanDigest: plan.digest,
        adapters: transactionAdapters(),
      }),
      { code: 'RUNTIME_MIGRATION_CONFLICT' }
    );
    assert.deepEqual(readFileSync(state), before);
    assert.deepEqual(existsSync(control) ? readFileSync(control) : null, conflicting);
  });
}
