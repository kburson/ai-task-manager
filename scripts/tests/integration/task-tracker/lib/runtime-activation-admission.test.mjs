// @story #1861
import { chmodSync, symlinkSync, lstatSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  createRuntimeRootFixture,
  activateRuntimeRootFixture,
} from '../../../helpers/runtime-root-fixture.mjs';
import { snapshotTree } from '../../../helpers/runtime-empty-contract-fixture.mjs';
import * as storage from '../../../../task-tracker/lib/runtime-storage.mjs';
import {
  planEmptyRuntimeInitialization,
  applyEmptyRuntimeInitialization,
} from '../../../../task-tracker/lib/runtime-empty-initialize.mjs';
import {
  planRuntimeInitialization,
  applyRuntimeInitialization,
} from '../../../../task-tracker/lib/runtime-initialize.mjs';
import { runtimeInitializationId } from '../../../../task-tracker/lib/runtime-initialization-record.mjs';
const adapters = {
  identity: () => ({
    provider: 'fixture',
    sid: 'activation-contract',
    pid: process.pid,
    processToken: 'activation-contract',
  }),
  writerCensus: () => ({ complete: true, writers: [], claims: [], unknown: [] }),
};
function fixture(t) {
  const root = createRuntimeRootFixture('activation-union-');
  const linked = root + '-linked';
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
  return {
    root,
    linked,
    main: { projectRoot: root, mainRoot: root },
    local: { projectRoot: linked, mainRoot: root },
  };
}
function addLinked(f) {
  execFileSync('git', ['-C', f.root, 'worktree', 'add', '-qb', 'linked', f.linked]);
}
async function activateEmpty(f) {
  const plan = await planEmptyRuntimeInitialization({ ...f.main, adapters });
  await applyEmptyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters });
  return plan;
}
// A main-only observation must never be mistaken for local linked admission.
for (const timing of ['before', 'after'])
  test(
    'empty activation requires explicit linked initialization for roots registered ' + timing,
    async (t) => {
      assert.equal(typeof storage.readRuntimeActivationRoot, 'function');
      const f = fixture(t);
      if (timing === 'before') addLinked(f);
      const linkedBefore = timing === 'before' ? snapshotTree(f.linked) : null;
      const emptyPlan = await activateEmpty(f);
      if (timing === 'after') addLinked(f);
      else assert.deepEqual(snapshotTree(f.linked), linkedBefore);
      const observation = storage.readRuntimeActivationRoot(f.local);
      assert.deepEqual(observation.activation, {
        kind: 'empty-initialization',
        id: emptyPlan.operationId,
        digest: emptyPlan.digest,
      });
      assert.deepEqual(observation.originalRoots, [f.root]);
      assert.equal(existsSync(path.join(f.linked, '.ai-task-manager/runtime')), false);
      assert.throws(() => storage.assertRuntimeReadable(f.local), {
        code: 'RUNTIME_INITIALIZATION_REQUIRED',
      });
      const plan = planRuntimeInitialization(f.local);
      assert.equal(plan.schema, 'aitm.runtime-initialization-plan/v2');
      assert.equal(plan.id, runtimeInitializationId(f.linked));
      assert.deepEqual(plan.activation, observation.activation);
      const file = path.join(f.root, '.ai-task-manager/runtime/initializations', plan.id + '.json');
      let beforeActive = false;
      await applyRuntimeInitialization({
        plan,
        approvedPlanDigest: plan.digest,
        adapters: {
          ...adapters,
          fault: (point) => {
            if (point === 'after-initialization-journal') {
              assert.equal(JSON.parse(readFileSync(file)).status, 'complete');
              assert.equal(
                JSON.parse(
                  readFileSync(path.join(f.linked, '.ai-task-manager/runtime/control.json'))
                ).status,
                'prepared'
              );
              beforeActive = true;
            }
          },
        },
      });
      assert.equal(beforeActive, true);
      assert.equal(storage.assertRuntimeReadable(f.local).activation.kind, 'empty-initialization');
      for (const [relative, bytes] of Object.entries({
        'state/task-tracker-state.json': '{}\n',
        'state/task-tracker-queue.json': '[]\n',
      }))
        assert.equal(
          readFileSync(path.join(f.linked, '.ai-task-manager/runtime/store', relative), 'utf8'),
          bytes
        );
      const journal = JSON.parse(readFileSync(file));
      assert.equal(journal.schema, 'aitm.runtime-initialization/v2');
      assert.equal(journal.plan.operationId, plan.operationId);
    }
  );
