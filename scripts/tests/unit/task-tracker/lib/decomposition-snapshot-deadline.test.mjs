// @story #2079 — capture must not sweep retained history inside authority requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { repository } from '../../../helpers/graphql-usage/fixture.mjs';
import { observation } from '../../../helpers/graphql-usage/observation.mjs';
import {
  prepareUsageEnv,
  observeGraphqlHttp,
} from '../../../../task-tracker/lib/graphql-usage/collection.mjs';
import {
  resolveUsageRoot,
  readUsage,
  enrollUsage,
  createUsageWriter,
  usageRetention,
} from '../../../../task-tracker/lib/graphql-usage/storage.mjs';

function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^AITM_(?:CAPTURE_|GRAPHQL_USAGE(?:_|$))/.test(key)) delete env[key];
  return { ...env, AITM_GRAPHQL_USAGE: '1' };
}
const fakeResponse = async () =>
  new Response(JSON.stringify({ data: { viewer: { id: 'offline' } } }));
const request = { method: 'POST', body: JSON.stringify({ query: '{viewer{id}}' }) };

// Break caught: moving a full-store sweep back into request startup, or losing root inspection.
test('root launch inspects once while nested preparation and HTTP observations retain capture without scans', async (t) => {
  const { cwd } = await repository(t);
  const resolved = await resolveUsageRoot(cwd);
  let sweeps = 0;
  const readdir = fs.readdir.bind(fs);
  t.mock.method(fs, 'readdir', async (directory, ...args) => {
    if (directory === resolved.root) sweeps++;
    return readdir(directory, ...args);
  });
  const env = await prepareUsageEnv({ cwd, env: cleanEnv(), permissionContext: 'deadline-test' });
  assert.equal(sweeps, 1, 'root launch owns one advisory inspection');
  const nested = await prepareUsageEnv({ cwd, env });
  assert.equal(sweeps, 1, 'nested preparation must not inspect retained history');
  for (let i = 0; i < 3; i++)
    await observeGraphqlHttp('https://api.github.com/graphql', request, {
      cwd,
      env: nested,
      fetch: fakeResponse,
      logicalOperationId: 'offline-snapshot',
      pageIndex: i,
    });
  assert.equal(sweeps, 1, 'request setup must not enumerate retained history');
  const rows = (await readUsage(resolved.root)).observations;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.pageIndex).sort(), [0, 1, 2]);
  assert.ok(rows.every((r) => r.outcome === 'success'));
});

// Break caught: reportDiagnostics creating a scanning writer for malformed inherited context.
test('invalid inherited context preserves diagnostics and observations without a descendant sweep', async (t) => {
  const { cwd } = await repository(t);
  const root = (await resolveUsageRoot(cwd)).root;
  const readdir = fs.readdir.bind(fs);
  let sweeps = 0;
  t.mock.method(fs, 'readdir', async (directory, ...args) => {
    if (directory === root) sweeps++;
    return readdir(directory, ...args);
  });
  const env = await prepareUsageEnv({
    cwd,
    env: { ...cleanEnv(), AITM_GRAPHQL_USAGE_CONTEXT: 'malformed' },
    permissionContext: 'deadline-test',
  });
  assert.ok(env.AITM_GRAPHQL_USAGE_CONTEXT !== 'malformed');
  assert.equal(sweeps, 0);
  await observeGraphqlHttp('https://api.github.com/graphql', request, {
    cwd,
    env,
    fetch: fakeResponse,
  });
  assert.equal(sweeps, 0);
  const records = await readUsage(root);
  assert.equal(records.observations.length, 1);
  assert.ok(records.diagnostics.some((r) => r.code === 'invalid-inherited-context'));
});

// Break caught: advisory inspection failure returning unprepared env and losing capture.
test('failed launch advisory inspection warns but preserves prepared collection and a successful observation', async (t) => {
  const { cwd } = await repository(t);
  const root = (await resolveUsageRoot(cwd)).root;
  const readdir = fs.readdir.bind(fs);
  const warnings = [];
  let failSweep = true;
  t.mock.method(process.stderr, 'write', (message) => {
    warnings.push(String(message));
    return true;
  });
  t.mock.method(fs, 'readdir', async (directory, ...args) => {
    if (directory === root && failSweep)
      throw Object.assign(new Error('private failure'), { code: 'EACCES' });
    return readdir(directory, ...args);
  });
  const env = await prepareUsageEnv({ cwd, env: cleanEnv(), permissionContext: 'deadline-test' });
  assert.ok(env.AITM_GRAPHQL_USAGE_CONTEXT);
  assert.ok(warnings.some((r) => r.includes('storage-failure')));
  assert.ok(warnings.every((r) => !r.includes('private failure')));
  await observeGraphqlHttp('https://api.github.com/graphql', request, {
    cwd,
    env,
    fetch: fakeResponse,
  });
  failSweep = false;
  assert.equal((await readUsage(root)).observations.length, 1);
});

