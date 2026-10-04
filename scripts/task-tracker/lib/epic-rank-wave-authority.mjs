// @story #1872
import path from 'node:path';
import { validateRankWaveSource } from './epic-rank-wave-source.mjs';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { freezeRankGraph, rankWaveDigest } from './epic-rank-wave-policy.mjs';

const KEYS = [
  'schema',
  'id',
  'revision',
  'action',
  'previousDigest',
  'repository',
  'epic',
  'rank',
  'members',
  'graph',
  'bindings',
  'parent',
  'proposalDigest',
  'source',
  'recordingActor',
  'createdAt',
  'expiresAt',
  'continuation',
];
const HASH = /^[a-f0-9]{64}$/;
export function exactRankWaveKeys(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    canonicalRecordJson(Object.keys(value).sort()) !== canonicalRecordJson([...keys].sort())
  ) {
    throw new TypeError('rank-wave: closed schema required');
  }
}
export function rankWaveProposal(record) {
  return {
    schema: 'aitm.rank-wave-proposal/v1',
    operationId: record.id,
    repository: record.repository,
    epic: record.epic,
    rank: record.rank,
    members: record.members,
    graph: record.graph,
    bindings: record.bindings,
    parent: record.parent,
    expiresAt: record.expiresAt,
  };
}
function validTime(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
export function validateRankWaveBinding(binding) {
  exactRankWaveKeys(binding, [
    'issue',
    'worktree',
    'branch',
    'commonDir',
    'provider',
    'sessionId',
    'generation',
  ]);
  if (
    !Number.isSafeInteger(binding.issue) ||
    binding.issue <= 0 ||
    !path.isAbsolute(binding.worktree) ||
    !path.isAbsolute(binding.commonDir) ||
    ['branch', 'provider', 'sessionId', 'generation'].some(
      (k) => typeof binding[k] !== 'string' || !binding[k].trim() || /[\r\n\0]/.test(binding[k])
    )
  )
    throw new TypeError('rank-wave: binding identity incomplete');
  return binding;
}
export function validateRankWaveRecord(record) {
  exactRankWaveKeys(record, KEYS);
  if (
    record.schema !== 'aitm.epic-rank-wave/v1' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(record.id) ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    !['authorize', 'revoke', 'refresh'].includes(record.action) ||
    !(record.previousDigest === null || HASH.test(record.previousDigest)) ||
    !/^[\w.-]+\/[\w.-]+$/.test(record.repository) ||
    !Number.isSafeInteger(record.epic) ||
    record.epic <= 0 ||
    typeof record.rank !== 'number' ||
    !Number.isFinite(record.rank) ||
    record.rank < 0 ||
    !validTime(record.createdAt) ||
    !(
      record.expiresAt === null ||
      (validTime(record.expiresAt) && Date.parse(record.expiresAt) > Date.parse(record.createdAt))
    ) ||
    typeof record.recordingActor !== 'string' ||
    !record.recordingActor.trim()
  ) {
    throw new TypeError('rank-wave: invalid envelope');
  }
  if (record.action !== 'refresh' && record.continuation !== null)
    throw new TypeError('rank-wave: unexpected continuation');
  if (record.action === 'refresh') {
    exactRankWaveKeys(record.continuation, [
      'issue',
      'oldGeneration',
      'oldSessionId',
      'newGeneration',
      'newSessionId',
    ]);
    if (
      !Number.isSafeInteger(record.continuation.issue) ||
      Object.values(record.continuation).some((v) => v === null || v === '')
    )
      throw new TypeError('rank-wave: continuation incomplete');
  }
  validateRankWaveSource(record.source);
  validateRankWaveBinding(record.parent);
  if (!Array.isArray(record.bindings)) throw new TypeError('rank-wave: bindings unreadable');
  record.bindings.forEach(validateRankWaveBinding);
  const graph = freezeRankGraph(record.graph);
  if (
    canonicalRecordJson(graph) !== canonicalRecordJson(record.graph) ||
    canonicalRecordJson(graph.filter((c) => c.rank === record.rank).map((c) => c.number)) !==
      canonicalRecordJson(record.members) ||
    !record.members.length ||
    !Array.isArray(record.bindings) ||
    canonicalRecordJson(record.bindings.map((b) => b.issue)) !==
      canonicalRecordJson(record.members) ||
    !record.parent ||
    record.parent.issue !== record.epic
  )
    throw new TypeError('rank-wave: incomplete scope');
  if (record.proposalDigest !== rankWaveDigest(rankWaveProposal(record))) {
    throw new TypeError('rank-wave: proposal digest mismatch');
  }
  return record;
}
export function sealRankWaveRecord(record) {
  validateRankWaveRecord(record);
  const copy = structuredClone(record);
  return { record: copy, digest: rankWaveDigest(copy) };
}

export function selectRankWaveRecord(envelopes, { repository, epic, rank, now } = {}) {
  try {
    if (!Array.isArray(envelopes) || !validTime(now))
      throw new Error('unreadable history or clock');
    const scoped = [];
    const ids = new Set();
    const revisions = new Set();
    for (const envelope of envelopes) {
      exactRankWaveKeys(envelope, ['record', 'digest']);
      const record = validateRankWaveRecord(envelope.record);
      if (Date.parse(record.createdAt) > Date.parse(now)) throw new Error('future record');
      if (envelope.digest !== rankWaveDigest(record)) throw new Error('record tampered');
      if (record.repository !== repository || record.epic !== epic)
        throw new Error('foreign scope');
      if (ids.has(record.id)) throw new Error('duplicate record identity');
      ids.add(record.id);
      if (record.rank !== rank) continue;
      if (revisions.has(record.revision)) throw new Error('conflicting revision');
      revisions.add(record.revision);
      scoped.push(envelope);
    }
    scoped.sort((a, b) => a.record.revision - b.record.revision);
    for (let i = 0; i < scoped.length; i++) {
      const current = scoped[i],
        previous = scoped[i - 1];
      if (
        current.record.revision !== i + 1 ||
        current.record.previousDigest !== (previous?.digest ?? null) ||
        (!previous && current.record.action !== 'authorize')
      )
        throw new Error('history incomplete');
      if (previous && Date.parse(current.record.createdAt) < Date.parse(previous.record.createdAt))
        throw new Error('record chronology');
      if (
        previous &&
        current.record.action === 'revoke' &&
        ['graph', 'members', 'bindings'].some(
          (key) =>
            canonicalRecordJson(current.record[key]) !== canonicalRecordJson(previous.record[key])
        )
      )
        throw new Error('revocation changed scope');
      if (previous && current.record.action === 'refresh') {
        if (previous.record.action === 'revoke')
          throw new Error('refresh cannot revive revocation');
        const before = previous.record.bindings,
          after = current.record.bindings;
        const changed = before.filter(
          (b, i) => canonicalRecordJson(b) !== canonicalRecordJson(after[i])
        );
        const continuation = current.record.continuation;
        const old = changed[0],
          next = after.find((b) => b.issue === old?.issue);
        if (
          changed.length !== 1 ||
          continuation.issue !== old.issue ||
          continuation.oldGeneration !== old.generation ||
          continuation.oldSessionId !== old.sessionId ||
          continuation.newGeneration !== next.generation ||
          continuation.newSessionId !== next.sessionId ||
          old.generation === next.generation
        )
          throw new Error('refresh continuation mismatch');
        for (const key of ['issue', 'worktree', 'branch', 'commonDir', 'provider']) {
          if (old[key] !== next[key]) throw new Error('refresh physical scope changed');
        }
        for (const key of [
          'repository',
          'epic',
          'rank',
          'members',
          'graph',
          'expiresAt',
          'source',
          'parent',
        ]) {
          if (
            canonicalRecordJson(current.record[key]) !== canonicalRecordJson(previous.record[key])
          )
            throw new Error('refresh changed scope');
        }
      }
    }
    const latest = scoped.at(-1);
    if (!latest) return { status: 'ungranted', record: null, digest: null };
    if (latest.record.action === 'revoke') return { status: 'revoked', ...latest };
    if (
      latest.record.expiresAt !== null &&
      Date.parse(now) >= Date.parse(latest.record.expiresAt)
    ) {
      return { status: 'expired', ...latest };
    }
    return { status: 'ready', ...latest };
  } catch (error) {
    return { status: 'malformed', detail: error.message, record: null, digest: null };
  }
}
