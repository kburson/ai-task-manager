// @story #2039 #2066 #2067
// Journal integrity and local checkpoints; neither grants provider mutation authority.
import { createHash } from 'node:crypto';
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
import { validateManifest } from './manifest.mjs';
import { materializeBodyTemplate } from './body-template.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(json(value));
const same = (a, b) => json(a) === json(b);
function fail(reason) {
  throw Object.assign(new Error(`Story recovery journal invalid: ${reason}`), {
    code: 'STORY_RECOVERY_UNAVAILABLE',
    reason,
  });
}
function exact(value, keys, optional = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !keys.includes(key) && !optional.includes(key))
  )
    fail('shape');
}
function validateConfirmation(record, effect, batch) {
  const outcome = effect.outcome;
  if (effect.kind === 'project-field-update') {
    const field = record.generation.baseSnapshot.fields.find(
      (row) => row.fieldId === effect.target.fieldId
    );
    if (
      !field ||
      !same(field, effect.candidate) ||
      outcome.providerId !== effect.target.fieldId ||
      outcome.digest !== hash(json(field)) ||
      !same(outcome.revision, field)
    )
      fail('confirmation-drift');
    return;
  }
  const issue = effect.kind === 'issue-update';
  const id = issue ? effect.target.issueNodeId : outcome.providerId;
  if (!issue && effect.kind === 'comment-update' && id !== effect.target.commentNodeId)
    fail('confirmation-drift');
  if (effect.kind === 'comment-create' && batch.baseline.inventory.includes(id))
    fail('confirmation-drift');
  const resource = record.generation.baseSnapshot.resources[`${issue ? 'issue' : 'comment'}:${id}`];
  if (
    !resource ||
    outcome.providerId !== id ||
    outcome.digest !== resource.digest ||
    !same(outcome.revision, resource.revision)
  )
    fail('confirmation-drift');
  const body = String(record.payloads.get(resource.payloadPath));
  let candidate = effect.candidate;
  if (issue) {
    const realized = materializeBodyTemplate({
      template: batch.bodyTemplate,
      expectedDigest: hash(json(batch.bodyTemplate)),
      effects: batch.effects,
    });
    if (!same(realized, batch.realizedIssue)) fail('confirmation-drift');
    candidate = realized.candidate;
    if (record.generation.baseSnapshot.title !== candidate.title) fail('confirmation-drift');
  }
  const intended = typeof candidate === 'string' ? candidate : candidate.body;
  if (issue ? body.replace(/\s+$/, '') !== intended.replace(/\s+$/, '') : body !== intended)
    fail('confirmation-drift');
}
export function hydrateJournalSnapshot(snapshot, payloads) {
  const result = clone(snapshot);
  for (const row of Object.values(result.resources)) {
    const bytes = payloads.get(row.payloadPath);
    if (bytes === undefined || hash(bytes) !== row.digest) fail('snapshot-payload');
    row.body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      Buffer.from(bytes)
    );
    delete row.payloadPath;
  }
  return result;
}
export function validateRecoveryJournal(record) {
  const verified = validateManifest(record.manifest, {
    identity: record.generation.identity,
    payloads: record.payloads,
  });
  if (!same(verified.generation, record.generation)) fail('generation-mismatch');
  const batch = record.generation.batch;
  if (batch === null) return null;
  exact(
    batch,
    [
      'schema',
      'batchId',
      'publicationGeneration',
      'transition',
      'baseline',
      'approvedInputDigests',
      'effects',
      'bodyTemplate',
      'status',
    ],
    ['realizedIssue']
  );
  if (
    ![
      'prepared',
      'dispatching',
      'uncertain',
      'partial',
      'confirmed',
      'conflict',
      'complete',
    ].includes(batch.status) ||
    !Array.isArray(batch.effects) ||
    !batch.effects.length ||
    !same(batch.baseline.identity, record.generation.identity)
  )
    fail('batch');
  const keys = new Set(batch.effects.map((row) => row.key));
  if (keys.size !== batch.effects.length) fail('duplicate-effects');
  for (const row of batch.effects) {
    exact(row, [
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
      !same(row.target.identity, record.generation.identity) ||
      typeof row.attempted !== 'boolean' ||
      !Array.isArray(row.dependencies) ||
      row.dependencies.some((key) => !keys.has(key) || key === row.key) ||
      new Set(row.dependencies).size !== row.dependencies.length
    )
      fail('effect');
    if (!row.attempted) {
      if (row.outcome !== null) fail('unattempted-outcome');
    } else {
      if (!['dispatching', 'uncertain', 'confirmed'].includes(row.outcome?.state)) fail('outcome');
      if (row.outcome.state === 'dispatching') exact(row.outcome, ['state']);
      if (row.outcome.state === 'uncertain') {
        exact(row.outcome, ['state', 'reason']);
        if (typeof row.outcome.reason !== 'string' || !row.outcome.reason) fail('outcome');
      }
      if (
        row.dependencies.some(
          (key) => batch.effects.find((item) => item.key === key)?.outcome?.state !== 'confirmed'
        )
      )
        fail('unconfirmed-dependency');
      if (row.outcome.state === 'confirmed') {
        exact(row.outcome, ['state', 'providerId', 'digest', 'revision']);
        if (
          !/^[a-f0-9]{64}$/.test(row.outcome.digest) ||
          typeof row.outcome.providerId !== 'string'
        )
          fail('confirmation');
        validateConfirmation(record, row, batch);
      }
    }
  }
  if (
    ['confirmed', 'complete'].includes(batch.status) &&
    batch.effects.some((row) => row.outcome?.state !== 'confirmed')
  )
    fail('aggregate-state-drift');
  const { batchId, realizedIssue: ignored, ...original } = clone(batch);
  void ignored;
  original.status = 'frozen';
  original.effects = original.effects.map((row) => ({ ...row, attempted: false, outcome: null }));
  if (batchId !== `batch:${hash(json(original))}`) fail('frozen-intent-drift');
  return batch;
}
export function checkpointResource(generation, payloads, effect, confirmation) {
  const { outcome, observed, field } = confirmation;
  if (field) {
    generation.baseSnapshot.fields = generation.baseSnapshot.fields.map((row) =>
      row.fieldId === field.fieldId ? clone(field) : row
    );
    generation.baseSnapshot.fieldsDigest = hash(
      json({
        canonicalizationVersion: 'aitm.canonical-json/v1',
        fields: generation.baseSnapshot.fields,
      })
    );
  } else {
    const { body, ...resource } = observed;
    const payloadPath = `payloads/${observed.digest}.txt`;
    payloads.set(payloadPath, body);
    generation.baseSnapshot.resources[observed.key] = {
      ...clone(resource),
      ownership: 'owned',
      payloadPath,
    };
    if (
      observed.kind === 'comment' &&
      !generation.baseSnapshot.inventory.includes(outcome.providerId)
    )
      generation.baseSnapshot.inventory.push(outcome.providerId);
    generation.baseSnapshot.inventory.sort();
    if (observed.kind === 'issue') {
      generation.baseSnapshot.title = effect.candidate.title;
      generation.baseSnapshot.titleDigest = hash(effect.candidate.title);
    }
    if (effect.candidate?.schema === 'aitm.story-timing-candidate/v1') {
      generation.timing.publishedCursor = effect.candidate.timing.ingestedCursor;
      generation.timing.canonicalCommentKey = observed.key;
    }
  }
  generation.dirtyKeys = generation.dirtyKeys.filter((key) => key !== effect.key);
}