// Break caught: opt-out disables raw records, misses periodic scans, or changes direct defaults.
test('collection writer opt-out suppresses startup and periodic sweeps while direct defaults and explicit retention still warn', async (t) => {
  const { cwd } = await repository(t);
  const enrollment = await enrollUsage({ cwd, permissionContext: 'deadline-test' });
  assert.equal(enrollment.available, true);
  const readdir = fs.readdir.bind(fs);
  let sweeps = 0;
  t.mock.method(fs, 'readdir', async (directory, ...args) => {
    if (directory === enrollment.root) sweeps++;
    return readdir(directory, ...args);
  });
  const writer = await createUsageWriter(enrollment, { inspectRetention: false, checkEvery: 1 });
  await writer.append(observation(enrollment.context, 'first'));
  await writer.append(observation(enrollment.context, 'second'));
  await writer.close();
  assert.equal(sweeps, 0);
  const warnings = [];
  const direct = await createUsageWriter(enrollment, {
    softBytes: 1,
    softFiles: 1,
    stderr: (s) => warnings.push(s),
  });
  await direct.close();
  assert.ok(sweeps >= 1);
  assert.ok(warnings.some((r) => r.includes('soft-byte-cap')));
  assert.ok(warnings.some((r) => r.includes('soft-file-cap')));
  const stats = await usageRetention(enrollment.root, { softBytes: 1, softFiles: 1 });
  assert.deepEqual(stats.warnings, ['soft-byte-cap', 'soft-file-cap']);
  assert.equal((await readUsage(enrollment.root)).observations.length, 2);
});

// Compatibility proof: real capture subprocesses retain the epic graph/fence observations.
// The offline binary accepts only selected fixture queries and never dispatches to GitHub.
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { makeTrafficFixture } from '../../../fixtures/refinement-traffic-cases.mjs';
import { installMeasuredHookProvider } from '../../../helpers/refinement-native-hook-provider.mjs';
import { PROJECT_ROOT_ALIASES } from '../../../../task-tracker/lib/runtime-storage.mjs';

for (const drift of [false, true])
  test(
    'real captured offline epic snapshot preserves ' +
      (drift ? 'ownership drift refusal' : 'three authority observations'),
    async (t) => {
      const { cwd } = await repository(t);
      const sourceRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../../..'
      );
      const fixture = await makeTrafficFixture({
        sourceRoot,
        fixtureId: 'two-child-ready-epic',
        projectDir: cwd,
      });
      let population;
      let cfg;
      try {
        population = structuredClone(fixture.provider.state);
        cfg = structuredClone(fixture.cfg);
      } finally {
        fixture.close();
      }
      const provider = installMeasuredHookProvider(cwd, { data: population }, cfg, { drift });
      const env = { ...cleanEnv(), ...provider.env, AITM_GRAPHQL_USAGE: '1' };
      for (const key of Object.keys(env))
        if (/^AITM_(?:CAPTURE_|GRAPHQL_USAGE_)/.test(key) || PROJECT_ROOT_ALIASES.includes(key))
          delete env[key];
      const prepared = await prepareUsageEnv({
        cwd,
        env,
        permissionContext: 'captured-offline-test',
      });
      assert.equal(prepared.AITM_CAPTURE_REAL_GH, path.join(cwd, '.tmp/2073-provider/gh'));
      const moduleUrl = pathToFileURL(
        path.join(sourceRoot, 'scripts/task-tracker/lib/decomposition-activity.mjs')
      ).href;
      const program = `
      import fs from 'node:fs';
      import path from 'node:path';
      import { evaluateHookDecomposition } from ${JSON.stringify(moduleUrl)};
      const result = await evaluateHookDecomposition({
        issue: 2073, cfg: ${JSON.stringify(cfg)}, projectDir: process.cwd(),
        activity: 'checkpoint', targets: [],
        deps: { readPlanAtCommit: async ({planPath}) => fs.readFileSync(path.join(process.cwd(), planPath), 'utf8') }
      });
      process.stdout.write(JSON.stringify(result));
    `;
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
        cwd,
        env: prepared,
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
      });
      assert.equal(child.status, 0, child.stderr);
      const outcome = JSON.parse(child.stdout);
      assert.equal(outcome.decision, drift ? 'block' : 'allow', JSON.stringify(outcome));
      if (drift) assert.match(outcome.reason, /ownership drift/);
      const captured = await readUsage((await resolveUsageRoot(cwd)).root);
      assert.equal(captured.observations.length, drift ? 4 : 3);
      assert.ok(captured.observations.every((row) => row.outcome === 'success'));
      assert.equal(captured.malformedLineCount, 0);
      assert.equal(captured.unclosedWriterCount, 0);
      const ledger = (await fs.readFile(provider.ledgerFile, 'utf8'))
        .trim()
        .split('\n')
        .map(JSON.parse);
      assert.equal(ledger.length, drift ? 4 : 3);
      assert.ok(ledger.every((row) => !row.family.includes('write')));
    }
  );
