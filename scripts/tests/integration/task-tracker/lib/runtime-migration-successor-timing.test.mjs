// @story #1857 #1861
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const parent = path.resolve('.ai-task-manager/runtime/test-fixtures');
mkdirSync(parent, { recursive: true });
const fixture = mkdtempSync(path.join(parent, 'successor-timing-1861-'));
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

test('completed unfenced timing retry admits a genuinely activated successor without republishing its stores', async () => {
  const { cpSync } = await import('node:fs');
  const { planRuntimeMigration, applyRuntimeMigration, resumeRuntimeMigration } = await engine();
  const roots = repository('successor-timing');
  const source = seed(roots);
  const selected = {
    trustLegacy: () => 'explicit-operator-trust',
    writerCensus: () => ({ complete: true, writers: [], claims: [] }),
    publishTiming: async () => {
      throw new Error('pending fixture timing');
    },
  };
  const plan = await planRuntimeMigration({ ...roots, adapters: selected });
  const first = await applyRuntimeMigration({
    plan,
    approvedPlanDigest: plan.digest,
    adapters: selected,
  });
  assert.equal(first.timing.publication.status, 'pending');
  const runtime = path.join(roots.projectRoot, '.ai-task-manager/runtime');
  const firstDirectory = path.join(runtime, 'migrations', first.transactionId);
  const preserved = path.join(fixture, 'preserved-successor-journal');
  cpSync(firstDirectory, preserved, { recursive: true });
  rmSync(runtime, { recursive: true });
  writeFileSync(source, JSON.stringify({ lastWordMarker: 99 }));
  const successorPlan = await planRuntimeMigration({ ...roots, adapters: selected });
  const successor = await applyRuntimeMigration({
    plan: successorPlan,
    approvedPlanDigest: successorPlan.digest,
    adapters: selected,
  });
  assert.notEqual(successor.transactionId, first.transactionId);
  cpSync(preserved, firstDirectory, { recursive: true });
  const control = readFileSync(path.join(runtime, 'control.json'));
  const state = readFileSync(
    successorPlan.files.find((file) => file.source === source).destination
  );
  let publications = 0;
  const result = await resumeRuntimeMigration({
    ...roots,
    transactionId: first.transactionId,
    approvedPlanDigest: plan.digest,
    adapters: {
      ...selected,
      publishTiming: async () => {
        publications++;
        return { status: 'confirmed' };
      },
    },
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.timing.publication.status, 'confirmed');
  assert.equal(publications, 1);
  assert.deepEqual(readFileSync(path.join(runtime, 'control.json')), control);
  assert.deepEqual(
    readFileSync(successorPlan.files.find((file) => file.source === source).destination),
    state
  );
});
