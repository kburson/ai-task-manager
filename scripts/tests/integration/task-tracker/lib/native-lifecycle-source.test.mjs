// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { createRevisionMemory } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { rawLifecycleSources as rawSources } from '../../../helpers/native-lifecycle-sources.mjs';
import { observeRevision } from '../../../../task-tracker/lib/criteria-revision/engine.mjs';

test('closed native lifecycle source data survives memory restart without changing revision authority', async () => {
  const f = await approvedFixture();
  const before = f.backend.snapshot;
  const sources = rawSources(before.observation);
  const backend = createRevisionMemory({ ...before, lifecycleSources: sources });
  sources.remote.parent[0].response.repository.issue.parent = { number: 999 };
  const snapshot = backend.snapshot;
  assert.equal(
    snapshot.lifecycleSources.remote.parent[0].response.repository.issue.parent,
    null,
    'constructor must own immutable original source bytes'
  );
  const restarted = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restarted.snapshot.lifecycleSources, snapshot.lifecycleSources);
  assert.deepEqual(restarted.observation, before.observation);
  const state = await observeRevision({ context: f.context, deps: restarted });
  assert.equal(state.status, 'applied');
  assert.deepEqual(
    restarted.snapshot,
    snapshot,
    'source data and authoritative records remain unchanged by observation'
  );
});

for (const [name, alter] of [
  [
    'unknown outer key',
    (value) => {
      value.ready = true;
    },
  ],
  [
    'unknown remote family',
    (value) => {
      value.remote.guardResult = { ok: true };
    },
  ],
  [
    'foreign repository',
    (value) => {
      value.repository = 'foreign/criteria';
    },
  ],
  [
    'foreign issue',
    (value) => {
      value.issue++;
    },
  ],
  [
    'body mismatch',
    (value) => {
      value.bodyHash = '0'.repeat(64);
    },
  ],
  [
    'missing family',
    (value) => {
      delete value.remote.parent;
    },
  ],
  [
    'unknown pair field',
    (value) => {
      value.remote.parent[0].ready = true;
    },
  ],
  [
    'duplicate native request',
    (value) => {
      value.remote.parent.push(structuredClone(value.remote.parent[0]));
    },
  ],
  [
    'foreign native request',
    (value) => {
      value.remote.parent[0].request.issue++;
    },
  ],
])
  test(`closed native lifecycle source refuses ${name}`, async () => {
    const f = await approvedFixture();
    const sources = rawSources(f.backend.observation);
    alter(sources);
    const effects = structuredClone(f.backend.effects);
    assert.throws(
      () => createRevisionMemory({ ...f.backend.snapshot, lifecycleSources: sources }),
      /criteria-revision:(?:keys|lifecycle-source)/
    );
    assert.deepEqual(f.backend.effects, effects);
  });
