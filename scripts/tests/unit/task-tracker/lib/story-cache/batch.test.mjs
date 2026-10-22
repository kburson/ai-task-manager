// @story #2039 #2047
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  finishReviewedCaptureBootstrap,
  reviewedOperation,
} from '../../../../helpers/story-batch-reviewed-fixture.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
} from '../../../../../task-tracker/lib/github-records/record-envelope.mjs';
import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import {
  test,
  identity,
  hash,
  transition,
  changeGeneration,
} from '../../../../helpers/story-timing-candidate-fixture.mjs';
import {
  inputFor,
  creation,
  templateInput,
  extraEffectInput,
  setComment,
  updateComment,
  fieldRow,
  fieldEffect,
  fieldInput,
  setIssue,
} from '../../../../helpers/story-batch-fixture.mjs';
const adapter = await import('../../../../../task-tracker/lib/story-cache/batch.mjs').catch(
  (error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  }
);
finishReviewedCaptureBootstrap();

function freeze(input) {
  assert.equal(typeof adapter.freezeStoryBatch, 'function', 'frozen story batch is missing');
  return adapter.freezeStoryBatch(input);
}
// A fresh clock, a changed baseline or a premature final-body digest breaks the frozen contract.
test('freezes the exact issue and native timing intents as one immutable publication generation', async (t) => {
  const { f, input } = await inputFor(t);
  const before = canonicalRecordJson(input.generation.generation);
  t.mock.method(Date, 'now', () => {
    throw new Error('batch cannot sample a clock');
  });
  const batch = freeze(input);
  assert.equal(batch.schema, 'aitm.story-publication-batch/v1');
  assert.equal(batch.publicationGeneration, 1);
  assert.deepEqual(batch.transition, transition);
  assert.deepEqual(batch.baseline, input.generation.generation.baseSnapshot);
  assert.deepEqual(
    batch.effects.map((effect) => effect.key),
    ['comment:C_timing', 'issue:I_test']
  );
  assert.equal(batch.effects[1].intendedDigest, null);
  assert.equal(batch.bodyTemplate.body, 'private unpublished body');
  assert.deepEqual(batch.bodyTemplate.slots, []);
  assert.equal(batch.status, 'frozen');
  assert.ok(Object.isFrozen(batch));
  assert.ok(Object.isFrozen(batch.effects[0].candidate.timing.events));
  assert.throws(() => {
    batch.baseline.inventory.push('foreign');
  });
  assert.equal(canonicalRecordJson(input.generation.generation), before);
  assert.deepEqual(await f.store.readGeneration(), input.generation);
  assert.deepEqual(freeze(input), batch);
});

const templates =
  await import('../../../../../task-tracker/lib/story-cache/body-template.mjs').catch((error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  });
const invalid = (e) => e.code === 'STORY_BATCH_INVALID';

test('missing dirty effects or unpublished timing cannot disappear from the frozen resource manifest', async (t) => {
  const { input } = await inputFor(t);
  assert.throws(() => freeze({ ...input, effects: input.effects.slice(1) }), invalid);
  const issue = structuredClone(input.effects[0]);
  issue.dependencies = [];
  assert.throws(() => freeze({ ...input, effects: [issue] }), invalid);
});

test('foreign identities, changed exact candidate bytes and fabricated before digests refuse', async (t) => {
  const { input } = await inputFor(t);
  for (const change of [
    (effect) => {
      effect.target.identity.issueNumber = 99;
    },
    (effect) => {
      effect.beforeDigest = '0'.repeat(64);
    },
    (effect) => {
      effect.intendedDigest = '0'.repeat(64);
    },
    (effect) => {
      effect.candidate.body += 'late edit';
      effect.intendedDigest = hash(effect.candidate.body);
    },
    (effect) => {
      effect.attempted = true;
    },
    (effect) => {
      effect.outcome = { state: 'confirmed' };
    },
  ]) {
    const effects = structuredClone(input.effects);
    change(effects[0]);
    assert.throws(() => freeze({ ...input, effects }), invalid);
  }
});

