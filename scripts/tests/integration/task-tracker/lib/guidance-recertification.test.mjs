// @story #1767
// @story #1857
// Actual Git/public-CLI replay belongs to integration, not the pure unit lane.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const fixtureRoot = path.join(projectRoot, 'scripts/tests/fixtures/1558');
// Ambient actor validation can refuse before replay; a valid actor reaches the
// archived capture's exact identity guard. Both must refuse obsolete evidence.
const obsoleteReplayRefusal =
  /TIMING_ACTOR_INVALID|Invalid timing actor|guidance-feasibility:capture-replay-identity:(?:scenarioManifestSha256|initialFixtureSha256|initialBodySha256|configSha256|fakeGhSha256)/;
function json(file) {
  return JSON.parse(readFileSync(path.join(fixtureRoot, file), 'utf8'));
}
async function measurementTool() {
  return import('../../../../maintenance/measure-guidance-candidate.mjs');
}

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
