// @story #2163 — registered entry, real admission and complete source authority.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { renameSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readDecompositionRecords } from '../../../task-tracker/lib/decomposition-records.mjs';
import { createInflationPublicEntryFixture } from '../../fixtures/inflation-public-entry-fixture.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const source = process.env.INFLATION_FIXTURE_SOURCE_COMMIT
  ? { commit: process.env.INFLATION_FIXTURE_SOURCE_COMMIT }
  : { root };
const inflation = [
  'inflate-estimate',
  '4242',
  '--size',
  'M',
  '--estimate',
  '6h',
  '--reason',
  'Discovered integration work.',
  '--item',
  'Integration validation (~4h)',
];
async function startFixture(t, options = {}) {
  const fixture = await createInflationPublicEntryFixture({ source, ...options });
  t.after(() => fixture.close());
  const start = await fixture.run(['start', '4242', '--role', 'agent']);
  assert.equal(start.status, 0, `SETUP/ADMISSION FAILURE: ${start.stderr}`);
  assert.deepEqual(
    fixture.readLedger().filter((e) => e.outcome === 'refused'),
    []
  );
  return { fixture, start };
}
function transport(start, argv, input) {
  return spawnSync(process.execPath, [path.join(start.environment.PATH, 'gh'), ...argv], {
    cwd: start.cwd,
    env: start.environment,
    input,
    encoding: 'utf8',
    timeout: 10000,
  });
}

test('strict provider refuses unknown operations, variables and targets without applying writes', async (t) => {
  const { fixture, start } = await startFixture(t);
  const request = JSON.parse(
    fixture.readLedger().find((e) => e.checkpoint === 'forecast-projection').stdin
  );
  const before = fixture.readState();
  const requests = [
    { query: 'query { viewer { id } }', variables: {} },
    { ...request, variables: { ...request.variables, extra: true } },
    { ...request, variables: { ...request.variables, issue: 4243 } },
    { ...request, variables: { ...request.variables, owner: 'foreign' } },
  ];
  for (const body of requests) {
    const result = transport(start, ['api', 'graphql', '--input', '-'], JSON.stringify(body));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unrecognized-graphql/);
  }
  assert.equal(
    transport(start, ['api', 'repos/foreign/repository/issues/4242/comments']).status,
    1
  );
  assert.deepEqual(fixture.readState(), before);
  assert.ok(
    fixture
      .readLedger()
      .slice(-5)
      .every((e) => !e.applied && e.outcome === 'refused')
  );
  const stateCopy = fixture.readState(),
    ledgerCopy = fixture.readLedger();
  stateCopy.provider.body = 'changed';
  ledgerCopy[0].applied = true;
  assert.deepEqual(fixture.readState(), before);
  assert.equal(fixture.readLedger()[0].applied, false);
  assert.throws(
    () =>
      fixture.fault({
        checkpoint: 'unknown',
        occurrence: 1,
        phase: 'before-apply',
        action: 'transport-failure',
      }),
    /fault-checkpoint/
  );
  assert.throws(
    () =>
      fixture.fault({
        checkpoint: 'audit',
        occurrence: 0,
        phase: 'before-apply',
        action: 'transport-failure',
      }),
    /fault-contract/
  );
  fixture.fault({
    checkpoint: 'forecast-projection',
    occurrence: 1,
    phase: 'before-apply',
    action: 'transport-failure',
  });
  assert.equal(
    transport(start, ['api', 'graphql', '--input', '-'], JSON.stringify(request)).status,
    1
  );
  assert.equal(
    transport(start, ['api', 'graphql', '--input', '-'], JSON.stringify(request)).status,
    0
  );
  assert.equal(fixture.readLedger().filter((e) => e.fault).length, 1);
});

test('strict provider malformed and incomplete pages refuse through the real collector', async (t) => {
  const { fixture } = await startFixture(t, { seed: { commentPageSize: 1 } });
  for (const [action, checkpoint] of [
    ['malformed-response', 'forecast-projection'],
    ['duplicate-comment-id', 'forecast-projection'],
    ['truncated-comments', 'forecast-projection'],
    ['repeated-comment-cursor', 'forecast-page'],
  ]) {
    const before = fixture.readLedger().length;
    fixture.fault({ checkpoint, occurrence: 1, phase: 'after-apply-before-response', action });
    const result = await fixture.run(inflation);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /forecast-unavailable/);
    assert.equal(
      fixture
        .readLedger()
        .slice(before)
        .filter((e) => e.applied).length,
      0,
      action
    );
  }
});