test('duplicate effects and self or undeclared dependencies refuse before allocation', async (t) => {
  const { input } = await inputFor(t);
  assert.throws(() => freeze({ ...input, effects: [...input.effects, input.effects[1]] }), invalid);
  for (const dependency of ['issue:I_test', 'comment:undeclared']) {
    const effects = structuredClone(input.effects);
    effects[0].dependencies.push(dependency);
    assert.throws(() => freeze({ ...input, effects }), invalid);
  }
});

test('a disconnected operation chain or serialized permission flag cannot approve the final body', async (t) => {
  const { input } = await inputFor(t);
  for (const capabilities of [
    [],
    true,
    [{ base: 'different', candidate: 'private unpublished body' }],
    [
      {
        base: 'base story',
        candidate: 'private unpublished body',
        capability: { allowUnverifiedTicks: true },
      },
    ],
  ]) {
    assert.throws(() => freeze({ ...input, capabilities }), invalid);
  }
});

function freezeTemplate(input) {
  assert.equal(typeof templates.freezeBodyTemplate, 'function', 'frozen body template is missing');
  return templates.freezeBodyTemplate(input);
}
function realize(template, effects) {
  assert.equal(
    typeof templates.materializeBodyTemplate,
    'function',
    'verified slot materialization is missing'
  );
  return templates.materializeBodyTemplate({
    template,
    expectedDigest: hash(canonicalRecordJson(template)),
    effects,
  });
}
// Altering an undeclared character or substituting an unconfirmed ID must fail.
test('materializes only declared verified IDs and non-body digests while retaining every other byte', () => {
  const input = templateInput();
  const before = structuredClone(input);
  const template = freezeTemplate(input);
  assert.ok(Object.isFrozen(template.slots[0]));
  assert.deepEqual(input, before);
  const effect = creation();
  effect.attempted = true;
  effect.outcome = {
    state: 'confirmed',
    providerId: 'IC_created',
    digest: effect.intendedDigest,
    revision: {
      mode: 'unedited',
      editId: null,
      editedAt: null,
      lastEditedAt: null,
      deletedAt: null,
    },
  };
  const result = realize(template, [effect]);
  assert.equal(
    result.candidate.body,
    'Created IC_created digest ' + hash(effect.candidate) + '  \n\n'
  );
  assert.equal(result.candidate.title, 'Title');
  assert.equal(result.intendedDigest, hash(result.candidate.body));
  assert.ok(Object.isFrozen(result.candidate));
});

test('ambiguous, missing, undeclared and final-body digest slots cannot enter a template', () => {
  for (const change of [
    (v) => {
      v.body += '{{aitm-slot:id}}';
    },
    (v) => {
      v.slots.pop();
    },
    (v) => {
      v.slots[0].effectKey = 'comment:foreign';
    },
    (v) => {
      v.slots[0].kind = 'arbitrary-text';
    },
    (v) => {
      v.effects[0].kind = 'issue-update';
    },
    (v) => {
      v.slots.push({ id: 'unused', kind: 'comment-id', effectKey: 'comment:new:note' });
    },
  ]) {
    const input = templateInput();
    change(input);
    assert.throws(() => freezeTemplate(input), invalid);
  }
});

test('uncertain, wrong-digest or foreign confirmed outcomes cannot fill a frozen slot', () => {
  const template = freezeTemplate(templateInput());
  for (const change of [
    (v) => {
      v.outcome.state = 'uncertain';
    },
    (v) => {
      v.outcome.digest = '0'.repeat(64);
    },
    (v) => {
      v.target.identity.issueNumber = 99;
    },
    (v) => {
      v.candidate += 'changed';
    },
    (v) => {
      v.outcome.providerId = '';
    },
  ]) {
    const effect = creation();
    effect.attempted = true;
    effect.outcome = {
      state: 'confirmed',
      providerId: 'IC_created',
      digest: effect.intendedDigest,
      revision: {
        mode: 'unedited',
        editId: null,
        editedAt: null,
        lastEditedAt: null,
        deletedAt: null,
      },
    };
    change(effect);
    assert.throws(() => realize(template, [effect]), invalid);
  }
  assert.throws(() => realize(template, []), invalid);
});

