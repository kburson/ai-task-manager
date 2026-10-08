// @story #1855
// Pure original source-data coherence, never a current read or stage capability.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as config from '../../../../../task-tracker/config.mjs';
import * as sessionPolicy from '../../../../../task-tracker/lib/session-store.mjs';

const projectDir = path.resolve('recorded-stage-project');
const homeDir = path.resolve('recorded-stage-home');
const sessionId = 'recorded-session';
function fixture() {
  const projectBytes = JSON.stringify({
    repo: 'example/criteria',
    projectId: 'PVT_fixture',
    preferences: { autoPush: false },
    verificationProvider: { id: 'node' },
  });
  const source = (role, root, filename, bytes) => ({
    role,
    currentPath: path.join(root, '.ai-task-manager', filename),
    currentExists: bytes !== null,
    legacyPath: path.join(root, '.claude', filename),
    selectedPath: path.join(root, bytes === null ? '.claude' : '.ai-task-manager', filename),
    selectedExists: bytes !== null,
    bytes,
    error: null,
  });
  const sources = [
    source('user', homeDir, 'task-tracker-config.json', null),
    source('project', projectDir, 'task-tracker.json', projectBytes),
  ];
  const sessionBytes = JSON.stringify({ custom: 'preserved', gates: { pullRequestReview: true } });
  return {
    schema: 'aitm.native-stage-sources/v1',
    repository: 'example/criteria',
    projectDir,
    homeDir,
    sessionId,
    configuration: {
      sources,
      value: config.deriveRecordedConfig({
        user: { source: 'absent', bytes: null },
        project: { source: 'current', bytes: projectBytes },
      }).config,
    },
    session: {
      source: {
        sessionId,
        path: path.join(projectDir, '.tmp/aitm/gates', `task-tracker.session.${sessionId}.json`),
        exists: true,
        bytes: sessionBytes,
        error: null,
      },
      value: sessionPolicy.deriveRecordedSessionPolicy({ sessionId, bytes: sessionBytes }),
    },
  };
}

// Would fail if recorded config/session are trusted instead of deriving native
// precedence and overlays from their exact original selected bytes.
test('recorded stage source data derives original native config and session without reading current files', async () => {
  const { deriveRecordedStageSources } =
    await import('../../../../../task-tracker/lib/criteria-revision/native-stage-data.mjs');
  const input = fixture(),
    before = structuredClone(input);
  const data = deriveRecordedStageSources(input);
  assert.deepEqual(data, {
    config: input.configuration.value,
    sessionPolicy: input.session.value,
    warnings: [],
  });
  assert.equal(data.sessionPolicy.custom, 'preserved');
  assert.equal(data.sessionPolicy.gates.pullRequestReview, true);
  assert.deepEqual(input, before);
  assert.ok(
    Object.isFrozen(data) &&
      Object.isFrozen(data.config) &&
      Object.isFrozen(data.sessionPolicy.gates)
  );
  assert.equal(Object.hasOwn(data, 'ready'), false);
  assert.equal(Object.hasOwn(data, 'capability'), false);
});

test('recorded stage source data rejects unresolved selections, foreign roots and substituted native projections', async () => {
  const { deriveRecordedStageSources } =
    await import('../../../../../task-tracker/lib/criteria-revision/native-stage-data.mjs');
  const changes = [
    (x) => {
      x.read = () => ({});
    },
    (x) => {
      x.configuration.sources.reverse();
    },
    (x) => {
      x.configuration.sources[1].currentExists = false;
    },
    (x) => {
      x.configuration.sources[1].selectedExists = false;
    },
    (x) => {
      x.configuration.sources[1].selectedPath += '.foreign';
    },
    (x) => {
      x.configuration.sources[1].legacyPath = path.join(homeDir, '.claude/task-tracker.json');
    },
    (x) => {
      x.configuration.sources[1].error = { code: 'EACCES', message: 'denied' };
    },
    (x) => {
      x.configuration.sources[1].bytes = '{';
    },
    (x) => {
      x.configuration.value.projectId = 'PVT_weaker';
    },
    (x) => {
      x.configuration.value.repo = 'foreign/repo';
    },
    (x) => {
      x.session.source.sessionId = 'foreign';
    },
    (x) => {
      x.session.source.path += '.foreign';
    },
    (x) => {
      x.session.source.exists = false;
    },
    (x) => {
      x.session.source.error = { code: null, message: 'invalid JSON' };
    },
    (x) => {
      x.session.value.gates.pullRequestReview = false;
    },
    (x) => {
      x.session.source.bytes = '[]';
    },
    (x) => {
      x.session.source.afterRead = true;
    },
  ];
  for (const alter of changes) {
    const input = fixture();
    alter(input);
    assert.throws(() => deriveRecordedStageSources(input), /native-stage-source/);
  }
});

test('recorded legacy and absent source data retain native semantics without authenticating absence', async () => {
  const { deriveRecordedStageSources } =
    await import('../../../../../task-tracker/lib/criteria-revision/native-stage-data.mjs');
  const input = fixture(),
    selected = input.configuration.sources[1];
  selected.currentExists = false;
  selected.selectedPath = selected.legacyPath;
  const legacy = deriveRecordedStageSources(input);
  assert.deepEqual(legacy.config, input.configuration.value);
  input.session.source.exists = false;
  input.session.source.bytes = null;
  input.session.value = sessionPolicy.deriveRecordedSessionPolicy({ sessionId, bytes: null });
  assert.deepEqual(deriveRecordedStageSources(input).sessionPolicy, input.session.value);
  assert.equal(Object.hasOwn(deriveRecordedStageSources(input), 'absenceVerified'), false);
});
