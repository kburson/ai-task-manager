// @story #1855
import {
  assert,
  chmodSync,
  createSandbox,
  execFileSync,
  fileURLToPath,
  mkdirSync,
  moveState,
  nativeFinalFixture,
  path,
  rawLifecycleSources,
  test,
  writeFileSync,
} from './native-continuation-fixtures.mjs';

for (const sourced of [false, true])
  test(`native full stage pipeline ${sourced ? 'reads captured native sources' : 'refuses unavailable lifecycle sources'} before saga effects`, async (t) => {
    if (process.env.AITM_STAGE_REFUSAL_FIXTURE !== '1') {
      const isolation = createSandbox();
      try {
        const bin = path.join(isolation.root, 'bin');
        mkdirSync(bin);
        writeFileSync(
          path.join(bin, 'gh'),
          '#!/bin/sh\necho fixture-lifecycle-source-unavailable >&2\nexit 97\n'
        );
        chmodSync(path.join(bin, 'gh'), 0o755);
        const output = execFileSync(
          process.execPath,
          [
            '--test',
            `--test-name-pattern=native full stage pipeline ${sourced ? 'reads captured native sources' : 'refuses unavailable lifecycle sources'}`,
            fileURLToPath(import.meta.url),
          ],
          {
            env: {
              ...isolation.env,
              PATH: `${bin}:${isolation.env.PATH}`,
              AITM_STAGE_REFUSAL_FIXTURE: '1',
            },
            cwd: isolation.context.sourceRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
        t.diagnostic(output);
        if (sourced) {
          assert.doesNotMatch(
            output,
            /dependency readiness unavailable|dependency projection unavailable|comments-fetch-failed|trail-fetch-failed|epic-children-fetch-failed|workflow policy authority unavailable/
          );
          assert.match(output, /code-complete-ac-unticked/);
        } else assert.match(output, /revision-authority-unavailable/);
      } finally {
        isolation.dispose();
      }
      return;
    }
    const f = await nativeFinalFixture({ bodyStages: ['backlog', 'refine', 'plan', 'develop'] });
    try {
      writeFileSync(
        path.join(f.projectDir, '.ai-task-manager/task-tracker.json'),
        JSON.stringify({
          repo: f.context.repository,
          projectId: 'PVT_fixture',
          fieldDisposition: 'PVTF_disposition',
        })
      );
      assert.equal((await f.invoke()).error, undefined);
      if (sourced)
        f.restart((snapshot) => {
          snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
        });
      const before = structuredClone(f.backend.snapshot);
      const calls = [];
      let result, error;
      try {
        result = await moveState({
          cfg: {
            repo: f.context.repository,
            projectId: 'PVT_fixture',
            fieldDisposition: 'PVTF_disposition',
          },
          issueArg: String(f.context.issue),
          stateArg: 'test',
          resolvedFromState: 'develop',
          verbContext: 'test',
          projectDir: f.projectDir,
          revisionBackend: f.backend,
          plan: { runGuardPipeline: true },
          SKIP_NETWORK: false,
          forceFlag: false,
          supersedeFlag: false,
          gh: async (args) => {
            calls.push(['gh', ...args]);
            if (args[0] === 'issue' && args[1] === 'view' && args.includes('--jq'))
              return f.backend.observation.body.bytes;
            throw new Error('fixture-lifecycle-source-unavailable');
          },
          pexec: async () => {
            calls.push(['pexec']);
            throw new Error('fixture-lifecycle-source-unavailable');
          },
          resolveLiveStateName: async () => {
            throw new Error('fixture-lifecycle-source-unavailable');
          },
        });
      } catch (caught) {
        error = caught;
      }
      t.diagnostic(JSON.stringify({ result, error: error?.code ?? error?.message, calls }));
      if (!sourced) {
        assert.equal(error?.code, 'revision-authority-unavailable');
        assert.deepEqual(calls, []);
        assert.deepEqual(f.backend.snapshot, before);
        return;
      }
      assert.equal(error, undefined);
      assert.equal(result.phase, 'guard');
      assert.notEqual(result.exit, null);
      assert.equal(result.boardMoved, false);
      assert.equal(result.sentinelPresent, false);
      assert.deepEqual(
        calls,
        [],
        'private source reads must not invoke supplied transport callbacks'
      );
      assert.deepEqual(f.backend.snapshot, before);
      assert.equal(
        f.effects.filter((effect) => effect === 'body-push').length,
        1,
        'only the prior final receipt was written'
      );
    } finally {
      f.dispose();
    }
  });