test('fixture launch strips polluted authority and verifies its sole provider before spawning', async (t) => {
  const pollution = {
    TT_SKIP_NETWORK: '1',
    CODEX_THREAD_ID: 'foreign',
    CODEX_SESSION_ID: 'foreign',
    AI_TASK_MANAGER_PROJECT_DIR: '/nonexistent-foreign-project',
    TT_PROJECT_DIR: '/nonexistent-foreign-project',
    GIT_DIR: '/nonexistent-foreign-git',
    AITM_ISSUE_LOCK_OWNER: 'foreign',
    AITM_ACTION_CAPTURE: 'foreign',
    GH_TOKEN: 'fictional-parent-token',
    NODE_OPTIONS: '--require /nonexistent-injection',
    PATH: '/nonexistent-parent-path',
  };
  const previous = Object.fromEntries(Object.keys(pollution).map((key) => [key, process.env[key]]));
  let fixture, start;
  try {
    Object.assign(process.env, pollution);
    ({ fixture, start } = await startFixture(t));
  } finally {
    for (const [key, value] of Object.entries(previous))
      value === undefined ? delete process.env[key] : (process.env[key] = value);
  }
  for (const key of Object.keys(pollution)) {
    if (['CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'PATH'].includes(key))
      assert.notEqual(start.environment[key], pollution[key]);
    else assert.equal(start.environment[key], undefined, key);
  }
  assert.equal(start.environment.PATH.split(path.delimiter).length, 1);
  assert.deepEqual(
    readdirSync(start.environment.PATH)
      .filter((name) => !['state.json', 'package.json'].includes(name))
      .sort(),
    ['bash', 'gh', 'git', 'node', 'sh']
  );
  for (const checkpoint of ['location-assignment', 'assignment', 'membership'])
    assert.ok(
      fixture.readLedger().some((e) => e.checkpoint === checkpoint),
      checkpoint
    );
  const before = fixture.readLedger();
  const gh = path.join(start.environment.PATH, 'gh');
  renameSync(gh, gh + '.removed');
  await assert.rejects(fixture.run(inflation), /provider-identity/);
  assert.deepEqual(fixture.readLedger(), before);
});

test('registered inflation seals its exact prepared audit authority', async (t) => {
  const fixture = await createInflationPublicEntryFixture({
    source,
    retainDir: process.env.INFLATION_FIXTURE_RETAIN_DIR,
  });
  t.after(() => fixture.close());
  const start = await fixture.run(['start', '4242', '--role', 'agent']);
  assert.equal(
    start.status,
    0,
    `SETUP/ADMISSION FAILURE (not RED):\n${start.stdout}\n${start.stderr}`
  );
  const started = fixture.readState();
  assert.equal(started.runtime.binding?.issue, '#4242');
  assert.equal(started.runtime.binding?.worktreePath, start.cwd);
  assert.equal(started.runtime.binding?.worktreeBranch, 'codex/4242-fixture');
  assert.ok(started.runtime.binding?.entryStartTs);
  assert.deepEqual(
    fixture.readLedger().filter((e) => e.outcome === 'refused'),
    [],
    `SETUP TRANSPORT FAILURE (not RED): ${start.stderr}`
  );
  const result = await fixture.run(inflation);
  const state = fixture.readState();
  const records = readDecompositionRecords(state.provider.body);
  if (result.status !== 0 && result.stderr.includes('final-authority-drift')) {
    assert.equal(records.publication.status, 'pending');
    assert.equal(records.publication.effects.length, 6);
    assert.ok(
      records.publication.effects.every(
        (effect) => effect.status === 'confirmed' && effect.observedDigest === effect.intendedDigest
      )
    );
    const beforeRetry = fixture.readLedger().length;
    const retry = await fixture.run(inflation);
    assert.equal(retry.status, 1, retry.stderr);
    assert.match(retry.stderr, /final-authority-drift/);
    const retried = readDecompositionRecords(fixture.readState().provider.body).publication;
    for (const key of ['operationId', 'createdAt', 'intendedInputDigest', 'beforeInputDigest'])
      assert.equal(retried[key], records.publication[key]);
    assert.equal(fixture.readState().provider.comments[0].body, state.provider.comments[0].body);
    assert.equal(
      fixture
        .readLedger()
        .slice(beforeRetry)
        .filter(
          (entry) =>
            entry.applied && ['audit', 'size', 'estimate', 'fields'].includes(entry.checkpoint)
        ).length,
      0
    );
  }
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(records.publication.status, 'complete');
  assert.equal(records.assessment.inputDigest, records.publication.intendedInputDigest);
  assert.equal(state.provider.comments[0].body.match(/Publication operation:/g)?.length, 1);
  const writes = fixture.readLedger().filter((entry) => entry.applied);
  for (const checkpoint of ['audit', 'size', 'estimate', 'fields'])
    assert.equal(writes.filter((entry) => entry.checkpoint === checkpoint).length, 1, checkpoint);
  const before = fixture.readLedger().length;
  const repeat = await fixture.run(inflation);
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.equal(
    fixture
      .readLedger()
      .slice(before)
      .filter((entry) => entry.applied).length,
    0
  );
});
