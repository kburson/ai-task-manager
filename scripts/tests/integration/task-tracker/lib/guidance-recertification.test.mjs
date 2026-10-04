// @story #1767
// @story #1857
// @story #1872
// Actual Git/public-CLI replay belongs to integration, not the pure unit lane.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const fixtureRoot = path.join(projectRoot, 'scripts/tests/fixtures/1558');
// Ambient actor validation can refuse before replay; a valid actor reaches the
// archived capture's exact identity guard. Both must refuse obsolete evidence.
const obsoleteReplayRefusal =
  /TIMING_ACTOR_INVALID|Invalid timing actor|guidance-feasibility:capture-replay-input:instructions\/aitm-guidance\.yml|guidance-feasibility:capture-replay-identity:(?:scenarioManifestSha256|initialFixtureSha256|initialBodySha256|configSha256|fakeGhSha256)/;
function json(file) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, file), 'utf8'));
}
async function measurementTool() {
  return import('../../../../maintenance/measure-guidance-candidate.mjs');
}

test('obsolete catalog input refuses before launching public CLI replay', async (t) => {
  const original = childProcess.spawnSync;
  let cliCalls = 0;
  t.mock.method(childProcess, 'spawnSync', function (command, args, ...rest) {
    if (command === process.execPath && args?.[0] === path.join(projectRoot, 'bin/aitm.mjs'))
      cliCalls += 1;
    return original.call(this, command, args, ...rest);
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const { buildCurrentRecertificationDecision } = await measurementTool();
  const capture = json('actual-explain-traffic-recertification.json');
  const catalog = capture.identity.implementationFiles.find(
    ({ path: sourcePath }) => sourcePath === 'instructions/aitm-guidance.yml'
  );
  assert.notEqual(
    catalog.sha256,
    `sha256:${createHash('sha256')
      .update(readFileSync(path.join(projectRoot, catalog.path)))
      .digest('hex')}`
  );
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture }),
    /guidance-feasibility:capture-replay-input:instructions\/aitm-guidance\.yml/
  );
  assert.equal(cliCalls, 0);
});

test('matching catalog inputs still launch actual replay and refuse fabricated current provenance', async (t) => {
  const original = childProcess.spawnSync;
  let cliCalls = 0;
  t.mock.method(childProcess, 'spawnSync', function (command, args, ...rest) {
    if (command === process.execPath && args?.[0] === path.join(projectRoot, 'bin/aitm.mjs'))
      cliCalls += 1;
    return original.call(this, command, args, ...rest);
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const { buildCurrentRecertificationDecision } = await measurementTool();
  const capture = json('actual-explain-traffic-recertification.json');
  // A self-consistent source relabel is insufficient: actual CLI events and
  // initial fixture identity must still be replayed before any current GO.
  capture.identity.sourceCommit = original('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).stdout.trim();
  for (const record of capture.identity.implementationFiles) {
    const committed = original('git', ['show', `${capture.identity.sourceCommit}:${record.path}`], {
      cwd: projectRoot,
      encoding: null,
    });
    assert.equal(committed.status, 0);
    record.sha256 = `sha256:${createHash('sha256').update(committed.stdout).digest('hex')}`;
  }
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture }),
    /capture-replay-identity|Invalid timing actor|TIMING_ACTOR_INVALID/
  );
  assert.ok(cliCalls > 0, 'matching inputs must not bypass real CLI replay');
});

test('archived recertification binds every obligation and refuses current replay identity drift', async () => {
  const { buildCurrentRecertificationDecision } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const decision = json('feasibility-recheck-1767.json');
  const archived = json('actual-explain-traffic-recertification.json');
  assert.equal(decision.capture.transcriptSha256, archived.identity.transcriptSha256);
  assert.throws(() => buildCurrentRecertificationDecision({ projectRoot }), obsoleteReplayRefusal);
  assert.equal(decision.schema, 'aitm.guidance-feasibility-recertification/v1');
  assert.equal(decision.owner.issue, 1767);
  assert.equal(decision.owner.foundationIssue, 1660);
  assert.equal(decision.verdict, 'GO');
  assert.equal(decision.obligations.total, 41);
  assert.equal(decision.obligations.retainedProtocol, 24);
  assert.equal(decision.obligations.enforcement, 17);
  assert.equal(decision.obligations.uncovered.length, 0);
  assert.equal(decision.capture.events, 17);
  assert.equal(
    decision.capture.actionResults.every(({ status }) => status === 'ready'),
    true
  );
  for (const adapter of ['claude', 'codex']) {
    assert.equal(decision.adapters[adapter].status, 'pass');
    assert.ok(decision.adapters[adapter].measurements.fullLifecycle <= 5600);
  }
});

test('recertification refuses a relabeled or altered lifecycle capture', async () => {
  const { buildCurrentRecertificationDecision } =
    await import('../../../../maintenance/measure-guidance-candidate.mjs');
  const committed = JSON.parse(
    readFileSync(path.join(fixtureRoot, 'actual-explain-traffic-recertification.json'), 'utf8')
  );
  const modeDrift = structuredClone(committed);
  modeDrift.identity.mode = 'historical';
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture: modeDrift }),
    /guidance-feasibility:capture-mode/
  );
  const transcriptDrift = structuredClone(committed);
  transcriptDrift.events.find(({ name }) => name === 'lifecycle-close').typed.status = 'blocked';
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture: transcriptDrift }),
    /guidance-feasibility:capture-transcript-digest/
  );
  const sourceDrift = structuredClone(committed);
  sourceDrift.identity.implementationFiles[0].sha256 = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture: sourceDrift }),
    /guidance-feasibility:capture-committed-source/
  );
  const selfConsistentDrift = structuredClone(committed);
  const first = selfConsistentDrift.events.find(({ name }) => name === 'ready-first-load');
  first.stdout = first.stdout.replace('"query":"bind"', '"query":"noop"');
  selfConsistentDrift.identity.transcriptSha256 = `sha256:${createHash('sha256')
    .update(JSON.stringify(selfConsistentDrift.events))
    .digest('hex')}`;
  assert.throws(
    () => buildCurrentRecertificationDecision({ projectRoot, capture: selfConsistentDrift }),
    /capture-replay|Invalid timing actor/
  );
});

test('historical foundation stays immutable while current commands refuse obsolete replay', async () => {
  const { buildFeasibilityDecision, buildCurrentRecertificationDecision, runMeasurementCommand } =
    await measurementTool();
  assert.throws(() => buildFeasibilityDecision({ projectRoot }), /measurement-artifact-drift/);
  assert.equal(json('feasibility-decision.json').schema, 'aitm.guidance-feasibility-decision/v1');
  assert.throws(() => buildCurrentRecertificationDecision({ projectRoot }), obsoleteReplayRefusal);

  for (const args of [
    ['--all', '--json'],
    ['--all', '--assert-feasible', '--json'],
  ]) {
    let stdout = '';
    let stderr = '';
    const status = runMeasurementCommand(args, {
      projectRoot,
      writeStdout: (value) => (stdout += value),
      writeStderr: (value) => (stderr += value),
    });
    assert.notEqual(status, 0);
    assert.equal(stdout, '');
    assert.match(stderr, obsoleteReplayRefusal);
  }

  let stderr = '';
  const invalid = runMeasurementCommand(['--json'], {
    projectRoot,
    writeStdout: () => {},
    writeStderr: (value) => (stderr += value),
  });
  assert.notEqual(invalid, 0);
  assert.match(stderr, /usage: measure-guidance-candidate/);
});
