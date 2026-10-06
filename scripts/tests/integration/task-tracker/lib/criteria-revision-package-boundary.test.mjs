// @story #1854 #1853
import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { parseNpmPackReport } from '../../../helpers/npm-pack-report.mjs';
import {
  makeLegacyRevisionFixture,
  makeCanonicalRevisionFixture,
} from '../../../fixtures/criteria-revision.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
function run(command, args, cwd) {
  const result = childProcess.spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, npm_config_loglevel: 'silent' },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}: ${result.stdout}\n${result.stderr}`
  );
  return result.stdout;
}
test('packed deep-import engine and both body adapters keep transaction mutation quarantined', async (t) => {
  const sandbox = mkdtempSync(join(projectScratchDir('test', root), 'criteria-revision-pack-'));
  const consumer = join(sandbox, 'consumer');
  mkdirSync(consumer);
  try {
    const report = parseNpmPackReport(
      run('npm', ['pack', '--json', '--pack-destination', sandbox], root),
      { expectedPackageName: '@kburson/ai-task-manager', requireFilename: true }
    );
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ name: 'criteria-revision-consumer', private: true, type: 'module' })
    );
    run(
      'npm',
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        join(sandbox, report.filename),
      ],
      consumer
    );
    assert.equal(existsSync(join(consumer, 'node_modules', 'ai-task-manager')), false);
    const installedRoot = realpathSync(
      join(consumer, 'node_modules', '@kburson', 'ai-task-manager')
    );
    assert.equal(
      installedRoot,
      join(realpathSync(consumer), 'node_modules', '@kburson', 'ai-task-manager')
    );
    const require = createRequire(join(consumer, 'package.json'));
    const load = async (relative) => {
      assert.ok(
        report.files.some((x) => x.path === relative),
        `not packed: ${relative}`
      );
      const resolved = realpathSync(require.resolve('@kburson/ai-task-manager/' + relative));
      assert.ok(resolved.startsWith(installedRoot + sep), `ambient/source fallback: ${resolved}`);
      return import(pathToFileURL(resolved).href);
    };
    const engine = await load('scripts/task-tracker/lib/criteria-revision/engine.mjs');
    const { mutateIssueBody } = await load('scripts/task-tracker/lib/issue-body-mutate.mjs');
    const { versionedWriteBody } = await load('scripts/task-tracker/lib/versioned-issue-write.mjs');
    const store = await load('scripts/task-tracker/lib/criteria-revision/store.mjs');
    const { withLegacyWriteCapability } = await load(
      'scripts/task-tracker/lib/criteria-revision/legacy.mjs'
    );
    const { COMMAND_CATALOG } = await load('scripts/task-tracker/lib/command-surface/catalog.mjs');
    const { listLifecycleActions } = await load(
      'scripts/task-tracker/lib/lifecycle-policy/actions.mjs'
    );
    let effects = 0;
    // Trap an unexpected production fallback; a regression must fail without
    // contacting real GitHub. This is test-process instrumentation, not runtime deps.
    t.mock.method(childProcess, 'spawn', () => {
      effects++;
      throw new Error('unexpected production spawn');
    });
    syncBuiltinESMExports();
    const f = makeLegacyRevisionFixture();
    const context = {
      repository: f.observation.repository,
      issue: f.observation.issue,
      executor: f.observation.executor,
    };
    const createBackend = () =>
      store.createRevisionMemory({
        observation: f.observation,
        comments: [],
        hostMessages: [f.rawUserMessage],
      });
    const deps = createBackend();
    for (const forged of [
      undefined,
      {},
      {
        transport: {
          createComment() {
            effects++;
          },
        },
        loadUserMessage() {
          effects++;
        },
      },
      { revisionBackend: true, ports: {} },
    ]) {
      assert.equal(
        (await engine.applyRevision({ context, request: f.request, deps: forged })).status,
        'refused'
      );
      assert.equal(
        (await engine.recoverRevision({ context, request: f.request, deps: forged })).status,
        'refused'
      );
    }
    const writers = [mutateIssueBody, versionedWriteBody];
    const call = (writer, token, backend, after = f.proposal.writeSet[0].afterBytes) =>
      writer({
        repo: context.repository,
        issueNumber: context.issue,
        criteriaRevisionCapability: token,
        deps: backend,
        mutate: () => after,
      });
    for (const writer of writers)
      await assert.rejects(
        call(
          writer,
          {},
          {
            fetchBody: () => {
              effects++;
            },
            pushBody: () => {
              effects++;
            },
          }
        ),
        /revision/
      );
    let escaped;
    await store.withMemoryInterlock(deps, context, async (capability) => {
      await withLegacyWriteCapability(
        {
          backend: deps,
          capability,
          context,
          proposal: f.proposal,
          before: f.observation.body.bytes,
        },
        async (token) => {
          escaped = token;
          for (const writer of writers) {
            for (const backend of [
              undefined,
              {},
              { revisionBackend: createBackend() },
              {
                revisionBackend: deps,
                pushBody: () => {
                  effects++;
                },
              },
            ])
              await assert.rejects(call(writer, token, backend), /revision/);
            for (const after of [
              f.proposal.writeSet[0].afterBytes + '\n<!-- aitm-test-verified sha="fake" -->',
              f.proposal.writeSet[0].afterBytes.replace('## Scope', '## Removed scope'),
            ])
              await assert.rejects(
                call(writer, token, { revisionBackend: deps }, after),
                /revision/
              );
          }
        }
      );
    });
    for (const writer of writers)
      await assert.rejects(call(writer, escaped, { revisionBackend: deps }), /revision/);
    const canonical = await load('scripts/task-tracker/lib/criteria-revision/canonical.mjs');
    const plan = await load('scripts/task-tracker/lib/criteria-revision/plan-approval.mjs');
    const { withCanonicalBodyWriteCapability } = await load(
      'scripts/task-tracker/lib/criteria-revision/legacy.mjs'
    );
    const cf = makeCanonicalRevisionFixture(),
      cb = store.createRevisionMemory({
        observation: cf.observation,
        comments: [],
        hostMessages: [cf.rawUserMessage],
      });
    const cc = {
      repository: cf.observation.repository,
      issue: cf.observation.issue,
      executor: cf.observation.executor,
    };
    const bodyWrite = cf.proposal.writeSet.find((write) => write.resource === 'issue-body');
    await assert.rejects(
      canonical.applyCanonicalRevision({ capability: {}, proposal: cf.proposal, deps: {} }),
      /production-quarantined/
    );
    await assert.rejects(plan.finishMemoryPlanApproval({}, {}), /plan-completion-capability/);
    await assert.rejects(
      plan.runMemoryPlanApproval({
        issueNumber: 124,
        cfg: { repo: cc.repository },
        backend: { observation: cf.observation },
      }),
      /production-quarantined/
    );
    cb.failBefore = 'body-write';
    await assert.rejects(
      engine.applyRevision({ context: cc, request: cf.request, deps: cb }),
      /interrupted/
    );
    let canonicalEscaped;
    await store.withMemoryInterlock(cb, cc, async (capability) => {
      await withCanonicalBodyWriteCapability(
        {
          backend: cb,
          capability,
          context: cc,
          proposal: cf.proposal,
          before: cb.observation.body.bytes,
        },
        async (token) => {
          canonicalEscaped = token;
          for (const writer of writers) {
            for (const backend of [
              { revisionBackend: deps },
              {
                revisionBackend: cb,
                pushBody: () => {
                  effects++;
                },
              },
            ])
              await assert.rejects(call(writer, token, backend, bodyWrite.afterBytes), /revision/);
            await assert.rejects(
              call(writer, token, { revisionBackend: cb }, bodyWrite.afterBytes + 'unrelated'),
              /revision/
            );
          }
        }
      );
    });
    for (const writer of writers)
      await assert.rejects(
        call(writer, canonicalEscaped, { revisionBackend: cb }, bodyWrite.afterBytes),
        /revision/
      );
    assert.equal(
      (await engine.recoverRevision({ context: cc, request: cf.request, deps: cb })).status,
      'applied'
    );
    assert.equal(effects, 0);
    assert.equal(deps.effects.includes('body-write'), false);
    assert.equal(
      COMMAND_CATALOG.some((x) => x.name.startsWith('criteria-revise')),
      false
    );
    assert.equal(
      listLifecycleActions().some((x) => x.id.startsWith('criteria-revise')),
      false
    );
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    rmSync(sandbox, { recursive: true, force: true });
  }
});
