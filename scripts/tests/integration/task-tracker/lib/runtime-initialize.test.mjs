// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createRuntimeRootFixture,
  createActivatedRuntimeRootFixture,
} from '../../../helpers/runtime-root-fixture.mjs';
import { planRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration-plan.mjs';
import { applyRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration-apply.mjs';
import { resumeRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration-apply.mjs';
import { assertRuntimeReadable } from '../../../../task-tracker/lib/runtime-storage.mjs';

test('a fresh registered worktree initializes empty local authority without changing the original migration or inheriting volatile bytes', async () => {
  const { planRuntimeInitialization, applyRuntimeInitialization, resumeRuntimeInitialization } =
    await import('../../../../task-tracker/lib/runtime-initialize.mjs');
  const mainRoot = createRuntimeRootFixture('1857-initialize-');
  const linked = mainRoot + '-linked';
  const owner = {
    provider: 'fixture',
    sid: 'initializer',
    pid: process.pid,
    processToken: 'init-process',
  };
  const adapters = {
    identity: () => owner,
    trustLegacy: () => 'explicit-operator-trust',
    writerCensus: () => ({ complete: true, writers: [], claims: [] }),
  };
  try {
    for (const [relative, value] of Object.entries({
      'state/task-tracker-state.json': {},
      'state/task-tracker-queue.json': [],
      'fleet/task-fleet.json': {},
      'fleet/occupancy.json': {},
    })) {
      const target = path.join(mainRoot, '.tmp/aitm', relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, JSON.stringify(value));
    }
    execFileSync('git', [
      '-C',
      mainRoot,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture',
    ]);
    const original = await planRuntimeMigration({ projectRoot: mainRoot, mainRoot, adapters });
    const activated = await applyRuntimeMigration({
      plan: original,
      approvedPlanDigest: original.digest,
      adapters,
    });
    const manifest = path.join(
      mainRoot,
      '.ai-task-manager/runtime/migrations',
      activated.transactionId,
      'manifest.json'
    );
    const before = readFileSync(manifest);
    execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', linked], { stdio: 'pipe' });
    const fake = path.join(linked, '.tmp/aitm/state/task-tracker-state.json');
    mkdirSync(path.dirname(fake), { recursive: true });
    writeFileSync(fake, '{"active":999}');
    const plan = planRuntimeInitialization({ projectRoot: linked, mainRoot });
    assert.equal(plan.sourcePolicy, 'empty-local-no-volatile-inherit');
    await assert.rejects(
      applyRuntimeInitialization({
        plan,
        approvedPlanDigest: plan.digest,
        adapters: {
          ...adapters,
          fault: (point) => {
            if (point === 'after-initialization-stage') throw new Error('fixture interruption');
          },
        },
      }),
      /fixture interruption/
    );
    const controlPath = path.join(linked, '.ai-task-manager/runtime/control.json');
    const genuineControl = readFileSync(controlPath);
    writeFileSync(
      controlPath,
      JSON.stringify({ ...JSON.parse(genuineControl), transactionId: 'foreign-control' })
    );
    await assert.rejects(
      resumeRuntimeInitialization({
        projectRoot: linked,
        mainRoot,
        approvedPlanDigest: plan.digest,
        adapters,
      }),
      { code: 'RUNTIME_MIGRATION_CONFLICT' }
    );
    assert.equal(JSON.parse(readFileSync(controlPath)).transactionId, 'foreign-control');
    writeFileSync(controlPath, genuineControl);
    const alien = path.join(
      linked,
      '.ai-task-manager/runtime',
      'initialization-' + plan.id,
      'extra.json'
    );
    writeFileSync(alien, '{}');
    await assert.rejects(
      resumeRuntimeInitialization({
        projectRoot: linked,
        mainRoot,
        approvedPlanDigest: plan.digest,
        adapters,
      }),
      { code: 'RUNTIME_MIGRATION_CONFLICT' }
    );
    assert.equal(readFileSync(alien, 'utf8'), '{}');
    rmSync(alien);
    let release;
    let reached;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const entered = new Promise((resolve) => {
      reached = resolve;
    });
    const firstResume = resumeRuntimeInitialization({
      projectRoot: linked,
      mainRoot,
      approvedPlanDigest: plan.digest,
      adapters: {
        ...adapters,
        fault: async (point) => {
          if (point === 'after-initialization-publish') {
            reached();
            await held;
            throw new Error('released recovery');
          }
        },
      },
    });
    const firstFailure = assert.rejects(firstResume, /released recovery/);
    await entered;
    try {
      await assert.rejects(
        resumeRuntimeInitialization({
          projectRoot: linked,
          mainRoot,
          approvedPlanDigest: plan.digest,
          adapters,
        }),
        { code: 'RUNTIME_MIGRATION_BUSY' }
      );
    } finally {
      release();
      await firstFailure;
    }
    const result = await resumeRuntimeInitialization({
      projectRoot: linked,
      mainRoot,
      approvedPlanDigest: plan.digest,
      adapters: {
        ...adapters,
        identity: () => ({ ...owner, sid: 'next-initializer', processToken: 'next-operation' }),
      },
    });
    assert.equal(result.status, 'complete');
    assert.equal(
      (
        await resumeRuntimeInitialization({
          projectRoot: linked,
          mainRoot,
          approvedPlanDigest: plan.digest,
          adapters,
        })
      ).status,
      'complete'
    );
    assertRuntimeReadable({ projectRoot: linked, mainRoot });
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          path.join(linked, '.ai-task-manager/runtime/store/state/task-tracker-state.json')
        )
      ),
      {}
    );
    assert.deepEqual(readFileSync(manifest), before);
    const retry = await resumeRuntimeMigration({
      projectRoot: mainRoot,
      mainRoot,
      transactionId: activated.transactionId,
      approvedPlanDigest: original.digest,
      adapters,
    });
    assert.equal(retry.status, 'complete');
    assert.deepEqual(JSON.parse(readFileSync(manifest)).roots, original.roots);
    assert.equal(readFileSync(fake, 'utf8'), '{"active":999}');
    rmSync(path.join(linked, '.tmp'), { recursive: true });
    assertRuntimeReadable({ projectRoot: linked, mainRoot });
    rmSync(path.join(linked, '.ai-task-manager/runtime'), { recursive: true });
    assert.throws(() => planRuntimeInitialization({ projectRoot: linked, mainRoot }), {
      code: 'RUNTIME_CONTROL_INVALID',
    });
  } finally {
    rmSync(linked, { recursive: true, force: true });
    rmSync(mainRoot, { recursive: true, force: true });
  }
});

