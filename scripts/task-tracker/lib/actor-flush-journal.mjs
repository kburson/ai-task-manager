import {
  assertRevisionStageHostEffect,
  isMemoryStageEffectScope,
} from './criteria-revision/transport-quarantine.mjs';
// @story #1857
// An immutable pending row survives publication ambiguity and local cursor failure.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { withLock } from '../fleet-registry.mjs';
import { timingActorKey } from './timing-actor.mjs';
import { parseTimingRow } from './timing-row-reader.mjs';
import { actorTimingStateRecord } from './actor-timing-state.mjs';
const SCHEMA = 'aitm.actor-flush-journal/v1';
function fail(code = 'ACTOR_FLUSH_INVALID') {
  const error = new Error(
    'Actor flush journal is invalid, conflicting, or publication is unresolved'
  );
  error.code = code;
  throw error;
}
function keys(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...expected].sort().join(',')
  );
}
function digest(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
export function validateActorFlushJournal(record, identity) {
  if (
    !keys(record, ['schema', 'actor', 'provider', 'sid', 'digest', 'payload']) ||
    record.schema !== SCHEMA ||
    record.provider !== identity.provider ||
    record.sid !== identity.sid ||
    record.actor !== timingActorKey(identity) ||
    record.digest !== digest(record.payload)
  )
    fail();
  const payload = record.payload;
  if (
    !keys(payload, ['issue', 'row', 'cursor', 'previous', 'checkpoint']) ||
    typeof payload.issue !== 'string' ||
    !/^#[1-9][0-9]*$/.test(payload.issue) ||
    typeof payload.row !== 'string'
  )
    fail();
  let row;
  if (
    !keys(payload.previous, ['entryStartTs', 'lastWordMarker', 'lastFullWordMarker']) ||
    (payload.previous.entryStartTs !== null &&
      !Number.isFinite(Date.parse(payload.previous.entryStartTs))) ||
    !Number.isSafeInteger(payload.previous.lastWordMarker) ||
    payload.previous.lastWordMarker < 0 ||
    !Number.isSafeInteger(payload.previous.lastFullWordMarker) ||
    payload.previous.lastFullWordMarker < 0 ||
    !keys(payload.checkpoint, [
      'active',
      'entryStartTs',
      'wordsAtEntryStart',
      'fullWordsAtEntryStart',
      'lastWordMarker',
      'lastFullWordMarker',
    ]) ||
    payload.checkpoint.wordsAtEntryStart !== payload.checkpoint.lastWordMarker ||
    payload.checkpoint.fullWordsAtEntryStart !== payload.checkpoint.lastFullWordMarker
  )
    fail();
  try {
    row = parseTimingRow(payload.row);
    actorTimingStateRecord(identity, payload.checkpoint);
  } catch {
    fail();
  }
  if (
    !row ||
    row.actorKey !== record.actor ||
    payload.checkpoint.active !== payload.issue ||
    (payload.checkpoint.entryStartTs !== null &&
      !Number.isFinite(Date.parse(payload.checkpoint.entryStartTs)))
  )
    fail();
  if (row.engagement && Date.parse(payload.checkpoint.entryStartTs) !== row.engagement.endMs)
    fail();
  if (!row.engagement && payload.checkpoint.entryStartTs !== null) fail();
  if (payload.cursor !== null) {
    if (!keys(payload.cursor, ['before', 'after'])) fail();
    for (const cursor of [payload.cursor.before, payload.cursor.after]) {
      if (
        !keys(cursor, ['line', 'words', 'wordsFull']) ||
        Object.values(cursor).some((value) => !Number.isSafeInteger(value) || value < 0) ||
        cursor.wordsFull < cursor.words
      )
        fail();
    }
    if (
      payload.cursor.after.words < payload.cursor.before.words ||
      payload.cursor.after.wordsFull < payload.cursor.before.wordsFull ||
      payload.cursor.after.words !== payload.checkpoint.lastWordMarker ||
      payload.cursor.after.wordsFull !== payload.checkpoint.lastFullWordMarker
    )
      fail();
    if (
      row.engagement &&
      (row.engagement.wordEnd !== payload.cursor.after.words ||
        row.engagement.fullWordEnd !== payload.cursor.after.wordsFull)
    )
      fail();
  }
  return record;
}
export function deriveActorFlushJournalRecord(input) {
  if (!keys(input, ['identity', 'candidate'])) fail();
  const { identity, candidate } = input;
  return validateActorFlushJournal(
    {
      schema: SCHEMA,
      actor: timingActorKey(identity),
      ...identity,
      digest: digest(candidate),
      payload: structuredClone(candidate),
    },
    identity
  );
}
export function readActorFlushJournal(file, identity) {
  if (!existsSync(file)) return null;
  let record;
  try {
    record = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    fail();
  }
  return validateActorFlushJournal(record, identity);
}
function prepareRecord(existing, identity, candidate) {
  if (existing) {
    validateActorFlushJournal(existing, identity);
    if (candidate && digest(candidate) !== existing.digest) fail('ACTOR_FLUSH_CONFLICT');
    return existing;
  }
  return candidate ? deriveActorFlushJournalRecord({ identity, candidate }) : null;
}
function prepare(file, identity, candidate) {
  return withLock(file, () => {
    const existing = readActorFlushJournal(file, identity);
    const record = prepareRecord(existing, identity, candidate);
    if (existing || !record) return record;
    mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp.' + process.pid;
    writeFileSync(temporary, JSON.stringify(record, null, 2) + String.fromCharCode(10));
    renameSync(temporary, file);
    return record;
  });
}
function assertRemovalRecord(current, identity, expectedDigest) {
  if (current) validateActorFlushJournal(current, identity);
  if (!current || current.digest !== expectedDigest) fail('ACTOR_FLUSH_CONFLICT');
}
export async function runActorFlushJournal(input) {
  const { file, identity, candidate = null, publish, commit, fault = () => {} } = input;
  let record,
    native = null;
  if (isMemoryStageEffectScope()) {
    native = await import('./move-state/move-state-core.mjs');
    const existing = await native.beginNativeStageActorPreparation(input);
    try {
      record = prepareRecord(existing, identity, candidate);
      await native.writeNativeStageActorPreparation(input, record);
    } finally {
      native.endNativeStageActorPreparation(input);
    }
    // Only the original runtime publisher remains live under the private token.
    await native.beginNativeStageActorPublication(input);
  } else {
    assertRevisionStageHostEffect();
    record = prepare(file, identity, candidate);
  }
  if (!record) return { status: 'empty' };
  await fault('prepared');
  // The publisher must perform canonical exact-row reconciliation. A queued
  // result means durable original bytes, not confirmed remote publication.
  let post;
  try {
    post = await publish(structuredClone(record.payload));
  } finally {
    if (native) native.endNativeStageActorPublication(input);
  }
  if (post?.ok !== true && post?.queued !== true) fail('ACTOR_FLUSH_PUBLICATION_UNRESOLVED');
  await fault('published');
  if (native) await native.beginNativeStageActorCommit(input);
  try {
    await commit(structuredClone(record.payload));
  } finally {
    if (native) native.endNativeStageActorCommit(input);
  }
  await fault('committed');
  if (native) {
    const current = await native.beginNativeStageActorRemoval(input);
    try {
      assertRemovalRecord(current, identity, record.digest);
      await native.persistNativeStageActorRemoval(input);
      await native.writeNativeStageActorRemoval(input);
      await native.completeNativeStageActorRemoval(input);
    } finally {
      native.endNativeStageActorRemoval(input);
    }
  } else {
    assertRevisionStageHostEffect();
    withLock(file, () => {
      const current = readActorFlushJournal(file, identity);
      assertRemovalRecord(current, identity, record.digest);
      unlinkSync(file);
    });
  }
  return { status: post.queued ? 'queued' : 'published', payload: record.payload, post };
}
