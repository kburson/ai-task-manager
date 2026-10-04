// @story #1861
// Read-only journal admission, with trusted storage/error primitives supplied by its caller.
import path from 'node:path';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FALLBACK_SESSION_ID } from './session-id.mjs';

export const runtimeBatchIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const runtimeBatchDigest = (bytes) =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) =>
  object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const digest = (value) => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const absolute = (value) =>
  typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const owner = (value) =>
  (exact(value, ['provider', 'sid', 'pid', 'processToken']) ||
    exact(value, ['provider', 'sid', 'pid', 'processToken', 'host'])) &&
  value.sid !== FALLBACK_SESSION_ID &&
  ['provider', 'sid', 'processToken'].every(
    (key) => typeof value[key] === 'string' && value[key].length > 0
  ) &&
  Number.isSafeInteger(value.pid) &&
  value.pid > 0 &&
  (value.host === undefined || (typeof value.host === 'string' && value.host.length > 0));
const payload = (value) => {
  if (
    !exact(value, ['bytes', 'digest']) ||
    typeof value.bytes !== 'string' ||
    !digest(value.digest)
  )
    return false;
  const decoded = Buffer.from(value.bytes, 'base64');
  return decoded.toString('base64') === value.bytes && runtimeBatchDigest(decoded) === value.digest;
};
const before = (value) =>
  value === null ||
  (exact(value, ['bytes', 'digest', 'dev', 'ino', 'mode']) &&
    integer(value.dev) &&
    integer(value.ino) &&
    integer(value.mode) &&
    payload({ bytes: value.bytes, digest: value.digest }));

export function validRuntimeBatchJournal(value) {
  if (
    !exact(value, [
      'schema',
      'operationId',
      'mainRoot',
      'status',
      'owner',
      'ownerHistory',
      'roots',
      'members',
      'observations',
    ]) ||
    value.schema !== 'aitm.runtime-batch/v1' ||
    !runtimeBatchIdPattern.test(value.operationId || '') ||
    !absolute(value.mainRoot) ||
    !['prepared', 'publishing', 'complete'].includes(value.status) ||
    !owner(value.owner)
  )
    return false;
  if (
    !Array.isArray(value.ownerHistory) ||
    !value.ownerHistory.length ||
    !value.ownerHistory.every(owner) ||
    JSON.stringify(value.ownerHistory.at(-1)) !== JSON.stringify(value.owner)
  )
    return false;
  if (
    !Array.isArray(value.observations) ||
    !value.observations.every(digest) ||
    new Set(value.observations).size !== value.observations.length
  )
    return false;
  if (
    !Array.isArray(value.roots) ||
    !value.roots.length ||
    !value.roots.every(
      (root) =>
        exact(root, [
          'projectRoot',
          'dev',
          'ino',
          'controlDigest',
          'transactionId',
          'planDigest',
        ]) &&
        absolute(root.projectRoot) &&
        integer(root.dev) &&
        integer(root.ino) &&
        digest(root.controlDigest) &&
        typeof root.transactionId === 'string' &&
        /^[a-zA-Z0-9-]+$/.test(root.transactionId) &&
        digest(root.planDigest)
    )
  )
    return false;
  const roots = new Set(value.roots.map((root) => root.projectRoot));
  if (roots.size !== value.roots.length || !roots.has(value.mainRoot)) return false;
  if (
    !Array.isArray(value.members) ||
    !value.members.length ||
    !value.members.every((member) => {
      if (
        !exact(member, ['target', 'projectRoot', 'actorIdentity', 'before', 'after']) ||
        !roots.has(member.projectRoot) ||
        !absolute(member.target) ||
        !before(member.before) ||
        (member.after !== null && !payload(member.after))
      )
        return false;
      const base = path.join(member.projectRoot, '.ai-task-manager/runtime/store') + path.sep;
      if (!member.target.startsWith(base) || member.target === base.slice(0, -1)) return false;
      return (
        member.actorIdentity === null ||
        (exact(member.actorIdentity, ['provider', 'sid']) &&
          ['provider', 'sid'].every(
            (key) =>
              typeof member.actorIdentity[key] === 'string' && member.actorIdentity[key].length > 0
          ))
      );
    })
  )
    return false;
  return new Set(value.members.map((member) => member.target)).size === value.members.length;
}

export const runtimeBatchMemberPending = (member, operationId, index) =>
  member.target + '.batch-' + operationId + '-' + index + '.pending';

