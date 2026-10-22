// @story #2039 #2047
// Rendering only. Confirmed journal data is input, never a grant of lifecycle authority.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { observeContent } from './native-observation.mjs';
const SCHEMA = 'aitm.story-final-body-template/v1';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = canonicalRecordJson;
const clone = (value) => JSON.parse(json(value));
const same = (a, b) => json(a) === json(b);
const token = (value) =>
  typeof value === 'string' && value.length > 0 && !/[\s\p{Cc}]/u.test(value);
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function fail(reason, cause) {
  throw Object.assign(new Error(`Story batch invalid: ${reason}`, { cause }), {
    code: 'STORY_BATCH_INVALID',
    reason,
  });
}
function exact(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !same(Object.keys(value).sort(), [...keys].sort())
  )
    fail('shape');
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function binding(effect) {
  exact(effect, [
    'key',
    'kind',
    'target',
    'beforeDigest',
    'intendedDigest',
    'candidate',
    'dependencies',
    'attempted',
    'outcome',
  ]);
  if (
    !token(effect.key) ||
    !['comment-update', 'comment-create', 'project-field-update'].includes(effect.kind) ||
    !digest(effect.intendedDigest)
  )
    fail('binding');
  const { attempted, outcome, ...intent } = effect;
  void attempted;
  void outcome;
  return hash(json(intent));
}
function nonBody(effects) {
  if (
    !Array.isArray(effects) ||
    new Set(effects.map((e) => e.key)).size !== effects.length ||
    effects.filter((e) => e.kind === 'issue-update').length > 1
  )
    fail('effects');
  return effects.filter((effect) => effect.kind !== 'issue-update');
}
const slotToken = (id) => `{{aitm-slot:${id}}}`;
function checkedTemplate(template) {
  exact(template, ['schema', 'body', 'title', 'slots', 'bindings']);
  if (
    template.schema !== SCHEMA ||
    typeof template.body !== 'string' ||
    typeof template.title !== 'string' ||
    !template.title.trim() ||
    /[\r\n]/.test(template.title) ||
    template.title.includes('{{aitm-slot:') ||
    !Array.isArray(template.slots) ||
    !Array.isArray(template.bindings)
  )
    fail('template');
  const bindings = new Map();
  for (const row of template.bindings) {
    exact(row, ['key', 'digest']);
    if (!token(row.key) || !digest(row.digest) || bindings.has(row.key)) fail('bindings');
    bindings.set(row.key, row.digest);
  }
  const ids = new Set();
  for (const slot of template.slots) {
    exact(slot, ['id', 'kind', 'effectKey']);
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(slot.id) ||
      ids.has(slot.id) ||
      !['comment-id', 'effect-digest'].includes(slot.kind) ||
      !bindings.has(slot.effectKey)
    )
      fail('slot');
    ids.add(slot.id);
    if (template.body.split(slotToken(slot.id)).length !== 2) fail('slot-occurrence');
  }
  if (template.body.split('{{aitm-slot:').length - 1 !== ids.size) fail('undeclared-slot');
  return bindings;
}
/** Exact source bytes and non-body bindings; its digest is retained separately by the batch. */
export function freezeBodyTemplate(input) {
  try {
    const value = clone(input);
    exact(value, ['body', 'title', 'slots', 'effects']);
    const effects = nonBody(value.effects);
    const template = {
      schema: SCHEMA,
      body: value.body,
      title: value.title,
      slots: value.slots,
      bindings: effects
        .map((effect) => {
          if (effect.attempted !== false || effect.outcome !== null) fail('fresh-effect');
          return { key: effect.key, digest: binding(effect) };
        })
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    };
    checkedTemplate(template);
    for (const slot of template.slots) {
      const effect = effects.find((entry) => entry.key === slot.effectKey);
      if (slot.kind === 'comment-id' && effect.kind !== 'comment-create') fail('slot-kind');
    }
    return freeze(template);
  } catch (error) {
    if (error.code === 'STORY_BATCH_INVALID') throw error;
    fail('template-input', error);
  }
}
function confirm(effect) {
  const result = effect.outcome;
  exact(result, ['state', 'providerId', 'digest', 'revision']);
  if (
    effect.attempted !== true ||
    result.state !== 'confirmed' ||
    result.digest !== effect.intendedDigest ||
    !token(result.providerId)
  )
    fail('unconfirmed-effect');
  if (effect.kind === 'project-field-update') {
    exact(result.revision, ['itemId', 'fieldId', 'type', 'value']);
    if (
      result.providerId !== effect.target.fieldId ||
      !same(result.revision, effect.candidate) ||
      hash(json(effect.candidate)) !== result.digest
    )
      fail('field-confirmation');
    return;
  }
  if (!['comment-update', 'comment-create'].includes(effect.kind)) fail('unsupported-confirmation');
  if (effect.kind === 'comment-update' && result.providerId !== effect.target.commentNodeId)
    fail('provider-id');
  const body = typeof effect.candidate === 'string' ? effect.candidate : effect.candidate.body;
  const revision = result.revision;
  exact(revision, ['mode', 'editId', 'editedAt', 'lastEditedAt', 'deletedAt']);
  if (!['unedited', 'edited'].includes(revision.mode)) fail('revision');
  const node = {
    __typename: 'IssueComment',
    id: result.providerId,
    lastEditedAt: revision.lastEditedAt,
    includesCreatedEdit: false,
    userContentEdits:
      revision.mode === 'unedited'
        ? { totalCount: 0, nodes: [] }
        : {
            totalCount: 1,
            nodes: [
              { id: revision.editId, editedAt: revision.editedAt, deletedAt: revision.deletedAt },
            ],
          },
  };
  const observed = observeContent({ identity: effect.target.identity, node, body });
  if (observed.digest !== result.digest || !same(observed.revision, revision))
    fail('confirmation-content');
}
/** The expected digest must come from the original persisted batch, not edited template bytes. */
export function materializeBodyTemplate(input) {
  try {
    const value = clone(input);
    exact(value, ['template', 'expectedDigest', 'effects']);
    const { template, expectedDigest } = value;
    if (!digest(expectedDigest) || hash(json(template)) !== expectedDigest) fail('template-drift');
    const bindings = checkedTemplate(template);
    const effects = nonBody(value.effects);
    if (effects.length !== bindings.size) fail('required-results');
    for (const effect of effects) {
      if (binding(effect) !== bindings.get(effect.key)) fail('effect-drift');
      confirm(effect);
    }
    let body = template.body;
    // One pass over frozen source tokens: replacement bytes cannot introduce another substitution.
    const replacements = new Map(
      template.slots.map((slot) => {
        const effect = effects.find((entry) => entry.key === slot.effectKey);
        if (slot.kind === 'comment-id' && effect.kind !== 'comment-create') fail('slot-kind');
        return [
          slotToken(slot.id),
          slot.kind === 'comment-id' ? effect.outcome.providerId : effect.outcome.digest,
        ];
      })
    );
    body = body.replace(/\{\{aitm-slot:[a-z][a-z0-9-]{0,63}\}\}/g, (match) =>
      replacements.get(match)
    );
    return freeze({
      candidate: { schema: 'aitm.story-issue-update/v1', body, title: template.title },
      intendedDigest: hash(body),
    });
  } catch (error) {
    if (error.code === 'STORY_BATCH_INVALID') throw error;
    fail('template-realization', error);
  }
}
