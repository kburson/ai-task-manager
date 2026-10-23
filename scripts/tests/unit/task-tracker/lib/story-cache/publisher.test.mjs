// @story #2039 #2066
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  test,
  identity,
  hash,
  context,
  changeGeneration,
} from '../../../../helpers/story-timing-candidate-fixture.mjs';
import { inputFor, fieldInput, creation } from '../../../../helpers/story-batch-fixture.mjs';
import { freezeStoryBatch } from '../../../../../task-tracker/lib/story-cache/batch.mjs';
import { canonicalRecordJson as json } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { validateStagedComposite } from '../../../../../task-tracker/lib/story-cache/stage-capabilities.mjs';
const publisher = await import('../../../../../task-tracker/lib/story-cache/publisher.mjs').catch(
  (e) => {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    return {};
  }
);
const adapters =
  await import('../../../../../task-tracker/lib/story-cache/provider-adapters.mjs').catch((e) => {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    return {};
  });
async function publish(args) {
  assert.equal(
    typeof publisher.publishResourceEffects,
    'function',
    'single-attempt publisher is missing'
  );
  return publisher.publishResourceEffects(args);
}
function currentSnapshot(record) {
  const snapshot = structuredClone(record.generation.baseSnapshot);
  for (const resource of Object.values(snapshot.resources)) {
    resource.body = String(record.payloads.get(resource.payloadPath));
    delete resource.payloadPath;
  }
  return snapshot;
}
function observation(effect, changes = {}) {
  if (effect.kind === 'project-field-update')
    return { complete: true, identity, field: structuredClone(effect.candidate), ...changes };
  const body = typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body;
  const id =
    effect.kind === 'issue-update' ? 'I_test' : (effect.target.commentNodeId ?? 'IC_created');
  return {
    complete: true,
    identity,
    node: {
      id,
      __typename: effect.kind === 'issue-update' ? 'Issue' : 'IssueComment',
      body,
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body,
    ...(effect.kind === 'issue-update' ? { title: effect.candidate.title } : {}),
    ...changes,
  };
}
async function setup(t, field = false, prepared = null) {
  const { f, input } = prepared ?? (field ? await fieldInput(t, 2) : await inputFor(t));
  const batch = freezeStoryBatch(input),
    calls = [],
    reads = [];
  const ports = {
    capabilities: input.capabilities,
    validateIssue({ base, candidate }) {
      validateStagedComposite({
        base,
        candidate: candidate.body,
        operations: [{ base, candidate: candidate.body }],
      });
    },
    async apply(effect) {
      const persisted = (await f.store.readGeneration()).generation.batch;
      const row = persisted.effects.find((e) => e.key === effect.key);
      assert.equal(row.attempted, true);
      assert.equal(row.outcome.state, 'dispatching');
      if (effect.kind === 'issue-update')
        assert.deepEqual(persisted.realizedIssue.candidate, effect.candidate);
      calls.push(effect.key);
      return observation(effect);
    },
    async observe(effect) {
      reads.push(effect.key);
      return observation(effect);
    },
  };
  const args = {
    store: f.store,
    claim: f.claim,
    batch,
    snapshot: currentSnapshot(input.generation),
    ports,
  };
  const run = (extra = {}) => context(f.root, () => publish({ ...args, ...extra }));
  return { f, input, batch, calls, reads, ports, args, run };
}
// Removing complete-snapshot validation would allow a mutation with no cloud authority.
test('incomplete observation refuses before dependency access or dispatch', async () => {
  await assert.rejects(
    publish({
      store: null,
      claim: null,
      batch: null,
      snapshot: { complete: false },
      ports: {
        apply() {
          assert.fail('dispatch');
        },
      },
    }),
    { code: 'STORY_OBSERVATION_UNAVAILABLE' }
  );
});
// Missing dispatch persistence or a second apply breaks durable at-most-once resource publication.
test('publishes each frozen resource once after durable dispatching and checkpoints exact results', async (t) => {
  const s = await setup(t, true);
  const result = await s.run();
  assert.equal(result.status, 'confirmed');
  assert.deepEqual(s.calls, ['comment:C_timing', 'project-field:PI_test:F_count', 'issue:I_test']);
  assert.deepEqual(s.reads, []);
  const g = (await s.f.store.readGeneration()).generation;
  assert.equal(g.batch.status, 'confirmed');
  assert.notEqual(g.batch.status, 'complete');
  assert.equal(g.batch.effects[0].outcome.providerId, 'C_timing');
  assert.equal(
    g.batch.effects[1].outcome.digest,
    hash(json({ itemId: 'PI_test', fieldId: 'F_count', type: 'NUMBER', value: 2 }))
  );
  assert.equal(g.timing.publishedCursor, g.timing.ingestedCursor);
  assert.deepEqual(g.dirtyKeys, []);
  assert.equal(g.baseSnapshot.fields[0].value, 2);
  assert.equal(g.baseSnapshot.resources['issue:I_test'].digest, hash('private unpublished body'));
  await assert.rejects(s.run(), { code: 'STORY_PUBLICATION_PENDING' });
  assert.equal(s.calls.length, 3);
  assert.match(result.limitation, /non-atomic/);
});
for (const [name, mutate] of [
  [
    'equal revision with different bytes',
    (s) => {
      s.resources['issue:I_test'].body = 'external edit';
      s.resources['issue:I_test'].digest = hash('external edit');
    },
  ],
  [
    'comment deletion',
    (s) => {
      delete s.resources['comment:C_timing'];
      s.inventory = [];
    },
  ],
  [
    'comment addition',
    (s) => {
      const r = structuredClone(s.resources['comment:C_timing']);
      r.key = 'comment:external';
      s.resources[r.key] = r;
      s.inventory.push('external');
      s.inventory.sort();
    },
  ],
  [
    'ownership drift',
    (s) => {
      s.assignees = ['foreign'];
    },
  ],
  [
    'title drift',
    (s) => {
      s.title = 'changed';
      s.titleDigest = hash('changed');
    },
  ],
])
  test(`full target preflight retains ${name} without mutation`, async (t) => {
    const s = await setup(t);
    mutate(s.args.snapshot);
    const result = await s.run();
    assert.equal(result.status, 'conflict');
    assert.deepEqual(s.calls, []);
    const g = (await s.f.store.readGeneration()).generation;
    assert.equal(g.batch.status, 'conflict');
    assert.ok(g.conflicts.length);
    assert.ok(g.dirtyKeys.length);
  });
// Trusting caller effect data instead of #2047's full source record permits unauthorized bytes.
test('altered frozen candidates or unverified payloads cannot reach transport', async (t) => {
  const s = await setup(t);
  const altered = structuredClone(s.batch);
  altered.effects[0].candidate.body += 'tamper';
  await assert.rejects(s.run({ batch: altered }), { code: 'STORY_BATCH_INVALID' });
  assert.deepEqual(s.calls, []);
  const read = s.f.store.readGeneration;
  const bad = await read();
  bad.payloads.set(bad.generation.working['issue:I_test'].payloadPath, Buffer.from('corrupt'));
  await assert.rejects(s.run({ store: { ...s.f.store, readGeneration: async () => bad } }), {
    code: 'STORY_MANIFEST_INVALID',
  });
  assert.deepEqual(s.calls, []);
});
test('unregistered claim and wrong actual session refuse before dispatch', async (t) => {
  const s = await setup(t);
  const claim = { ...s.f.claim };
  delete claim.registryKey;
  await assert.rejects(s.run({ claim }), { code: 'STORY_WRITER_UNAVAILABLE' });
  await assert.rejects(
    context(s.f.root, () => publish(s.args), 'author-B'),
    { code: 'STORY_WRITER_OWNED' }
  );
  assert.deepEqual(s.calls, []);
});
// A failed durable write before dispatch must never consume transport capability.
for (const boundary of [1, 2, 3])
  test(`persistence failure at commit ${boundary} stops subsequent writes and replay`, async (t) => {
    const s = await setup(t);
    let commits = 0;
    const store = {
      ...s.f.store,
      async commitGeneration(...args) {
        if (++commits === boundary)
          throw Object.assign(new Error('synthetic disk failure'), {
            code: 'STORY_STORE_UNAVAILABLE',
          });
        return s.f.store.commitGeneration(...args);
      },
    };
    await assert.rejects(s.run({ store }), { code: 'STORY_STORE_UNAVAILABLE' });
    assert.equal(s.calls.length, boundary === 3 ? 1 : 0);
    if (boundary > 1) {
      await assert.rejects(s.run(), { code: 'STORY_PUBLICATION_PENDING' });
      assert.equal(s.calls.length, boundary === 3 ? 1 : 0);
    }
  });
// Complete exact responses save the read; incomplete responses spend exactly one, never a retry.
test('an incomplete mutation response uses one targeted readback', async (t) => {
  const s = await setup(t);
  const apply = s.ports.apply;
  s.ports.apply = async (effect) => {
    await apply(effect);
    return { complete: true };
  };
  const result = await s.run();
  assert.equal(result.status, 'confirmed');
  assert.deepEqual(s.reads, ['comment:C_timing', 'issue:I_test']);
  assert.equal(s.calls.length, 2);
});
for (const landed of [false, true])
  test(`timeout with ${landed ? 'landed' : 'delayed'} write never triggers a second apply`, async (t) => {
    const s = await setup(t);
    let delayed;
    s.ports.apply = async (effect) => {
      s.calls.push(effect.key);
      delayed = effect;
      throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    };
    s.ports.observe = async (effect) => {
      s.reads.push(effect.key);
      return landed
        ? observation(effect)
        : observation(effect, {
            body: 'old baseline',
            node: { ...observation(effect).node, body: 'old baseline' },
          });
    };
    const result = await s.run();
    assert.equal(result.status, landed ? 'confirmed' : 'uncertain');
    assert.equal(s.calls.length, landed ? 2 : 1);
    assert.equal(s.reads.length, landed ? 2 : 1);
    assert.ok(delayed); // The timed-out operation may land after this observation.
    await assert.rejects(s.run(), { code: 'STORY_PUBLICATION_PENDING' });
    assert.equal(s.calls.length, landed ? 2 : 1);
  });
test('readback changed bytes or wrong returned node ID remain uncertain and stop dependencies', async (t) => {
  const s = await setup(t);
  s.ports.apply = async (effect) => {
    s.calls.push(effect.key);
    return observation(effect, { node: { ...observation(effect).node, id: 'wrong' } });
  };
  s.ports.observe = async (effect) => {
    s.reads.push(effect.key);
    return observation(effect, {
      body: 'external',
      node: { ...observation(effect).node, body: 'external' },
    });
  };
  const result = await s.run();
  assert.equal(result.status, 'uncertain');
  assert.equal(result.batch.effects[0].outcome.state, 'uncertain');
  assert.deepEqual(s.calls, ['comment:C_timing']);
  assert.equal(s.reads.length, 1);
});
test('native registry drift after provider dispatch stops further effects and preserves dispatching', async (t) => {
  const s = await setup(t);
  const apply = s.ports.apply;
  s.ports.apply = async (effect) => {
    const result = await apply(effect);
    fs.writeFileSync(
      path.join(
        s.f.root,
        'fixture-common',
        'aitm',
        'story-writers',
        s.f.claim.registryKey + '.json'
      ),
      'corrupt'
    );
    return result;
  };
  await assert.rejects(s.run(), { code: 'STORY_WRITER_UNAVAILABLE' });
  assert.deepEqual(s.calls, ['comment:C_timing']);
  assert.equal(
    (await s.f.store.readGeneration()).generation.batch.effects[0].outcome.state,
    'dispatching'
  );
});
// Direct adapter tests are transport-level, not mocked publisher assertions.
test('provider adapters dispatch exact native resource mutations without retry or invented field confirmation', async () => {
  assert.equal(typeof adapters.createStoryProviderAdapters, 'function');
  const requests = [];
  const ports = adapters.createStoryProviderAdapters({
    capabilities: [],
    validateIssue() {},
    observe() {},
    async graphql(request) {
      requests.push(request);
      return {
        data: {
          updateIssue: {
            issue: {
              id: 'I_test',
              body: 'new',
              title: 'new title',
              lastEditedAt: null,
              userContentEdits: { totalCount: 0, nodes: [] },
            },
          },
        },
      };
    },
  });
  const issue = {
    kind: 'issue-update',
    target: { identity, issueNodeId: 'I_test' },
    candidate: { body: 'new', title: 'new title' },
  };
  const result = await ports.apply(issue);
  assert.equal(result.body, 'new');
  assert.equal(result.node.includesCreatedEdit, false);
  assert.deepEqual(requests[0].variables, { id: 'I_test', body: 'new', title: 'new title' });
  assert.equal(requests[0].host, 'github.com');
  assert.match(requests[0].query, /updateIssue\(/);
  for (const kind of ['comment-update', 'comment-create']) {
    await ports.apply({ kind, target: { identity, commentNodeId: 'IC_note' }, candidate: 'note' });
  }
  assert.match(requests[1].query, /updateIssueComment\(/);
  assert.deepEqual(requests[1].variables, { id: 'IC_note', body: 'note' });
  assert.match(requests[2].query, /addComment\(/);
  assert.deepEqual(requests[2].variables, { id: 'I_test', body: 'note' });
  const field = {
    kind: 'project-field-update',
    target: { identity, projectId: 'P_test', itemId: 'PI_test', fieldId: 'F_estimate' },
    candidate: { itemId: 'PI_test', fieldId: 'F_estimate', type: 'NUMBER', value: 3.5 },
  };
  await ports.apply(field);
  assert.equal(requests[3].variables.value, 3.5);
  assert.match(requests[3].query, /number:\$value/);
  await ports.apply({ ...field, candidate: { ...field.candidate, value: null } });
  assert.match(requests[4].query, /clearProjectV2ItemFieldValue/);
});

async function creationInput(t) {
  const { f, input } = await inputFor(t),
    note = creation();
  const body = 'Created {{aitm-slot:note-id}}';
  await changeGeneration(f, (g, payloads) => {
    payloads.set('working/created-body.md', body);
    g.working['issue:I_test'] = {
      payloadPath: 'working/created-body.md',
      digest: hash(body),
      kind: 'issue',
      capabilityRef: null,
    };
    payloads.set('working/note.md', note.candidate);
    g.working[note.key] = {
      payloadPath: 'working/note.md',
      digest: note.intendedDigest,
      kind: 'comment',
      capabilityRef: null,
    };
    g.dirtyKeys.push(note.key);
    g.dirtyKeys.sort();
  });
  input.generation = await f.store.readGeneration();
  input.effects[0].candidate = {
    schema: 'aitm.story-final-body-template/v1',
    body,
    title: 'Title',
    slots: [{ id: 'note-id', kind: 'comment-id', effectKey: note.key }],
  };
  input.effects[0].intendedDigest = null;
  input.effects[0].dependencies.push(note.key);
  input.effects.push(note);
  input.capabilities = [{ base: 'base story', candidate: body }];
  return { f, input };
}
// Losing the real created ID or materializing before durable confirmation breaks the final body.
test('new comment ID is uniquely verified and persisted before exact final-body slot dispatch', async (t) => {
  const s = await setup(t, false, await creationInput(t));
  const apply = s.ports.apply;
  s.ports.apply = async (effect) => {
    const result = await apply(effect);
    if (effect.kind === 'comment-create')
      result.inventory = [
        { id: 'C_timing', body: s.batch.effects[0].candidate.body },
        { id: 'IC_created', body: effect.candidate },
      ];
    if (effect.kind === 'issue-update') {
      assert.equal(effect.candidate.body, 'Created IC_created');
      const g = (await s.f.store.readGeneration()).generation;
      assert.equal(
        g.batch.effects.find((e) => e.kind === 'comment-create').outcome.providerId,
        'IC_created'
      );
    }
    return result;
  };
  const result = await s.run();
  assert.equal(result.status, 'confirmed');
  assert.equal(result.batch.realizedIssue.intendedDigest, hash('Created IC_created'));
  assert.deepEqual(s.reads, []);
});
for (const duplicate of [false, true])
  test(`creation ${duplicate ? 'duplicate purpose' : 'missing result'} remains uncertain without second creation`, async (t) => {
    const s = await setup(t, false, await creationInput(t));
    const apply = s.ports.apply;
    s.ports.apply = async (effect) => {
      const result = await apply(effect);
      if (effect.kind !== 'comment-create') return result;
      return duplicate
        ? {
            ...result,
            inventory: [
              { id: 'IC_created', body: effect.candidate },
              { id: 'IC_duplicate', body: effect.candidate + 'changed' },
            ],
          }
        : null;
    };
    s.ports.observe = async (effect) => {
      s.reads.push(effect.key);
      return duplicate
        ? observation(effect, {
            inventory: [
              { id: 'IC_created', body: effect.candidate },
              { id: 'IC_duplicate', body: effect.candidate + 'changed' },
            ],
          })
        : null;
    };
    const result = await s.run();
    assert.equal(result.status, 'uncertain');
    assert.equal(s.calls.filter((key) => key === creation().key).length, 1);
    assert.ok(!s.calls.includes('issue:I_test'));
    assert.equal(s.reads.length, 1);
    await assert.rejects(s.run(), { code: 'STORY_PUBLICATION_PENDING' });
  });
test('realized native body validation refusal preserves confirmed prerequisites and prevents issue write', async (t) => {
  const s = await setup(t);
  s.ports.validateIssue = () => {
    throw Object.assign(new Error('native proof scope changed'), {
      code: 'STORY_MUTATION_INVALID',
    });
  };
  await assert.rejects(s.run(), { code: 'STORY_MUTATION_INVALID' });
  assert.deepEqual(s.calls, ['comment:C_timing']);
  const g = (await s.f.store.readGeneration()).generation;
  assert.equal(g.batch.effects[0].outcome.state, 'confirmed');
  assert.equal(g.batch.effects[1].attempted, false);
});
// Check the actual serialized provider payload, not a CLI flag that only converts integers.
test('default GraphQL transport serializes fractional NUMBER values as JSON numbers', async (t) => {
  const { ghClient } = await import('../../../../../gh/lib/gh-client.mjs');
  const response = '{"data":{"updateProjectV2ItemFieldValue":{"projectV2Item":{"id":"PI_test"}}}}';
  const payloads = [];
  // Cover the old production branch offline: gh --field converts integer literals only.
  t.mock.method(ghClient, 'pexec', async (file, args) => {
    const variables = {};
    for (let i = 0; i < args.length; i++)
      if (['-f', '-F'].includes(args[i])) {
        const [key, ...tail] = args[++i].split('=');
        const raw = tail.join('=');
        variables[key] = args[i - 1] === '-F' && /^-?\d+$/.test(raw) ? Number(raw) : raw;
      }
    payloads.push({ variables });
    return { stdout: response };
  });
  t.mock.method(ghClient, 'execFile', (file, args, options, callback) => {
    assert.equal(file, 'gh');
    assert.ok(args.includes('--input'));
    assert.equal(args[args.indexOf('--input') + 1], '-');
    assert.equal(args[args.indexOf('--hostname') + 1], 'github.com');
    assert.equal(options.maxBuffer, 4194304);
    const child = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = (raw) => {
      payloads.push(JSON.parse(raw));
      queueMicrotask(() => callback(null, response, ''));
    };
    return child;
  });
  const ports = adapters.createStoryProviderAdapters({
    capabilities: [],
    validateIssue() {},
    observe() {},
  });
  for (const value of [3.5, 0, -1.25])
    await ports.apply({
      kind: 'project-field-update',
      target: { identity, projectId: 'P_test', itemId: 'PI_test', fieldId: 'F_estimate' },
      candidate: { itemId: 'PI_test', fieldId: 'F_estimate', type: 'NUMBER', value },
    });
  assert.deepEqual(
    payloads.map((payload) => payload.variables.value),
    [3.5, 0, -1.25]
  );
  assert.ok(payloads.every((payload) => typeof payload.variables.value === 'number'));
});
// A provider cannot bind two declared creations to the same newly returned node.
test('a second creation cannot reuse an already confirmed new provider ID', async (t) => {
  const prepared = await creationInput(t);
  const second = creation();
  second.key = 'comment:new:second';
  second.target.creationIntent = 'second';
  second.candidate = 'Other note\n\n<!-- aitm-owned-comment key="batch.second" -->';
  second.intendedDigest = hash(second.candidate);
  await changeGeneration(prepared.f, (g, payloads) => {
    payloads.set('working/second.md', second.candidate);
    g.working[second.key] = {
      payloadPath: 'working/second.md',
      digest: second.intendedDigest,
      kind: 'comment',
      capabilityRef: null,
    };
    g.dirtyKeys.push(second.key);
    g.dirtyKeys.sort();
  });
  prepared.input.generation = await prepared.f.store.readGeneration();
  prepared.input.effects.push(second);
  prepared.input.effects[0].dependencies.push(second.key);
  const s = await setup(t, false, prepared);
  const apply = s.ports.apply;
  const response = (effect) =>
    observation(effect, {
      inventory: [
        { id: 'C_timing', body: s.batch.effects[0].candidate.body },
        { id: 'IC_created', body: effect.candidate },
      ],
    });
  s.ports.apply = async (effect) => {
    const result = await apply(effect);
    return effect.kind === 'comment-create' ? response(effect) : result;
  };
  s.ports.observe = async (effect) => {
    s.reads.push(effect.key);
    return response(effect);
  };
  const result = await s.run();
  assert.equal(result.status, 'uncertain');
  assert.ok(!s.calls.includes('issue:I_test'));
  const created = result.batch.effects.filter((effect) => effect.kind === 'comment-create');
  assert.equal(created[0].outcome.state, 'confirmed');
  assert.equal(created[1].outcome.state, 'uncertain');
});
for (const drift of ['deletion', 'addition', 'changed bytes'])
  test(`creation readback cannot hide external inventory ${drift}`, () => {
    const effect = creation();
    const baseline = {
      inventory: ['IC_existing'],
      resources: { 'comment:IC_existing': { digest: hash('external original') } },
    };
    const inventory = [{ id: 'IC_created', body: effect.candidate }];
    if (drift !== 'deletion')
      inventory.push({
        id: 'IC_existing',
        body: drift === 'changed bytes' ? 'external changed' : 'external original',
      });
    if (drift === 'addition') inventory.push({ id: 'IC_foreign', body: 'new external comment' });
    assert.throws(
      () =>
        adapters.confirmResourceEffect(effect, observation(effect, { inventory }), { baseline }),
      { code: 'STORY_EFFECT_UNCONFIRMED' }
    );
  });
