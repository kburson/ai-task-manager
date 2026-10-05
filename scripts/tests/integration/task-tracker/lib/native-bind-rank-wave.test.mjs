// @story #1889
// Child HOME is an isolated fixture; no native user transcript/state is written.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);

for (const mode of ['source', 'packed']) {
  test(
    mode +
      ' real native bind satisfies production rank-wave parent check and tampering remains refused',
    () => {
      const fixtureHome = mkdtempProjectIsolated('binding-home-');
      try {
        const modules = Object.fromEntries(
          [
            ['fixture', '../../../helpers/binding-generation-fixture.mjs'],
            ['start', '../../../../task-tracker/verbs/start.mjs'],
            ['runtime', '../../../../task-tracker/lib/epic-rank-wave-runtime.mjs'],
            ['bindings', '../../../../task-tracker/lib/epic-rank-wave-bindings.mjs'],
            ['session', '../../../../task-tracker/session-state.mjs'],
          ].map(([key, value]) => [key, new URL(value, import.meta.url).href])
        );
        if (mode === 'packed') {
          const packDir = path.join(fixtureHome, 'pack');
          const consumer = path.join(fixtureHome, 'consumer');
          mkdirSync(packDir, { recursive: true });
          mkdirSync(consumer, { recursive: true });
          writeFileSync(
            path.join(consumer, 'package.json'),
            JSON.stringify({
              name: 'native-bind-fixture',
              version: '1.0.0',
              private: true,
              type: 'module',
            })
          );
          const sourceRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
          const report = parseNpmPackReport(
            execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
              cwd: sourceRoot,
              encoding: 'utf8',
            }),
            {
              expectedPackageName: '@kburson/ai-task-manager',
              requireFilename: true,
            }
          );
          execFileSync(
            'npm',
            [
              'install',
              '--offline',
              '--ignore-scripts',
              '--no-audit',
              '--no-fund',
              '--package-lock=false',
              path.join(packDir, report.filename),
            ],
            { cwd: consumer, encoding: 'utf8' }
          );
          const installed = path.join(consumer, 'node_modules', '@kburson', 'ai-task-manager');
          for (const [key, relative] of Object.entries({
            start: 'verbs/start.mjs',
            runtime: 'lib/epic-rank-wave-runtime.mjs',
            bindings: 'lib/epic-rank-wave-bindings.mjs',
            session: 'session-state.mjs',
          }))
            modules[key] = pathToFileURL(
              path.join(installed, 'scripts/task-tracker', relative)
            ).href;
        }
        const script = `
    import assert from 'node:assert/strict';
    import { mkdirSync, writeFileSync } from 'node:fs';
    import path from 'node:path';
    import { createBindingFixture } from ${JSON.stringify(modules.fixture)};
    import { verbStart } from ${JSON.stringify(modules.start)};
    import { createRankWaveRuntime } from ${JSON.stringify(modules.runtime)};
    import { nativeRankWaveTranscript } from ${JSON.stringify(modules.bindings)};
    import { setActiveTask } from ${JSON.stringify(modules.session)};
    const f = createBindingFixture(${JSON.stringify(import.meta.url)});
    try {
      await verbStart(f.ctx);
      const claim = f.rows()['107'];
      assert.equal(f.active().bindingGenerationId, claim.bindingGenerationId);
      const transcript = nativeRankWaveTranscript({
        provider: f.provider, sessionId: f.sid, worktree: f.root
      });
      mkdirSync(path.dirname(transcript), { recursive: true });
      writeFileSync(transcript, JSON.stringify({
        sessionId: f.sid, cwd: f.root, isSidechain: false
      }) + '\\n');
      const runtime = createRankWaveRuntime({ ...f.ctx, cfg: { repo: 'fixture/repo' } });
      await runtime.assertParent(107);
      const original = f.active();
      // Negative fixtures mutate test authority only, after genuine native bind.
      for (const replacement of [null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']) {
        setActiveTask(f.sid, { ...original, bindingGenerationId: replacement }, f.root);
        await assert.rejects(() => runtime.assertParent(107), /genuine parent binding required/);
      }
      setActiveTask(f.sid, original, f.root);
      process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-foreign-1889';
      const foreign = createRankWaveRuntime({ ...f.ctx, cfg: { repo: 'fixture/repo' } });
      await assert.rejects(() => foreign.assertParent(107), /session|binding/);
      console.log('native-bind-rank-wave: real bind accepted; missing, mismatch and foreign refused');
    } finally { f.close(); }
  `;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
          env: { ...process.env, HOME: fixtureHome },
          encoding: 'utf8',
          timeout: 30000,
        });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /real bind accepted; missing, mismatch and foreign refused/);
      } finally {
        rmSync(fixtureHome, { recursive: true, force: true });
      }
    }
  );
}
