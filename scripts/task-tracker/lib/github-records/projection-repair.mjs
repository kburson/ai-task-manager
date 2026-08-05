import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  assertTransitionAuthorityCapability,
  validateTransitionAuthority,
} from './lifecycle-transition.mjs';

const PROJECTION_KEYS = ['body', 'bodyHash', 'commentNodeId', 'kind', 'revision'];

function repairError(category) {
  return new TypeError(`projection-repair:${category}`);
}

function isPlainDataObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => typeof key === 'string');
}

function hasExactlyKeys(value, keys) {
  if (!isPlainDataObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function bodyHash(body) {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

function validateProjectionSnapshot(snapshot, intent) {
  if (
    !hasExactlyKeys(snapshot, PROJECTION_KEYS) ||
    snapshot.commentNodeId !== intent.singletonCommentNodeId ||
    snapshot.kind !== intent.kind ||
    !Number.isSafeInteger(snapshot.revision) ||
    snapshot.revision <= 0 ||
    typeof snapshot.body !== 'string' ||
    snapshot.body.length === 0 ||
    snapshot.bodyHash !== bodyHash(snapshot.body)
  ) {
    throw repairError('projection');
  }
  return snapshot;
}

function expectedSnapshot(intent, current) {
  if (
    current.revision !== intent.expectedRevision ||
    current.bodyHash !== intent.expectedBodyHash
  ) {
    throw repairError('stale-projection');
  }
  return current;
}

function nextSnapshot(intent) {
  if (intent.nextBodyHash !== bodyHash(intent.nextBody)) throw repairError('next-projection');
  return Object.freeze({
    kind: intent.kind,
    commentNodeId: intent.singletonCommentNodeId,
    revision: intent.nextRevision,
    bodyHash: intent.nextBodyHash,
    body: intent.nextBody,
  });
}

function assertDependencies(deps) {
  if (
    !isPlainDataObject(deps) ||
    typeof deps.readProjection !== 'function' ||
    typeof deps.updateProjection !== 'function'
  ) {
    throw repairError('deps');
  }
}

async function emitCrash(crashAt, phase) {
  if (typeof crashAt === 'function') await crashAt({ phase });
}

async function repairAuthorized({
  repository,
  issue,
  transitionAuthority,
  authority,
  coordinator,
  contract,
  records,
  deps,
  crashAt,
}) {
  const proof = assertTransitionAuthorityCapability(transitionAuthority, { requireDurable: true });
  if (proof.repository !== repository || proof.issue !== issue) throw repairError('capability');
  assertDependencies(deps);

  const currentAuthority = validateTransitionAuthority({
    repository,
    issue,
    payload: proof.payload,
    authority,
    coordinator,
    contract,
    records,
  });
  const current = assertTransitionAuthorityCapability(currentAuthority, { requireDurable: true });
  if (
    current.transitionRecord.envelope.recordId !== proof.transitionRecord.envelope.recordId ||
    !isDeepStrictEqual(current.transitionRecord.envelope, proof.transitionRecord.envelope)
  ) {
    throw repairError('proof');
  }

  const snapshots = [];
  for (const intent of proof.payload.projections) {
    let snapshot;
    try {
      snapshot = await deps.readProjection({
        repository,
        issue,
        commentNodeId: intent.singletonCommentNodeId,
      });
    } catch {
      throw repairError('store');
    }
    validateProjectionSnapshot(snapshot, intent);
    const next = nextSnapshot(intent);
    const alreadyApplied = isDeepStrictEqual(snapshot, next);
    if (!alreadyApplied) expectedSnapshot(intent, snapshot);
    snapshots.push({ intent, snapshot, next, alreadyApplied });
  }

  const repairedKinds = [];
  const alreadyAppliedKinds = [];
  for (const entry of snapshots) {
    const { intent, snapshot, next, alreadyApplied } = entry;
    if (alreadyApplied) {
      alreadyAppliedKinds.push(intent.kind);
      continue;
    }
    await emitCrash(crashAt, `before-projection:${intent.kind}`);
    try {
      await deps.updateProjection({
        repository,
        issue,
        commentNodeId: intent.singletonCommentNodeId,
        expected: snapshot,
        next,
      });
    } catch {
      throw repairError('store');
    }
    await emitCrash(crashAt, `after-projection:${intent.kind}`);
    let readBack;
    try {
      readBack = await deps.readProjection({
        repository,
        issue,
        commentNodeId: intent.singletonCommentNodeId,
      });
    } catch {
      throw repairError('store');
    }
    validateProjectionSnapshot(readBack, intent);
    if (!isDeepStrictEqual(readBack, next)) throw repairError('readback');
    await emitCrash(crashAt, `after-projection-readback:${intent.kind}`);
    repairedKinds.push(intent.kind);
  }

  return Object.freeze({
    transitionRecordId: proof.transitionRecord.envelope.recordId,
    repairedKinds: Object.freeze(repairedKinds),
    alreadyAppliedKinds: Object.freeze(alreadyAppliedKinds),
    pendingKinds: Object.freeze([]),
  });
}

export async function repairIssueProjections(input = {}) {
  assertTransitionAuthorityCapability(input.transitionAuthority, { requireDurable: true });
  return repairAuthorized(input);
}
