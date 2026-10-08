// @story #1855
// cspell:words nonstring
// Recognized-memory raw response DATA; constructor coherence is not provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { rawLifecycleSources } from '../../../helpers/native-lifecycle-sources.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { STATUS_OPTION_QUERY } from '../../../../task-tracker/lib/move-state/github-mutation.mjs';
function source(observation) {
  const [owner, repo] = observation.repository.split('/');
  const value = rawLifecycleSources(observation);
  value.remote.stageStatus = {
    schema: 'aitm.native-stage-status-source/v1',
    reads: [
      {
        attempt: 1,
        request: {
          query: STATUS_OPTION_QUERY,
          variables: { owner, repo, issue: observation.issue },
        },
        response: { stdout: '{}', stderr: '', exitCode: null },
      },
    ],
  };
  return value;
}
test('closed raw Status source retains original bytes and null exit across constructor restart', async () => {
  const f = await approvedFixture(),
    before = f.backend.snapshot,
    value = source(before.observation);
  const memory = createRevisionMemory({ ...before, lifecycleSources: value });
  const snapshot = memory.snapshot;
  assert.deepEqual(snapshot.lifecycleSources, value);
  value.remote.stageStatus.reads[0].response.stdout = '{"data":null}';
  assert.equal(memory.snapshot.lifecycleSources.remote.stageStatus.reads[0].response.stdout, '{}');
  const restarted = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restarted.snapshot, snapshot);
  assert.deepEqual(restarted.observation, before.observation);
  assert.deepEqual(restarted.effects, []);
});
for (const [name, change] of [
  [
    'unknown source key',
    (x) => {
      x.ready = true;
    },
  ],
  [
    'schema',
    (x) => {
      x.schema = 'unknown';
    },
  ],
  [
    'missing first',
    (x) => {
      x.reads = [];
    },
  ],
  [
    'duplicate attempt',
    (x) => {
      x.reads.push(structuredClone(x.reads[0]));
    },
  ],
  [
    'out of order',
    (x) => {
      x.reads[0].attempt = 2;
    },
  ],
  [
    'foreign subject',
    (x) => {
      x.reads[0].request.variables.issue++;
    },
  ],
  [
    'unknown request key',
    (x) => {
      x.reads[0].request.ready = true;
    },
  ],
  [
    'normalized option',
    (x) => {
      x.reads[0].response.optionId = 'OPTION_test';
    },
  ],
  [
    'fractional exit',
    (x) => {
      x.reads[0].response.exitCode = 0.5;
    },
  ],
  [
    'nonstring bytes',
    (x) => {
      x.reads[0].response.stdout = {};
    },
  ],
])
  test('closed raw Status source refuses ' + name, async () => {
    const f = await approvedFixture(),
      before = f.backend.snapshot,
      value = source(before.observation);
    change(value.remote.stageStatus);
    assert.throws(
      () => createRevisionMemory({ ...before, lifecycleSources: value }),
      /criteria-revision:lifecycle-source/
    );
    assert.deepEqual(f.backend.snapshot, before);
  });

test('recorded all-pair Status source validates query, outcomes and canonical roundtrip', async () => {
  const stage = await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
  assert.equal(typeof stage.deriveRecordedStageStatusSource, 'function');
  const f = await approvedFixture(),
    observation = f.backend.snapshot.observation;
  const lifecycleSources = source(observation),
    first = lifecycleSources.remote.stageStatus.reads[0];
  lifecycleSources.remote.stageStatus.reads.push({
    ...structuredClone(first),
    attempt: 2,
    response: { stdout: '{}', stderr: '', exitCode: 0 },
  });
  lifecycleSources.remote.stageStatus.reads.push({
    ...structuredClone(first),
    attempt: 3,
    response: { stdout: '{"data":null}', stderr: '', exitCode: 0 },
  });
  const input = { observation, lifecycleSources, projectId: 'PVT_subject' },
    effects = [...f.backend.effects];
  const result = await stage.deriveRecordedStageStatusSource(input);
  assert.equal(result.reads.length, 3);
  assert.equal(result.reads[0].derivation.error.code, null);
  assert.deepEqual(result.reads[1].derivation.result, { kind: 'undefined' });
  assert.deepEqual(result.reads[2].derivation.result, { kind: 'json', value: null });
  assert.deepEqual(
    result.reads.map((x) => x.transport),
    lifecycleSources.remote.stageStatus.reads.map((x) => x.response)
  );
  assert.ok(Object.isFrozen(result.reads[0].request.variables));
  const { canonicalRecordJson } =
    await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
  assert.deepEqual(
    await stage.deriveRecordedStageStatusSource(JSON.parse(canonicalRecordJson(input))),
    result
  );
  const absent = structuredClone(input);
  delete absent.lifecycleSources.remote.stageStatus;
  assert.equal(await stage.deriveRecordedStageStatusSource(absent), null);
  assert.deepEqual(f.backend.effects, effects);
});

