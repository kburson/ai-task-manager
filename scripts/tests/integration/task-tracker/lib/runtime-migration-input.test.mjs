// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { planRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration-plan.mjs';

test('exact observed plan trust cannot bless changed sources, hard blockers, or mutated plan bytes', async () => {
  const { readRuntimePlanInput, acknowledgeRuntimeLegacyPlan } =
    await import('../../../../task-tracker/lib/runtime-migration-input.mjs');
  const root = createRuntimeRootFixture('1857-plan-input-');
  const roots = { projectRoot: root, mainRoot: root };
  const adapters = { writerCensus: () => ({ complete: true, writers: [], claims: [] }) };
  try {
    const source = path.join(root, '.tmp/aitm/state/task-tracker-state.json');
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, '{"active":null}');
    const observed = await planRuntimeMigration({ ...roots, adapters });
    assert.deepEqual(
      observed.blockers.map((entry) => entry.code),
      ['legacy-trust-required']
    );
    const file = path.join(root, 'observed.json');
    writeFileSync(file, JSON.stringify(observed));
    const parsed = readRuntimePlanInput({ file, approvedPlanDigest: observed.digest, ...roots });
    const accepted = await acknowledgeRuntimeLegacyPlan({
      observedPlan: parsed,
      approvedPlanDigest: observed.digest,
      ...roots,
      adapters,
    });
    assert.deepEqual(accepted.blockers, []);
    assert.equal(accepted.files[0].trust, 'explicit-operator-trust');
    assert.notEqual(accepted.digest, observed.digest);
    assert.equal(readFileSync(source, 'utf8'), '{"active":null}');
    writeFileSync(file, JSON.stringify({ ...observed, roots: [] }));
    assert.throws(
      () => readRuntimePlanInput({ file, approvedPlanDigest: observed.digest, ...roots }),
      { code: 'RUNTIME_MIGRATION_APPROVAL_REQUIRED' }
    );
    writeFileSync(source, '{"active":1857}');
    await assert.rejects(
      acknowledgeRuntimeLegacyPlan({
        observedPlan: observed,
        approvedPlanDigest: observed.digest,
        ...roots,
        adapters,
      }),
      { code: 'RUNTIME_MIGRATION_PLAN_CHANGED' }
    );
    writeFileSync(source, '{"active":null}');
    const unknown = path.join(path.dirname(source), 'unknown.json');
    writeFileSync(unknown, '{}');
    await assert.rejects(
      acknowledgeRuntimeLegacyPlan({
        observedPlan: observed,
        approvedPlanDigest: observed.digest,
        ...roots,
        adapters,
      }),
      { code: 'RUNTIME_MIGRATION_PLAN_CHANGED' }
    );
    const blocked = await planRuntimeMigration({ ...roots, adapters });
    await assert.rejects(
      acknowledgeRuntimeLegacyPlan({
        observedPlan: blocked,
        approvedPlanDigest: blocked.digest,
        ...roots,
        adapters,
      }),
      { code: 'RUNTIME_MIGRATION_BLOCKED' }
    );
    rmSync(unknown);
    const unavailable = await planRuntimeMigration({ ...roots });
    await assert.rejects(
      acknowledgeRuntimeLegacyPlan({
        observedPlan: unavailable,
        approvedPlanDigest: unavailable.digest,
        ...roots,
        adapters,
      }),
      { code: 'RUNTIME_MIGRATION_BLOCKED' }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
