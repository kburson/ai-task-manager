// @story #1861
// cspell:words unleased
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, rmSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { snapshotTree } from '../../../helpers/runtime-empty-contract-fixture.mjs';
import {
  planEmptyRuntimeInitialization,
  applyEmptyRuntimeInitialization,
  inspectEmptyRuntimeInitialization,
  resumeEmptyRuntimeInitialization,
} from '../../../../task-tracker/lib/runtime-empty-initialize.mjs';
import {
  writeRuntimeJsonBatch,
  inspectRuntimeBatch,
} from '../../../../task-tracker/lib/runtime-batch.mjs';
import {
  planRuntimeInitialization,
  applyRuntimeInitialization,
} from '../../../../task-tracker/lib/runtime-initialize.mjs';
import { observeRuntimeWriterCensus } from '../../../../task-tracker/lib/runtime-writer-census.mjs';
import { assertRuntimeReadable } from '../../../../task-tracker/lib/runtime-storage.mjs';
const owner = {
  provider: 'fixture',
  sid: randomUUID(),
  pid: process.pid,
  processToken: randomUUID(),
  host: hostname(),
};
const adapters = {
  identity: () => owner,
  writerCensus: () => ({ complete: true, writers: [], claims: [], unknown: [] }),
};
const state = (root) =>
  path.join(root, '.ai-task-manager/runtime/store/state/task-tracker-state.json');