test('recorded all-pair Status source rejects query, subject, order, output and supplied authority', async () => {
  const stage = await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
  assert.equal(typeof stage.deriveRecordedStageStatusSource, 'function');
  const f = await approvedFixture(),
    observation = f.backend.snapshot.observation;
  const original = { observation, lifecycleSources: source(observation), projectId: 'PVT_subject' };
  for (const change of [
    (x) => {
      x.lifecycleSources.remote.stageStatus.reads[0].request.query += ' ';
    },
    (x) => {
      x.lifecycleSources.remote.stageStatus.reads[0].request.variables.issue++;
    },
    (x) => {
      x.lifecycleSources.remote.stageStatus.reads[0].attempt = 2;
    },
    (x) => {
      x.lifecycleSources.remote.stageStatus.reads.push(
        structuredClone(x.lifecycleSources.remote.stageStatus.reads[0])
      );
    },
    (x) => {
      x.lifecycleSources.remote.stageStatus.reads[0].response = {
        stdout: '{"data":1e999}',
        stderr: '',
        exitCode: 0,
      };
    },
    (x) => {
      x.lifecycleSources.remote.stageStatus.reads[0].response = {
        stdout: '{"data":{"nested":[1e999]}}',
        stderr: '',
        exitCode: 0,
      };
    },
    (x) => {
      x.projectId = '';
    },
    (x) => {
      x.ready = true;
    },
  ]) {
    const bad = structuredClone(original);
    change(bad);
    await assert.rejects(
      stage.deriveRecordedStageStatusSource(bad),
      (error) => error.message === 'criteria-revision:native-stage-status-source-unavailable'
    );
  }
  let getters = 0;
  const pending = stage.deriveRecordedStageStatusSource(original);
  Object.defineProperty(original, 'lifecycleSources', {
    get() {
      getters++;
      throw new Error('caller getter');
    },
  });
  assert.equal((await pending).reads.length, 1);
  assert.equal(getters, 0);
});

