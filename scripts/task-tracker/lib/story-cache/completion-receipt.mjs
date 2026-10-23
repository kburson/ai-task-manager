// @story #2039 #2048
// Pure evidence validation, never publication, freshness or lifecycle authority.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
import { validateManifest } from './manifest.mjs';
import { mergeTimingEvents } from './timing-events.mjs';
import { validateExecutableTransition } from '../lifecycle-policy/executable-transitions.mjs';
import { assertTimingActorKey } from '../timing-actor.mjs';
import { resolvePhaseEvent } from '../../phase-events.mjs';
import { renderTimingEventBatch } from '../../gh-timing-comment.mjs';
import { parseTimingRow } from '../timing-row-reader.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
const same = (a, b) => json(a) === json(b);
const token = (v) => typeof v === 'string' && v.length > 0 && !/[\s\p{Cc}]/u.test(v);
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function fail(reason, unconfirmed = false) {
  throw Object.assign(new Error(`Story completion receipt invalid: ${reason}`), {
    code: unconfirmed ? 'STORY_COMPLETION_UNCONFIRMED' : 'STORY_COMPLETION_INVALID',
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
function frozen(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) frozen(v);
    Object.freeze(value);
  }
  return value;
}
function move(value) {
  exact(value, ['id', 'from', 'to', 'actorId', 'visit']);
  const edge = validateExecutableTransition(value.from, value.to);
  if (
    !token(value.id) ||
    !edge.ok ||
    edge.noop ||
    !Number.isSafeInteger(value.visit) ||
    value.visit < 1
  )
    fail('transition');
  assertTimingActorKey(value.actorId);
}
function pair(events, transition) {
  move(transition);
  const rows = events.filter((e) => e.transitionId === transition.id);
  const exit = rows.filter(
    (e) => e.event === resolvePhaseEvent({ state: transition.from, phase: 'complete' })?.event
  );
  const entry = rows.filter(
    (e) => e.event === resolvePhaseEvent({ state: transition.to, phase: 'enter' })?.event
  );
  if (
    rows.length !== 2 ||
    exit.length !== 1 ||
    entry.length !== 1 ||
    rows.some((e) => e.actorId !== transition.actorId) ||
    exit[0].timestamp !== entry[0].timestamp ||
    entry[0].activeSeconds !== 0 ||
    entry[0].idleSeconds !== 0
  )
    fail('transition-pair');
  return exit[0].eventId;
}
function eventRecord(body) {
  if (typeof body !== 'string' || !body.isWellFormed() || Buffer.byteLength(body) > 65536)
    fail('timing-body');
  const matches = [
    ...body.matchAll(/\n<!-- aitm-timing-events:v1 encoding=gzip payload=([A-Za-z0-9_-]+) -->\n$/g),
  ];
  if (matches.length !== 1 || body.split('aitm-timing-events:').length !== 2)
    fail('native-timing-record-missing');
  const match = matches[0];
  const compressed = Buffer.from(match[1], 'base64url');
  if (compressed.toString('base64url') !== match[1]) fail('encoding');
  const bytes = gunzipSync(compressed, { maxOutputLength: 4 * 1024 * 1024 });
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const record = JSON.parse(raw);
  exact(record, ['schema', 'events', 'cursor', 'transitions', 'tableDigest']);
  if (
    json(record) !== raw ||
    record.schema !== 'aitm.story-timing-events/v1' ||
    !token(record.cursor) ||
    !same(mergeTimingEvents(record.events, []), record.events) ||
    !Array.isArray(record.transitions) ||
    new Set(record.transitions.map((v) => v.id)).size !== record.transitions.length
  )
    fail('native-timing-record');
  const table = body.slice(0, match.index);
  if (hash(table) !== record.tableDigest) fail('timing-table-digest');
  const expectedRows = [];
  for (const transition of record.transitions) {
    const exitEventId = pair(record.events, transition);
    expectedRows.push(
      ...renderTimingEventBatch({
        timingBody: '',
        events: record.events.filter((e) => e.transitionId === transition.id),
        exitEventId,
      })
        .split('\n')
        .filter((line) => parseTimingRow(line)?.actorKey)
    );
  }
  if (
    record.events.some(
      (e) => e.transitionId !== null && !record.transitions.some((m) => m.id === e.transitionId)
    )
  )
    fail('undeclared-transition');
  const actualRows = table.split('\n').filter((line) => parseTimingRow(line)?.actorKey);
  // Match the predecessor: retain unrelated historical actor rows without minting proof.
  for (const row of new Set(expectedRows))
    if (
      actualRows.filter((line) => line === row).length !==
      expectedRows.filter((line) => line === row).length
    )
      fail('timing-table-correspondence');
  return record;
}
function timingEffect(effect) {
  exact(effect.candidate, ['schema', 'body', 'timing']);
  const c = effect.candidate;
  const t = c.timing;
  exact(t, [
    'transition',
    'sourceEvents',
    'events',
    'eventIds',
    'eventsDigest',
    'ingestedCursor',
    'publishedCursor',
    'canonicalCommentKey',
  ]);
  const record = eventRecord(c.body);
  if (
    c.schema !== 'aitm.story-timing-candidate/v1' ||
    !same(record.events, t.sourceEvents) ||
    record.cursor !== t.ingestedCursor ||
    !same(mergeTimingEvents(t.events, []), t.events) ||
    !same(t.eventIds, t.events.map((e) => e.eventId).sort()) ||
    hash(json(t.events)) !== t.eventsDigest ||
    t.events.some((e) => !record.events.some((r) => same(r, e))) ||
    !record.transitions.some((m) => same(m, t.transition))
  )
    fail('frozen-timing-candidate');
  pair(t.events, t.transition);
  const creating = effect.kind === 'comment-create';
  exact(effect.target, ['identity', 'commentNodeId', 'creationIntent']);
  if (
    creating
      ? effect.target.commentNodeId !== null ||
        !effect.key.startsWith('comment:new:') ||
        effect.target.creationIntent !== effect.key.slice(12) ||
        t.canonicalCommentKey !== null
      : effect.kind !== 'comment-update' ||
        effect.key !== `comment:${effect.target.commentNodeId}` ||
        effect.target.creationIntent !== null ||
        t.canonicalCommentKey !== effect.key
  )
    fail('timing-target');
  if (
    !token(effect.outcome.providerId) ||
    (!creating && effect.outcome.providerId !== effect.target.commentNodeId)
  )
    fail('timing-provider-id');
  return { key: `comment:${effect.outcome.providerId}`, record };
}
function confirmed(effect) {
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
    !digest(effect.intendedDigest) ||
    !(effect.beforeDigest === null || digest(effect.beforeDigest)) ||
    !effect.target?.identity ||
    !Array.isArray(effect.dependencies) ||
    effect.dependencies.some((k) => !token(k)) ||
    new Set(effect.dependencies).size !== effect.dependencies.length
  )
    fail('effect');
  if (
    effect.attempted !== true ||
    effect.outcome?.state !== 'confirmed' ||
    effect.outcome.digest !== effect.intendedDigest
  )
    fail('effect-unconfirmed', true);
  const candidate = effect.candidate;
  const bytes =
    typeof candidate === 'string'
      ? candidate
      : candidate?.schema === 'aitm.story-timing-candidate/v1'
        ? candidate.body
        : json(candidate);
  if (hash(bytes) !== effect.intendedDigest) fail('effect-candidate-digest');
  if (effect.kind === 'project-field-update') {
    const target = effect.target;
    exact(target, ['identity', 'projectId', 'itemId', 'fieldId', 'type']);
    exact(candidate, ['itemId', 'fieldId', 'type', 'value']);
    if (
      !token(target.fieldId) ||
      !['NUMBER', 'TEXT', 'DATE', 'SINGLE_SELECT', 'ITERATION'].includes(target.type) ||
      effect.key !== `project-field:${target.itemId}:${target.fieldId}` ||
      target.projectId !== target.identity.projectId ||
      target.itemId !== target.identity.projectItemId ||
      !same(
        { itemId: target.itemId, fieldId: target.fieldId, type: target.type },
        { itemId: candidate.itemId, fieldId: candidate.fieldId, type: candidate.type }
      )
    )
      fail('field-target');
    const value = candidate.value;
    if (value !== null && !same(value, { state: 'absent' })) {
      if (target.type === 'NUMBER') {
        if (typeof value !== 'number' || !Number.isFinite(value)) fail('field-value');
      } else if (target.type === 'SINGLE_SELECT') {
        exact(value, ['optionId', 'name']);
        if (!token(value.optionId) || typeof value.name !== 'string') fail('field-value');
      } else {
        if (typeof value !== 'string' || (target.type === 'ITERATION' && !token(value)))
          fail('field-value');
        if (
          target.type === 'DATE' &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(Date.parse(value)) ||
            new Date(value).toISOString().slice(0, 10) !== value)
        )
          fail('field-value');
      }
    }
  } else {
    if (!['comment-create', 'comment-update'].includes(effect.kind)) fail('prerequisite-kind');
    exact(effect.target, ['identity', 'commentNodeId', 'creationIntent']);
    const target = effect.target;
    const creation = effect.kind === 'comment-create';
    if (
      creation
        ? !effect.key.startsWith('comment:new:') ||
          !token(target.creationIntent) ||
          target.creationIntent !== effect.key.slice(12) ||
          target.commentNodeId !== null ||
          effect.beforeDigest !== null
        : !token(target.commentNodeId) ||
          effect.key !== `comment:${target.commentNodeId}` ||
          effect.key.startsWith('comment:new:') ||
          target.creationIntent !== null ||
          effect.beforeDigest === null
    )
      fail('comment-target');
    if (
      !token(effect.outcome.providerId) ||
      effect.outcome.providerId.startsWith('new:') ||
      (!creation && effect.outcome.providerId !== target.commentNodeId)
    )
      fail('comment-provider-id');
    if (!(typeof candidate === 'string' || candidate?.schema === 'aitm.story-timing-candidate/v1'))
      fail('comment-candidate');
  }
}
function inspect(receipt, { transition, confirmedEffects } = {}) {
  if (!Array.isArray(confirmedEffects) || !confirmedEffects.length)
    fail('confirmations-missing', true);
  // Canonical cloning rejects accessor/exotic/non-JSON data before it can grant evidence.
  const r = JSON.parse(json(receipt));
  const effects = JSON.parse(json(confirmedEffects));
  exact(r, ['schema', 'transition', 'timing', 'effects']);
  if (r.schema !== 'aitm.story-transition-completion/v1') fail('schema');
  move(r.transition);
  move(transition);
  if (!same(r.transition, transition)) fail('transition-mismatch');
  exact(r.timing, ['key', 'resourceDigest', 'eventIds', 'eventsDigest']);
  const t = r.timing;
  if (
    !token(t.key) ||
    !t.key.startsWith('comment:') ||
    t.key.startsWith('comment:new:') ||
    !digest(t.resourceDigest) ||
    !digest(t.eventsDigest) ||
    !Array.isArray(t.eventIds) ||
    t.eventIds.length < 2 ||
    t.eventIds.some((id) => !token(id)) ||
    !same(t.eventIds, [...new Set(t.eventIds)].sort())
  )
    fail('timing-reference');
  if (
    !Array.isArray(r.effects) ||
    !r.effects.length ||
    new Set(effects.map((e) => e.key)).size !== effects.length
  )
    fail('effect-coverage');
  for (const effect of effects) confirmed(effect);
  const timings = effects.filter((e) => e.candidate?.schema === 'aitm.story-timing-candidate/v1');
  if (timings.length !== 1) fail('timing-effect');
  const timing = timings[0];
  const observed = timingEffect(timing);
  if (
    observed.key !== t.key ||
    timing.intendedDigest !== t.resourceDigest ||
    !same(timing.candidate.timing.transition, r.transition) ||
    !same(timing.candidate.timing.eventIds, t.eventIds) ||
    timing.candidate.timing.eventsDigest !== t.eventsDigest
  )
    fail('timing-binding');
  const prerequisites = effects.filter((e) => e !== timing);
  if (
    r.effects.length !== prerequisites.length ||
    new Set(r.effects.map((e) => e.key)).size !== r.effects.length
  )
    fail('effect-coverage');
  for (const ref of r.effects) {
    exact(ref, ['key', 'digest']);
    if (
      !token(ref.key) ||
      !digest(ref.digest) ||
      !prerequisites.some((e) => e.key === ref.key && e.outcome.digest === ref.digest)
    )
      fail('prerequisite-unconfirmed', true);
  }
  if (effects.some((e) => !same(e.target.identity, timing.target.identity)))
    fail('effect-identity');
  return { receipt: r, timing };
}
function guarded(operation) {
  try {
    return operation();
  } catch (error) {
    if (['STORY_COMPLETION_INVALID', 'STORY_COMPLETION_UNCONFIRMED'].includes(error.code))
      throw error;
    fail('native-evidence');
  }
}
/** Original frozen publication proof only; caller still owns published-body/freshness authority. */
export function validateCompletionReceipt(receipt, options = {}) {
  return guarded(() => frozen(inspect(receipt, options).receipt));
}
/** Also verify an older receipt's exact native event subset in a full current published store record. */
export function validateHistoricalCompletionReceipt(
  receipt,
  { transition, confirmedEffects, generation: record } = {}
) {
  return guarded(() => {
    const result = inspect(receipt, { transition, confirmedEffects });
    exact(record, ['manifest', 'generation', 'payloads']);
    const identity = result.timing.target.identity;
    const verified = validateManifest(record.manifest, { identity, payloads: record.payloads });
    if (!same(record.generation, verified.generation)) fail('generation-drift');
    const ref = verified.generation.baseSnapshot.resources[result.receipt.timing.key];
    if (!ref || ref.kind !== 'comment' || ref.ownership !== 'owned') fail('historical-resource');
    const bytes = record.payloads.get(ref.payloadPath);
    const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      Buffer.from(bytes)
    );
    const current = eventRecord(body);
    if (!current.transitions.some((m) => same(m, result.receipt.transition)))
      fail('historical-transition');
    const ids = new Set(result.receipt.timing.eventIds);
    const subset = current.events.filter((e) => ids.has(e.eventId));
    if (subset.length !== ids.size || hash(json(subset)) !== result.receipt.timing.eventsDigest)
      fail('historical-subset');
    pair(subset, result.receipt.transition);
    return frozen(result.receipt);
  });
}