test('the separately frozen template digest rejects late body, title or slot edits', () => {
  const template = freezeTemplate(templateInput());
  const expectedDigest = hash(canonicalRecordJson(template));
  for (const change of [
    (v) => {
      v.body += 'late discretionary edit';
    },
    (v) => {
      v.title = 'Different title';
    },
    (v) => {
      v.slots[0].effectKey = 'comment:new:foreign';
    },
  ]) {
    const altered = structuredClone(template);
    change(altered);
    assert.throws(
      () => templates.materializeBodyTemplate({ template: altered, expectedDigest, effects: [] }),
      invalid
    );
  }
});

test('a frozen batch binds staged creation slots and requires every non-body result before realization', async (t) => {
  const { f } = await inputFor(t);
  const body = 'private unpublished body\nCreated {{aitm-slot:id}} digest {{aitm-slot:digest}}';
  const note = creation();
  await changeGeneration(f, (g, payloads) => {
    const raw = canonicalRecordJson({ schema: 'aitm.story-issue-update/v1', body, title: 'Title' });
    payloads.set('working/slot-body.json', raw);
    g.working['issue:I_test'] = {
      payloadPath: 'working/slot-body.json',
      digest: hash(raw),
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
    g.dirtyKeys = ['comment:new:note', 'issue:I_test'];
  });
  const record = await f.store.readGeneration();
  const timing = await f.freeze();
  const input = {
    generation: record,
    transition,
    effects: [
      {
        key: 'issue:I_test',
        kind: 'issue-update',
        target: { identity: { ...identity }, issueNodeId: 'I_test' },
        beforeDigest: record.generation.baseSnapshot.resources['issue:I_test'].digest,
        intendedDigest: null,
        candidate: {
          schema: 'aitm.story-final-body-template/v1',
          body,
          title: 'Title',
          slots: templateInput().slots,
        },
        dependencies: [timing.key, note.key].sort(),
        attempted: false,
        outcome: null,
      },
      note,
      timing,
    ],
    capabilities: [{ base: 'base story', candidate: body }],
  };
  const batch = freeze(input);
  const digest = hash(canonicalRecordJson(batch.bodyTemplate));
  assert.ok(batch.approvedInputDigests.includes(digest));
  assert.equal(batch.effects.at(-1).intendedDigest, null);
  const confirmed = batch.effects
    .filter((effect) => effect.kind !== 'issue-update')
    .map((effect) => {
      const result = structuredClone(effect);
      result.attempted = true;
      result.outcome = {
        state: 'confirmed',
        providerId: effect.kind === 'comment-create' ? 'IC_created' : 'C_timing',
        digest: effect.intendedDigest,
        revision: {
          mode: 'unedited',
          editId: null,
          editedAt: null,
          lastEditedAt: null,
          deletedAt: null,
        },
      };
      return result;
    });
  assert.throws(
    () =>
      realize(
        batch.bodyTemplate,
        confirmed.filter((effect) => effect.key !== timing.key)
      ),
    invalid
  );
  const result = templates.materializeBodyTemplate({
    template: batch.bodyTemplate,
    expectedDigest: digest,
    effects: confirmed,
  });
  assert.equal(
    result.candidate.body,
    'private unpublished body\nCreated IC_created digest ' + note.intendedDigest
  );
});

for (const nativeRecord of [false, true])
  test(`freezes an existing native owned ${nativeRecord ? 'record envelope' : 'comment'} without adopting foreign content`, async (t) => {
    const envelope = createAitmRecordEnvelope({
      recordType: 'audit-note',
      repository: identity.repository,
      issue: identity.issueNumber,
      payload: { note: 'retained native record' },
      actor: 'tester',
      recordId: '01J00000000000000000000001',
      grantId: '01J00000000000000000000002',
      createdAt: '2026-10-19T00:00:00.000Z',
    });
    const render = (text) =>
      nativeRecord
        ? renderAitmRecord({ envelope, visibleMarkdown: text })
        : text + '\n\n<!-- aitm-owned-comment key="batch.note" -->';
    const before = render('Original');
    const after = render('Updated narrative');
    const effect = updateComment(before, after);
    const { input } = await extraEffectInput(t, effect, (g, p) => setComment(g, p, before, after));
    const batch = freeze(input);
    assert.equal(batch.effects.find((e) => e.key === effect.key).candidate, after);
    assert.equal(batch.baseline.resources[effect.key].ownership, 'read-only');
    const changed = structuredClone(effect);
    changed.candidate = 'Foreign content';
    changed.intendedDigest = hash(changed.candidate);
    assert.throws(
      () =>
        freeze({
          ...input,
          effects: input.effects.map((e) => (e.key === changed.key ? changed : e)),
        }),
      invalid
    );
  });

for (const value of [2, null, { state: 'absent' }])
  test(`freezes a typed configured field while preserving ${JSON.stringify(value)}`, async (t) => {
    const { input } = await fieldInput(t, value);
    const batch = freeze(input);
    const field = batch.effects.find((e) => e.kind === 'project-field-update');
    assert.deepEqual(field.candidate, fieldRow(value));
    const confirmed = batch.effects
      .filter((e) => e.kind !== 'issue-update')
      .map((effect) => {
        const e = structuredClone(effect);
        e.attempted = true;
        e.outcome = {
          state: 'confirmed',
          providerId: e.kind === 'project-field-update' ? 'F_count' : 'C_timing',
          digest: e.intendedDigest,
          revision:
            e.kind === 'project-field-update'
              ? e.candidate
              : {
                  mode: 'unedited',
                  editId: null,
                  editedAt: null,
                  lastEditedAt: null,
                  deletedAt: null,
                },
        };
        return e;
      });
    assert.equal(realize(batch.bodyTemplate, confirmed).candidate.body, 'private unpublished body');
    const wrong = structuredClone(input.effects);
    wrong.find((e) => e.kind === 'project-field-update').target.itemId = 'PI_foreign';
    assert.throws(() => freeze({ ...input, effects: wrong }), invalid);
  });

test('conflicts and a persisted pending batch cannot allocate another publication generation', async (t) => {
  const { f, input } = await inputFor(t);
  const batch = freeze(input);
  await changeGeneration(f, (g) => {
    g.batch = structuredClone(batch);
    g.publicationGeneration = 1;
  });
  const pending = await f.store.readGeneration();
  assert.throws(() => freeze({ ...input, generation: pending }), invalid);
  assert.deepEqual(await f.store.readGeneration(), pending);
  await changeGeneration(f, (g) => {
    g.batch = null;
    g.conflicts = [{ reason: 'external change' }];
  });
  const conflicted = await f.store.readGeneration();
  assert.throws(() => freeze({ ...input, generation: conflicted }), invalid);
});

test('retains a genuinely minted native scope capability for validation without serializing its authority', async (t) => {
  const operation = await reviewedOperation(t.unitRoot);
  const { f, input } = await inputFor(t);
  await changeGeneration(f, (g, payloads) =>
    setIssue(g, payloads, operation.base, operation.candidate)
  );
  input.generation = await f.store.readGeneration();
  const issue = structuredClone(input.effects[0]);
  issue.beforeDigest = hash(operation.base);
  issue.intendedDigest = hash(operation.candidate);
  issue.candidate.body = operation.candidate;
  input.effects = [issue, await f.freeze()];
  input.capabilities = [operation];
  const originalCapability = operation.capability.reviewedEvidenceCapability;
  const batch = freeze(input);
  assert.equal(batch.bodyTemplate.body, operation.candidate);
  assert.equal(operation.capability.reviewedEvidenceCapability, originalCapability);
  assert.doesNotThrow(() => canonicalRecordJson(batch));
  assert.equal(Object.hasOwn(batch, 'capabilities'), false);
  assert.ok(batch.approvedInputDigests.every((value) => /^[a-f0-9]{64}$/.test(value)));
  assert.throws(
    () =>
      freeze({
        ...input,
        capabilities: [{ ...operation, capability: { reviewedEvidenceCapability: {} } }],
      }),
    invalid
  );
});

test('untrusted generation accessors cannot run during intent freezing', async (t) => {
  const { input } = await inputFor(t);
  let reads = 0;
  const record = { ...input.generation };
  Object.defineProperty(record, 'payloads', {
    enumerable: true,
    get() {
      reads++;
      return input.generation.payloads;
    },
  });
  assert.throws(() => freeze({ ...input, generation: record }), invalid);
  assert.equal(reads, 0);
});

test('typed field corruption refuses while retaining exact local bytes', async (t) => {
  const { f, input } = await fieldInput(t, 2);
  for (const value of ['2', { state: 'unknown' }]) {
    const effect = fieldEffect(value);
    await changeGeneration(f, (g, payloads) => {
      const raw = canonicalRecordJson(effect.candidate);
      payloads.set('working/bad-field.json', raw);
      g.working[effect.key] = {
        payloadPath: 'working/bad-field.json',
        digest: hash(raw),
        kind: 'project-field',
        capabilityRef: null,
      };
    });
    const before = await f.store.readGeneration();
    const effects = input.effects.map((e) => (e.kind === 'project-field-update' ? effect : e));
    assert.throws(() => freeze({ ...input, generation: before, effects }), invalid);
    assert.deepEqual(await f.store.readGeneration(), before);
  }
});

test('a genuine dependency cycle among declared owned effects refuses before publication', async (t) => {
  const { f, input } = await inputFor(t);
  const first = creation();
  const second = creation();
  first.key = 'comment:new:one';
  first.target.creationIntent = 'one';
  first.candidate = first.candidate.replace('batch.note', 'batch.one');
  first.intendedDigest = hash(first.candidate);
  second.key = 'comment:new:two';
  second.target.creationIntent = 'two';
  second.candidate = second.candidate.replace('batch.note', 'batch.two');
  second.intendedDigest = hash(second.candidate);
  first.dependencies = [second.key];
  second.dependencies = [first.key];
  await changeGeneration(f, (g, payloads) => {
    for (const effect of [first, second]) {
      const payloadPath = 'working/' + effect.target.creationIntent + '.md';
      payloads.set(payloadPath, effect.candidate);
      g.working[effect.key] = {
        payloadPath,
        digest: effect.intendedDigest,
        kind: 'comment',
        capabilityRef: null,
      };
      g.dirtyKeys.push(effect.key);
    }
    g.dirtyKeys.sort();
  });
  const issue = structuredClone(input.effects[0]);
  const timing = await f.freeze();
  issue.dependencies = [first.key, second.key, timing.key].sort();
  const record = await f.store.readGeneration();
  assert.throws(
    () => freeze({ ...input, generation: record, effects: [issue, first, second, timing] }),
    (e) => invalid(e) && e.reason === 'dependency-cycle'
  );
  assert.deepEqual(await f.store.readGeneration(), record);
});

test('batch persistence and the real timing acknowledgement remain transport-free and independently pending', async (t) => {
  const { f, input } = await inputFor(t);
  const marker = path.join(t.unitRoot, 'transport-attempt');
  fs.writeFileSync(
    path.join(t.unitRoot, 'gh'),
    '#!/bin/sh\nprintf attempted > "$AITM_BATCH_TEST_MARKER"\nexit 91\n',
    { mode: 0o700 }
  );
  const priorPath = process.env.PATH;
  const priorMarker = process.env.AITM_BATCH_TEST_MARKER;
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', () => {
    fetches++;
    throw new Error('transport forbidden');
  });
  process.env.PATH = t.unitRoot + path.delimiter + priorPath;
  process.env.AITM_BATCH_TEST_MARKER = marker;
  try {
    const batch = freeze(input);
    const timing = batch.effects.find(
      (effect) => effect.candidate?.schema === 'aitm.story-timing-candidate/v1'
    );
    await changeGeneration(f, (g) => {
      g.publicationGeneration = batch.publicationGeneration;
      g.batch = structuredClone(batch);
      g.batch.effects.find((effect) => effect.key === timing.key).attempted = true;
    });
    const confirmed = await f.confirm(timing, f.observation(timing), { batchId: batch.batchId });
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(confirmed.batchStatus, 'frozen');
    const record = await f.store.readGeneration();
    assert.equal(record.generation.timing.publishedCursor, 'native-a-entry');
    assert.equal(
      record.generation.batch.effects.find((effect) => effect.kind === 'issue-update').outcome,
      null
    );
    const result = realize(record.generation.batch.bodyTemplate, record.generation.batch.effects);
    assert.equal(result.candidate.body, 'private unpublished body');
    assert.equal(record.generation.batch.status, 'frozen');
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fetches, 0);
  } finally {
    process.env.PATH = priorPath;
    if (priorMarker === undefined) delete process.env.AITM_BATCH_TEST_MARKER;
    else process.env.AITM_BATCH_TEST_MARKER = priorMarker;
  }
});