async function active(t) {
  const root = createRuntimeRootFixture('empty-compatibility-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  await applyEmptyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters });
  return {
    root,
    plan,
    input: { projectRoot: root, mainRoot: root, operationId: plan.operationId },
  };
}
// Reading v1-only control fields would refuse ordinary batches on real empty main/linked activation.
test('empty main and linked activation support real ordinary batches with exact control identities', async (t) => {
  const f = await active(t),
    linked = f.root + '-linked';
  t.after(() => rmSync(linked, { recursive: true, force: true }));
  execFileSync('git', [
    '-C',
    f.root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  execFileSync('git', ['-C', f.root, 'worktree', 'add', '--detach', linked], { stdio: 'pipe' });
  const plan = planRuntimeInitialization({ projectRoot: linked, mainRoot: f.root });
  await applyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters });
  const controlBefore = readFileSync(path.join(f.root, '.ai-task-manager/runtime/control.json'));
  const result = writeRuntimeJsonBatch(
    [
      { target: state(f.root), value: { lastWordMarker: 1861 } },
      { target: state(linked), value: { lastWordMarker: 1862 } },
    ],
    { adapters }
  );
  assert.equal(result.status, 'complete');
  assert.equal(JSON.parse(readFileSync(state(f.root))).lastWordMarker, 1861);
  assert.equal(JSON.parse(readFileSync(state(linked))).lastWordMarker, 1862);
  const journal = inspectRuntimeBatch({ ...f.input, operationId: result.operationId }).record;
  assert.equal(journal.roots.length, 2);
  for (const root of journal.roots) {
    assert.equal(root.transactionId, f.plan.operationId);
    assert.equal(root.planDigest, f.plan.digest);
  }
  assert.deepEqual(
    readFileSync(path.join(f.root, '.ai-task-manager/runtime/control.json')),
    controlBefore
  );
  assertRuntimeReadable(f.input);
  assertRuntimeReadable({ projectRoot: linked, mainRoot: f.root });
});
// A completed retry must validate ordinary batch admission before declaring recovery complete.
test('completed empty retry refuses an unfinished ordinary batch without rewriting any member', async (t) => {
  const f = await active(t);
  assert.throws(
    () =>
      writeRuntimeJsonBatch([{ target: state(f.root), value: { lastWordMarker: 777 } }], {
        adapters: {
          ...adapters,
          faultSync: (point) => {
            if (point === 'after-batch-journal') throw Error('held batch');
          },
        },
      }),
    /held batch/
  );
  const observed = inspectEmptyRuntimeInitialization(f.input),
    before = snapshotTree(f.root);
  await assert.rejects(
    resumeEmptyRuntimeInitialization({
      ...f.input,
      observedDigest: observed.digest,
      approvedPlanDigest: f.plan.digest,
      adapters,
    }),
    { code: 'RUNTIME_BATCH_INCOMPLETE' }
  );
  assert.deepEqual(snapshotTree(f.root), before);
});
// Replaying fixed empty records or the original census would erase valid later authority.
test('completed empty retry preserves ordinary writes and separately initialized new linked roots', async (t) => {
  const f = await active(t),
    linked = f.root + '-linked';
  t.after(() => rmSync(linked, { recursive: true, force: true }));
  writeRuntimeJsonBatch([{ target: state(f.root), value: { lastWordMarker: 991 } }], { adapters });
  execFileSync('git', [
    '-C',
    f.root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  execFileSync('git', ['-C', f.root, 'worktree', 'add', '--detach', linked], { stdio: 'pipe' });
  const plan = planRuntimeInitialization({ projectRoot: linked, mainRoot: f.root });
  await applyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters });
  const observed = inspectEmptyRuntimeInitialization(f.input),
    mainBefore = snapshotTree(f.root),
    linkedBefore = snapshotTree(linked);
  assert.equal(
    (
      await resumeEmptyRuntimeInitialization({
        ...f.input,
        observedDigest: observed.digest,
        approvedPlanDigest: f.plan.digest,
        adapters,
      })
    ).status,
    'complete'
  );
  assert.deepEqual(snapshotTree(f.root), mainBefore);
  assert.deepEqual(snapshotTree(linked), linkedBefore);
  assert.equal(JSON.parse(readFileSync(state(f.root))).lastWordMarker, 991);
});
// Partial same-session claims, a foreign host and inconsistent unknown evidence cannot be the invoker.
for (const [name, census] of [
  [
    'unknown despite complete',
    { complete: true, writers: [], claims: [], unknown: [{ reason: 'unproved' }] },
  ],
  ['missing unknown census', { complete: true, writers: [], claims: [] }],
  [
    'partial self claim',
    {
      complete: true,
      writers: [],
      claims: [{ provider: owner.provider, sid: owner.sid }],
      unknown: [],
    },
  ],
  [
    'foreign host writer',
    { complete: true, writers: [{ ...owner, host: 'foreign.invalid' }], claims: [], unknown: [] },
  ],
  ['unknown writer shape', { complete: true, writers: [null], claims: [], unknown: [] }],
  [
    'uncooperative old writer',
    {
      complete: true,
      writers: [
        { pid: process.pid + 1, projectRoot: 'unused', observed: 'live', cooperative: false },
      ],
      claims: [],
      unknown: [],
    },
  ],
])
  test('empty planning refuses ' + name + ' with typed blockers and no writes', async (t) => {
    const root = createRuntimeRootFixture('empty-census-contract-');
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const before = snapshotTree(root);
    await assert.rejects(
      planEmptyRuntimeInitialization({
        projectRoot: root,
        mainRoot: root,
        adapters: { ...adapters, writerCensus: () => census },
      }),
      (error) => error.code === 'RUNTIME_EMPTY_INIT_REFUSED' && error.blockers.length > 0
    );
    assert.deepEqual(snapshotTree(root), before);
  });

// A completed old empty receipt can validate a genuinely published successor without replaying absence.
test('completed empty retry preserves a real migration successor generation', async (t) => {
  const f = await active(t),
    runtime = path.join(f.root, '.ai-task-manager/runtime'),
    history = path.join(runtime, 'empty-initializations'),
    preserved = path.join(f.root, 'preserved-empty-history');
  cpSync(history, preserved, { recursive: true });
  rmSync(runtime, { recursive: true });
  for (const [relative, value] of Object.entries({
    'state/task-tracker-state.json': { lastWordMarker: 321 },
    'state/task-tracker-queue.json': [],
    'fleet/task-fleet.json': {},
    'fleet/occupancy.json': {},
  })) {
    const file = path.join(f.root, '.tmp/aitm', relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  }
  const { planRuntimeMigration, applyRuntimeMigration } =
    await import('../../../../task-tracker/lib/runtime-migration.mjs');
  const selected = { ...adapters, trustLegacy: () => 'explicit-operator-trust' };
  const plan = await planRuntimeMigration({
    projectRoot: f.root,
    mainRoot: f.root,
    adapters: selected,
  });
  await applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: selected });
  cpSync(preserved, history, { recursive: true });
  assertRuntimeReadable(f.input);
  const observed = inspectEmptyRuntimeInitialization(f.input),
    before = snapshotTree(f.root);
  assert.equal(
    (
      await resumeEmptyRuntimeInitialization({
        ...f.input,
        observedDigest: observed.digest,
        approvedPlanDigest: f.plan.digest,
        adapters,
      })
    ).status,
    'complete'
  );
  assert.deepEqual(snapshotTree(f.root), before);
  assert.equal(JSON.parse(readFileSync(state(f.root))).lastWordMarker, 321);
});

