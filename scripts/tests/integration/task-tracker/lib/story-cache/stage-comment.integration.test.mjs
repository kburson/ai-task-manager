// @story #2039 #2058
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createRuntimeRootFixture } from '../../../../helpers/runtime-root-fixture.mjs';
import { context } from '../../../../helpers/story-handoff-runtime-fixture.mjs';
import { handoffGeneration, identity, hash } from '../../../../helpers/story-handoff-fixture.mjs';
import { observeContent } from '../../../../../task-tracker/lib/story-cache/native-observation.mjs';
import {
  openStoryStore,
  storyCachePath,
} from '../../../../../task-tracker/lib/story-cache/store.mjs';
import {
  acquireStoryWriter,
  openStoryWriterRegistry,
} from '../../../../../task-tracker/lib/story-cache/writer-claim.mjs';

async function fixture(t, comments = []) {
  const root = fs.realpathSync(createRuntimeRootFixture('stage-comment-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registry = openStoryWriterRegistry({ projectRoot: root });
  const claim = await acquireStoryWriter({
    identity,
    human: 'tester',
    sessionId: 'author-A',
    worktree: root,
    cachePath: storyCachePath({ projectRoot: root, identity }),
    assignment: ['tester'],
    registry,
  });
  const store = await openStoryStore({ projectRoot: root, identity });
  const initial = await handoffGeneration(claim.claimId);
  initial.generation.working = {};
  initial.generation.dirtyKeys = [];
  for (const [index, comment] of comments.entries()) {
    const { body: ignored, ...observed } = observeContent({
      identity,
      node: {
        id: `IC_${index}`,
        lastEditedAt: null,
        includesCreatedEdit: false,
        userContentEdits: { totalCount: 0, nodes: [] },
      },
      body: comment.body,
    });
    void ignored;
    initial.generation.baseSnapshot.resources[observed.key] = {
      ...observed,
      ownership: comment.ownership ?? 'read-only',
      payloadPath: `base/comment-${index}.md`,
    };
    initial.generation.baseSnapshot.inventory.push(`IC_${index}`);
    initial.payloads.set(`base/comment-${index}.md`, comment.body);
  }
  const before = await store.commitGeneration(initial, { expectedGeneration: null });
  assert.equal(
    fs.existsSync(
      new URL('../../../../../task-tracker/lib/story-cache/stage-comment.mjs', import.meta.url)
    ),
    true,
    'owned-comment staging adapter is missing'
  );
  const adapter = await import('../../../../../task-tracker/lib/story-cache/stage-comment.mjs');
  const stage = (key, body, extra = {}) =>
    context('author-A', root, () =>
      adapter.stageOwnedComment({ store, claim, key, body, ...extra })
    );
  return { root, registry, claim, store, before, stage, adapter };
}
const owned = (body, key = 'plan.audit') => `${body}\n\n<!-- aitm-owned-comment key="${key}" -->`;
test('creation intent survives chained edits and store reopen without changing baseline', async (t) => {
  const f = await fixture(t);
  const key = 'comment:new:stable-intent-2058';
  const first = await f.stage(key, owned('First'));
  assert.equal(first.status, 'staged');
  assert.equal(first.publication, 'unpublished');
  assert.equal(first.generation, 2);
  assert.deepEqual(first.dirtyKeys, [key]);
  const once = await f.store.readGeneration();
  const firstRef = once.generation.working[key];
  const reopened = await openStoryStore({ projectRoot: f.root, identity });
  const second = await f.stage(key, owned('Second'), { store: reopened });
  const current = await reopened.readGeneration();
  assert.equal(second.generation, 3);
  assert.deepEqual(Object.keys(current.generation.working), [key]);
  assert.equal(
    current.payloads.get(current.generation.working[key].payloadPath).toString(),
    owned('Second')
  );
  assert.equal(
    fs.readFileSync(`${f.store.cachePath}/${firstRef.payloadPath}`, 'utf8'),
    owned('First')
  );
  assert.equal(current.generation.working[key].digest, hash(owned('Second')));
  assert.deepEqual(current.generation.baseSnapshot, f.before.generation.baseSnapshot);
  assert.deepEqual(current.generation.timing, f.before.generation.timing);
  assert.equal(current.generation.publicationGeneration, 0);
});

test('adopts an actual native ownership marker despite read-only observation', async (t) => {
  const f = await fixture(t, [{ body: owned('Observed') }, { body: 'Foreign context' }]);
  const result = await f.stage('comment:IC_0', owned('Updated'));
  assert.equal(result.body, owned('Updated'));
  assert.deepEqual(result.dirtyKeys, ['comment:IC_0']);
  const current = await f.store.readGeneration();
  assert.deepEqual(current.generation.baseSnapshot, f.before.generation.baseSnapshot);
  assert.equal(current.generation.baseSnapshot.resources['comment:IC_0'].ownership, 'read-only');
  assert.equal(current.generation.working['comment:IC_1'], undefined);
});
test('unchanged baseline or pending body is a no-op with no generation write', async (t) => {
  const f = await fixture(t, [{ body: owned('Observed') }]);
  const clean = await f.stage('comment:IC_0', owned('Observed'));
  assert.equal(clean.status, 'no-op');
  assert.equal(clean.generation, 1);
  assert.deepEqual(clean.dirtyKeys, []);
  assert.deepEqual(await f.store.readGeneration(), f.before);
  await f.stage('comment:IC_0', owned('Updated'));
  const before = await f.store.readGeneration();
  const dirty = await f.stage('comment:IC_0', owned('Updated'));
  assert.equal(dirty.status, 'no-op');
  assert.equal(dirty.generation, 2);
  assert.deepEqual(await f.store.readGeneration(), before);
});
for (const ownership of ['read-only', 'owned'])
  test(`heading or claimed ${ownership} classification alone cannot authorize a foreign edit`, async (t) => {
    const f = await fixture(t, [{ body: '## Plan Audit\nWritten by tester', ownership }]);
    await assert.rejects(f.stage('comment:IC_0', owned('Changed')), {
      code: 'STORY_MUTATION_INVALID',
      reason: 'foreign-comment',
    });
    assert.deepEqual(await f.store.readGeneration(), f.before);
  });
for (const body of [
  'Replacement',
  owned('Replacement', 'other.key'),
  `${owned('Replacement')}\n${owned('Duplicate')}`,
])
  test(`refuses removal or replacement of native marker identity: ${body.slice(0, 20)}`, async (t) => {
    const f = await fixture(t, [{ body: owned('Observed') }]);
    await assert.rejects(f.stage('comment:IC_0', body), { code: 'STORY_MUTATION_INVALID' });
    assert.deepEqual(await f.store.readGeneration(), f.before);
  });
test('duplicate native ownership in baseline refuses adoption and creation', async (t) => {
  const f = await fixture(t, [{ body: owned('First') }, { body: owned('Second') }]);
  for (const key of ['comment:IC_0', 'comment:new:new-intent'])
    await assert.rejects(f.stage(key, owned('Changed')), {
      code: 'STORY_MUTATION_INVALID',
      reason: 'duplicate-ownership',
    });
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('a new intent cannot duplicate a retained baseline or another pending intent', async (t) => {
  const f = await fixture(t, [{ body: owned('Existing') }]);
  await assert.rejects(f.stage('comment:new:wrong-new', owned('Existing')), {
    code: 'STORY_MUTATION_INVALID',
    reason: 'duplicate-ownership',
  });
  await f.stage('comment:new:first', owned('Pending', 'new.audit'));
  const before = await f.store.readGeneration();
  await assert.rejects(f.stage('comment:new:second', owned('Pending', 'new.audit')), {
    code: 'STORY_MUTATION_INVALID',
    reason: 'duplicate-ownership',
  });
  await assert.rejects(f.stage('comment:new:first', owned('Replaced', 'different.audit')), {
    code: 'STORY_MUTATION_INVALID',
    reason: 'ownership-identity',
  });
  assert.deepEqual(await f.store.readGeneration(), before);
});
test('an absent provider node cannot be invented through a normal comment key', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.stage('comment:IC_missing', owned('New')), {
    code: 'STORY_MUTATION_INVALID',
    reason: 'comment-missing',
  });
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('argument and forged capability validation precede dependency access', async (t) => {
  const f = await fixture(t);
  for (const extra of [
    { key: 'issue:I_test' },
    { key: 'comment:new:' },
    { key: 'comment:new:bad key' },
    { body: null },
    { body: '' },
    { body: '\ud800' },
    { capability: true },
    { capability: { allowMarkerLoss: true } },
    { transport: () => assert.fail('transport') },
  ]) {
    const input = {
      key: 'comment:new:intent',
      body: owned('New'),
      ...extra,
      get store() {
        return assert.fail('store read');
      },
      get claim() {
        return assert.fail('claim read');
      },
    };
    await assert.rejects(f.adapter.stageOwnedComment(input), { code: 'STORY_MUTATION_INVALID' });
  }
});
test('requires the native persistent claim and current local owning session', async (t) => {
  const f = await fixture(t);
  const claim = { ...f.claim };
  delete claim.registryKey;
  await assert.rejects(f.stage('comment:new:intent', owned('New'), { claim }), {
    code: 'STORY_MUTATION_UNAVAILABLE',
  });
  await assert.rejects(
    context('author-B', f.root, () =>
      f.adapter.stageOwnedComment({
        store: f.store,
        claim: f.claim,
        key: 'comment:new:intent',
        body: owned('New'),
      })
    ),
    { code: 'STORY_WRITER_OWNED' }
  );
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
test('refuses a disappeared persistent registry claim', async (t) => {
  const f = await fixture(t);
  fs.unlinkSync(`${f.registry.path}/${f.claim.registryKey}.json`);
  await assert.rejects(f.stage('comment:new:intent', owned('New')), {
    code: 'STORY_WRITER_UNAVAILABLE',
  });
  assert.deepEqual(await f.store.readGeneration(), f.before);
});
for (const state of ['batch', 'conflicts'])
  test(`blocks staging while ${state} is retained`, async (t) => {
    const f = await fixture(t);
    const current = await f.store.readGeneration();
    const generation = structuredClone(current.generation);
    generation.generation++;
    if (state === 'batch') {
      generation.publicationGeneration = 1;
      generation.batch = { schema: 'aitm.story-publication-batch/v1', publicationGeneration: 1 };
    } else generation.conflicts = ['retained-conflict'];
    const before = await f.store.commitGeneration(
      { generation, claimId: f.claim.claimId, payloads: current.payloads },
      { expectedGeneration: 1 }
    );
    await assert.rejects(f.stage('comment:new:intent', owned('New')), {
      code: 'STORY_MUTATION_UNAVAILABLE',
      reason: 'publication-pending',
    });
    assert.deepEqual(await f.store.readGeneration(), before);
  });
test('a retained proof reference is unavailable until the capability sibling validates it', async (t) => {
  const f = await fixture(t);
  await f.stage('comment:new:intent', owned('First'));
  const current = await f.store.readGeneration();
  const generation = structuredClone(current.generation);
  generation.generation++;
  generation.working['comment:new:intent'].capabilityRef = 'unverified-proof';
  await f.store.commitGeneration(
    { generation, claimId: f.claim.claimId, payloads: current.payloads },
    { expectedGeneration: 2 }
  );
  await assert.rejects(f.stage('comment:new:intent', owned('Second')), {
    code: 'STORY_MUTATION_UNAVAILABLE',
    reason: 'retained-capability',
  });
});

import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';
const envelope = (extra = {}) =>
  createAitmRecordEnvelope({
    recordType: 'audit-note',
    repository: identity.repository,
    issue: identity.issueNumber,
    payload: { note: 'retained native record' },
    actor: 'tester',
    recordId: '01J00000000000000000000001',
    grantId: '01J00000000000000000000002',
    createdAt: '2026-10-19T00:00:00.000Z',
    ...extra,
  });
const record = (visibleMarkdown = 'Observed', extra = {}) =>
  renderAitmRecord({ envelope: envelope(extra), visibleMarkdown });
test('adopts a correlated native record while preserving its exact envelope', async (t) => {
  const f = await fixture(t, [{ body: record() }]);
  const result = await f.stage('comment:IC_0', record('Updated narrative'));
  assert.equal(result.status, 'staged');
  assert.equal(result.body, record('Updated narrative'));
  assert.deepEqual(
    (await f.store.readGeneration()).generation.baseSnapshot,
    f.before.generation.baseSnapshot
  );
});
for (const body of [
  record('Foreign', { repository: 'other/repo' }),
  record('Foreign', { issue: 999 }),
  record().replace('retained native record', 'tampered native record'),
])
  test(`invalid or foreign native envelope is refused: ${hash(body).slice(0, 8)}`, async (t) => {
    const f = await fixture(t, [{ body }]);
    await assert.rejects(f.stage('comment:IC_0', body), { code: 'STORY_MUTATION_INVALID' });
    assert.deepEqual(await f.store.readGeneration(), f.before);
  });
test('a record identity or payload cannot be replaced under adopted ownership', async (t) => {
  const f = await fixture(t, [{ body: record() }]);
  for (const extra of [
    { recordId: '01J00000000000000000000003' },
    { payload: { note: 'new payload under retained record ID' } },
  ])
    await assert.rejects(f.stage('comment:IC_0', record('Changed', extra)), {
      code: 'STORY_MUTATION_INVALID',
      reason: 'ownership-identity',
    });
});
test('duplicate native record IDs refuse adoption even with differing envelopes', async (t) => {
  const f = await fixture(t, [
    { body: record() },
    { body: record('Duplicate', { payload: { note: 'different bytes' } }) },
  ]);
  await assert.rejects(f.stage('comment:IC_0', record('Changed')), {
    code: 'STORY_MUTATION_INVALID',
    reason: 'duplicate-ownership',
  });
});
test('native record creation intent retains identity across repeated local updates', async (t) => {
  const f = await fixture(t);
  await f.stage('comment:new:record-intent', record('First'));
  await f.stage('comment:new:record-intent', record('Second'));
  const current = await f.store.readGeneration();
  assert.deepEqual(current.generation.dirtyKeys, ['comment:new:record-intent']);
  assert.equal(
    current.payloads
      .get(current.generation.working['comment:new:record-intent'].payloadPath)
      .toString(),
    record('Second')
  );
});
for (const addition of [
  '\n<!-- aitm-dod-evidence:tests ts="2026-10-22T00:00:00Z" sha="abcdef1234567" -->',
  '\n<!-- aitm-scope-evidence-policy:v1 -->',
])
  test(`comment staging refuses fabricated execution or scope authority: ${addition.slice(0, 25)}`, async (t) => {
    const f = await fixture(t, [{ body: owned('Observed') }]);
    await assert.rejects(f.stage('comment:IC_0', owned('Observed' + addition)), {
      code: 'STORY_MUTATION_INVALID',
    });
    assert.deepEqual(await f.store.readGeneration(), f.before);
  });

import { ghClient } from '../../../../../gh/lib/gh-client.mjs';
test('real native adoption and repeated staging dispatch zero GitHub transport', async (t) => {
  const f = await fixture(t, [{ body: owned('Observed') }]);
  const prior = { ...ghClient };
  let dispatches = 0;
  const deny = () => {
    dispatches++;
    throw new Error('unexpected GitHub dispatch');
  };
  Object.assign(ghClient, { execFile: deny, spawn: deny, pexec: deny });
  try {
    await f.stage('comment:IC_0', owned('Changed'));
    await f.stage('comment:new:intent', owned('First', 'new.audit'));
    await f.stage('comment:new:intent', owned('Second', 'new.audit'));
    await f.stage('comment:new:intent', owned('Second', 'new.audit'));
    assert.equal(dispatches, 0);
  } finally {
    Object.assign(ghClient, prior);
  }
});
test('read-back cannot claim success for a different persisted generation', async (t) => {
  const f = await fixture(t);
  const store = {
    cachePath: f.store.cachePath,
    readGeneration: f.store.readGeneration,
    commitGeneration: async () => f.before,
  };
  await assert.rejects(f.stage('comment:new:intent', owned('New'), { store }), {
    code: 'STORY_MUTATION_UNAVAILABLE',
    reason: 'commit-readback',
  });
  assert.deepEqual(await f.store.readGeneration(), f.before);
});

test('comment staging refuses an existing unchecked item being checked without proof', async (t) => {
  const f = await fixture(t, [{ body: owned('Observed\n- [ ] existing check') }]);
  await assert.rejects(f.stage('comment:IC_0', owned('Observed\n- [x] existing check')), {
    code: 'STORY_MUTATION_INVALID',
    reason: 'unverified-ticks',
  });
  assert.deepEqual(await f.store.readGeneration(), f.before);
});

test('a changing capability getter cannot turn a forged grant into an allowed call', async (t) => {
  const f = await fixture(t);
  let reads = 0;
  await assert.rejects(
    f.adapter.stageOwnedComment({
      key: 'comment:new:intent',
      body: owned('New'),
      get capability() {
        return ++reads === 1 ? { allowMarkerLoss: true } : null;
      },
      get store() {
        return assert.fail('store accessed after forged grant');
      },
      get claim() {
        return assert.fail('claim accessed after forged grant');
      },
    }),
    { code: 'STORY_MUTATION_INVALID', reason: 'capability' }
  );
  assert.equal(reads, 1);
});