test('the input map is snapshotted without invoking an overridden iterator', async (t) => {
  const { input } = await inputFor(t);
  const payloads = new Map(input.generation.payloads);
  let iterations = 0;
  payloads[Symbol.iterator] = function () {
    iterations++;
    return Map.prototype.entries.call(this);
  };
  const batch = freeze({ ...input, generation: { ...input.generation, payloads } });
  assert.equal(batch.status, 'frozen');
  assert.equal(iterations, 0);
});

for (const [type, value] of [
  ['TEXT', 'New text'],
  ['DATE', '2026-10-22'],
  ['SINGLE_SELECT', { optionId: 'OPT_ready', name: 'Ready' }],
  ['ITERATION', 'ITER_next'],
])
  test(`retains the native ${type} field value and target identity`, async (t) => {
    const { input } = await fieldInput(t, value, type);
    const batch = freeze(input);
    assert.deepEqual(
      batch.effects.find((effect) => effect.kind === 'project-field-update').candidate,
      fieldRow(value, type)
    );
  });

test('an unconfigured project field cannot acquire a publication effect', async (t) => {
  const { f, input } = await fieldInput(t, 2);
  const effect = fieldEffect(2);
  const originalKey = effect.key;
  effect.key = 'project-field:PI_test:F_missing';
  effect.target.fieldId = 'F_missing';
  effect.candidate.fieldId = 'F_missing';
  effect.intendedDigest = hash(canonicalRecordJson(effect.candidate));
  await changeGeneration(f, (g, payloads) => {
    delete g.working[originalKey];
    const raw = canonicalRecordJson(effect.candidate);
    payloads.set('working/unconfigured.json', raw);
    g.working[effect.key] = {
      payloadPath: 'working/unconfigured.json',
      digest: hash(raw),
      kind: 'project-field',
      capabilityRef: null,
    };
    g.dirtyKeys = g.dirtyKeys.filter((key) => key !== originalKey);
    g.dirtyKeys.push(effect.key);
    g.dirtyKeys.sort();
  });
  const issue = structuredClone(input.effects[0]);
  const timing = await f.freeze();
  issue.dependencies = [effect.key, timing.key].sort();
  const record = await f.store.readGeneration();
  assert.throws(
    () => freeze({ ...input, generation: record, effects: [issue, effect, timing] }),
    (e) => invalid(e) && e.reason === 'field-intent'
  );
  assert.deepEqual(await f.store.readGeneration(), record);
});

test('a staged title is frozen in the same issue effect and changes the immutable intent identity', async (t) => {
  const { f, input } = await inputFor(t);
  const original = freeze(input);
  const candidate = { ...input.effects[0].candidate, title: 'Renamed story' };
  await changeGeneration(f, (g, payloads) => {
    const raw = canonicalRecordJson(candidate);
    payloads.set('working/title.json', raw);
    g.working['issue:I_test'] = {
      payloadPath: 'working/title.json',
      digest: hash(raw),
      kind: 'issue',
      capabilityRef: null,
    };
  });
  const issue = { ...structuredClone(input.effects[0]), candidate };
  const batch = freeze({
    ...input,
    generation: await f.store.readGeneration(),
    effects: [issue, await f.freeze()],
  });
  assert.equal(batch.bodyTemplate.title, 'Renamed story');
  assert.equal(batch.effects.filter((effect) => effect.kind === 'issue-update').length, 1);
  assert.equal(batch.publicationGeneration, original.publicationGeneration);
  assert.notEqual(batch.batchId, original.batchId);
  assert.equal(batch.baseline.title, 'Title');
});
