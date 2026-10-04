// @story #1861
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  createRuntimeRootFixture,
  activateRuntimeRootFixture,
} from '../../../helpers/runtime-root-fixture.mjs';
import { snapshotTree } from '../../../helpers/runtime-empty-contract-fixture.mjs';
import { planEmptyRuntimeInitialization } from '../../../../task-tracker/lib/runtime-empty-initialize.mjs';

const adapters = {
  identity: () => ({
    provider: 'fixture',
    sid: 'empty-plan-contract',
    pid: process.pid,
    processToken: 'fixture-empty-plan',
  }),
  writerCensus: () => ({ complete: true, writers: [], claims: [], unknown: [] }),
};
// Removing any fixed no-grant record or writing during plan must fail this case.
test('pristine main planning seals exactly four no-grant records without changing any byte', async (t) => {
  const root = createRuntimeRootFixture('empty-plan-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const before = snapshotTree(root);
  const plan = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  assert.equal(plan.schema, 'aitm.runtime-empty-plan/v1');
  assert.deepEqual(plan.originalRoots, [root]);
  assert.deepEqual(plan.records, {
    'state/task-tracker-state.json': '{}\n',
    'state/task-tracker-queue.json': '[]\n',
    'fleet/task-fleet.json': '{}\n',
    'fleet/occupancy.json': '{}\n',
  });
  assert.equal(plan.sourcePolicy, 'proven-total-absence-no-inherited-grants');
  assert.match(plan.operationId, /^[a-f0-9-]{36}$/);
  assert.match(plan.digest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(snapshotTree(root), before);
});
// Treating an existing empty directory or unknown authority as total absence is a bug.
for (const residue of [
  '.ai-task-manager/runtime',
  '.ai-task-manager/runtime/future-namespace',
  '.tmp/aitm',
  '.db/aitm',
  '.ai-task-manager/state',
  '.claude/sessions',
]) {
  test('existing authority prefix refuses empty plan: ' + residue, async (t) => {
    const root = createRuntimeRootFixture('empty-residue-');
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(path.join(root, residue), { recursive: true });
    const before = snapshotTree(root);
    await assert.rejects(
      planEmptyRuntimeInitialization({ projectRoot: root, mainRoot: root, adapters }),
      (error) =>
        error.code === 'RUNTIME_EMPTY_INIT_REFUSED' &&
        error.blockers.some(
          (item) =>
            item.target === path.join(root, residue) ||
            path.join(root, residue).startsWith(item.target + path.sep)
        )
    );
    assert.deepEqual(snapshotTree(root), before);
  });
}
test('authority aliases and malformed legacy records refuse without modifying their targets', async (t) => {
  const root = createRuntimeRootFixture('empty-alias-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, '.ai-task-manager'));
  writeFileSync(path.join(root, 'protected'), 'original');
  symlinkSync(path.join(root, 'protected'), path.join(root, '.ai-task-manager/runtime'));
  writeFileSync(path.join(root, '.ai-task-manager/task-tracker-state.json'), '{broken');
  const before = snapshotTree(root);
  await assert.rejects(
    planEmptyRuntimeInitialization({ projectRoot: root, mainRoot: root, adapters }),
    (error) => error.code === 'RUNTIME_EMPTY_INIT_REFUSED'
  );
  assert.deepEqual(snapshotTree(root), before);
});
// Exempting a foreign writer, unknown census or foreign claim must fail these cases.
for (const census of [
  { complete: false, writers: [], claims: [], unknown: [{ reason: 'unobserved' }] },
  {
    complete: true,
    writers: [{ provider: 'foreign', sid: 'foreign', pid: process.pid, processToken: 'foreign' }],
    claims: [],
  },
  { complete: true, writers: [], claims: [{ provider: 'foreign', sid: 'foreign' }] },
]) {
  test('incomplete or foreign writer/claim census cannot approve empty authority', async (t) => {
    const root = createRuntimeRootFixture('empty-writer-');
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const before = snapshotTree(root);
    await assert.rejects(
      planEmptyRuntimeInitialization({
        projectRoot: root,
        mainRoot: root,
        adapters: { ...adapters, writerCensus: () => census },
      }),
      (error) => error.code === 'RUNTIME_EMPTY_INIT_REFUSED'
    );
    assert.deepEqual(snapshotTree(root), before);
  });
}

// Total loss grants nothing inherited, and cannot depend on knowing the old activation.
test('fresh and genuinely activated then totally erased fixture use the same absence policy', async (t) => {
  const root = createRuntimeRootFixture('empty-total-loss-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fresh = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  await activateRuntimeRootFixture(root);
  const old = snapshotTree(path.join(root, '.ai-task-manager/runtime'));
  mkdirSync(path.join(process.cwd(), 'output'), { recursive: true });
  writeFileSync(
    path.join(process.cwd(), 'output', path.basename(root) + '-prior-proof.json'),
    JSON.stringify(old)
  );
  for (const relative of ['.ai-task-manager/runtime', '.tmp/aitm', '.db/aitm'])
    rmSync(path.join(root, relative), { recursive: true, force: true });
  const before = snapshotTree(root);
  const lost = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  assert.equal(lost.observationDigest, fresh.observationDigest);
  assert.deepEqual(lost.records, fresh.records);
  assert.deepEqual(snapshotTree(root), before);
});
// A root census is observation only; registered linked roots get no local publication grant.
test('main plans include registered linked absence and refuse unavailable roots', async (t) => {
  const root = createRuntimeRootFixture('empty-linked-');
  const linked = path.join(path.dirname(root), path.basename(root) + '-linked');
  t.after(() => {
    rmSync(linked, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });
  execFileSync('git', [
    '-C',
    root,
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--allow-empty',
    '-qm',
    'fixture',
  ]);
  execFileSync('git', ['-C', root, 'worktree', 'add', '-qb', 'linked', linked]);
  const before = snapshotTree(linked);
  const plan = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  assert.deepEqual(plan.originalRoots, [root]);
  assert.equal(plan.observation.roots.includes(linked), true);
  assert.deepEqual(snapshotTree(linked), before);
  await assert.rejects(
    planEmptyRuntimeInitialization({ projectRoot: linked, mainRoot: root, adapters }),
    (error) => error.code === 'RUNTIME_EMPTY_INIT_REFUSED'
  );
  rmSync(linked, { recursive: true, force: true });
  await assert.rejects(
    planEmptyRuntimeInitialization({ projectRoot: root, mainRoot: root, adapters }),
    (error) =>
      error.code === 'RUNTIME_EMPTY_INIT_REFUSED' &&
      error.blockers.some((item) => item.code === 'root-unavailable')
  );
});
// A different actual process identity must not perturb the sealed absence projection.
test('stable absence projection excludes only the authenticated current invoker across processes', async (t) => {
  const root = createRuntimeRootFixture('empty-two-processes-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const executable = new URL(
    '../../../../task-tracker/lib/runtime-empty-initialize.mjs',
    import.meta.url
  ).href;
  const script = `import {planEmptyRuntimeInitialization} from ${JSON.stringify(executable)};
    const root=process.argv[1];const owner={provider:'fixture',sid:'fixture-'+process.pid,pid:process.pid,processToken:'token-'+process.pid};
    const plan=await planEmptyRuntimeInitialization({projectRoot:root,mainRoot:root,adapters:{identity:()=>owner,writerCensus:()=>({complete:true,writers:[owner],claims:[],unknown:[]})}});
    console.log(JSON.stringify({pid:process.pid,digest:plan.observationDigest}));`;
  const run = () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], {
      encoding: 'utf8',
      env: process.env,
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const first = run(),
    second = run();
  assert.notEqual(first.pid, second.pid);
  assert.equal(first.digest, second.digest);
});
