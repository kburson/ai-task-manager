// @story #1837
import test from 'node:test';
import assert from 'node:assert/strict';
import * as identity from '../../../task-tracker/lib/graphql-usage/identity.mjs';

test('augmentation changes only selected query, preserves literal braces and avoids aliases', () => {
  assert.equal(typeof identity.prepareGraphqlQuery, 'function');
  const query =
    'query Other { viewer { id } } query Selected($s: String = "}") { _aitmUsage: viewer { id } ...Fields } fragment Fields on Query { repository(name:"secret}", owner:"x") { id } }';
  const prepared = identity.prepareGraphqlQuery(query, { selectedOperation: 'Selected' });
  assert.equal(prepared.alias, '_aitmUsage1');
  assert.equal(
    prepared.query,
    query.replace('...Fields }', '...Fields  _aitmUsage1: rateLimit { cost } }')
  );
  for (const unchanged of [
    '# comment\nmutation M { doThing { id } }',
    'query A { viewer { id } } query B { viewer { id } }',
    'query Broken { ??? }',
  ]) {
    assert.equal(identity.prepareGraphqlQuery(unchanged).query, unchanged);
    assert.equal(identity.prepareGraphqlQuery(unchanged).alias, null);
  }
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { repository } from '../../helpers/graphql-usage/fixture.mjs';
import { readUsage, resolveUsageRoot } from '../../../task-tracker/lib/graphql-usage/storage.mjs';
const collectionUrl = new URL(
  '../../../task-tracker/lib/graphql-usage/collection.mjs',
  import.meta.url
);
const shim = path.resolve('scripts/task-tracker/action-capture-bin');
async function setup(t) {
  const fixture = await repository(t);
  const bin = path.join(fixture.base, 'bin');
  await fs.mkdir(bin);
  await fs.writeFile(
    path.join(bin, 'gh'),
    `#!/usr/bin/env node
let input=''; for await (const chunk of process.stdin) input+=chunk;
const body=input ? JSON.parse(input) : {};
const alias=body.query?.match(/(_aitmUsage[0-9]*): rateLimit/)?.[1];
process.stdout.write(JSON.stringify({data:{viewer:{id:'business'},...(alias?{[alias]:{cost:7}}:{})}}));
process.stderr.write('business stderr');
`,
    { mode: 0o755 }
  );
  return {
    ...fixture,
    env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, AITM_GRAPHQL_USAGE: '1' },
  };
}

test('usage-only shell and synchronous invocations flush before normal return without payload capture', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({
    cwd,
    env,
    launchRoute: 'measurement-launcher',
    permissionContext: 'test',
  });
  assert.equal(prepared.PATH.split(path.delimiter)[0], shim);
  assert.equal(prepared.AITM_CAPTURE_ISSUE, undefined);
  const run = spawnSync(
    '/bin/sh',
    ['-c', 'gh api graphql -f "query={viewer{id}}" </dev/null; gh issue list </dev/null'],
    { cwd, env: prepared, encoding: 'utf8' }
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, 'business stderr'.repeat(2));
  const root = (await resolveUsageRoot(cwd)).root;
  const rows = (await readUsage(root)).observations;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].observationKind, 'opaque-cli-invocation');
  assert.equal(rows[0].rateLimitUnavailableReason, 'transport-unavailable');
  assert.equal(rows[0].issueNumber, null);
  assert.equal(rows[0].pointCost, null);
  await assert.rejects(fs.stat(path.join(cwd, '.tmp/aitm/action-capture')), { code: 'ENOENT' });
});

