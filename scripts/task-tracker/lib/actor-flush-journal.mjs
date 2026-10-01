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
function validate(record, identity) {
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
export function readActorFlushJournal(file, identity) {
  if (!existsSync(file)) return null;
  let record;
  try {
    record = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    fail();
  }
  return validate(record, identity);
}
function prepare(file, identity, candidate) {
  return withLock(file, () => {
    const existing = readActorFlushJournal(file, identity);
    if (existing) {
      if (candidate && digest(candidate) !== existing.digest) fail('ACTOR_FLUSH_CONFLICT');
      return existing;
    }
    if (!candidate) return null;
    const record = validate(
      {
        schema: SCHEMA,
        actor: timingActorKey(identity),
        ...identity,
        digest: digest(candidate),
        payload: structuredClone(candidate),
      },
      identity
    );
    mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp.' + process.pid;
    writeFileSync(temporary, JSON.stringify(record, null, 2) + String.fromCharCode(10));
    renameSync(temporary, file);
    return record;
  });
}
export async function runActorFlushJournal({
  file,
  identity,
  candidate = null,
  publish,
  commit,
  fault = () => {},
}) {
  const record = prepare(file, identity, candidate);
  if (!record) return { status: 'empty' };
  await fault('prepared');
  // The publisher must perform canonical exact-row reconciliation. A queued
  // result means durable original bytes, not confirmed remote publication.
  const post = await publish(structuredClone(record.payload));
  if (post?.ok !== true && post?.queued !== true) fail('ACTOR_FLUSH_PUBLICATION_UNRESOLVED');
  await fault('published');
  await commit(structuredClone(record.payload));
  await fault('committed');
  withLock(file, () => {
    const current = readActorFlushJournal(file, identity);
    if (!current || current.digest !== record.digest) fail('ACTOR_FLUSH_CONFLICT');
    unlinkSync(file);
  });
  return { status: post.queued ? 'queued' : 'published', payload: record.payload, post };
}
