// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, readFileSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { inspectReadyForPlanMigration, applyReadyForPlanMigration } from '../../../../task-tracker/lib/ready-for-plan-migration.mjs';
import { readyForPlanMigrationJournalPath, loadReadyForPlanMigrationJournal } from '../../../../task-tracker/lib/ready-for-plan-migration-freeze.mjs';
import { inspectRuntimeWriterLeases } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';

test('Ready-for-Planning cutover journal and remote operation share durable authority and a whole lease', async () => {
  const root = await createActivatedRuntimeRootFixture('ready-journal-durable-');
  const cfg = { projectId: 'P1', kanbanFieldId: 'F1', kanbanOptionBacklog: 'B', kanbanOptionAssigned: 'A' };
  const names = ['Backlog', 'Assigned', 'Refine', 'Plan', 'Develop', 'Test', 'Review', 'Done'];
  const field = { id: 'F1', options: names.map((name, i) => ({ id: i === 0 ? 'B' : i === 1 ? 'A' : 'O' + i, name, color: 'GRAY', description: '' })) };
  try {
    const target = readyForPlanMigrationJournalPath(root);
    assert.equal(target, path.join(root, '.ai-task-manager', 'runtime', 'store', 'migrations', 'ready-for-plan-migration.json'));
    const plan = await inspectReadyForPlanMigration({ cfg, deps: { fetchStatusField: async () => field, collectInventory: async () => [] } });
    await assert.rejects(applyReadyForPlanMigration({ plan, cfg, projectDir: root, deps: {
      collectInventory: async () => [],
      fetchStatusField: async () => {
        assert.equal(inspectRuntimeWriterLeases({ projectRoot: root, mainRoot: root }).length, 1);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(loadReadyForPlanMigrationJournal({ projectDir: root }).planDigest, plan.digest);
        throw new Error('observed-remote-boundary');
      },
    } }), /observed-remote-boundary/);
    assert.equal(inspectRuntimeWriterLeases({ projectRoot: root, mainRoot: root }).length, 0);
    const original = readFileSync(target);
    const volatile = path.join(root, '.tmp', 'ready.json');
    mkdirSync(path.dirname(volatile), { recursive: true });
    writeFileSync(volatile, original);
    rmSync(target);
    symlinkSync(volatile, target);
    assert.throws(() => loadReadyForPlanMigrationJournal({ projectDir: root }), { code: 'RUNTIME_OVERRIDE_UNSAFE' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