test('known gql builder delegates single observation to shim and strips only private alias', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env, permissionContext: 'test' });
  const url = pathToFileURL(path.resolve('scripts/gh/lib/github-projects.mjs')).href;
  const run = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {gql} from ${JSON.stringify(url)}; console.log(JSON.stringify(await gql('query Q { viewer { id } }')));`,
    ],
    { cwd, env: prepared, encoding: 'utf8' }
  );
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { viewer: { id: 'business' } });
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pointCost, 7);
  assert.equal(rows[0].costCoverage, 'visible-response-only');
  assert.equal(rows[0].operation, 'Q');
});

test('HTTP adapter records each attempt, headers and errors, with no extra requests or payload changes', async (t) => {
  const { prepareUsageEnv, observeGraphqlHttp } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env, permissionContext: 'test' });
  let calls = 0;
  const fetch = async (_url, options) => {
    calls++;
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.variables, { secret: 'not-on-disk' });
    const alias = payload.query.match(/(_aitmUsage[0-9]*): rateLimit/)?.[1];
    return new Response(
      JSON.stringify({
        data: { viewer: { id: 'business' }, ...(alias ? { [alias]: { cost: 3 } } : {}) },
        ...(calls === 2 ? { errors: [{ message: 'private failure' }] } : {}),
      }),
      {
        status: calls === 3 ? 503 : 200,
        headers: {
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4997',
          'x-ratelimit-used': '3',
          'x-ratelimit-reset': '1790578800',
          'x-ratelimit-resource': 'graphql',
        },
      }
    );
  };
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
    const result = await observeGraphqlHttp(
      'https://api.github.com/graphql',
      {
        method: 'POST',
        body: JSON.stringify({ query: '{ viewer { id } }', variables: { secret: 'not-on-disk' } }),
      },
      { fetch, env: prepared, cwd, logicalOperationId: 'pages-1', pageIndex }
    );
    assert.deepEqual(result.data, { viewer: { id: 'business' } });
  }
  assert.equal(calls, 3);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.pageIndex).sort(), [0, 1, 2]);
  assert.ok(rows.every((r) => r.logicalOperationId === 'pages-1' && r.pointCost === 3));
  assert.ok(rows.some((r) => r.errorClass === 'graphql-errors'));
  assert.ok(rows.some((r) => r.errorClass === 'http-error' && r.httpStatus === 503));
  assert.equal(rows[0].rateLimit.limit, 5000);
  assert.equal(JSON.stringify(rows).includes('not-on-disk'), false);
  const failure = Object.assign(new Error('private error'), { name: 'TimeoutError' });
  await assert.rejects(
    observeGraphqlHttp(
      'https://api.github.com/graphql',
      { body: JSON.stringify({ query: 'mutation M { x { id } }' }) },
      {
        fetch: async () => {
          throw failure;
        },
        env: prepared,
        cwd,
      }
    ),
    (error) => error === failure
  );
  const after = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(after.length, 4);
  assert.ok(after.some((r) => r.dispatchStatus === 'unknown' && r.outcome === 'timeout'));
});

test('measurement launcher enrolls actual synchronous verifier and preserves its result', async (t) => {
  const { cwd, env, base } = await setup(t);
  await fs.mkdir(path.join(cwd, '.ai-task-manager'));
  await fs.writeFile(
    path.join(cwd, '.ai-task-manager/task-tracker.json'),
    JSON.stringify({ priorityOptionP3: 'p3', projectId: 'project' })
  );
  await fs.writeFile(
    path.join(base, 'bin/gh'),
    '#!/bin/sh\nprintf \'{"data":{"node":{"field":{"options":[{"id":"p3","name":"P3"}]}}}}\'\n',
    { mode: 0o755 }
  );
  const run = spawnSync(
    process.execPath,
    [
      path.resolve('scripts/task-tracker/graphql-usage-launch.mjs'),
      process.execPath,
      path.resolve('scripts/gh/verify-priority-p3.mjs'),
    ],
    { cwd, env, encoding: 'utf8' }
  );
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /OK/);
  assert.equal((await readUsage((await resolveUsageRoot(cwd)).root)).observations.length, 1);
});

test('classification and issue context stay conservative without active issue fallback', async () => {
  const { classifyGhUsage, classifyGhCall } =
    await import('../../../task-tracker/lib/action-capture.mjs');
  const { dispatchContext } = await import(collectionUrl);
  assert.equal(
    classifyGhUsage(['api', 'graphql', '-f', 'query=# comment\nmutation M { x }']).kind,
    'mutation'
  );
  assert.equal(
    classifyGhCall(['api', 'graphql', '-f', 'query=# comment\nmutation M { x }']).operationClass,
    'read'
  );
  assert.equal(
    classifyGhUsage(
      ['api', 'graphql'],
      Buffer.from('{"query":"query A {x} mutation B {y}","operationName":"B"}')
    ).kind,
    'mutation'
  );
  assert.equal(classifyGhUsage(['api', 'graphql', '-f', 'query=nonsense']).kind, 'unknown');
  assert.equal(
    dispatchContext({ variables: { issues: [10, 11] } }).contextScope,
    'multiple-issues'
  );
  assert.equal(dispatchContext({ args: ['issue', 'view', '42'] }).issueNumber, 42);
  assert.equal(dispatchContext({ variables: { issue: 42 } }).lifecycleState, 'unknown');
});

import {
  setActionCaptureEnabled,
  summarizeActionCorpus,
} from '../../../task-tracker/lib/action-capture.mjs';
for (const usage of [false, true])
  for (const action of [false, true])
    test(`independent modes usage=${usage} action=${action}`, async (t) => {
      const { prepareUsageEnv } = await import(collectionUrl);
      const { cwd, env } = await setup(t);
      const captureContext = { projectDir: cwd, repository: 'example/test', issue: 42 };
      let prepared = { ...env, AITM_GRAPHQL_USAGE: usage ? '1' : '0' };
      if (action) {
        setActionCaptureEnabled({ ...captureContext, enabled: true });
        prepared = {
          ...prepared,
          AITM_CAPTURE_PROJECT_DIR: cwd,
          AITM_CAPTURE_REPOSITORY: 'example/test',
          AITM_CAPTURE_ISSUE: '42',
          AITM_CAPTURE_INVOCATION_ID: 'test-mode',
          AITM_CAPTURE_REAL_GH: path.join(cwd, '../bin/gh'),
          PATH: shim + path.delimiter + prepared.PATH,
        };
      }
      prepared = await prepareUsageEnv({ cwd, env: prepared });
      const run = spawnSync('gh', ['api', 'graphql', '-f', 'query={viewer{id}}'], {
        cwd,
        env: prepared,
        input: '',
        encoding: 'utf8',
      });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.stderr, 'business stderr');
      const root = (await resolveUsageRoot(cwd)).root;
      if (usage) assert.equal((await readUsage(root)).observations.length, 1);
      else await assert.rejects(fs.stat(root), { code: 'ENOENT' });
      if (action) assert.equal(summarizeActionCorpus(captureContext).actions, 1);
      else
        await assert.rejects(fs.stat(path.join(cwd, '.tmp/aitm/action-capture')), {
          code: 'ENOENT',
        });
    });

test('AITM CLI bootstrap enrolls without an active issue', async (t) => {
  const { cwd, env, base } = await setup(t);
  await fs.mkdir(path.join(cwd, '.ai-task-manager'));
  await fs.writeFile(
    path.join(cwd, '.ai-task-manager/task-tracker.json'),
    JSON.stringify({ priorityOptionP3: 'p3', projectId: 'project' })
  );
  await fs.writeFile(
    path.join(base, 'bin/gh'),
    '#!/bin/sh\nprintf \'{"data":{"node":{"field":{"options":[{"id":"p3","name":"P3"}]}}}}\'\n',
    { mode: 0o755 }
  );
  const run = spawnSync(process.execPath, [path.resolve('bin/aitm.mjs'), 'help'], {
    cwd,
    env,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    (await fs.readdir(path.join((await resolveUsageRoot(cwd)).root, 'participants'))).length,
    1
  );
});

test('runtime bootstrap preserves hashed session across descendants and changed permission enrollment', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const first = await prepareUsageEnv({
    cwd,
    env: { ...env, CODEX_THREAD_ID: 'sensitive-provider-id' },
    launchRoute: 'aitm-cli',
    permissionContext: 'test',
  });
  const context = JSON.parse(first.AITM_GRAPHQL_USAGE_CONTEXT);
  assert.equal(context.sessionSource, 'runtime');
  assert.match(context.sessionId, /^sha256:/);
  assert.equal(JSON.stringify(context).includes('sensitive-provider-id'), false);
  const second = await prepareUsageEnv({ cwd, env: first, permissionContext: 'other' });
  assert.equal(JSON.parse(second.AITM_GRAPHQL_USAGE_CONTEXT).sessionId, context.sessionId);
  assert.notEqual(JSON.parse(second.AITM_GRAPHQL_USAGE_CONTEXT).enrollmentId, context.enrollmentId);
});

test('HTTP mutation and unsupported documents remain byte-identical and record unknown cost', async (t) => {
  const { prepareUsageEnv, observeGraphqlHttp } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  for (const query of ['# comment\nmutation M { x }', 'query Broken { ?? }']) {
    const body = JSON.stringify({ query });
    const result = await observeGraphqlHttp(
      'https://api.github.com/graphql',
      { body },
      {
        cwd,
        env: prepared,
        fetch: async (_url, options) => {
          assert.equal(options.body, body);
          return new Response('{"data":{"x":1}}');
        },
      }
    );
    assert.deepEqual(result, { data: { x: 1 } });
  }
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.ok(rows.some((r) => r.costUnknownReason === 'mutation-cost-unavailable'));
  assert.ok(rows.some((r) => r.costUnknownReason === 'unsupported-syntax'));
});

import { initGhFixture } from '../../helpers/graphql-usage/init-gh.mjs';
test('real init shell page loop completes with one record per gh boundary before parent returns', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env, base } = await setup(t);
  const callLog = path.join(base, 'calls.log');
  await fs.writeFile(path.join(base, 'bin/gh'), initGhFixture(callLog), { mode: 0o755 });
  const prepared = await prepareUsageEnv({ cwd, env });
  const run = spawnSync(
    'bash',
    [path.resolve('scripts/gh/init-project-config.sh'), '--target', cwd],
    { cwd, env: prepared, input: '\n'.repeat(32), encoding: 'utf8', timeout: 30000 }
  );
  assert.equal(run.status, 0, run.stderr + '\n' + run.stdout);
  const calls = await fs.readFile(callLog, 'utf8');
  assert.match(calls, /cursor=CURSOR_1/);
  const graphqlCalls = (calls.match(new RegExp('^api graphql ', 'gm')) || []).length;
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.filter((row) => row.queryFingerprint !== null).length, graphqlCalls);
  assert.ok(rows.some((row) => row.kind === 'mutation'));
});

test('REST and authentication commands never become GraphQL observations', async () => {
  const { classifyGhUsage } = await import('../../../task-tracker/lib/action-capture.mjs');
  assert.equal(classifyGhUsage(['api', 'repos/example/test']), null);
  assert.equal(classifyGhUsage(['auth', 'token']), null);
});

test('explicit permission context is reused within an inherited process tree', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const first = await prepareUsageEnv({ cwd, env, permissionContext: 'fixture-sandbox' });
  const second = await prepareUsageEnv({ cwd, env: first });
  assert.equal(
    JSON.parse(first.AITM_GRAPHQL_USAGE_CONTEXT).enrollmentId,
    JSON.parse(second.AITM_GRAPHQL_USAGE_CONTEXT).enrollmentId
  );
});

test('inventory identifies instrumented shim and HTTP adapter boundaries', async () => {
  const { scanGraphqlSurfaces } =
    await import('../../../task-tracker/lib/graphql-usage/inventory.mjs');
  const rows = scanGraphqlSurfaces({ root: process.cwd() });
  assert.ok(
    rows.some(
      (row) =>
        row.source === 'scripts/task-tracker/action-capture-bin/gh' && row.coverage === 'opaque'
    )
  );
  assert.ok(
    rows.some(
      (row) =>
        row.source === 'scripts/reports/generate-value-report.mjs' &&
        row.classification === 'direct-http' &&
        row.coverage === 'covered'
    )
  );
});

test('unknown lifecycle state has unknown provenance even for a known issue', async () => {
  const { dispatchContext } = await import(collectionUrl);
  assert.equal(dispatchContext({ variables: { issue: 42 } }).stateSource, 'unknown');
  assert.equal(
    dispatchContext({ issueNumber: 42, lifecycleState: 'develop', stateSource: 'local' })
      .stateSource,
    'local'
  );
});

test('shim spawn failure is not sent and completed errors preserve process exit', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env, base } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const missing = spawnSync('gh', ['api', 'graphql', '-f', 'query={viewer{id}}'], {
    cwd,
    env: { ...prepared, AITM_CAPTURE_REAL_GH: path.join(base, 'missing') },
    encoding: 'utf8',
  });
  assert.equal(missing.status, 1);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dispatchStatus, 'not-sent');
  assert.equal(rows[0].errorClass, 'spawn-error');
});

test('invalid private observation context cannot replace the original command result', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const run = spawnSync('gh', ['api', 'graphql', '-f', 'query={viewer{id}}'], {
    cwd,
    env: { ...prepared, AITM_GRAPHQL_USAGE_PRIVATE: 'null' },
    input: '',
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { data: { viewer: { id: 'business' } } });
});

test('non-object stdin payloads classify unknown without throwing', async () => {
  const { classifyGhUsage } = await import('../../../task-tracker/lib/action-capture.mjs');
  assert.equal(
    classifyGhUsage(['api', 'graphql', '--input', '-'], Buffer.from('null')).kind,
    'unknown'
  );
});

test('visible HTTP retries share identity and selected-operation fragments retain business aliases', async (t) => {
  const { prepareUsageEnv, observeGraphqlHttp } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const query =
    'query Other { viewer { id } } query Selected { _aitmUsage: viewer { id } ...Fields } fragment Fields on Query { repository(owner:"literal",name:"repo}") { id } }';
  const body = JSON.stringify({ query, operationName: 'Selected', variables: {} });
  let attempts = 0;
  const transport = async (_url, options) => {
    attempts++;
    const payload = JSON.parse(options.body);
    assert.equal(payload.operationName, 'Selected');
    assert.ok(payload.query.startsWith('query Other { viewer { id } }'));
    assert.ok(
      payload.query.endsWith(
        'fragment Fields on Query { repository(owner:"literal",name:"repo}") { id } }'
      )
    );
    assert.match(payload.query, /_aitmUsage1: rateLimit/);
    if (attempts === 1) throw Object.assign(new Error('ambiguous'), { name: 'TimeoutError' });
    return new Response('{"data":{"_aitmUsage":{"id":"original"},"_aitmUsage1":{"cost":2}}}');
  };
  const options = { cwd, env: prepared, fetch: transport, logicalOperationId: 'retry-request' };
  await assert.rejects(observeGraphqlHttp('https://api.github.com/graphql', { body }, options), {
    name: 'TimeoutError',
  });
  const result = await observeGraphqlHttp('https://api.github.com/graphql', { body }, options);
  assert.deepEqual(result, { data: { _aitmUsage: { id: 'original' } } });
  assert.equal(attempts, 2);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every((row) => row.logicalOperationId === 'retry-request' && row.operation === 'Selected')
  );
  assert.ok(rows.some((row) => row.dispatchStatus === 'unknown' && row.pointCost === null));
  assert.ok(rows.some((row) => row.pointCost === 2 && row.costCoverage === 'complete-observation'));
});

test('non-object HTTP JSON body preserves transport behavior', async (t) => {
  const { prepareUsageEnv, observeGraphqlHttp } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  let calls = 0;
  const result = await observeGraphqlHttp(
    'https://api.github.com/graphql',
    { body: 'null' },
    {
      cwd,
      env: prepared,
      fetch: async (_url, options) => {
        calls++;
        assert.equal(options.body, 'null');
        return new Response('{"data":{"ok":true}}');
      },
    }
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, { data: { ok: true } });
});

test('CLI fields and enterprise host are attributed without persisting field values', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const args = ['api', 'graphql', '-f', 'query=query Q($issue:Int!){viewer{id}}', '-F', 'issue=42'];
  const first = spawnSync('gh', args, {
    cwd,
    env: { ...prepared, GH_HOST: 'github.example.com' },
    encoding: 'utf8',
  });
  assert.equal(first.status, 0, first.stderr);
  const second = spawnSync('gh', [...args, '--hostname', 'github.internal.example'], {
    cwd,
    env: { ...prepared, GH_HOST: 'github.example.com' },
    encoding: 'utf8',
  });
  assert.equal(second.status, 0, second.stderr);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.endpointHost).sort(), [
    'github.example.com',
    'github.internal.example',
  ]);
  assert.ok(rows.every((r) => r.issueNumber === 42 && r.contextScope === 'single-issue'));
  assert.equal(JSON.stringify(rows).includes('issue=42'), false);
});

test('enrollment diagnostics identify invalid context and Git root failure', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, base, env } = await setup(t);
  const messages = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk) => {
    messages.push(String(chunk));
    return true;
  };
  try {
    await prepareUsageEnv({ cwd, env: { ...env, AITM_GRAPHQL_USAGE_CONTEXT: 'bad' } });
    await prepareUsageEnv({ cwd: path.join(base, 'not-a-repo'), env });
  } finally {
    process.stderr.write = original;
  }
  assert.match(messages.join(''), /invalid-inherited-context/);
  assert.match(messages.join(''), /git-root-resolution-failed/);
  const diagnostics = (await readUsage((await resolveUsageRoot(cwd)).root)).diagnostics;
  assert.ok(diagnostics.some((entry) => entry.code === 'invalid-inherited-context'));
});

test('value report page loop passes one logical identity and page indexes', async () => {
  const { fetchProject } = await import('../../../reports/generate-value-report.mjs');
  const metadata = [];
  const project = await fetchProject({
    request: async (_query, _variables, context) => {
      metadata.push(context);
      return {
        node: {
          title: 'fixture',
          items: {
            nodes: [],
            pageInfo: {
              hasNextPage: metadata.length === 1,
              endCursor: 'next',
            },
          },
        },
      };
    },
  });
  assert.equal(project.title, 'fixture');
  assert.deepEqual(
    metadata.map((entry) => entry.pageIndex),
    [0, 1]
  );
  assert.equal(metadata[0].logicalOperationId, metadata[1].logicalOperationId);
});

test('multi-issue gh edit is never attributed to only its first issue', async () => {
  const { dispatchContext } = await import(collectionUrl);
  const context = dispatchContext({
    args: ['issue', 'edit', '23', '34', '--add-label', 'help wanted'],
    lifecycleState: 'develop',
  });
  assert.equal(context.issueNumber, null);
  assert.equal(context.contextScope, 'multiple-issues');
  assert.equal(context.lifecycleState, 'unknown');
});

test('gh api flags before graphql still produce one durable observation', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const run = spawnSync(
    'gh',
    ['api', '--hostname', 'github.example.com', 'graphql', '-f', 'query={viewer{id}}'],
    { cwd, env: prepared, encoding: 'utf8' }
  );
  assert.equal(run.status, 0, run.stderr);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endpointHost, 'github.example.com');
  assert.equal(rows[0].kind, 'query');
});

test('host-qualified repo selector controls CLI endpoint attribution', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const run = spawnSync('gh', ['issue', 'view', '42', '--repo', 'github.example.com/owner/repo'], {
    cwd,
    env: { ...prepared, GH_HOST: '' },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endpointHost, 'github.example.com');
});

test('HTTP response parse failures retain sent status and known HTTP failure', async (t) => {
  const { prepareUsageEnv, observeGraphqlHttp } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  let calls = 0;
  for (const status of [502, 200]) {
    await assert.rejects(
      observeGraphqlHttp(
        'https://api.github.com/graphql',
        { body: JSON.stringify({ query: 'query Q { viewer { id } }' }) },
        {
          cwd,
          env: prepared,
          fetch: async () => {
            calls += 1;
            return new Response('<html>not json</html>', { status });
          },
        }
      ),
      SyntaxError
    );
  }
  assert.equal(calls, 2);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 2);
  rows.sort((a, b) => b.httpStatus - a.httpStatus);
  assert.deepEqual(
    rows.map((row) => row.dispatchStatus),
    ['sent', 'sent']
  );
  assert.deepEqual(
    rows.map((row) => row.errorClass),
    ['http-error', 'parse-error']
  );
  assert.deepEqual(
    rows.map((row) => row.costUnknownReason),
    ['no-same-response-cost', 'no-same-response-cost']
  );
});

test('host-qualified issue URL controls CLI endpoint attribution', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const run = spawnSync(
    'gh',
    ['issue', 'view', 'https://github.example.com/owner/repo/issues/42'],
    { cwd, env: { ...prepared, GH_HOST: '' }, encoding: 'utf8' }
  );
  assert.equal(run.status, 0, run.stderr);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endpointHost, 'github.example.com');
});

test('interspersed edit options and issue URLs preserve multi-issue context', async () => {
  const { dispatchContext } = await import(collectionUrl);
  for (const args of [
    ['issue', 'edit', '23', '--add-label', 'bug', '34'],
    ['issue', 'edit', '23', 'https://github.com/owner/repo/issues/34', '--add-label', 'bug'],
  ]) {
    const context = dispatchContext({ args, lifecycleState: 'develop' });
    assert.equal(context.issueNumber, null);
    assert.equal(context.contextScope, 'multiple-issues');
    assert.equal(context.lifecycleState, 'unknown');
  }
  const one = dispatchContext({
    args: ['issue', 'edit', '23', '--parent', '100', '--body', '34'],
  });
  assert.equal(one.issueNumber, 23);
});

test('body URL cannot override GH CLI endpoint host', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const run = spawnSync(
    'gh',
    ['issue', 'edit', '23', '--body', 'https://github.example.com/owner/repo/issues/42'],
    { cwd, env: { ...prepared, GH_HOST: '' }, encoding: 'utf8' }
  );
  assert.equal(run.status, 0, run.stderr);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endpointHost, 'api.github.com');
});

// @story #1839
test('command-scoped draft metadata reaches the live shim without active-task inference', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const run = spawnSync(
    'gh',
    ['issue', 'create', '--repo', 'owner/scratch', '--title', 'private-title'],
    {
      cwd,
      env: {
        ...prepared,
        AITM_GRAPHQL_USAGE_DISPATCH_CONTEXT: JSON.stringify({
          repository: 'owner/scratch',
          draftId: 'workload-a-1',
          lifecycleState: 'backlog',
          stateSource: 'argument',
        }),
      },
      encoding: 'utf8',
    }
  );
  assert.equal(run.status, 0, run.stderr);
  const rows = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].repository, 'owner/scratch');
  assert.equal(rows[0].draftId, 'workload-a-1');
  assert.equal(rows[0].issueNumber, null);
  assert.equal(rows[0].lifecycleState, 'backlog');
  assert.equal(rows[0].stateSource, 'argument');
  assert.equal(rows[0].operation, 'gh.issue.create');
  assert.equal(rows[0].kind, 'mutation');
  assert.equal(rows[0].pointCost, null);
  assert.equal(rows[0].observationKind, 'opaque-cli-invocation');
  assert.ok(!JSON.stringify(rows).includes('private-title'));
});

test('scoped dispatch context refuses conflicting targets and malformed metadata', async () => {
  const { dispatchContext, readDispatchContext } = await import(collectionUrl);
  const scope = {
    repository: 'owner/scratch',
    issueNumber: 42,
    lifecycleState: 'plan',
    stateSource: 'argument',
  };
  assert.deepEqual(readDispatchContext('{broken'), {});
  assert.deepEqual(readDispatchContext(JSON.stringify({ ...scope, body: 'secret' })), {});
  assert.deepEqual(
    readDispatchContext(JSON.stringify({ ...scope, lifecycleState: 'made-up' })),
    {}
  );
  assert.equal(
    dispatchContext({ ...scope, args: ['issue', 'view', '43'] }).lifecycleState,
    'unknown'
  );
  assert.equal(
    dispatchContext({ ...scope, args: ['issue', 'view', '42', '--repo', 'other/repo'] })
      .lifecycleState,
    'unknown'
  );
  assert.equal(
    dispatchContext({ ...scope, draftId: 'draft', variables: { issues: [42, 43] } }).draftId,
    null
  );
  assert.equal(
    dispatchContext({
      ...scope,
      args: ['issue', 'view', 'https://github.com/other/repo/issues/42'],
    }).lifecycleState,
    'unknown'
  );
  assert.equal(
    dispatchContext({
      ...scope,
      args: ['issue', 'edit', '42', '--body', 'https://github.com/other/repo/issues/99'],
    }).lifecycleState,
    'plan'
  );

  assert.equal(
    dispatchContext({ draftId: 'secret with spaces', lifecycleState: 'backlog' }).draftId,
    null
  );
});

test('unnamed query observations use their normalized fingerprint as candidate identity', async (t) => {
  const { prepareUsageEnv } = await import(collectionUrl);
  const { cwd, env } = await setup(t);
  const prepared = await prepareUsageEnv({ cwd, env });
  const run = spawnSync('gh', ['api', 'graphql', '-f', 'query={ viewer { id } }'], {
    cwd,
    env: prepared,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const [row] = (await readUsage((await resolveUsageRoot(cwd)).root)).observations;
  assert.equal(row.operation, 'anonymous.' + row.queryFingerprint.slice(7));
});

test('native body-read short jq flag preserves attribution and board edit stays opaque', async () => {
  const { dispatchContext } = await import(collectionUrl);
  const { classifyGhUsage } = await import('../../../task-tracker/lib/action-capture.mjs');
  const scope = { repository: 'owner/scratch', issueNumber: 42, lifecycleState: 'refine' };
  assert.equal(
    dispatchContext({
      ...scope,
      args: ['issue', 'view', '42', '-R', 'owner/scratch', '--json', 'body', '-q', '.body'],
    }).lifecycleState,
    'refine'
  );
  assert.equal(
    dispatchContext({ ...scope, args: ['issue', 'view', '42', '--unsupported', 'secret'] })
      .lifecycleState,
    'unknown'
  );
  const classified = classifyGhUsage([
    'project',
    'item-edit',
    '--project-id',
    'PVT_target',
    '--id',
    'PVTI_item',
    '--field-id',
    'field',
    '--single-select-option-id',
    'option',
  ]);
  assert.equal(classified.operation, 'gh.project.item-edit');
  assert.equal(classified.kind, 'mutation');
  assert.equal(classified.queryFingerprint, null);
});
