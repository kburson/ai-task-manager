// @story #1861
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
const fixture = mkdtempSync(path.join(parent, 'admission-1861-'));
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
