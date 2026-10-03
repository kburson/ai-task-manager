// @story #1857
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { planRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration-plan.mjs';
import { applyRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration-apply.mjs';
import {
  planRuntimeInitialization,
  resumeRuntimeInitialization,
} from '../../../../task-tracker/lib/runtime-initialize.mjs';
import {
  inspectRuntimeWriterLeases,
  recoverRuntimeWriterLease,
} from '../../../../task-tracker/lib/runtime-migration-lock.mjs';
import { assertRuntimeReadable } from '../../../../task-tracker/lib/runtime-storage.mjs';

test('SIGKILL before initialization publication and during resumer claim preserves exclusive recoverable ownership', async () => {
  const mainRoot = createRuntimeRootFixture('1857-init-kill-');
  const linked = mainRoot + '-linked';
  const children = [];
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
    const adapters = {
      trustLegacy: () => 'explicit-operator-trust',
      writerCensus: () => ({ complete: true, writers: [], claims: [] }),
    };
    const original = await planRuntimeMigration({ projectRoot: mainRoot, mainRoot, adapters });
    await applyRuntimeMigration({ plan: original, approvedPlanDigest: original.digest, adapters });
    execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', linked], { stdio: 'pipe' });
    const plan = planRuntimeInitialization({ projectRoot: linked, mainRoot });
    const url = new URL('../../../../task-tracker/lib/runtime-initialize.mjs', import.meta.url)
      .href;
    const launch = (mode) => {
      const code = [
        'import { applyRuntimeInitialization, resumeRuntimeInitialization } from ' +
          JSON.stringify(url) +
          ';',
        'const plan = JSON.parse(process.argv[1]);',
        'const mode = process.argv[2];',
        'const adapters = { fault: async (point) => {',
        'if (mode === "apply" && point === "after-initialization-claim") process.kill(process.pid, "SIGKILL");',
        'if (mode === "resume" && point === "after-initialization-recovery-claim") { process.stdout.write("HELD"); setInterval(() => {}, 1000); await new Promise(() => {}); }',
        '} };',
        'if (mode === "apply") await applyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters });',
        'else await resumeRuntimeInitialization({ projectRoot: plan.projectRoot, mainRoot: plan.mainRoot, approvedPlanDigest: plan.digest, adapters });',
      ].join(String.fromCharCode(10));
      const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', code, JSON.stringify(plan), mode],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const exited = once(child, 'exit');
      children.push({ child, exited });
      return { child, exited };
    };
    const first = launch('apply');
    assert.equal((await first.exited)[1], 'SIGKILL');
    const journalFile = path.join(
      mainRoot,
      '.ai-task-manager/runtime/initializations',
      plan.id + '.json'
    );
    const originalOwner = JSON.parse(readFileSync(journalFile)).owner;
    assert.equal(originalOwner.pid, first.child.pid);
    const recovery = launch('resume');
    let stderr = '';
    recovery.child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    await Promise.race([
      new Promise((resolve) => recovery.child.stdout.once('data', resolve)),
      recovery.exited.then(() => assert.fail('resumer exited before claim: ' + stderr)),
    ]);
    await assert.rejects(
      resumeRuntimeInitialization({
        projectRoot: linked,
        mainRoot,
        approvedPlanDigest: plan.digest,
      }),
      { code: 'RUNTIME_MIGRATION_BUSY' }
    );
    assert.equal(existsSync(path.join(linked, '.ai-task-manager/runtime/store')), false);
    recovery.child.kill('SIGKILL');
    assert.equal((await recovery.exited)[1], 'SIGKILL');
    assert.equal(
      (
        await resumeRuntimeInitialization({
          projectRoot: linked,
          mainRoot,
          approvedPlanDigest: plan.digest,
        })
      ).status,
      'complete'
    );
    assertRuntimeReadable({ projectRoot: linked, mainRoot });
    const history = path.join(
      mainRoot,
      '.ai-task-manager/runtime/initialization-recoveries',
      plan.id
    );
    const claims = readdirSync(history)
      .sort()
      .map((name) => JSON.parse(readFileSync(path.join(history, name))));
    assert.equal(claims.length, 2);
    assert.equal(claims[0].phase, 'active');
    assert.equal(claims[0].owner.pid, recovery.child.pid);
    assert.equal(claims[1].phase, 'complete');
    assert.ok(claims[1].previousReceipt);
    const leases = inspectRuntimeWriterLeases({ projectRoot: linked, mainRoot });
    assert.equal(leases.length, 2);
    for (const lease of leases)
      recoverRuntimeWriterLease({
        projectRoot: linked,
        mainRoot,
        leaseId: lease.record.leaseId,
        expectedDigest: lease.digest,
      });
    assert.equal(inspectRuntimeWriterLeases({ projectRoot: linked, mainRoot }).length, 0);
  } finally {
    for (const { child, exited } of children) {
      child.kill('SIGKILL');
      await exited;
    }
    rmSync(linked, { recursive: true, force: true });
    rmSync(mainRoot, { recursive: true, force: true });
  }
});

for (const boundary of [
  'after-initialization-stage',
  'after-initialization-publish',
  'after-initialization-journal',
]) {
  test(
    'real SIGKILL at ' + boundary + ' preserves empty local bytes and original activation',
    async () => {
      const { createActivatedRuntimeRootFixture } =
        await import('../../../helpers/runtime-root-fixture.mjs');
      const mainRoot = await createActivatedRuntimeRootFixture('1861-init-boundary-');
      const linked = mainRoot + '-linked';
      let child;
      let exited;
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
        const mainControl = readFileSync(
          path.join(mainRoot, '.ai-task-manager/runtime/control.json')
        );
        const mainStore = readFileSync(
          path.join(mainRoot, '.ai-task-manager/runtime/store/state/task-tracker-state.json')
        );
        execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', linked], {
          stdio: 'pipe',
        });
        const plan = planRuntimeInitialization({ projectRoot: linked, mainRoot });
        const url = new URL('../../../../task-tracker/lib/runtime-initialize.mjs', import.meta.url)
          .href;
        const code = `import { applyRuntimeInitialization } from ${JSON.stringify(url)};
        const [plan, boundary] = JSON.parse(process.argv[1]);
        await applyRuntimeInitialization({ plan, approvedPlanDigest: plan.digest, adapters: { fault: (point) => {
          if (point === boundary) process.kill(process.pid, 'SIGKILL');
        } } });`;
        child = spawn(
          process.execPath,
          ['--input-type=module', '-e', code, JSON.stringify([plan, boundary])],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        exited = once(child, 'exit');
        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        const [exitCode, signal] = await exited;
        assert.equal(exitCode, null, stderr);
        assert.equal(signal, 'SIGKILL', stderr);
        const journalFile = path.join(
          mainRoot,
          '.ai-task-manager/runtime/initializations',
          plan.id + '.json'
        );
        assert.equal(JSON.parse(readFileSync(journalFile)).owner.pid, child.pid);
        assert.throws(() => assertRuntimeReadable({ projectRoot: linked, mainRoot }), {
          code: 'RUNTIME_TRANSACTION_INCOMPLETE',
        });
        assert.equal(
          (
            await resumeRuntimeInitialization({
              projectRoot: linked,
              mainRoot,
              approvedPlanDigest: plan.digest,
            })
          ).status,
          'complete'
        );
        assertRuntimeReadable({ projectRoot: linked, mainRoot });
        for (const [relative, bytes] of Object.entries(plan.records))
          assert.equal(
            readFileSync(path.join(linked, '.ai-task-manager/runtime/store', relative), 'utf8'),
            bytes
          );
        assert.deepEqual(
          readFileSync(path.join(mainRoot, '.ai-task-manager/runtime/control.json')),
          mainControl
        );
        assert.deepEqual(
          readFileSync(
            path.join(mainRoot, '.ai-task-manager/runtime/store/state/task-tracker-state.json')
          ),
          mainStore
        );
        for (const lease of inspectRuntimeWriterLeases({ projectRoot: linked, mainRoot }))
          recoverRuntimeWriterLease({
            projectRoot: linked,
            mainRoot,
            leaseId: lease.record.leaseId,
            expectedDigest: lease.digest,
          });
        assert.equal(
          (
            await resumeRuntimeInitialization({
              projectRoot: linked,
              mainRoot,
              approvedPlanDigest: plan.digest,
            })
          ).status,
          'complete'
        );
      } finally {
        if (child) {
          child.kill('SIGKILL');
          await exited;
        }
        rmSync(linked, { recursive: true, force: true });
        rmSync(mainRoot, { recursive: true, force: true });
      }
    }
  );
}
