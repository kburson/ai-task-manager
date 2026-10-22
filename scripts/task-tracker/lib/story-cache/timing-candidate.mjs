// @story #2039 #2061
// cspell:ignore EISSUELOCKED
// Frozen timing content is provisional. Only the coordinator can dispatch effects.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { validateManifest, storyIdentityKey } from './manifest.mjs';
import { observeContent } from './native-observation.mjs';
import { mergeTimingEvents } from './timing-events.mjs';
import { renderTimingEventBatch } from '../../gh-timing-comment.mjs';
import { resolvePhaseEvent } from '../../phase-events.mjs';
import { parseTimingRow } from '../timing-row-reader.mjs';
import { isEmittableTimingEvent } from '../timing-events/index.mjs';
import { validateExecutableTransition } from '../lifecycle-policy/executable-transitions.mjs';
import { assertTimingActorKey } from '../timing-actor.mjs';
import { resolveRuntimeRoot } from '../runtime-storage.mjs';
import { resolveSessionId } from '../session-id.mjs';
import {
  assertStoryWriter,
  openStoryWriterRegistry,
  resolveStoryWriter,
} from './writer-registry.mjs';
import { storyCachePath } from './store.mjs';
import { withIssueLock, currentIssueLockOwner } from '../../issue-mutator-lock.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(canonicalRecordJson(value));
const same = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const token = (v) => typeof v === 'string' && v.length > 0 && !/[\s\p{Cc}]/u.test(v);
const TIMING_HEADING = '⏱ Timing Log';
// Conservative UTF-8 budget within GitHub's documented final-comment character cap.
const COMMENT_BYTE_LIMIT = 65536;
const RECORD_BYTE_LIMIT = 4 * 1024 * 1024;
const RECORD_RE = /\n<!-- aitm-timing-events:v1 encoding=gzip payload=([A-Za-z0-9_-]+) -->\n$/g;
function invalid(reason, cause) {
  throw Object.assign(new Error(`Story timing candidate invalid: ${reason}`, { cause }), {
    code: 'STORY_TIMING_CANDIDATE_INVALID',
    reason,
  });
}
function unavailable(reason, cause) {
  throw Object.assign(new Error(`Story timing publication unavailable: ${reason}`, { cause }), {
    code: 'STORY_TIMING_PUBLICATION_UNAVAILABLE',
    reason,
  });
}
function frozen(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function payload(payloads, reference) {
  const bytes = payloads.get(reference?.payloadPath);
  if (!(typeof bytes === 'string' || Buffer.isBuffer(bytes))) invalid('payload');
  const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    Buffer.from(bytes)
  );
  if (hash(body) !== reference.digest) invalid('payload-digest');
  return body;
}
function retained(body) {
  if (Buffer.byteLength(body, 'utf8') > COMMENT_BYTE_LIMIT) invalid('comment-size');
  const matches = [...body.matchAll(RECORD_RE)];
  if (matches.length > 1 || body.split('aitm-timing-events:').length - 1 !== matches.length)
    invalid('timing-record-ambiguity');
  if (!matches.length) return { body, events: [], cursor: null, transitions: [] };
  const match = matches[0];
  let record;
  try {
    const compressed = Buffer.from(match[1], 'base64url');
    if (compressed.toString('base64url') !== match[1]) invalid('timing-record-encoding');
    const bytes = gunzipSync(compressed, { maxOutputLength: RECORD_BYTE_LIMIT });
    record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (canonicalRecordJson(record) !== bytes.toString('utf8')) invalid('timing-record-encoding');
    if (
      !same(Object.keys(record).sort(), [
        'cursor',
        'events',
        'schema',
        'tableDigest',
        'transitions',
      ]) ||
      record.schema !== 'aitm.story-timing-events/v1' ||
      !token(record.cursor) ||
      !same(mergeTimingEvents(record.events, []), record.events)
    )
      invalid('timing-record');
  } catch (error) {
    invalid('timing-record', error);
  }
  const tableBody = body.slice(0, match.index);
  if (
    hash(tableBody) !== record.tableDigest ||
    !Array.isArray(record.transitions) ||
    new Set(record.transitions.map((move) => move.id)).size !== record.transitions.length
  )
    invalid('timing-table-drift');
  const expected = [];
  for (const move of record.transitions) {
    const exitEventId = pairFor(record.events, move);
    expected.push(
      ...renderTimingEventBatch({
        timingBody: '',
        events: record.events.filter((event) => event.transitionId === move.id),
        exitEventId,
      })
        .split('\n')
        .filter((line) => parseTimingRow(line)?.actorKey)
    );
  }
  if (
    record.events.some(
      (event) =>
        event.transitionId !== null &&
        !record.transitions.some((move) => move.id === event.transitionId)
    )
  )
    invalid('timing-table-correspondence');
  const actual = tableBody.split('\n');
  for (const row of new Set(expected))
    if (
      actual.filter((line) => line === row).length !==
      expected.filter((line) => line === row).length
    )
      invalid('timing-table-correspondence');
  return { body: tableBody, ...record };
}

