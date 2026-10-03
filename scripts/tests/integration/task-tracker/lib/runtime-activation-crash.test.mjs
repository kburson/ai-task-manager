// @story #1861
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { planRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration-plan.mjs';
import { resumeRuntimeMigration } from '../../../../task-tracker/lib/runtime-migration-apply.mjs';
import { assertRuntimeReadable } from '../../../../task-tracker/lib/runtime-storage.mjs';
import { observeLocalRuntimeOwner } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';

for (const activatedRoot of [0, 1]) {
  test(
    'SIGKILL after control activation at root ' +
      activatedRoot +
      ' refuses partial authority and resumes exactly',
    async () => {
      const mainRoot = createRuntimeRootFixture('1861-control-crash-');
      const linked = mainRoot + '-linked';
      const adapters = {
        observeOwner: observeLocalRuntimeOwner,
        writerCensus: () => ({ complete: true, writers: [], claims: [] }),
        trustLegacy: () => 'explicit-operator-trust',
      };
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
        execFileSync('git', ['-C', mainRoot, 'worktree', 'add', '--detach', linked], {
          stdio: 'pipe',
        });
        const originals = [];
        for (const root of [mainRoot, linked]) {
          const values = {
            'state/task-tracker-state.json': { lastWordMarker: 1861 },
            'state/task-tracker-queue.json': [],
          };
          if (root === mainRoot)
            Object.assign(values, { 'fleet/task-fleet.json': {}, 'fleet/occupancy.json': {} });
          for (const [relative, value] of Object.entries(values)) {
            const file = path.join(root, '.tmp/aitm', relative);
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, JSON.stringify(value));
            originals.push([file, readFileSync(file)]);
          }
        }
        const plan = await planRuntimeMigration({ projectRoot: mainRoot, mainRoot, adapters });
        assert.deepEqual(plan.blockers, []);
        const module = new URL(
          '../../../../task-tracker/lib/runtime-migration-apply.mjs',
          import.meta.url
        ).href;
        const code = `import { applyRuntimeMigration } from ${JSON.stringify(module)};
        const [plan, rootIndex] = JSON.parse(process.argv[1]);
        await applyRuntimeMigration({ plan, approvedPlanDigest: plan.digest, adapters: {
          writerCensus: () => ({ complete: true, writers: [], claims: [] }), trustLegacy: () => 'explicit-operator-trust',
          fault: (point, context) => { if (point === 'after-root-activation' && context.root === plan.roots[rootIndex]) process.kill(process.pid, 'SIGKILL'); }
        } });`;
        child = spawn(
          process.execPath,
          ['--input-type=module', '-e', code, JSON.stringify([plan, activatedRoot])],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        exited = new Promise((resolve) =>
          child.once('exit', (code, signal) => resolve([code, signal]))
        );
        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        assert.equal((await exited)[1], 'SIGKILL', stderr);
        for (const root of [mainRoot, linked])
          assert.throws(() => assertRuntimeReadable({ projectRoot: root, mainRoot }));
        for (const [file, bytes] of originals) assert.deepEqual(readFileSync(file), bytes);
        const transactionId = 'migration-' + plan.digest.slice(7, 39);
        assert.equal(
          (
            await resumeRuntimeMigration({
              projectRoot: mainRoot,
              mainRoot,
              transactionId,
              approvedPlanDigest: plan.digest,
              adapters,
            })
          ).status,
          'complete'
        );
        for (const root of [mainRoot, linked])
          assertRuntimeReadable({ projectRoot: root, mainRoot });
        for (const [file, bytes] of originals) assert.deepEqual(readFileSync(file), bytes);
      } finally {
        child?.kill('SIGKILL');
        if (exited) await exited;
        rmSync(linked, { recursive: true, force: true });
        rmSync(mainRoot, { recursive: true, force: true });
      }
    }
  );
}
