import { assertRevisionStageHostEffect } from './criteria-revision/transport-quarantine.mjs';
// @story #1857
// Session timing survives unbinding without becoming another actor's fallback.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sessionDir } from '../paths.mjs';
import { withLock } from '../fleet-registry.mjs';
import { timingActorKey } from './timing-actor.mjs';

export const ACTOR_TIMING_FIELDS = Object.freeze([
  'active',
  'lastActive',
  'entryStartTs',
  'wordsAtEntryStart',
  'fullWordsAtEntryStart',
  'totalActiveMinutes',
  'discoverBucket',
  'lastWordMarker',
  'lastFullWordMarker',
  'pausedAtTs',
  'paused',
  'pauseReason',
  'pauseReasonSlug',
  'pauseReasonText',
]);
const SCHEMA = 'aitm.actor-timing-state/v1';
function invalid(cause) {
  const error = new Error('Actor timing state is malformed or belongs to another identity', {
    cause,
  });
  error.code = 'ACTOR_TIMING_STATE_INVALID';
  throw error;
}
export function actorTimingStatePath(identity, root) {
  const key = timingActorKey(identity);
  return path.join(sessionDir(identity.sid, root), 'timing', key.slice(3) + '.json');
}
export function validateActorTimingState(record, identity) {
  if (
    !record ||
    record.schema !== SCHEMA ||
    record.actor !== timingActorKey(identity) ||
    record.provider !== identity.provider ||
    record.sid !== identity.sid ||
    !record.state ||
    typeof record.state !== 'object' ||
    Array.isArray(record.state) ||
    Object.keys(record).some(
      (key) => !['schema', 'actor', 'provider', 'sid', 'state'].includes(key)
    ) ||
    Object.keys(record.state).some((key) => !ACTOR_TIMING_FIELDS.includes(key))
  )
    invalid();
  for (const [key, value] of Object.entries(record.state)) {
    if (key === 'totalActiveMinutes' && value === null) continue;
    if (['entryStartTs', 'pausedAtTs'].includes(key)) {
      if (value !== null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value))))
        invalid();
    } else if (
      [
        'wordsAtEntryStart',
        'fullWordsAtEntryStart',
        'totalActiveMinutes',
        'lastWordMarker',
        'lastFullWordMarker',
      ].includes(key)
    ) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalid();
    } else if (key === 'paused') {
      if (typeof value !== 'boolean') invalid();
    } else if (key === 'discoverBucket') {
      if (value !== null && (typeof value !== 'object' || Array.isArray(value))) invalid();
    } else if (['pauseReason', 'pauseReasonSlug', 'pauseReasonText'].includes(key)) {
      if (value !== null && typeof value !== 'string') invalid();
    } else if (value !== null && typeof value !== 'string' && !Number.isSafeInteger(value))
      invalid();
  }
  return record;
}
export function readActorTimingState(identity, root) {
  const file = actorTimingStatePath(identity, root);
  if (!existsSync(file)) return null;
  let record;
  try {
    record = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    invalid(error);
  }
  return validateActorTimingState(record, identity).state;
}
export function actorTimingStateRecord(identity, state) {
  return validateActorTimingState(
    {
      schema: SCHEMA,
      actor: timingActorKey(identity),
      ...identity,
      state: Object.fromEntries(
        ACTOR_TIMING_FIELDS.filter((key) => state[key] !== undefined).map((key) => [
          key,
          state[key],
        ])
      ),
    },
    identity
  );
}
export function writeActorTimingState(identity, root, state) {
  assertRevisionStageHostEffect();
  const file = actorTimingStatePath(identity, root);
  const record = actorTimingStateRecord(identity, state);
  return withLock(file, () => {
    readActorTimingState(identity, root);
    mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + '.tmp.' + process.pid;
    writeFileSync(temp, JSON.stringify(record, null, 2) + '\n');
    renameSync(temp, file);
    return record.state;
  });
}

const nativeStageActorStateWrites = new WeakMap();
export function assertNativeStageActorStateWrite(invocation, intent) {
  const original = nativeStageActorStateWrites.get(invocation);
  if (!original || JSON.stringify(original) !== JSON.stringify(intent)) invalid();
}
export async function writeNativeStageActorTiming(invocation, operation) {
  // The native record construction still precedes resource acquisition. The
  // independently current existing record is reread/validated while locked.
  const record = actorTimingStateRecord(operation?.identity, operation?.state);
  const native = await import('./move-state/move-state-core.mjs');
  const source = await native.beginNativeStageCheckpointActor(invocation, operation);
  try {
    if (source.beforeBytes !== null) validateActorTimingState(JSON.parse(source.beforeBytes), source.identity);
    const intent = { invocation: source.invocation, file: source.file, stateBytes: source.stateBytes,
      bytes: JSON.stringify(record, null, 2) + '\n' };
    nativeStageActorStateWrites.set(invocation, intent);
    await native.persistNativeStageCheckpoint(invocation, intent);
    await native.writeNativeStageCheckpoint(invocation);
    await native.completeNativeStageCheckpoint(invocation);
    return record.state;
  } finally { nativeStageActorStateWrites.delete(invocation); native.endNativeStageCheckpointLeaf(invocation); }
}
