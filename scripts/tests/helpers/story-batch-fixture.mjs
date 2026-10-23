// @story #2039 #2047
// Test-only durable fixtures. Native proof minting uses explicit synthetic offline ports.
import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import { observeContent } from '../../task-tracker/lib/story-cache/native-observation.mjs';
import {
  fixture,
  identity,
  hash,
  transition,
  changeGeneration,
} from './story-timing-candidate-fixture.mjs';
const read = (record, ref) => String(record.payloads.get(ref.payloadPath));
export async function inputFor(t) {
  const f = await fixture(t);
  const record = await f.store.readGeneration();
  const key = 'issue:I_test';
  const body = read(record, record.generation.working[key]);
  const timing = await f.freeze();
  const issue = {
    key,
    kind: 'issue-update',
    target: { identity: { ...identity }, issueNodeId: 'I_test' },
    beforeDigest: record.generation.baseSnapshot.resources[key].digest,
    intendedDigest: hash(body),
    candidate: { schema: 'aitm.story-issue-update/v1', body, title: 'Title' },
    dependencies: [timing.key],
    attempted: false,
    outcome: null,
  };
  return {
    f,
    input: {
      generation: record,
      transition,
      effects: [issue, timing],
      capabilities: [{ base: 'base story', candidate: body }],
    },
  };
}
export function creation() {
  const body = 'Created record\n\n<!-- aitm-owned-comment key="batch.note" -->';
  return {
    key: 'comment:new:note',
    kind: 'comment-create',
    target: { identity: { ...identity }, commentNodeId: null, creationIntent: 'note' },
    beforeDigest: null,
    intendedDigest: hash(body),
    candidate: body,
    dependencies: [],
    attempted: false,
    outcome: null,
  };
}
export function templateInput() {
  return {
    body: 'Created {{aitm-slot:id}} digest {{aitm-slot:digest}}  \n\n',
    title: 'Title',
    slots: [
      { id: 'id', kind: 'comment-id', effectKey: 'comment:new:note' },
      { id: 'digest', kind: 'effect-digest', effectKey: 'comment:new:note' },
    ],
    effects: [creation()],
  };
}
export async function extraEffectInput(t, effect, edit) {
  const { f, input } = await inputFor(t);
  await changeGeneration(f, edit);
  input.generation = await f.store.readGeneration();
  const timing = await f.freeze();
  const issue = structuredClone(input.effects[0]);
  issue.dependencies = [effect.key, timing.key].sort();
  input.effects = [issue, effect, timing];
  return { f, input };
}
export function setComment(g, payloads, before, after) {
  const { body: ignored, ...observed } = observeContent({
    identity,
    node: {
      id: 'IC_note',
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body: before,
  });
  void ignored;
  payloads.set('base/note.md', before);
  g.baseSnapshot.resources['comment:IC_note'] = { ...observed, payloadPath: 'base/note.md' };
  g.baseSnapshot.inventory.push('IC_note');
  g.baseSnapshot.inventory.sort();
  payloads.set('working/note.md', after);
  g.working['comment:IC_note'] = {
    payloadPath: 'working/note.md',
    digest: hash(after),
    kind: 'comment',
    capabilityRef: null,
  };
  g.dirtyKeys.push('comment:IC_note');
  g.dirtyKeys.sort();
}
export function updateComment(before, after) {
  return {
    key: 'comment:IC_note',
    kind: 'comment-update',
    target: { identity: { ...identity }, commentNodeId: 'IC_note', creationIntent: null },
    beforeDigest: hash(before),
    intendedDigest: hash(after),
    candidate: after,
    dependencies: [],
    attempted: false,
    outcome: null,
  };
}
const fieldInitial = {
  NUMBER: 1,
  TEXT: 'old',
  DATE: '2026-10-01',
  SINGLE_SELECT: { optionId: 'OPT_old', name: 'Old' },
  ITERATION: 'ITER_old',
};
export function fieldRow(value, type = 'NUMBER') {
  return { itemId: 'PI_test', fieldId: 'F_count', type, value };
}
export function fieldEffect(value, type = 'NUMBER') {
  const candidate = fieldRow(value, type);
  return {
    key: 'project-field:PI_test:F_count',
    kind: 'project-field-update',
    target: {
      identity: { ...identity },
      projectId: 'P_test',
      itemId: 'PI_test',
      fieldId: 'F_count',
      type,
    },
    beforeDigest: hash(canonicalRecordJson(fieldRow(fieldInitial[type], type))),
    intendedDigest: hash(canonicalRecordJson(candidate)),
    candidate,
    dependencies: [],
    attempted: false,
    outcome: null,
  };
}
export async function fieldInput(t, value, type = 'NUMBER') {
  const effect = fieldEffect(value, type);
  return extraEffectInput(t, effect, (g, payloads) => {
    g.baseSnapshot.fields = [fieldRow(fieldInitial[type], type)];
    g.baseSnapshot.fieldsDigest = hash(
      canonicalRecordJson({
        canonicalizationVersion: 'aitm.canonical-json/v1',
        fields: g.baseSnapshot.fields,
      })
    );
    const raw = canonicalRecordJson(effect.candidate);
    payloads.set('working/field.json', raw);
    g.working[effect.key] = {
      payloadPath: 'working/field.json',
      digest: hash(raw),
      kind: 'project-field',
      capabilityRef: null,
    };
    g.dirtyKeys.push(effect.key);
    g.dirtyKeys.sort();
  });
}

export function setIssue(g, payloads, base, candidate) {
  const { body: ignored, ...observed } = observeContent({
    identity,
    node: {
      id: 'I_test',
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body: base,
  });
  void ignored;
  payloads.set('base/proof.md', base);
  g.baseSnapshot.resources['issue:I_test'] = { ...observed, payloadPath: 'base/proof.md' };
  payloads.set('working/proof.md', candidate);
  g.working['issue:I_test'] = {
    payloadPath: 'working/proof.md',
    digest: hash(candidate),
    kind: 'issue',
    capabilityRef: null,
  };
}