for (const relative of [
  '.db/aitm/ready-for-plan-migration.json',
  '.claude/task-tracker-state.json',
  '.ai-task-manager/task-tracker-state.json',
]) {
  test(`empty linked initialization refuses existing durable evidence at ${relative}`, async () => {
    const { planRuntimeInitialization } =
      await import('../../../../task-tracker/lib/runtime-initialize.mjs');
    const mainRoot = await createActivatedRuntimeRootFixture('1861-durable-initialize-');
    const linked = mainRoot + '-linked';
    try {
      execFileSync('git', [
        '-C',
        mainRoot,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--allow-empty',
        '-qm',
        'fixture',
      ]);
      execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', linked], {
        stdio: 'pipe',
      });
      const evidence = path.join(linked, relative);
      mkdirSync(path.dirname(evidence), { recursive: true });
      writeFileSync(evidence, 'protected legacy bytes');
      assert.throws(() => planRuntimeInitialization({ projectRoot: linked, mainRoot }), {
        code: 'RUNTIME_INITIALIZATION_REFUSED',
      });
      assert.equal(readFileSync(evidence, 'utf8'), 'protected legacy bytes');
    } finally {
      rmSync(linked, { recursive: true, force: true });
      rmSync(mainRoot, { recursive: true, force: true });
    }
  });
}

test('empty linked initialization rechecks durable absence before applying an approved plan', async () => {
  const { planRuntimeInitialization, applyRuntimeInitialization } =
    await import('../../../../task-tracker/lib/runtime-initialize.mjs');
  const mainRoot = await createActivatedRuntimeRootFixture('1861-late-durable-');
  const linked = mainRoot + '-linked';
  try {
    execFileSync('git', [
      '-C',
      mainRoot,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'fixture',
    ]);
    execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', linked], { stdio: 'pipe' });
    const plan = planRuntimeInitialization({ projectRoot: linked, mainRoot });
    const evidence = path.join(linked, '.db/aitm/ready-for-plan-migration.json');
    mkdirSync(path.dirname(evidence), { recursive: true });
    writeFileSync(evidence, 'arrived after planning');
    await assert.rejects(
      applyRuntimeInitialization({
        plan,
        approvedPlanDigest: plan.digest,
        adapters: {
          identity: () => ({
            provider: 'fixture',
            sid: 'late-initializer',
            pid: process.pid,
            processToken: 'late-process',
          }),
        },
      }),
      { code: 'RUNTIME_INITIALIZATION_REFUSED' }
    );
    assert.equal(readFileSync(evidence, 'utf8'), 'arrived after planning');
    assert.equal(existsSync(path.join(linked, '.ai-task-manager/runtime/control.json')), false);
    assert.equal(existsSync(path.join(linked, '.ai-task-manager/runtime/store')), false);
  } finally {
    rmSync(linked, { recursive: true, force: true });
    rmSync(mainRoot, { recursive: true, force: true });
  }
});
