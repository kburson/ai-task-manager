// @story #2068
// Real durable store/claim; only provider transport and native host ports are offline.
import assert from 'node:assert/strict';
import {
  test,
  context,
  identity,
  hash,
  changeGeneration,
  event,
} from '../../../../helpers/story-timing-candidate-fixture.mjs';
import { ingestTimingEvents } from '../../../../../task-tracker/lib/story-cache/timing-stage.mjs';
import { fieldInput, setIssue } from '../../../../helpers/story-batch-fixture.mjs';
import { canonicalRecordJson as json } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { hydrateJournalSnapshot } from '../../../../../task-tracker/lib/story-cache/journal.mjs';
import { observeContent } from '../../../../../task-tracker/lib/story-cache/native-observation.mjs';
import { moveState } from '../../../../../task-tracker/lib/move-state/move-state-core.mjs';
const coordinator =
  await import('../../../../../task-tracker/lib/story-cache/transition-batch.mjs').catch(
    (error) => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return {};
    }
  );
const run = (args) => {
  assert.equal(
    typeof coordinator.runTransitionBatch,
    'function',
    'transition coordinator is missing'
  );
  return coordinator.runTransitionBatch(args);
};
async function setup(t) {
  const { f, input } = await fieldInput(t, { optionId: 'OPT_test', name: 'Test' }, 'SINGLE_SELECT');
  const base =
    '<!-- aitm-last-known-state state="develop" ts="2026-10-19T12:00:00Z" -->\nbase story';
  const candidate =
    base.replace('base story', 'private unpublished body') +
    '\n\n## AITM Progress Markers\n\n' +
    'Retained operator checkpoint.\n'.repeat(64);
  await changeGeneration(f, (g, payloads) => setIssue(g, payloads, base, candidate));
  input.generation = await f.store.readGeneration();
  const issue = input.effects.find((e) => e.kind === 'issue-update');
  issue.beforeDigest = hash(base);
  issue.intendedDigest = hash(candidate);
  issue.candidate.body = candidate;
  const timing = input.effects.find(
    (e) => e.candidate?.schema === 'aitm.story-timing-candidate/v1'
  );
  const status = input.effects.find((e) => e.kind === 'project-field-update');
  status.dependencies = [timing.key];
  const cloud = hydrateJournalSnapshot(
    input.generation.generation.baseSnapshot,
    input.generation.payloads
  );
  const calls = [];
  const ctx = {
    issueArg: String(identity.issueNumber),
    resolvedFromState: 'develop',
    stateArg: 'test',
    transitionId: input.transition.id,
    transition: input.transition,
    effects: input.effects,
    statusKey: status.key,
    cfg: { kanbanFieldId: 'F_count', kanbanOptionDevelop: 'OPT_old', kanbanOptionTest: 'OPT_test' },
    _runGuardExecution: async () => ({ exit: null }),
  };
  const ports = {
    capabilities: [{ base, candidate }],
    readSnapshot: async () => structuredClone(cloud),
    validatePreStatus: async () => ({ verified: true }),
    validateIssue: async () => ({ verified: true }),
    validateFinal: async () => ({ verified: true }),
    async apply(effect) {
      const persisted = (await f.store.readGeneration()).generation.batch;
      assert.equal(
        persisted.effects.find((e) => e.key === effect.key).outcome.state,
        'dispatching'
      );
      calls.push(effect.kind);
      if (effect.kind === 'project-field-update') {
        cloud.fields = [structuredClone(effect.candidate)];
        cloud.fieldsDigest = hash(
          json({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: cloud.fields })
        );
        return { complete: true, identity, field: effect.candidate };
      }
      const body = typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body;
      const id =
        effect.kind === 'issue-update' ? identity.issueNodeId : effect.target.commentNodeId;
      const value = {
        complete: true,
        identity,
        node: {
          id,
          lastEditedAt: null,
          includesCreatedEdit: false,
          userContentEdits: { totalCount: 0, nodes: [] },
        },
        body,
        ...(effect.kind === 'issue-update' ? { title: effect.candidate.title } : {}),
      };
      cloud.resources[effect.key] = { ...observeContent(value), ownership: 'owned' };
      return value;
    },
    observe: async () => ({ complete: false }),
  };
  const args = { ctx, store: f.store, claim: f.claim, ports };
  return { f, ctx, ports, cloud, calls, args, run: () => context(f.root, () => run(args)) };
}
// Losing the final snapshot/local commit would turn publication into false lifecycle completion.
test('orders timing, Status and one final body, then commits verified completion', async (t) => {
  const s = await setup(t);
  const result = await s.run();
  assert.equal(result.status, 'complete');
  assert.deepEqual(s.calls, ['comment-update', 'project-field-update', 'issue-update']);
  const record = await s.f.store.readGeneration();
  assert.equal(record.generation.batch.status, 'complete');
  const body = s.cloud.resources[`issue:${identity.issueNodeId}`].body;
  assert.match(body, /aitm-move-complete state=test/);
  assert.match(body, /aitm-transition-completion/);
  assert.match(body, /private unpublished body/);
  assert.match(body, /aitm-entered-test/);
});
// Every guard refusal must occur before the first provider mutation.
test('native guard refusal prevents all publication', async (t) => {
  const s = await setup(t);
  s.ctx._runGuardExecution = async () => ({ exit: 19 });
  const result = await s.run();
  assert.equal(result.exit, 19);
  assert.deepEqual(s.calls, []);
});
test('initial inventory drift retains conflict without writes', async (t) => {
  const s = await setup(t);
  s.cloud.title = 'External title';
  s.cloud.titleDigest = hash(s.cloud.title);
  assert.equal((await s.run()).status, 'conflict');
  assert.deepEqual(s.calls, []);
});
test('pre-Status authority refusal leaves only provisional timing', async (t) => {
  const s = await setup(t);
  s.ports.validatePreStatus = async () => ({ verified: false });
  await assert.rejects(s.run(), { code: 'STORY_TRANSITION_UNAVAILABLE' });
  assert.deepEqual(s.calls, ['comment-update']);
  assert.notEqual((await s.f.store.readGeneration()).generation.batch.status, 'complete');
});
test('uncertain Status never publishes a body or retries the field', async (t) => {
  const s = await setup(t);
  const apply = s.ports.apply;
  s.ports.apply = async (effect) => {
    if (effect.kind === 'project-field-update') {
      s.calls.push(effect.kind);
      throw new Error('timeout');
    }
    return apply(effect);
  };
  assert.equal((await s.run()).status, 'uncertain');
  assert.deepEqual(s.calls, ['comment-update', 'project-field-update']);
  assert.equal((await s.run()).status, 'pending');
  assert.equal(s.calls.length, 2);
  await assert.rejects(
    context(s.f.root, () =>
      coordinator.prepareNextTransition({ store: s.f.store, claim: s.f.claim })
    ),
    { code: 'STORY_TRANSITION_UNAVAILABLE' }
  );
  assert.equal((await s.f.store.readGeneration()).generation.batch.status, 'uncertain');
});
test('final vector drift refuses completion after one final issue write', async (t) => {
  const s = await setup(t);
  const read = s.ports.readSnapshot;
  let reads = 0;
  s.ports.readSnapshot = async () => {
    const value = await read();
    if (++reads === 2) {
      value.title = 'Late external edit';
      value.titleDigest = hash(value.title);
    }
    return value;
  };
  assert.equal((await s.run()).status, 'conflict');
  assert.equal(s.calls.filter((k) => k === 'issue-update').length, 1);
  assert.notEqual((await s.f.store.readGeneration()).generation.batch.status, 'complete');
});
// Core must not invoke its legacy body/sentinel/compensation/tail path for cache transitions.
test('moveState routes a cached transition through native guards and the coordinator only', async (t) => {
  const s = await setup(t);
  const result = await context(s.f.root, () =>
    moveState({
      ...s.ctx,
      storyCache: { store: s.f.store, claim: s.f.claim, ports: s.ports },
      _probeCompletion: () => assert.fail('legacy probe'),
      _stampEntryMarkers: () => assert.fail('legacy pre-Status body'),
      _writeSentinel: () => assert.fail('second body write'),
      _runPostCommitTail: () => assert.fail('post-body cloud tail'),
    })
  );
  assert.equal(result.phase, 'complete');
  assert.equal(result.sentinelPresent, true);
  assert.deepEqual(s.calls, ['comment-update', 'project-field-update', 'issue-update']);
});
test('completed replay revalidates authority without dispatching again', async (t) => {
  const s = await setup(t);
  assert.equal((await s.run()).status, 'complete');
  assert.equal((await s.run()).status, 'complete');
  assert.equal(s.calls.length, 3);
});
test('failed final local commit recovers from confirmed effects without replay', async (t) => {
  const s = await setup(t);
  const original = s.f.store;
  let failed = false;
  s.args.store = {
    cachePath: original.cachePath,
    readGeneration: (...args) => original.readGeneration(...args),
    commitGeneration: (value, options) => {
      if (!failed && value.generation.batch?.status === 'complete') {
        failed = true;
        throw new Error('completion persistence unavailable');
      }
      return original.commitGeneration(value, options);
    },
  };
  await assert.rejects(s.run(), /completion persistence unavailable/);
  assert.equal((await original.readGeneration()).generation.batch.status, 'confirmed');
  assert.equal((await s.run()).status, 'complete');
  assert.equal(s.calls.length, 3);
});
test('failed dispatch journal commit prevents the corresponding provider attempt', async (t) => {
  const s = await setup(t);
  const original = s.f.store;
  s.args.store = {
    cachePath: original.cachePath,
    readGeneration: (...args) => original.readGeneration(...args),
    commitGeneration: (value, options) => {
      if (value.generation.batch?.status === 'dispatching')
        throw new Error('dispatch persistence unavailable');
      return original.commitGeneration(value, options);
    },
  };
  await assert.rejects(s.run(), /dispatch persistence unavailable/);
  assert.deepEqual(s.calls, []);
});
for (const failingKind of ['comment-update', 'issue-update']) {
  test(`uncertain ${failingKind} preserves the batch and never repeats writes`, async (t) => {
    const s = await setup(t);
    const apply = s.ports.apply;
    s.ports.apply = async (effect) => {
      if (effect.kind === failingKind) {
        s.calls.push(effect.kind);
        throw new Error('crash');
      }
      return apply(effect);
    };
    assert.equal((await s.run()).status, 'uncertain');
    const count = s.calls.length;
    assert.equal((await s.run()).status, 'pending');
    assert.equal(s.calls.length, count);
    assert.notEqual((await s.f.store.readGeneration()).generation.batch.status, 'complete');
  });
}
test('invalid native Status ordering fails before dispatch', async (t) => {
  const s = await setup(t);
  s.ctx.effects.find((e) => e.key === s.ctx.statusKey).dependencies = [];
  await assert.rejects(s.run(), { code: 'STORY_TRANSITION_UNAVAILABLE' });
  assert.deepEqual(s.calls, []);
});
test('final body scope refusal prevents the only issue dispatch', async (t) => {
  const s = await setup(t);
  s.ports.validateIssue = async () => ({ verified: false });
  await assert.rejects(s.run(), { code: 'STORY_TRANSITION_UNAVAILABLE' });
  assert.deepEqual(s.calls, ['comment-update', 'project-field-update']);
});
test('core refuses an attempt to replace its native context through the cache operand', async (t) => {
  const s = await setup(t);
  const result = await context(s.f.root, () =>
    moveState({
      ...s.ctx,
      _runGuardExecution: async () => ({ exit: 23 }),
      storyCache: { store: s.f.store, claim: s.f.claim, ports: s.ports, ctx: s.ctx },
    })
  );
  assert.equal(result.exit, 23);
  assert.deepEqual(s.calls, []);
});
async function prepareSecond(s) {
  assert.equal((await s.run()).status, 'complete');
  const firstBody = s.cloud.resources[`issue:${identity.issueNodeId}`].body;
  const firstReceipt = firstBody.match(/^<!-- aitm-transition-completion .+ -->$/m)[0];
  assert.equal(
    typeof coordinator.prepareNextTransition,
    'function',
    'completed generation handoff is missing'
  );
  await context(s.f.root, () =>
    coordinator.prepareNextTransition({ store: s.f.store, claim: s.f.claim })
  );
  assert.equal(s.calls.length, 3);
  const move = { ...s.ctx.transition, id: 'move:two', from: 'test', to: 'develop' };
  await context(s.f.root, () =>
    ingestTimingEvents({
      store: s.f.store,
      claim: s.f.claim,
      events: [
        event('two-exit', {
          transitionId: move.id,
          event: 'test:passed',
          timestamp: '2026-10-19T12:02:00.000Z',
          activeSeconds: null,
          idleSeconds: null,
        }),
        event('two-entry', {
          transitionId: move.id,
          event: 'develop:started',
          timestamp: '2026-10-19T12:02:00.000Z',
          activeSeconds: 0,
          idleSeconds: 0,
        }),
      ],
    })
  );
  const record = await s.f.store.readGeneration();
  const timing = await s.f.freeze(move);
  const before = record.generation.baseSnapshot.fields[0];
  const status = structuredClone(s.ctx.effects.find((e) => e.key === s.ctx.statusKey));
  status.beforeDigest = hash(json(before));
  status.candidate.value = { optionId: 'OPT_old', name: 'Develop' };
  status.intendedDigest = hash(json(status.candidate));
  status.dependencies = [timing.key];
  await changeGeneration(s.f, (g, payloads) => {
    const raw = json(status.candidate);
    payloads.set('working/next-status.json', raw);
    g.working[status.key] = {
      payloadPath: 'working/next-status.json',
      digest: hash(raw),
      kind: 'project-field',
      capabilityRef: null,
    };
    g.dirtyKeys.push(status.key);
    g.dirtyKeys.sort();
  });
  const issue = structuredClone(s.ctx.effects.find((e) => e.kind === 'issue-update'));
  issue.beforeDigest = hash(firstBody);
  issue.intendedDigest = hash(firstBody);
  issue.candidate.body = firstBody;
  issue.dependencies = [timing.key, status.key].sort();
  Object.assign(s.ctx, {
    transition: move,
    transitionId: move.id,
    resolvedFromState: 'test',
    stateArg: 'develop',
    effects: [issue, timing, status],
  });
  s.ports.capabilities = [{ base: firstBody, candidate: firstBody }];
  return { firstBody, firstReceipt };
}
test('a second demotion transition preserves the first receipt and timing events', async (t) => {
  const s = await setup(t);
  const { firstReceipt } = await prepareSecond(s);
  assert.equal((await s.run()).status, 'complete');
  const body = s.cloud.resources[`issue:${identity.issueNodeId}`].body;
  assert.ok(body.includes(firstReceipt));
  assert.match(body, /aitm-move-complete state=develop/);
  assert.equal([...body.matchAll(/aitm-transition-completion/g)].length, 2);
  const final = await s.f.store.readGeneration();
  assert.equal(final.generation.timing.events.length, 4);
  assert.equal(
    final.generation.timing.events.find((e) => e.eventId === 'two-exit').activeSeconds,
    null
  );
  assert.equal(s.calls.filter((k) => k === 'issue-update').length, 2);
});
for (const [name, edit] of [
  ['removed', (body, receipt) => body.replace(receipt, '')],
  ['changed', (body, receipt) => body.replace(receipt, receipt.replace('"visit":1', '"visit":9'))],
  ['invented', (body, receipt) => body + '\n' + receipt.replace('move:one', 'move:invented')],
  ['malformed', (body) => body + '\n<!-- aitm-transition-completion x -->'],
]) {
  test(`prior receipt cannot be ${name} by staged body edits`, async (t) => {
    const s = await setup(t);
    const { firstBody, firstReceipt } = await prepareSecond(s);
    const candidate = edit(firstBody, firstReceipt);
    await changeGeneration(s.f, (g, payloads) => {
      setIssue(g, payloads, firstBody, candidate);
      g.dirtyKeys.push(`issue:${identity.issueNodeId}`);
      g.dirtyKeys.sort();
    });
    const issue = s.ctx.effects.find((e) => e.kind === 'issue-update');
    issue.candidate.body = candidate;
    issue.intendedDigest = hash(candidate);
    s.ports.capabilities = [{ base: firstBody, candidate }];
    await assert.rejects(s.run(), { code: 'STORY_TRANSITION_UNAVAILABLE' });
    assert.equal(s.calls.length, 3);
    assert.equal(s.cloud.resources[`issue:${identity.issueNodeId}`].body, firstBody);
  });
}
test('completed replay reports later drift without changing completed evidence', async (t) => {
  const s = await setup(t);
  assert.equal((await s.run()).status, 'complete');
  const before = await s.f.store.readGeneration();
  s.cloud.title = 'Later external title';
  s.cloud.titleDigest = hash(s.cloud.title);
  assert.equal((await s.run()).status, 'conflict');
  const after = await s.f.store.readGeneration();
  assert.deepEqual(after.manifest, before.manifest);
  assert.equal(after.generation.batch.status, 'complete');
  assert.deepEqual(after.generation.conflicts, []);
  await context(s.f.root, () =>
    coordinator.prepareNextTransition({ store: s.f.store, claim: s.f.claim })
  );
  assert.equal((await s.f.store.readGeneration()).generation.batch, null);
  assert.equal(s.calls.length, 3);
});