function pairFor(events, transition) {
  if (
    !transition ||
    !same(Object.keys(transition).sort(), ['actorId', 'from', 'id', 'to', 'visit']) ||
    !token(transition.id) ||
    !Number.isSafeInteger(transition.visit) ||
    transition.visit < 1
  )
    invalid('transition');
  assertTimingActorKey(transition.actorId);
  const allowed = validateExecutableTransition(transition.from, transition.to);
  if (!allowed.ok || allowed.noop) invalid('transition');
  const exit = resolvePhaseEvent({ state: transition.from, phase: 'complete' });
  const enter = resolvePhaseEvent({ state: transition.to, phase: 'enter' });
  const rows = events.filter((event) => event.transitionId === transition.id);
  const exits = rows.filter((event) => event.event === exit?.event);
  const entries = rows.filter((event) => event.event === enter?.event);
  if (
    rows.length !== 2 ||
    exits.length !== 1 ||
    entries.length !== 1 ||
    exits[0].actorId !== transition.actorId ||
    entries[0].actorId !== transition.actorId ||
    exits[0].timestamp !== entries[0].timestamp ||
    entries[0].activeSeconds !== 0 ||
    entries[0].idleSeconds !== 0
  )
    invalid('transition-pair');
  return exits[0].eventId;
}
function derive(generation, payloads, transition, frozenBody = null) {
  if (
    generation.conflicts.length ||
    (generation.batch !== null && generation.batch.status !== 'complete')
  )
    invalid('publication-pending');
  const timing = generation.timing;
  const events = mergeTimingEvents(timing.events, []);
  if (
    !same(events, timing.events) ||
    !token(timing.ingestedCursor) ||
    !(timing.publishedCursor === null || token(timing.publishedCursor))
  )
    invalid('timing-state');
  if (events.filter((event) => event.sourceCursor === timing.ingestedCursor).length !== 1)
    invalid('ingestion-boundary');
  for (const event of events) {
    assertTimingActorKey(event.actorId);
    if (!isEmittableTimingEvent(event.event)) invalid('event-vocabulary');
  }
  const exitEventId = pairFor(events, transition);
  const candidates = Object.values(generation.baseSnapshot.resources).filter(
    (resource) =>
      resource.kind === 'comment' &&
      payload(payloads, resource)
        .split('\n')
        .some((line) => line.trim() === TIMING_HEADING)
  );
  if (candidates.length > 1) invalid('canonical-comment-ambiguous');
  const existing = candidates[0];
  if (existing && (existing.key !== timing.canonicalCommentKey || existing.ownership !== 'owned'))
    invalid('canonical-comment-owner');
  if (!existing && timing.canonicalCommentKey !== null) invalid('canonical-comment-missing');
  const key = existing?.key ?? `comment:new:timing:${transition.id}`;
  const baselineBody = existing ? payload(payloads, existing) : '';
  if (generation.working[key] && payload(payloads, generation.working[key]) !== baselineBody)
    invalid('unstaged-timing-body');
  const prior = retained(baselineBody);
  if (prior.cursor !== timing.publishedCursor) invalid('publication-boundary');
  const byId = new Map(events.map((event) => [event.eventId, event]));
  for (const event of prior.events)
    if (!same(byId.get(event.eventId) ?? null, event)) invalid('published-event-drift');
  const published = new Set(prior.events.map((event) => event.eventId));
  const pending = events.filter((event) => !published.has(event.eventId));
  if (!pending.some((event) => event.eventId === exitEventId) || !pending.length)
    invalid('transition-already-published');
  if (pending.some((event) => event.transitionId !== null && event.transitionId !== transition.id))
    invalid('undeclared-transition');
  const pairEvents = pending.filter((event) => event.transitionId === transition.id);
  let body = renderTimingEventBatch({ timingBody: prior.body, events: pairEvents, exitEventId });
  body = body.trimEnd() + '\n';
  const record = {
    schema: 'aitm.story-timing-events/v1',
    events,
    cursor: timing.ingestedCursor,
    transitions: [...prior.transitions, clone(transition)],
    tableDigest: hash(body),
  };
  if (frozenBody !== null) {
    const recovered = retained(frozenBody);
    const { body: recoveredTable, ...recoveredRecord } = recovered;
    if (recoveredTable !== body || !same(recoveredRecord, record)) invalid('frozen-encoding');
    // Compression library versions may differ after handoff. Reuse verified original bytes.
    body = frozenBody;
  } else {
    const raw = Buffer.from(canonicalRecordJson(record));
    if (raw.length > RECORD_BYTE_LIMIT) invalid('timing-record-size');
    body +=
      '\n<!-- aitm-timing-events:v1 encoding=gzip payload=' +
      gzipSync(raw, { level: 9, mtime: 0 }).toString('base64url') +
      ' -->\n';
  }
  if (Buffer.byteLength(body, 'utf8') > COMMENT_BYTE_LIMIT) invalid('comment-size');

  return frozen({
    key,
    kind: existing ? 'comment-update' : 'comment-create',
    target: {
      identity: clone(generation.identity),
      commentNodeId: existing ? key.slice(8) : null,
      creationIntent: existing ? null : key.slice(12),
    },
    beforeDigest: existing?.digest ?? null,
    intendedDigest: hash(body),
    candidate: {
      schema: 'aitm.story-timing-candidate/v1',
      body,
      timing: {
        transition: clone(transition),
        sourceEvents: clone(events),
        events: clone(pending),
        eventIds: pending.map((event) => event.eventId).sort(),
        eventsDigest: hash(canonicalRecordJson(pending)),
        ingestedCursor: timing.ingestedCursor,
        publishedCursor: timing.publishedCursor,
        canonicalCommentKey: timing.canonicalCommentKey,
      },
    },
    dependencies: [],
    attempted: false,
    outcome: null,
  });
}
/** Pure, deterministic candidate; the batch coordinator allocates/persists its batch ID. */
export function freezeTimingCandidate({ generation: record, transition } = {}) {
  try {
    const verified = validateManifest(record.manifest, {
      identity: record.generation?.identity,
      payloads: record.payloads,
    });
    return derive(verified.generation, record.payloads, clone(transition));
  } catch (error) {
    if (error.code === 'STORY_TIMING_CANDIDATE_INVALID') throw error;
    invalid('input', error);
  }
}
async function confirm({ store, batchId, observation }) {
  if (
    !store ||
    !token(batchId) ||
    typeof store.readGeneration !== 'function' ||
    typeof store.commitGeneration !== 'function'
  )
    unavailable('arguments');
  const root = resolveRuntimeRoot({ cwd: process.cwd(), env: {} });
  const worktree = root.projectRoot;
  const sessionId = resolveSessionId();
  const first = await store.readGeneration();
  if (!first) unavailable('generation-missing');
  const identity = first.manifest.identity;
  const claim = resolveStoryWriter({
    identity,
    registry: openStoryWriterRegistry({ projectRoot: worktree }),
  });
  const assertOwner = () => {
    if (
      resolveSessionId() !== sessionId ||
      resolveRuntimeRoot({ cwd: process.cwd(), env: {} }).projectRoot !== worktree ||
      store.cachePath !== claim.cachePath ||
      storyCachePath({ projectRoot: worktree, identity }) !== store.cachePath
    )
      unavailable('local-context');
    assertStoryWriter(claim, { worktree, sessionId });
  };
  assertOwner();
  return withIssueLock(
    { issue: identity.issueNumber, projDir: worktree, sessionId, retries: 0 },
    async () => {
      const lockOwner = currentIssueLockOwner(identity.issueNumber);
      const revalidate = () => {
        assertOwner();
        if (
          !lockOwner ||
          currentIssueLockOwner(identity.issueNumber) !== lockOwner ||
          lockOwner.projDir !== root.mainRoot ||
          lockOwner.sessionId !== sessionId
        )
          unavailable('native-lock-owner');
      };
      revalidate();
      const current = await store.readGeneration();
      revalidate();
      const verified = validateManifest(current.manifest, { identity, payloads: current.payloads });
      if (
        current.manifest.claimId !== claim.claimId ||
        storyIdentityKey(identity) !== claim.identityKey
      )
        unavailable('generation-identity');
      const generation = clone(verified.generation);
      const batch = generation.batch;
      if (
        !batch ||
        batch.batchId !== batchId ||
        !Array.isArray(batch.effects) ||
        !batch.baseline ||
        !same(
          batch.transition,
          batch.effects.find(
            (effect) => effect.candidate?.schema === 'aitm.story-timing-candidate/v1'
          )?.candidate.timing.transition
        )
      )
        unavailable('batch');
      const effects = batch.effects.filter(
        (effect) => effect.candidate?.schema === 'aitm.story-timing-candidate/v1'
      );
      if (effects.length !== 1) unavailable('timing-effect');
      const effect = effects[0];
      if (
        effect.attempted !== true ||
        !same(effect.candidate.timing.sourceEvents, generation.timing.events) ||
        effect.candidate.timing.ingestedCursor !== generation.timing.ingestedCursor
      )
        unavailable('frozen-boundary');
      const origin = clone(generation);
      origin.batch = null;
      origin.baseSnapshot = clone(batch.baseline);
      origin.timing.publishedCursor = effect.candidate.timing.publishedCursor;
      origin.timing.canonicalCommentKey = effect.candidate.timing.canonicalCommentKey;
      if (effect.outcome?.state === 'confirmed')
        delete origin.working[`comment:${effect.outcome.providerId}`];
      const expected = derive(origin, current.payloads, batch.transition, effect.candidate.body);
      if (!same({ ...effect, attempted: false, outcome: null }, expected))
        unavailable('frozen-candidate');
      const observed = observeContent(observation);
      if (
        observed.kind !== 'comment' ||
        !same(observed.identity, identity) ||
        observed.body !== effect.candidate.body ||
        observed.digest !== effect.intendedDigest ||
        (effect.target.commentNodeId !== null && observed.key !== effect.key)
      )
        unavailable('readback');
      if (effect.kind === 'comment-create') {
        const providerId = observed.key.slice(8);
        if (
          batch.baseline.inventory.includes(providerId) ||
          Object.hasOwn(batch.baseline.resources, observed.key) ||
          (effect.outcome?.state !== 'confirmed' &&
            (Object.hasOwn(generation.baseSnapshot.resources, observed.key) ||
              Object.hasOwn(generation.working, observed.key)))
        )
          unavailable('creation-existing-resource');
        const inventory = observation.inventory;
        if (
          observation.complete !== true ||
          !Array.isArray(inventory) ||
          inventory.some((row) => !token(row.id) || typeof row.body !== 'string') ||
          new Set(inventory.map((row) => row.id)).size !== inventory.length
        )
          unavailable('creation-inventory');
        const matches = inventory.filter((row) => row.body.includes(TIMING_HEADING));
        if (
          matches.length !== 1 ||
          matches[0].id !== observed.key.slice(8) ||
          matches[0].body !== observed.body
        )
          unavailable('creation-ambiguous');
      }
      const outcome = {
        state: 'confirmed',
        providerId: observed.key.slice(8),
        revision: observed.revision,
        digest: observed.digest,
      };
      if (effect.outcome?.state === 'confirmed') {
        if (
          !same(effect.outcome, outcome) ||
          generation.timing.publishedCursor !== effect.candidate.timing.ingestedCursor ||
          generation.timing.canonicalCommentKey !== observed.key ||
          generation.baseSnapshot.resources[observed.key]?.digest !== observed.digest
        )
          unavailable('confirmed-drift');
        return frozen({
          status: 'no-op',
          publishedCursor: generation.timing.publishedCursor,
          batchStatus: batch.status,
        });
      }
      if (
        generation.timing.publishedCursor !== effect.candidate.timing.publishedCursor ||
        generation.timing.canonicalCommentKey !== effect.candidate.timing.canonicalCommentKey
      )
        unavailable('publication-boundary');
      const payloads = new Map(current.payloads);
      const payloadPath = `payloads/${observed.digest}.txt`;
      payloads.set(payloadPath, observed.body);
      const { body: ignored, ...resource } = observed;
      void ignored;
      generation.baseSnapshot.resources[observed.key] = {
        ...resource,
        ownership: 'owned',
        payloadPath,
      };
      if (!generation.baseSnapshot.inventory.includes(outcome.providerId))
        generation.baseSnapshot.inventory.push(outcome.providerId);
      generation.baseSnapshot.inventory.sort();
      delete generation.working[effect.key];
      generation.working[observed.key] = {
        payloadPath,
        digest: observed.digest,
        kind: 'comment',
        capabilityRef: null,
      };
      generation.dirtyKeys = generation.dirtyKeys.filter((key) => key !== effect.key);
      generation.timing.publishedCursor = effect.candidate.timing.ingestedCursor;
      generation.timing.canonicalCommentKey = observed.key;
      effect.outcome = outcome;
      generation.generation++;
      revalidate();
      const committed = await store.commitGeneration(
        { generation, claimId: claim.claimId, payloads },
        { expectedGeneration: current.manifest.generation }
      );
      revalidate();
      const readback = validateManifest(committed.manifest, {
        identity,
        payloads: committed.payloads,
      });
      if (committed.manifest.claimId !== claim.claimId || !same(readback.generation, generation))
        unavailable('commit-readback');
      return frozen({
        status: 'confirmed',
        publishedCursor: generation.timing.publishedCursor,
        batchStatus: batch.status,
      });
    }
  );
}
/** Confirmation never performs remote I/O, completes the batch or regenerates an event. */
export async function confirmTimingPublication(input = {}) {
  try {
    return await confirm(input);
  } catch (error) {
    if (
      typeof error.code === 'string' &&
      (error.code.startsWith('STORY_') || error.code === 'EISSUELOCKED')
    )
      throw error;
    unavailable('confirmation', error);
  }
}
