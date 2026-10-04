// @story #1861
import { createHash } from 'node:crypto';
export function emptyRuntimeDigest(value) {
  const stable = (item) =>
    Array.isArray(item)
      ? item.map(stable)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, stable(item[key])])
          )
        : item;
  return (
    'sha256:' +
    createHash('sha256')
      .update(Buffer.isBuffer(value) ? value : JSON.stringify(stable(value)))
      .digest('hex')
  );
}
export const INITIAL_SHARED_RUNTIME_RECORDS = Object.freeze({
  'fleet/task-fleet.json': '{}\n',
  'fleet/occupancy.json': '{}\n',
});
export function emptyRuntimeObservationProjection(observation) {
  return {
    roots: observation.roots,
    rootIdentities: observation.rootIdentities,
    unavailableRoots: observation.unavailableRoots,
    authority: observation.authority,
    blockers: observation.blockers,
    writerObservation: observation.writerObservation,
  };
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const emptyRuntimeKeys = (value, keys) =>
  object(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export const validEmptyOperationId = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const validEmptyDigest = (value) =>
  typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const rootIdentity = (value) =>
  emptyRuntimeKeys(value, ['projectRoot', 'gitDir', 'commonDir']) &&
  Object.values(value).every((item) => typeof item === 'string' && item.startsWith('/'));
const validOwner = (owner) =>
  (emptyRuntimeKeys(owner, ['provider', 'sid', 'pid', 'processToken']) ||
    emptyRuntimeKeys(owner, ['provider', 'sid', 'pid', 'processToken', 'host'])) &&
  owner.sid !== 'default-session' &&
  ['provider', 'sid', 'processToken'].every(
    (key) => typeof owner[key] === 'string' && owner[key]
  ) &&
  Number.isSafeInteger(owner.pid) &&
  owner.pid > 0 &&
  (owner.host === undefined || (typeof owner.host === 'string' && owner.host));
const physicalIdentity = (value) =>
  emptyRuntimeKeys(value, ['dev', 'ino', 'mode']) &&
  Object.values(value).every(Number.isSafeInteger);
export function validEmptyRuntimePlan(plan) {
  if (
    !emptyRuntimeKeys(plan, [
      'schema',
      'operationId',
      'projectRoot',
      'mainRoot',
      'mainIdentity',
      'observation',
      'observationDigest',
      'originalRoots',
      'sourcePolicy',
      'records',
      'digest',
    ])
  )
    return false;
  const { digest, ...payload } = plan;
  const observation = plan.observation;
  return (
    plan.schema === 'aitm.runtime-empty-plan/v1' &&
    validEmptyOperationId(plan.operationId) &&
    rootIdentity(plan.mainIdentity) &&
    plan.projectRoot === plan.mainRoot &&
    plan.projectRoot === plan.mainIdentity.projectRoot &&
    emptyRuntimeDigest(payload) === digest &&
    plan.sourcePolicy === 'proven-total-absence-no-inherited-grants' &&
    emptyRuntimeDigest(plan.records) ===
      emptyRuntimeDigest({
        'state/task-tracker-state.json': '{}\n',
        'state/task-tracker-queue.json': '[]\n',
        ...INITIAL_SHARED_RUNTIME_RECORDS,
      }) &&
    emptyRuntimeDigest(plan.originalRoots) === emptyRuntimeDigest([plan.mainRoot]) &&
    emptyRuntimeKeys(observation, [
      'roots',
      'rootIdentities',
      'unavailableRoots',
      'authority',
      'blockers',
      'writerObservation',
    ]) &&
    emptyRuntimeDigest(observation) === plan.observationDigest &&
    Array.isArray(observation.roots) &&
    observation.roots.length > 0 &&
    observation.roots.includes(plan.mainRoot) &&
    emptyRuntimeDigest(observation.roots) ===
      emptyRuntimeDigest([...new Set(observation.roots)].sort()) &&
    Array.isArray(observation.rootIdentities) &&
    observation.rootIdentities.length === observation.roots.length &&
    observation.rootIdentities.every(
      (identity, index) =>
        rootIdentity(identity) && identity.projectRoot === observation.roots[index]
    ) &&
    emptyRuntimeDigest(
      observation.rootIdentities.find((identity) => identity.projectRoot === plan.mainRoot)
    ) === emptyRuntimeDigest(plan.mainIdentity) &&
    Array.isArray(observation.authority) &&
    observation.authority.every(
      (item) =>
        emptyRuntimeKeys(item, ['target', 'present']) &&
        item.present === false &&
        typeof item.target === 'string'
    ) &&
    Array.isArray(observation.unavailableRoots) &&
    observation.unavailableRoots.length === 0 &&
    Array.isArray(observation.blockers) &&
    observation.blockers.length === 0 &&
    emptyRuntimeKeys(observation.writerObservation, ['complete', 'writers', 'claims', 'unknown']) &&
    observation.writerObservation.complete === true &&
    ['writers', 'claims', 'unknown'].every(
      (key) =>
        Array.isArray(observation.writerObservation[key]) &&
        observation.writerObservation[key].length === 0
    )
  );
}
export function emptyRuntimeControl(plan, status) {
  return {
    schema: 'aitm.runtime-control/v2',
    status,
    projectRoot: plan.projectRoot,
    mainRoot: plan.mainRoot,
    activation: { kind: 'empty-initialization', id: plan.operationId, digest: plan.digest },
  };
}
export function validEmptyRuntimeControl(control) {
  if (
    !control ||
    control.schema !== 'aitm.runtime-control/v2' ||
    !['prepared', 'active'].includes(control.status) ||
    typeof control.projectRoot !== 'string' ||
    typeof control.mainRoot !== 'string' ||
    !emptyRuntimeKeys(control.activation, ['kind', 'id', 'digest']) ||
    control.activation.kind !== 'empty-initialization' ||
    !validEmptyOperationId(control.activation.id) ||
    !validEmptyDigest(control.activation.digest)
  )
    return false;
  if (control.projectRoot === control.mainRoot)
    return emptyRuntimeKeys(control, ['schema', 'status', 'projectRoot', 'mainRoot', 'activation']);
  return (
    emptyRuntimeKeys(control, [
      'schema',
      'status',
      'projectRoot',
      'mainRoot',
      'activation',
      'initialization',
    ]) &&
    emptyRuntimeKeys(control.initialization, ['id', 'operationId', 'digest']) &&
    typeof control.initialization.id === 'string' &&
    /^[a-f0-9]{64}$/.test(control.initialization.id) &&
    validEmptyOperationId(control.initialization.operationId) &&
    validEmptyDigest(control.initialization.digest)
  );
}
export { validOwner as validEmptyRuntimeOwner };

export function validEmptyCoordinatorProof(value) {
  if (
    !emptyRuntimeKeys(value, ['status', 'identity', 'record', 'bytes', 'digest']) ||
    value.status !== 'owned' ||
    !emptyRuntimeKeys(value.identity, ['dev', 'ino']) ||
    !Object.values(value.identity).every(Number.isSafeInteger) ||
    !emptyRuntimeKeys(value.record, ['schema', 'owner', 'transactionId', 'planDigest']) ||
    value.record.schema !== 'aitm.runtime-coordinator/v1' ||
    !validOwner(value.record.owner) ||
    !validEmptyOperationId(value.record.transactionId) ||
    !validEmptyDigest(value.record.planDigest) ||
    typeof value.bytes !== 'string'
  )
    return false;
  try {
    return (
      emptyRuntimeDigest(JSON.parse(value.bytes)) === emptyRuntimeDigest(value.record) &&
      value.digest ===
        'sha256:' +
          createHash('sha256')
            .update(JSON.stringify({ identity: value.identity, bytes: value.bytes }))
            .digest('hex')
    );
  } catch {
    return false;
  }
}
function validEmptyStage(stage, records) {
  if (!object(stage)) return false;
  const directories = ['', 'state', 'fleet'];
  return Object.entries(stage).every(
    ([key, value]) =>
      emptyRuntimeKeys(value, ['kind', 'identity', 'digest']) &&
      physicalIdentity(value.identity) &&
      (directories.includes(key)
        ? value.kind === 'directory' && value.digest === null
        : Object.hasOwn(records, key) &&
          value.kind === 'file' &&
          value.digest === emptyRuntimeDigest(Buffer.from(records[key]))) &&
      (key === '' ||
        Object.hasOwn(stage, key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : ''))
  );
}
export function validEmptyRuntimeJournal(journal) {
  return (
    emptyRuntimeKeys(journal, [
      'schema',
      'status',
      'plan',
      'ancestors',
      'stage',
      'coordinator',
      'owner',
      'ownerHistory',
    ]) &&
    journal.schema === 'aitm.runtime-empty-initialization/v1' &&
    ['prepared', 'publishing', 'complete'].includes(journal.status) &&
    validEmptyRuntimePlan(journal.plan) &&
    emptyRuntimeKeys(journal.ancestors, [
      'runtime',
      'migrations',
      'empty-initializations',
      'operation',
    ]) &&
    Object.values(journal.ancestors).every(physicalIdentity) &&
    validEmptyStage(journal.stage, journal.plan.records) &&
    validOwner(journal.owner) &&
    Array.isArray(journal.ownerHistory) &&
    journal.ownerHistory.length > 0 &&
    journal.ownerHistory.every(validOwner) &&
    emptyRuntimeDigest(journal.ownerHistory.at(-1)) === emptyRuntimeDigest(journal.owner) &&
    validEmptyCoordinatorProof(journal.coordinator) &&
    emptyRuntimeDigest(journal.ownerHistory[0]) ===
      emptyRuntimeDigest(journal.coordinator.record.owner) &&
    journal.coordinator.record.transactionId === journal.plan.operationId &&
    journal.coordinator.record.planDigest === journal.plan.digest &&
    validEmptyDigest(journal.coordinator.digest)
  );
}