// Two valid prepublication requests must yield one publisher, never two empty outcomes.
test('competing empty applies admit one exclusive publisher and retain its exact coordinator', async (t) => {
  const root = createRuntimeRootFixture('empty-competing-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  const results = await Promise.allSettled([
    applyEmptyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters }),
    applyEmptyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters }),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  const refused = results.find((x) => x.status === 'rejected');
  assert.equal(refused.reason.code, 'RUNTIME_MIGRATION_PLAN_CHANGED');
  assert.equal(results.find((x) => x.status === 'fulfilled').value.status, 'complete');
  assertRuntimeReadable({ projectRoot: root, mainRoot: root });
});
// Empty and migration policies cannot both be valid after legacy data arrives; no stale empty write is allowed.
test('migration publication excludes an approved but stale empty policy without changing its protected evidence', async (t) => {
  const root = createRuntimeRootFixture('empty-migration-interleave-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const empty = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  for (const [relative, value] of Object.entries({
    'state/task-tracker-state.json': { lastWordMarker: 73 },
    'state/task-tracker-queue.json': [],
    'fleet/task-fleet.json': {},
    'fleet/occupancy.json': {},
  })) {
    const file = path.join(root, '.tmp/aitm', relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  }
  const { planRuntimeMigration, applyRuntimeMigration } =
    await import('../../../../task-tracker/lib/runtime-migration.mjs');
  const selected = { ...adapters, trustLegacy: () => 'explicit-operator-trust' };
  const plan = await planRuntimeMigration({
    projectRoot: root,
    mainRoot: root,
    adapters: selected,
  });
  let reached, release;
  const boundary = new Promise((r) => {
      reached = r;
    }),
    held = new Promise((r) => {
      release = r;
    });
  const publishing = applyRuntimeMigration({
    plan,
    approvedPlanDigest: plan.digest,
    adapters: {
      ...selected,
      fault: async (point) => {
        if (point === 'after-fence') {
          reached();
          await held;
        }
      },
    },
  });
  try {
    await Promise.race([
      boundary,
      publishing.then(() => assert.fail('migration did not pause at its real boundary')),
    ]);
    const before = snapshotTree(root);
    await assert.rejects(
      applyEmptyRuntimeInitialization({ plan: empty, approvedPlanDigest: empty.digest, adapters }),
      { code: 'RUNTIME_MIGRATION_PLAN_CHANGED' }
    );
    assert.deepEqual(snapshotTree(root), before);
  } finally {
    release();
  }
  assert.equal((await publishing).status, 'complete');
  assert.equal(JSON.parse(readFileSync(state(root))).lastWordMarker, 73);
});

// A real unleased Node process in the physical root must be observed by the production census.
test('live unleased Node process in an empty root blocks production writer census', async (t) => {
  const root = createRuntimeRootFixture('empty-unleased-process-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const child = spawn(
    process.execPath,
    ['-e', "process.stdout.write('HELD');setInterval(()=>{},1000);"],
    {
      cwd: root,
      env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const exited = new Promise((r) => child.once('exit', (code, signal) => r({ code, signal })));
  let stderr = '';
  child.stderr.on('data', (s) => {
    stderr += s;
  });
  try {
    await Promise.race([
      new Promise((r) => child.stdout.once('data', r)),
      exited.then(() => assert.fail(stderr)),
    ]);
    const before = snapshotTree(root);
    const census = observeRuntimeWriterCensus({
      projectRoot: root,
      mainRoot: root,
      roots: [root],
      files: [],
      owner,
    });
    assert.equal(census.complete, true, JSON.stringify(census.unknown));
    assert.ok(
      census.writers.some(
        (writer) =>
          writer.pid === child.pid && writer.projectRoot === root && writer.cooperative === false
      ),
      JSON.stringify({
        childPid: child.pid,
        root,
        census,
        snapshot: execFileSync('ps', ['-p', String(child.pid), '-o', 'pid=,ppid=,comm=,args='], {
          encoding: 'utf8',
        }).trim(),
      })
    );
    await assert.rejects(
      planEmptyRuntimeInitialization({
        projectRoot: root,
        mainRoot: root,
        adapters: { identity: () => owner },
      }),
      (e) =>
        e.code === 'RUNTIME_EMPTY_INIT_REFUSED' &&
        e.blockers.some((x) => x.code === 'writers-active')
    );
    assert.deepEqual(snapshotTree(root), before);
  } finally {
    child.kill('SIGKILL');
    assert.deepEqual(await exited, { code: null, signal: 'SIGKILL' });
  }
});