async function recordedBoard(raws) {
  const { canonicalRecordJson } =
    await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
  const board = await import('../../../../task-tracker/lib/move-state/github-mutation.mjs');
  const f = await approvedFixture(),
    observation = f.backend.snapshot.observation;
  const lifecycleSources = source(observation),
    pair = lifecycleSources.remote.stageStatus.reads[0];
  lifecycleSources.remote.stageStatus.reads = raws.map((stdout, index) => ({
    ...structuredClone(pair),
    attempt: index + 1,
    response: { stdout, stderr: '', exitCode: 0 },
  }));
  const intent = {
    projectId: 'PVT_subject',
    itemId: 'PVTI_subject',
    fieldId: 'PVTF_status',
    optionId: 'OPTION_test',
  };
  const item = {
    id: intent.itemId,
    project: { id: intent.projectId },
    content: {
      __typename: 'Issue',
      id: 'I_subject',
      number: observation.issue,
      repository: { nameWithOwner: observation.repository },
    },
    fieldValues: {
      nodes: [
        {
          __typename: 'ProjectV2ItemFieldSingleSelectValue',
          id: 'VALUE_status',
          name: 'Develop',
          optionId: 'OPTION_develop',
          field: { id: intent.fieldId, name: 'Status' },
        },
      ],
      totalCount: 1,
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
  const vector = (item) => ({
    stage: item.fieldValues.nodes[0].name.toLowerCase(),
    membership: {
      projectId: intent.projectId,
      itemId: intent.itemId,
      bytes: canonicalRecordJson(item),
    },
  });
  const before = vector(item),
    changed = structuredClone(item);
  changed.fieldValues.nodes[0].name = 'Test';
  changed.fieldValues.nodes[0].optionId = intent.optionId;
  const after = vector(changed),
    previous = 'sha256:' + 'a'.repeat(64);
  const attempts = [];
  for (const [index, entry] of lifecycleSources.remote.stageStatus.reads.entries())
    attempts.push({
      number: index + 1,
      request: { file: 'gh', args: board.statusWriteArgs(intent) },
      before: index === 0 ? before : after,
      write: { kind: 'returned', stdout: '' },
      read: {
        request: entry.request,
        transport: entry.response,
        ...(await board.deriveRecordedStageStatusResponse({
          response: entry.response,
          projectId: intent.projectId,
        })),
      },
      after,
    });
  return {
    repository: observation.repository,
    issue: observation.issue,
    sourceOptionId: 'OPTION_develop',
    intent,
    before,
    previous,
    statusSource: { observation, lifecycleSources, projectId: intent.projectId },
    step: {
      ordinal: 14,
      kind: 'board-status',
      previous,
      intent,
      attempts,
      outcome: null,
      readback: null,
    },
  };
}
const targetStatus = JSON.stringify({
  data: {
    repository: {
      issue: {
        projectItems: {
          nodes: [
            { project: { id: 'PVT_subject' }, fieldValueByName: { optionId: 'OPTION_test' } },
          ],
        },
      },
    },
  },
});

test('recorded source-bearing board attempts preserve native parse failures then exact target confirmation', async () => {
  const { reconstructNativeStageBoardStep } =
    await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
  for (const first of [
    '{}',
    '{',
    '{"data":{"repository":{"issue":{"projectItems":{"nodes":{}}}}}}',
  ]) {
    const value = await recordedBoard([first, targetStatus]);
    value.step.outcome = { kind: 'confirmed', attempt: 2, exit: null };
    value.step.readback = { attempt: 2, ...structuredClone(value.step.attempts[1].after) };
    assert.equal((await reconstructNativeStageBoardStep(value)).confirmed, true);
  }
});

test('recorded source-bearing board refuses substituted, missing and unused terminal pairs while pending suffix remains data', async () => {
  const { reconstructNativeStageBoardStep: derive } =
    await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
  const original = await recordedBoard(['{}', targetStatus]);
  original.step.outcome = { kind: 'confirmed', attempt: 2, exit: null };
  original.step.readback = { attempt: 2, ...structuredClone(original.step.attempts[1].after) };
  for (const change of [
    (x) => {
      x.statusSource.projectId = 'PVT_foreign';
    },
    (x) => {
      x.step.attempts[0].read.transport.stdout = '{"data":null}';
    },
    (x) => {
      x.step.attempts[0].read.result = { kind: 'json', value: null };
    },
    (x) => {
      x.statusSource.lifecycleSources.remote.stageStatus.reads.pop();
    },
    (x) => {
      x.statusSource.lifecycleSources.remote.stageStatus.reads.push({
        ...structuredClone(x.statusSource.lifecycleSources.remote.stageStatus.reads[1]),
        attempt: 3,
      });
    },
    (x) => {
      delete x.statusSource;
    },
    (x) => {
      x.step.attempts[0].read.ready = true;
    },
  ]) {
    const bad = structuredClone(original);
    change(bad);
    await assert.rejects(
      derive(bad),
      (error) => error.message === 'criteria-revision:native-stage-board-step'
    );
  }
  const pending = structuredClone(original);
  pending.step.attempts.pop();
  pending.step.outcome = null;
  pending.step.readback = null;
  assert.equal((await derive(pending)).confirmed, false);
});

test('recorded source-bearing write exception retains zero consumed reads and immutable pending suffix', async () => {
  const { reconstructNativeStageBoardStep: derive } =
    await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
  const value = await recordedBoard([targetStatus]);
  const originalSource = structuredClone(value.statusSource);
  const attempt = value.step.attempts[0];
  attempt.write = { kind: 'threw', name: 'Error', message: 'native write unavailable', code: null };
  attempt.read = null;
  attempt.after = null;
  value.step.outcome = { kind: 'exception', attempt: 1, exit: null };
  const result = await derive(value);
  assert.equal(result.confirmed, false);
  assert.equal(value.step.readback, null);
  assert.deepEqual(value.statusSource, originalSource);
  assert.deepEqual(result.prefixes, [value.before, result.after]);
});