export function readRuntimeBatchObservation(layout, operationId, { assertPath, fail }) {
  if (!runtimeBatchIdPattern.test(operationId || ''))
    fail('RUNTIME_BATCH_INVALID', 'Exact batch UUID is required');
  const directory = assertPath(
    path.join(layout.sharedRuntimeRoot, 'batches', operationId),
    layout.sharedRuntimeRoot,
    'RUNTIME_BATCH_INVALID'
  );
  try {
    if (!lstatSync(directory).isDirectory()) throw new Error('not a directory');
    const names = readdirSync(directory).sort();
    if (
      !names.length ||
      names.some((name) => !['journal.json', 'journal.json.pending'].includes(name))
    )
      fail('RUNTIME_BATCH_INVALID', 'Unknown batch publication artifact');
    const file = assertPath(
      path.join(directory, 'journal.json'),
      layout.sharedRuntimeRoot,
      'RUNTIME_BATCH_INVALID'
    );
    const read = (target) => {
      assertPath(target, layout.sharedRuntimeRoot, 'RUNTIME_BATCH_INVALID');
      const stat = lstatSync(target);
      if (!stat.isFile()) throw new Error('not a file');
      const bytes = readFileSync(target);
      const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (
        !validRuntimeBatchJournal(record) ||
        record.operationId !== operationId ||
        record.mainRoot !== layout.mainRoot
      )
        fail('RUNTIME_BATCH_INVALID', 'Malformed batch journal or physical owner mismatch');
      return {
        file: target,
        dev: stat.dev,
        ino: stat.ino,
        bytes: bytes.toString('base64'),
        record,
      };
    };
    const published = names.includes('journal.json') ? read(file) : null;
    const journalArtifact = names.includes('journal.json.pending') ? read(file + '.pending') : null;
    if (!published && journalArtifact.record.status !== 'prepared')
      fail('RUNTIME_BATCH_INVALID', 'Initial batch publication must be prepared');
    if (published && journalArtifact) {
      const before = published.record;
      const after = journalArtifact.record;
      const stable = (value) =>
        JSON.stringify([
          value.schema,
          value.operationId,
          value.mainRoot,
          value.roots,
          value.members,
        ]);
      if (
        (before.status === 'complete' && after.status !== 'complete') ||
        stable(before) !== stable(after) ||
        after.ownerHistory.length < before.ownerHistory.length ||
        JSON.stringify(after.ownerHistory.slice(0, before.ownerHistory.length)) !==
          JSON.stringify(before.ownerHistory) ||
        before.observations.some((item) => !after.observations.includes(item)) ||
        (before.status === 'prepared' && after.status !== 'publishing')
      )
        fail('RUNTIME_BATCH_INVALID', 'Pending journal contradicts its published predecessor');
    }
    const selected = journalArtifact || published;
    const record = selected.record;
    const memberArtifacts = record.members.map((member, index) => {
      const pending = assertPath(
        runtimeBatchMemberPending(member, operationId, index),
        path.join(member.projectRoot, '.ai-task-manager/runtime/store'),
        'RUNTIME_BATCH_INVALID'
      );
      try {
        const identity = lstatSync(pending);
        if (!identity.isFile())
          fail('RUNTIME_BATCH_INVALID', 'Pending batch member must be a regular protected file');
        return {
          file: pending,
          dev: identity.dev,
          ino: identity.ino,
          bytes: readFileSync(pending).toString('base64'),
        };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    });
    if (record.status === 'complete' && !journalArtifact && memberArtifacts.some(Boolean))
      fail('RUNTIME_BATCH_INCOMPLETE', 'Completed batch retains unresolved publication artifacts');
    return {
      record,
      file,
      directory,
      journalArtifact,
      memberArtifacts,
      identity: { dev: selected.dev, ino: selected.ino },
      digest: runtimeBatchDigest(JSON.stringify([published, journalArtifact, memberArtifacts])),
    };
  } catch (error) {
    if (error.code?.startsWith('RUNTIME_')) throw error;
    fail('RUNTIME_BATCH_INVALID', 'Missing or unreadable protected batch journal');
  }
}

export function assertRuntimeBatchAdmission(layout, primitives, { skipOperationId } = {}) {
  const directory = primitives.assertPath(
    path.join(layout.sharedRuntimeRoot, 'batches'),
    layout.sharedRuntimeRoot,
    'RUNTIME_BATCH_INVALID'
  );
  let names;
  try {
    if (!lstatSync(directory).isDirectory())
      primitives.fail('RUNTIME_BATCH_INVALID', 'Batch container must be a directory');
    names = readdirSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const id of names.sort()) {
    if (!runtimeBatchIdPattern.test(id))
      primitives.fail('RUNTIME_BATCH_INVALID', 'Unknown protected batch entry');
    if (id === skipOperationId) continue;
    const observed = readRuntimeBatchObservation(layout, id, primitives);
    if (observed.record.status !== 'complete' || observed.journalArtifact)
      primitives.fail(
        'RUNTIME_BATCH_INCOMPLETE',
        'Ordinary authority reads refuse an incomplete batch; use registered observed recovery'
      );
  }
}
