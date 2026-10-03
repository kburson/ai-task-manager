// @story #1857
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function createActivatedRuntimeRootFixture(prefix = 'runtime-active-test-') {
  const root = createRuntimeRootFixture(prefix);
  try {
    await activateRuntimeRootFixture(root);
    return root;
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

// Existing disposable Git roots, including registered linked roots, migrate as
// one real fixture census. Call only after fixture worktree creation completes.
export async function activateRuntimeRootFixture(root, linkedRoots = []) {
  const { planRuntimeMigration, applyRuntimeMigration } =
    await import('../../task-tracker/lib/runtime-migration.mjs');
  for (const [relative, value] of Object.entries({
    'state/task-tracker-state.json': {},
    'state/task-tracker-queue.json': [],
    'fleet/task-fleet.json': {},
    'fleet/occupancy.json': {},
  })) {
    const file = path.join(root, '.tmp', 'aitm', relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  }
  const adapters = {
    identity: () => ({
      provider: 'fixture',
      sid: 'isolated-runtime-fixture',
      pid: process.pid,
      processToken: 'fixture-migration',
    }),
    trustLegacy: () => 'explicit-operator-trust',
    writerCensus: () => ({ complete: true, writers: [], claims: [] }),
  };
  for (const linked of linkedRoots) {
    for (const [relative, value] of Object.entries({
      'state/task-tracker-state.json': {},
      'state/task-tracker-queue.json': [],
    })) {
      const file = path.join(linked, '.tmp', 'aitm', relative);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(value));
    }
  }
  const plan = await planRuntimeMigration({ projectRoot: root, mainRoot: root, adapters });
  await applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters });
}

export function createRuntimeRootFixture(prefix = 'runtime-test-') {
  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const parent = path.join(repository, '.ai-task-manager', 'runtime', 'test-fixtures');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(path.join(parent, prefix));
  execFileSync('git', ['init', '-q', root]);
  return root;
}