for (const kind of [
  'prepared-v1',
  'complete-v1',
  'prepared-v2',
  'complete-v2',
  'malformed',
  'local-residue',
])
  test(
    'missing linked control with ' + kind + ' is protected loss rather than fresh admission',
    async (t) => {
      assert.equal(typeof storage.readRuntimeActivationRoot, 'function');
      const f = fixture(t);
      addLinked(f);
      await activateEmpty(f);
      const id = runtimeInitializationId(f.linked),
        history = path.join(f.root, '.ai-task-manager/runtime/initializations', id + '.json');
      if (kind === 'local-residue')
        mkdirSync(path.join(f.linked, '.ai-task-manager/runtime'), { recursive: true });
      else {
        mkdirSync(path.dirname(history), { recursive: true });
        writeFileSync(
          history,
          kind === 'malformed'
            ? 'not json'
            : JSON.stringify({
                schema: 'aitm.runtime-initialization/' + kind.slice(-2),
                status: kind.split('-')[0],
              })
        );
      }
      const before = snapshotTree(f.root),
        local = snapshotTree(f.linked);
      assert.throws(() => storage.assertRuntimeReadable(f.local), {
        code: 'RUNTIME_CONTROL_INVALID',
      });
      assert.throws(() => planRuntimeInitialization(f.local), { code: 'RUNTIME_CONTROL_INVALID' });
      assert.deepEqual(snapshotTree(f.root), before);
      assert.deepEqual(snapshotTree(f.linked), local);
    }
  );
test('main observation preserves pristine absence and completed-proof loss distinctions', async (t) => {
  assert.equal(typeof storage.readRuntimeActivationRoot, 'function');
  const f = fixture(t);
  addLinked(f);
  assert.throws(() => storage.readRuntimeActivationRoot(f.local), {
    code: 'RUNTIME_MIGRATION_REQUIRED',
  });
  await activateEmpty(f);
  const control = path.join(f.root, '.ai-task-manager/runtime/control.json');
  rmSync(control);
  assert.throws(() => storage.readRuntimeActivationRoot(f.local), {
    code: 'RUNTIME_CONTROL_INVALID',
  });
  assert.throws(() => storage.assertRuntimeReadable(f.local), { code: 'RUNTIME_CONTROL_INVALID' });
});
test('migration original root with missing control cannot reinitialize from census membership', async (t) => {
  assert.equal(typeof storage.readRuntimeActivationRoot, 'function');
  const f = fixture(t);
  addLinked(f);
  await activateRuntimeRootFixture(f.root, [f.linked]);
  rmSync(path.join(f.linked, '.ai-task-manager/runtime/control.json'));
  assert.equal(storage.readRuntimeActivationRoot(f.local).activation.kind, 'migration');
  assert.throws(() => storage.assertRuntimeReadable(f.local), { code: 'RUNTIME_CONTROL_INVALID' });
  assert.throws(() => planRuntimeInitialization(f.local), { code: 'RUNTIME_CONTROL_INVALID' });
});

for (const kind of [
  'aliased-history',
  'unreadable-history',
  'activation-mismatch',
  'main-prepared',
  'main-malformed-proof',
])
  test('activation admission retains typed refusal for ' + kind, async (t) => {
    const f = fixture(t);
    addLinked(f);
    const mainPlan = await activateEmpty(f);
    let unreadable, unreadableMode;
    if (kind.endsWith('history')) {
      const file = path.join(
        f.root,
        '.ai-task-manager/runtime/initializations',
        runtimeInitializationId(f.linked) + '.json'
      );
      mkdirSync(path.dirname(file), { recursive: true });
      if (kind === 'aliased-history') symlinkSync(path.join(f.root, '.git/config'), file);
      else {
        writeFileSync(file, '{}');
        unreadable = file;
        unreadableMode = lstatSync(file).mode & 0o7777;
      }
    } else if (kind === 'activation-mismatch') {
      const plan = planRuntimeInitialization(f.local);
      await applyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters });
      const file = path.join(f.linked, '.ai-task-manager/runtime/control.json'),
        value = JSON.parse(readFileSync(file));
      value.activation.digest = 'sha256:' + '0'.repeat(64);
      writeFileSync(file, JSON.stringify(value));
    } else if (kind === 'main-prepared') {
      const file = path.join(f.root, '.ai-task-manager/runtime/control.json'),
        value = JSON.parse(readFileSync(file));
      value.status = 'prepared';
      writeFileSync(file, JSON.stringify(value));
    } else
      writeFileSync(
        path.join(
          f.root,
          '.ai-task-manager/runtime/empty-initializations',
          mainPlan.operationId,
          'journal.json'
        ),
        '{}'
      );
    const before = snapshotTree(f.root),
      local = snapshotTree(f.linked);
    if (unreadable) chmodSync(unreadable, 0);
    try {
      assert.throws(() => storage.assertRuntimeReadable(f.local), {
        code:
          kind === 'main-prepared' ? 'RUNTIME_TRANSACTION_INCOMPLETE' : 'RUNTIME_CONTROL_INVALID',
      });
    } finally {
      if (unreadable) chmodSync(unreadable, unreadableMode);
    }
    assert.deepEqual(snapshotTree(f.root), before);
    assert.deepEqual(snapshotTree(f.linked), local);
  });
