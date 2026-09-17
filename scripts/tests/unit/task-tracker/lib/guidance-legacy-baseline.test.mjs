// @story #1656
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverTestFiles } from '../../../../task-tracker/lib/discover-test-files.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const fixtureRoot = path.join(projectRoot, 'scripts/tests/fixtures/1558');
const workflowRoot = path.join(fixtureRoot, 'legacy-workflow');
const baselinePath = path.join(fixtureRoot, 'legacy-baseline.json');
const ACTIONS = ['bind', 'resume', 'promote', 'test', 'review', 'deliver', 'close'];
const ADAPTERS = ['claude', 'codex'];

function bytes(file) {
  return readFileSync(path.join(projectRoot, file));
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function loadJson(file) {
  assert.equal(existsSync(file), true, `missing frozen baseline artifact: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function percentile(samples, ratio) {
  const ordered = [...samples].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)];
}

test('aggregate baseline executes the predecessor inventory, transport and authority proofs', () => {
  const files = [
    'scripts/tests/unit/task-tracker/lib/guidance-legacy-inventory.test.mjs',
    'scripts/tests/unit/task-tracker/lib/guidance-legacy-transport.test.mjs',
    'scripts/tests/integration/task-tracker/lib/guidance-legacy-transport.test.mjs',
    'scripts/tests/unit/task-tracker/lib/guidance-legacy-authority.test.mjs',
  ];
  const discovered = new Set(discoverTestFiles({ projectRoot }));
  for (const file of files) assert.equal(discovered.has(file), true, `undiscovered ${file}`);
  const env = { ...process.env, NODE_OPTIONS: '' };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd: projectRoot,
    encoding: 'utf8',
    env,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /tests \d+/);
  assert.match(result.stdout, /fail 0/);
});

test('frozen baseline retains both complete adapter generations and closes every digest', () => {
  const baseline = loadJson(baselinePath);
  assert.equal(baseline.schema, 'aitm.guidance-legacy-baseline/v1');
  assert.match(baseline.source.commit, /^[0-9a-f]{40}$/);
  assert.match(baseline.source.runtime.node, /^v\d+\./);
  assert.deepEqual(baseline.adapters.map(({ id }) => id).sort(), ADAPTERS);

  for (const input of baseline.inputs) {
    const content = bytes(input.snapshotPath);
    assert.equal(content.length, input.bytes, `${input.id} byte count drifted`);
    assert.equal(sha256(content), input.sha256, `${input.id} digest drifted`);
  }

  for (const adapter of baseline.adapters) {
    assert.equal(
      adapter.loadedText.length >= 6,
      true,
      `${adapter.id} loaded-text stack incomplete`
    );
    for (const loaded of adapter.loadedText) {
      const content = bytes(loaded.snapshotPath);
      assert.equal(content.length, loaded.bytes, `${adapter.id}:${loaded.role} bytes drifted`);
      assert.equal(content.toString('utf8').length, loaded.characters);
      assert.equal(Math.ceil(loaded.characters / 4), loaded.proxyTokens);
      assert.equal(sha256(content), loaded.sha256, `${adapter.id}:${loaded.role} digest drifted`);
    }
    const transcriptBytes = bytes(adapter.transcriptPath);
    assert.equal(sha256(transcriptBytes), adapter.transcriptSha256);
  }

  const closure = structuredClone(baseline);
  delete closure.generationSha256;
  assert.equal(sha256(`${JSON.stringify(closure)}\n`), baseline.generationSha256);
});

test('each adapter transcript preserves all seven success/refusal lanes and authority identities', () => {
  const baseline = loadJson(baselinePath);
  const scenarios = loadJson(path.join(workflowRoot, 'lifecycle-scenarios.json'));
  const expectedKeys = scenarios.scenarios.map(({ id }) => id).sort();
  assert.equal(expectedKeys.length, ACTIONS.length * 2);

  for (const adapter of baseline.adapters) {
    const transcript = loadJson(path.join(projectRoot, adapter.transcriptPath));
    assert.equal(transcript.schema, 'aitm.guidance-legacy-transcript/v1');
    assert.equal(transcript.adapter, adapter.id);
    assert.equal(transcript.sourceCommit, baseline.source.commit);
    assert.deepEqual(transcript.entries.map(({ scenarioId }) => scenarioId).sort(), expectedKeys);
    assert.deepEqual(
      transcript.entries.map(({ sequence }) => sequence),
      transcript.entries.map((_, index) => index + 1)
    );

    for (const entry of transcript.entries) {
      const scenario = scenarios.scenarios.find(({ id }) => id === entry.scenarioId);
      assert.ok(scenario, `missing scenario ${entry.scenarioId}`);
      assert.equal(entry.action, scenario.action);
      assert.equal(entry.outcome, scenario.outcome);
      assert.equal(entry.command.argv[0], 'aitm');
      assert.equal(entry.command.stdin, '');
      assert.equal(typeof entry.stdout, 'string');
      assert.equal(typeof entry.stderr, 'string');
      assert.equal(entry.stdout.length + entry.stderr.length > 0, true);
      assert.match(entry.formatter.sha256, /^sha256:[0-9a-f]{64}$/);
      assert.deepEqual(
        entry.physicalRequests.map(({ requestId }) => requestId),
        scenario.expectedTransport.map(({ id }) => id)
      );
      assert.deepEqual(
        entry.logicalAuthorityAccesses.map(({ id }) => id),
        scenario.expectedAuthorityAccesses.map(({ id }) => id)
      );
      for (const access of entry.logicalAuthorityAccesses) {
        assert.equal(Number.isInteger(access.page), true);
        assert.equal(Number.isInteger(access.attempt), true);
      }
      if (entry.outcome === 'refusal') {
        assert.deepEqual(entry.effects, []);
        assert.equal(entry.authority.initialSha256, entry.authority.finalSha256);
      } else {
        assert.equal(entry.effects.length > 0, true);
        assert.notEqual(entry.authority.initialSha256, entry.authority.finalSha256);
      }
    }
  }
});

test('live timing is read-only and remains separate from deterministic fixture accounting', () => {
  const baseline = loadJson(baselinePath);
  const live = baseline.timing.liveService;
  const fixture = baseline.timing.fixtureTransport;
  assert.equal(live.kind, 'controlled-read-only');
  assert.deepEqual(live.command.slice(0, 3), ['gh', 'issue', 'view']);
  assert.doesNotMatch(live.command.join(' '), /\b(?:create|edit|close|reopen|comment|api)\b/);
  assert.equal(live.samplesMs.length, live.sampleCount);
  assert.equal(live.sampleCount >= 5, true);
  assert.equal(live.medianMs, percentile(live.samplesMs, 0.5));
  assert.equal(live.p95Ms, percentile(live.samplesMs, 0.95));
  assert.match(live.runtime, /^gh version /);
  assert.equal(fixture.kind, 'deterministic-fixture');
  assert.equal(fixture.unit, 'physical-request-count');
  assert.equal(fixture.latencySamples, null);
  assert.equal(fixture.totalRequests > 0, true);
});

test('completion record certifies coverage, refusals and the accepted sizing review', () => {
  const baseline = loadJson(baselinePath);
  const actions = loadJson(path.join(fixtureRoot, 'action-observation-inventory.json'));
  const flags = loadJson(path.join(fixtureRoot, 'behavioral-flags.json'));
  const completion = baseline.completion;
  assert.deepEqual(completion.actions, ACTIONS);
  assert.equal(completion.adapters, 2);
  assert.equal(completion.lanesPerAdapter, 14);
  assert.equal(
    completion.knownRefusals,
    actions.actions.reduce(
      (n, action) =>
        n + action.observations.reduce((sum, observation) => sum + observation.refusals.length, 0),
      0
    )
  );
  assert.equal(completion.behavioralFlags, flags.flags.length);
  assert.equal(completion.sourceEffectFlagCoverage, 'complete');
  assert.equal(completion.candidateWorkStarted, false);
  assert.deepEqual(
    completion.sizingReview.separate.units.map(({ humanHours }) => humanHours),
    [8, 4]
  );
  assert.equal(completion.sizingReview.separate.totalHumanHours, 12);
  assert.equal(completion.sizingReview.combined.unitCount, 2);
  assert.equal(completion.sizingReview.combined.splitThresholdHours, 24);
  assert.equal(completion.sizingReview.combined.decision, 'retain-single-child');
});
