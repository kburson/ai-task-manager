// @story #1861
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { snapshotTree } from '../../../helpers/runtime-empty-contract-fixture.mjs';
import {
  planEmptyRuntimeInitialization,
  applyEmptyRuntimeInitialization,
  inspectEmptyRuntimeInitialization,
} from '../../../../task-tracker/lib/runtime-empty-initialize.mjs';
import { runtimeStoragePaths } from '../../../../task-tracker/lib/runtime-storage.mjs';
const adapters = {
  identity: () => ({
    provider: 'fixture',
    sid: 'empty-apply-contract',
    pid: process.pid,
    processToken: 'fixture-empty-apply',
  }),
  writerCensus: () => ({ complete: true, writers: [], claims: [], unknown: [] }),
};
const fixture = (t) => {
  const root = createRuntimeRootFixture('empty-apply-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
// A mismatched approval must fail before even allocating coordinator ancestors.
test('wrong empty approval is a byte-preserving refusal', async (t) => {
  const root = fixture(t);
  const plan = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  const before = snapshotTree(root);
  await assert.rejects(
    applyEmptyRuntimeInitialization({
      plan,
      approvedPlanDigest: 'sha256:' + '0'.repeat(64),
      adapters,
    }),
    (error) => error.code === 'RUNTIME_MIGRATION_APPROVAL_REQUIRED'
  );
  assert.deepEqual(snapshotTree(root), before);
});
// A late legacy entry invalidates the sealed absence rather than becoming migrated data.
test('late legacy authority invalidates empty apply without writes', async (t) => {
  const root = fixture(t);
  const plan = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  const late = path.join(root, '.tmp/aitm/state/task-tracker-state.json');
  mkdirSync(path.dirname(late), { recursive: true });
  writeFileSync(late, '{}\n');
  const before = snapshotTree(root);
  await assert.rejects(
    applyEmptyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters }),
    (error) => error.code === 'RUNTIME_MIGRATION_PLAN_CHANGED'
  );
  assert.deepEqual(snapshotTree(root), before);
});
// Publication must contain exactly the approved no-grant records and matching protected proof.
test('explicit approved main publication completes its journal before active control', async (t) => {
  const root = fixture(t);
  const plan = await planEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    adapters,
  });
  const boundaries = [];
  const result = await applyEmptyRuntimeInitialization({
    plan,
    approvedPlanDigest: plan.digest,
    adapters: {
      ...adapters,
      fault: (boundary) => {
        boundaries.push(boundary);
        if (boundary === 'after-empty-complete-journal') {
          const layout = runtimeStoragePaths({ projectRoot: root, mainRoot: root });
          assert.equal(JSON.parse(readFileSync(layout.controlPath)).status, 'prepared');
        }
      },
    },
  });
  assert.equal(result.status, 'complete');
  const layout = runtimeStoragePaths({ projectRoot: root, mainRoot: root });
  for (const [relative, bytes] of Object.entries(plan.records))
    assert.equal(readFileSync(path.join(layout.localRoot, relative), 'utf8'), bytes);
  assert.deepEqual(JSON.parse(readFileSync(layout.controlPath)), {
    schema: 'aitm.runtime-control/v2',
    status: 'active',
    projectRoot: root,
    mainRoot: root,
    activation: { kind: 'empty-initialization', id: plan.operationId, digest: plan.digest },
  });
  const before = snapshotTree(root);
  const observed = inspectEmptyRuntimeInitialization({
    projectRoot: root,
    mainRoot: root,
    operationId: plan.operationId,
  });
  assert.equal(observed.status, 'complete');
  assert.match(observed.digest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(snapshotTree(root), before);
  assert.ok(
    boundaries.indexOf('after-empty-complete-journal') <
      boundaries.indexOf('after-empty-active-control')
  );
});
