// @story #1857
// Operational correlation never attributes historical timing to a current actor.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { observeRuntimeProcesses } from './runtime-process-census.mjs';
import { inspectRuntimeWriterLeases } from './runtime-migration-lock.mjs';

const digest = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const issueKey = (value) => String(value ?? '').replace(/^#/, '');
const active = (value) =>
  object(value) &&
  value.paused !== true &&
  Boolean(value.issue || value.active) &&
  typeof value.entryStartTs === 'string' &&
  Number.isFinite(Date.parse(value.entryStartTs));

export function observeRuntimeWriterCensus(input, adapters = {}) {
  const claims = [];
  const unknown = [];
  const sessions = [];
  const globals = [];
  const readBytes = adapters.readBytes || readFileSync;
  for (const file of input.files) {
    if (!['sessions', 'state', 'occupancy'].includes(file.family)) continue;
    if (
      file.family === 'sessions' &&
      !file.source.endsWith('/active-task.json') &&
      !new RegExp('/sessions/[^/]+/timing/[^/]+[.]json$').test(file.source)
    )
      continue;
    try {
      const bytes = readBytes(file.source);
      if (!Buffer.isBuffer(bytes) || digest(bytes) !== file.digest)
        throw new Error('Changed source bytes');
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!object(value)) throw new Error('Unsupported claim record');
      if (file.family === 'occupancy') {
        for (const entry of Object.values(value)) {
          if (!object(entry) || typeof entry.sid !== 'string' || typeof entry.provider !== 'string')
            throw new Error('Unsupported occupancy claim');
          claims.push({
            provider: entry.provider,
            sid: entry.sid,
            projectRoot: file.root,
            issue: issueKey(entry.issue),
            reason: 'occupancy',
          });
        }
      } else if (file.family === 'state') {
        if (active(value)) globals.push({ value, root: file.root });
      } else {
        const parts = file.source.split('/');
        const index = parts.lastIndexOf('sessions');
        const sid = parts[index + 1];
        if (index < 0 || !sid) throw new Error('Unknown session identity');
        const actor = value.schema === 'aitm.actor-timing-state/v1';
        if (!actor && !file.source.endsWith('/active-task.json')) continue;
        const state = actor ? value.state : value;
        if (actor && (value.sid !== sid || typeof value.provider !== 'string'))
          throw new Error('Conflicting actor identity');
        if (active(state))
          sessions.push({
            provider: actor
              ? value.provider
              : sid === input.owner.sid
                ? input.owner.provider
                : null,
            sid,
            projectRoot: file.root,
            issue: issueKey(state.issue || state.active),
            entryStartTs: state.entryStartTs,
            reason: actor ? 'actor-engagement' : 'session-binding',
          });
      }
    } catch {
      unknown.push({ reason: 'claim-observation-unavailable', source: file.source });
    }
  }
  claims.push(...sessions);
  for (const entry of globals) {
    const matches = sessions.filter(
      (session) =>
        session.projectRoot === entry.root &&
        session.issue === issueKey(entry.value.active || entry.value.issue) &&
        session.entryStartTs === entry.value.entryStartTs
    );
    const identities = new Set(matches.map((match) => match.provider + ':' + match.sid));
    if (identities.size !== 1)
      claims.push({
        provider: null,
        sid: null,
        projectRoot: entry.root,
        issue: issueKey(entry.value.active || entry.value.issue),
        reason: 'unattributed-active-state',
      });
  }
  let leases = [];
  let observed = { complete: false, processes: [], unknown: [] };
  try {
    leases = (adapters.inspectLeases || inspectRuntimeWriterLeases)(input);
  } catch {
    unknown.push({ reason: 'lease-observation-unavailable' });
  }
  try {
    observed = (adapters.observeProcesses || observeRuntimeProcesses)(input);
  } catch {
    unknown.push({ reason: 'process-observation-unavailable' });
  }
  if (!observed || observed.complete !== true || !Array.isArray(observed.processes))
    unknown.push({ reason: 'process-observation-incomplete' });
  unknown.push(...(observed?.unknown || []));
  const writers = (observed?.processes || []).map((process) => {
    const matching = leases.filter(
      ({ record }) => record.owner.pid === process.pid && record.projectRoot === process.projectRoot
    );
    return matching.length === 1
      ? { ...process, ...matching[0].record.owner, cooperative: true }
      : { ...process, cooperative: false };
  });
  for (const { record } of leases) {
    if (
      !writers.some(
        (writer) => writer.pid === record.owner.pid && writer.projectRoot === record.projectRoot
      )
    )
      writers.push({
        ...record.owner,
        projectRoot: record.projectRoot,
        cooperative: false,
        reason: 'unresolved-writer-lease',
      });
  }
  return { complete: unknown.length === 0, writers, claims, unknown };
}
