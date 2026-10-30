// @story #2039 #2067
// Controlled durable-store/provider fixtures; no live incident restoration claim.
import assert from 'node:assert/strict';
import {
  test,
  context,
  identity,
  changeGeneration,
  hash,
} from '../../../../helpers/story-timing-candidate-fixture.mjs';
import {
  inputFor,
  fieldInput,
  extraEffectInput,
  creation,
} from '../../../../helpers/story-batch-fixture.mjs';
import { canonicalRecordJson as json } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { freezeStoryBatch } from '../../../../../task-tracker/lib/story-cache/batch.mjs';
import { publishResourceEffects } from '../../../../../task-tracker/lib/story-cache/publisher.mjs';
import { observeContent } from '../../../../../task-tracker/lib/story-cache/native-observation.mjs';
import { validateStagedComposite } from '../../../../../task-tracker/lib/story-cache/stage-capabilities.mjs';
const adapter = await import('../../../../../task-tracker/lib/story-cache/recovery.mjs').catch(
  (error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  }
);
const recover = (args) => {
  assert.equal(typeof adapter.recoverStoryBatch, 'function', 'safe recovery entrypoint is missing');
  return adapter.recoverStoryBatch(args);
};
function snapshot(record) {
  const value = structuredClone(record.generation.baseSnapshot);
  for (const row of Object.values(value.resources)) {
    row.body = String(record.payloads.get(row.payloadPath));
    delete row.payloadPath;
  }
  return value;
}
function observed(effect, body) {
  const issue = effect.kind === 'issue-update';
  return {
    complete: true,
    identity,
    node: {
      id: issue ? identity.issueNodeId : effect.target.commentNodeId,
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body,
    ...(issue ? { title: effect.candidate.title } : {}),
  };
}
async function uncertain(t, prepared = null, failKind = null) {
  const { f, input } = prepared ?? (await inputFor(t));
  const batch = freezeStoryBatch(input);
  const cloud = snapshot(input.generation);
  let writes = 0;
  const result = await context(f.root, () =>
    publishResourceEffects({
      store: f.store,
      claim: f.claim,
      batch,
      snapshot: cloud,
      ports: {
        capabilities: input.capabilities,
        validateIssue: ({ base, candidate }) =>
          validateStagedComposite({
            base,
            candidate: candidate.body,
            operations: input.capabilities,
          }),
        apply(effect) {
          writes++;
          if (failKind === null || effect.kind === failKind)
            throw new Error('request timed out; it can still arrive');
          const result = observed(
            effect,
            typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body
          );
          cloud.resources[effect.key] = { ...observeContent(result), ownership: 'owned' };
          return result;
        },
        observe: async (effect) =>
          effect.kind === 'comment-create'
            ? { complete: false }
            : effect.kind === 'project-field-update'
              ? {
                  complete: true,
                  identity,
                  field: cloud.fields.find((row) => row.fieldId === effect.target.fieldId),
                }
              : observed(effect, cloud.resources[effect.key].body),
      },
    })
  );
  assert.equal(result.status, 'uncertain');
  assert.equal(writes, failKind === null ? 1 : 2);
  return { f, input, batch, cloud, writes: () => writes };
}
test('unchanged recovery cannot replay a timed-out write; a later exact landing is reconciled', async (t) => {
  const f = await uncertain(t);
  const original = await f.f.store.readGeneration();
  const effect = original.generation.batch.effects.find((row) => row.attempted);
  const before = original.generation.batch.baseline.resources[effect.key];
  let landed = false;
  const ports = {
    capabilities: f.input.capabilities,
    readSnapshot: async () => structuredClone(f.cloud),
    observe: async (row) =>
      observed(row, landed ? row.candidate.body : f.cloud.resources[row.key].body),
    get apply() {
      return assert.fail('recovery must not even access provider mutation capability');
    },
  };
  const args = { store: f.f.store, claim: f.f.claim, ports, allowMutation: false };
  assert.equal((await context(f.f.root, () => recover(args))).status, 'uncertain');
  const unchanged = await f.f.store.readGeneration();
  assert.equal(unchanged.manifest.payloadDigest, original.manifest.payloadDigest);
  assert.equal(f.writes(), 1);

  landed = true;
  f.cloud.resources[effect.key] = {
    ...observeContent(observed(effect, effect.candidate.body)),
    ownership: 'owned',
  };
  const late = await context(f.f.root, () => recover(args));
  assert.equal(late.status, 'partial');
  const recovered = await f.f.store.readGeneration();
  assert.equal(recovered.generation.batch.batchId, f.batch.batchId);
  assert.deepEqual(recovered.generation.batch.baseline.resources[effect.key], before);
  assert.equal(
    recovered.generation.batch.effects.find((row) => row.key === effect.key).outcome.state,
    'confirmed'
  );
  assert.equal(
    recovered.generation.batch.effects.find((row) => row.kind === 'issue-update').attempted,
    false
  );
  assert.equal(f.writes(), 1);
  const again = await context(f.f.root, () => recover(args));
  assert.equal(again.status, 'partial');
  assert.equal(
    (await f.f.store.readGeneration()).manifest.payloadDigest,
    recovered.manifest.payloadDigest
  );
});
test('an arbitrary mutation Boolean is not recovery authority', async () => {
  await assert.rejects(recover({ allowMutation: true }), { code: 'STORY_RECOVERY_UNAVAILABLE' });
});
test('a changed frozen intent cannot become a new recovery generation', async (t) => {
  const f = await uncertain(t);
  await changeGeneration(f.f, (g) => {
    g.batch.effects[0].candidate.body += ' changed';
  });
  let reads = 0;
  await assert.rejects(
    context(f.f.root, () =>
      recover({
        store: f.f.store,
        claim: f.f.claim,
        ports: {
          readSnapshot: async () => {
            reads++;
            return f.cloud;
          },
          observe: async () => assert.fail(),
        },
      })
    ),
    { code: 'STORY_RECOVERY_UNAVAILABLE', reason: 'frozen-intent-drift' }
  );
  assert.equal(reads, 0);
  assert.equal(f.writes(), 1);
});
test('external content is retained as a three-way conflict without cloud mutation or auto-rebase', async (t) => {
  const f = await uncertain(t);
  const old = await f.f.store.readGeneration();
  const key = 'issue:I_test';
  f.cloud.resources[key] = {
    ...observeContent({
      identity,
      node: {
        id: identity.issueNodeId,
        lastEditedAt: null,
        includesCreatedEdit: false,
        userContentEdits: { totalCount: 0, nodes: [] },
      },
      body: 'foreign issue edit',
    }),
    ownership: 'owned',
  };
  const args = {
    store: f.f.store,
    claim: f.f.claim,
    ports: {
      readSnapshot: async () => f.cloud,
      observe: async (effect) => observed(effect, f.cloud.resources[effect.key].body),
    },
  };
  assert.equal((await context(f.f.root, () => recover(args))).status, 'conflict');
  const result = await f.f.store.readGeneration();
  assert.deepEqual(result.generation.batch.baseline, old.generation.batch.baseline);
  assert.deepEqual(result.generation.working, old.generation.working);
  assert.equal(
    result.generation.conflicts.at(-1).current.resources[key].body,
    'foreign issue edit'
  );
  assert.equal((await context(f.f.root, () => recover(args))).status, 'conflict');
  assert.equal(
    (await f.f.store.readGeneration()).manifest.payloadDigest,
    result.manifest.payloadDigest
  );
  assert.equal(f.writes(), 1);
});
test('an incomplete full snapshot cannot confirm an effect', async (t) => {
  const f = await uncertain(t);
  const before = await f.f.store.readGeneration();
  await assert.rejects(
    context(f.f.root, () =>
      recover({
        store: f.f.store,
        claim: f.f.claim,
        ports: {
          readSnapshot: async () => ({ complete: false }),
          observe: async () => assert.fail(),
        },
      })
    ),
    { code: 'STORY_RECOVERY_UNAVAILABLE', reason: 'snapshot-incomplete' }
  );
  assert.equal(
    (await f.f.store.readGeneration()).manifest.payloadDigest,
    before.manifest.payloadDigest
  );
});
test('unavailable provider observations preserve the pending journal', async (t) => {
  const f = await uncertain(t);
  const before = await f.f.store.readGeneration();
  await assert.rejects(
    context(f.f.root, () =>
      recover({
        store: f.f.store,
        claim: f.f.claim,
        ports: {
          readSnapshot: async () => f.cloud,
          observe: async () => {
            throw new Error('provider unavailable');
          },
        },
      })
    ),
    { code: 'STORY_RECOVERY_UNAVAILABLE', reason: 'observation-unavailable' }
  );
  assert.equal(
    (await f.f.store.readGeneration()).manifest.payloadDigest,
    before.manifest.payloadDigest
  );
});
test('a different actor cannot inspect or settle the registered owner journal', async (t) => {
  const f = await uncertain(t);
  const before = await f.f.store.readGeneration();
  await assert.rejects(
    context(
      f.f.root,
      () =>
        recover({
          store: f.f.store,
          claim: f.f.claim,
          ports: { readSnapshot: async () => assert.fail(), observe: async () => assert.fail() },
        }),
      'other-actor'
    ),
    { code: 'STORY_WRITER_OWNED' }
  );
  assert.equal(
    (await f.f.store.readGeneration()).manifest.payloadDigest,
    before.manifest.payloadDigest
  );
});
test('an invented confirmed outcome cannot promote baseline bytes to intended bytes', async (t) => {
  const f = await uncertain(t);
  await changeGeneration(f.f, (g) => {
    const row = g.batch.effects.find((effect) => effect.attempted);
    row.outcome = {
      state: 'confirmed',
      providerId: row.target.commentNodeId,
      digest: row.intendedDigest,
      revision: g.baseSnapshot.resources[row.key].revision,
    };
    g.batch.status = 'partial';
  });
  await assert.rejects(
    context(f.f.root, () =>
      recover({
        store: f.f.store,
        claim: f.f.claim,
        ports: { readSnapshot: async () => f.cloud, observe: async () => assert.fail() },
      })
    ),
    { code: 'STORY_RECOVERY_UNAVAILABLE', reason: 'confirmation-drift' }
  );
});
test('a field write that landed after timeout is confirmed without repeating the mutation', async (t) => {
  const f = await uncertain(t, await fieldInput(t, 2), 'project-field-update');
  const before = await f.f.store.readGeneration();
  const effect = before.generation.batch.effects.find((row) => row.kind === 'project-field-update');
  f.cloud.fields = [structuredClone(effect.candidate)];
  f.cloud.fieldsDigest = hash(
    json({ canonicalizationVersion: 'aitm.canonical-json/v1', fields: f.cloud.fields })
  );
  const result = await context(f.f.root, () =>
    recover({
      store: f.f.store,
      claim: f.f.claim,
      ports: {
        readSnapshot: async () => f.cloud,
        observe: async () => ({
          complete: true,
          identity,
          field: structuredClone(effect.candidate),
        }),
      },
    })
  );
  assert.equal(result.status, 'partial');
  const after = await f.f.store.readGeneration();
  assert.deepEqual(after.generation.baseSnapshot.fields, f.cloud.fields);
  assert.deepEqual(after.generation.batch.baseline, before.generation.batch.baseline);
  assert.equal(f.writes(), 2);
});
async function pendingCreation(t) {
  const effect = creation();
  const prepared = await extraEffectInput(t, effect, (g, payloads) => {
    payloads.set('working/note.md', effect.candidate);
    g.working[effect.key] = {
      payloadPath: 'working/note.md',
      digest: hash(effect.candidate),
      kind: 'comment',
      capabilityRef: null,
    };
    g.dirtyKeys.push(effect.key);
    g.dirtyKeys.sort();
  });
  return uncertain(t, prepared, 'comment-create');
}
function creationObservation(f, effect, ids) {
  for (const id of ids) {
    const value = observed(effect, effect.candidate);
    value.node.id = id;
    f.cloud.resources[`comment:${id}`] = { ...observeContent(value), ownership: 'owned' };
    f.cloud.inventory.push(id);
  }
  f.cloud.inventory.sort();
  const value = observed(effect, effect.candidate);
  value.node.id = ids[0];
  value.inventory = f.cloud.inventory.map((id) => ({
    id,
    body: f.cloud.resources[`comment:${id}`].body,
  }));
  return value;
}
test('one exact created comment is reconciled by actual identity and complete inventory', async (t) => {
  const f = await pendingCreation(t);
  const before = await f.f.store.readGeneration();
  const effect = before.generation.batch.effects.find((row) => row.kind === 'comment-create');
  const value = creationObservation(f, effect, ['IC_created_late']);
  assert.equal(
    (
      await context(f.f.root, () =>
        recover({
          store: f.f.store,
          claim: f.f.claim,
          ports: { readSnapshot: async () => f.cloud, observe: async () => value },
        })
      )
    ).status,
    'partial'
  );
  const after = await f.f.store.readGeneration();
  assert.equal(
    after.generation.batch.effects.find((row) => row.key === effect.key).outcome.providerId,
    'IC_created_late'
  );
  assert.equal(f.writes(), 2);
});
test('two matching created comments remain a conflict and never authorize another create', async (t) => {
  const f = await pendingCreation(t);
  const before = await f.f.store.readGeneration();
  const effect = before.generation.batch.effects.find((row) => row.kind === 'comment-create');
  const value = creationObservation(f, effect, ['IC_duplicate_a', 'IC_duplicate_b']);
  assert.equal(
    (
      await context(f.f.root, () =>
        recover({
          store: f.f.store,
          claim: f.f.claim,
          ports: { readSnapshot: async () => f.cloud, observe: async () => value },
        })
      )
    ).status,
    'conflict'
  );
  const after = await f.f.store.readGeneration();
  assert.equal(
    after.generation.batch.effects.find((row) => row.key === effect.key).outcome.state,
    'uncertain'
  );
  assert.equal(
    after.generation.batch.effects.find((row) => row.key === effect.key).attempted,
    true
  );
  assert.equal(f.writes(), 2);
});
test('the exact realized final body is recovered without claiming transition completion', async (t) => {
  const f = await uncertain(t, null, 'issue-update');
  const before = await f.f.store.readGeneration();
  const effect = before.generation.batch.effects.find((row) => row.kind === 'issue-update');
  const realized = before.generation.batch.realizedIssue;
  const value = observed({ ...effect, ...realized }, realized.candidate.body);
  f.cloud.resources[effect.key] = { ...observeContent(value), ownership: 'owned' };
  f.cloud.title = realized.candidate.title;
  f.cloud.titleDigest = hash(f.cloud.title);
  const result = await context(f.f.root, () =>
    recover({
      store: f.f.store,
      claim: f.f.claim,
      ports: { readSnapshot: async () => f.cloud, observe: async () => value },
    })
  );
  assert.equal(result.status, 'confirmed');
  assert.equal(result.batch.status, 'confirmed');
  assert.equal(Object.hasOwn(result, 'completionReceipt'), false);
  assert.equal(f.writes(), 2);
});
test('a failed local checkpoint preserves the original uncertain journal', async (t) => {
  const f = await uncertain(t);
  const before = await f.f.store.readGeneration();
  const effect = before.generation.batch.effects.find((row) => row.attempted);
  const value = observed(effect, effect.candidate.body);
  f.cloud.resources[effect.key] = { ...observeContent(value), ownership: 'owned' };
  await assert.rejects(
    context(f.f.root, () =>
      recover({
        store: {
          ...f.f.store,
          commitGeneration: async () => {
            throw new Error('disk write unavailable');
          },
        },
        claim: f.f.claim,
        ports: { readSnapshot: async () => f.cloud, observe: async () => value },
      })
    ),
    /disk write unavailable/
  );
  assert.equal(
    (await f.f.store.readGeneration()).manifest.payloadDigest,
    before.manifest.payloadDigest
  );
  assert.equal(f.writes(), 1);
});
test('a concurrent generation change is refused instead of overwritten', async (t) => {
  const f = await uncertain(t);
  const before = await f.f.store.readGeneration();
  await assert.rejects(
    context(f.f.root, () =>
      recover({
        store: f.f.store,
        claim: f.f.claim,
        ports: {
          readSnapshot: async () => {
            await changeGeneration(f.f, () => {});
            return f.cloud;
          },
          observe: async (effect) => observed(effect, f.cloud.resources[effect.key].body),
        },
      })
    ),
    { code: 'STORY_RECOVERY_UNAVAILABLE', reason: 'generation-race' }
  );
  const after = await f.f.store.readGeneration();
  assert.equal(after.manifest.generation, before.manifest.generation + 1);
  assert.equal(after.generation.batch.batchId, before.generation.batch.batchId);
  assert.equal(f.writes(), 1);
});
test('unfrozen dirty intent is staged rather than falsely reported clean', async (t) => {
  const { f } = await inputFor(t);
  const result = await context(f.root, () =>
    recover({
      store: f.store,
      claim: f.claim,
      ports: { readSnapshot: async () => assert.fail(), observe: async () => assert.fail() },
    })
  );
  assert.equal(result.status, 'staged');
  assert.equal(result.batch, null);
});
test('unknown outcome properties cannot carry recovery authority', async (t) => {
  const f = await uncertain(t);
  await changeGeneration(f.f, (g) => {
    g.batch.effects.find((row) => row.attempted).outcome.mintedAuthority = true;
  });
  await assert.rejects(
    context(f.f.root, () =>
      recover({
        store: f.f.store,
        claim: f.f.claim,
        ports: { readSnapshot: async () => f.cloud, observe: async () => assert.fail() },
      })
    ),
    { code: 'STORY_RECOVERY_UNAVAILABLE', reason: 'shape' }
  );
});
