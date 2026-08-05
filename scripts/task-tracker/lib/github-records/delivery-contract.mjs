import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './canonical-json.mjs';
import { assertNoSecretRecordData } from './record-secret-policy.mjs';
import {
  renderDeliveryContract as renderContract,
  validateRenderedContractProjection,
} from './delivery-contract-renderer.mjs';

const CONTRACT_SCHEMA = 'aitm.delivery-contract/v1';
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const ITEM_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const RECORD_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const CONTRACT_KEYS = [
  'acceptanceCriteria',
  'acceptedRecordIds',
  'authorityEpoch',
  'contractEpoch',
  'coordinatorGrantId',
  'definitionHash',
  'definitionOfDone',
  'lifecycleProjection',
  'projectionHash',
  'recordId',
  'revision',
  'schema',
  'status',
  'verificationCommands',
];
const DRAFT_INPUT_KEYS = [
  'acceptanceCriteria',
  'acceptedRecordIds',
  'authorityEpoch',
  'coordinatorGrantId',
  'definitionOfDone',
  'lifecycleProjection',
  'previousContract',
  'recordId',
  'verificationCommands',
];
const AMEND_INPUT_KEYS = [
  'acceptanceCriteria',
  'authorityEpoch',
  'contract',
  'coordinatorGrantId',
  'definitionOfDone',
  'expectedContractEpoch',
  'verificationCommands',
];
const DEFINITION_KINDS = ['acceptanceCriteria', 'verificationCommands', 'definitionOfDone'];

function contractError(category) {
  return new TypeError(`delivery-contract:${category}`);
}

function hasExactlyKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index])
  );
}

function isPlainDataObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertInputKeys(input, expectedKeys) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw contractError('input');
  }
  if (!Object.keys(input).every((key) => expectedKeys.includes(key))) throw contractError('keys');
}

function assertDurableData(value) {
  try {
    assertNoSecretRecordData(value, {
      safeKeyNames: ['authorityEpoch', 'verificationCommands'],
    });
  } catch {
    throw contractError('durable-data');
  }
}

function isRecordId(value) {
  return typeof value === 'string' && RECORD_ID_RE.test(value);
}

function isItemId(value) {
  return typeof value === 'string' && ITEM_ID_RE.test(value);
}

function isVisibleText(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function definitionHash(definitions) {
  return `sha256:${createHash('sha256').update(canonicalRecordJson(definitions)).digest('hex')}`;
}

function orderedDefinitionJson({ acceptanceCriteria, verificationCommands, definitionOfDone }) {
  return canonicalRecordJson({ acceptanceCriteria, verificationCommands, definitionOfDone });
}

function normalizedDefinitionDomain({
  acceptanceCriteria,
  verificationCommands,
  definitionOfDone,
}) {
  return {
    acceptanceCriteria: [...acceptanceCriteria].sort((left, right) =>
      left.logicalId.localeCompare(right.logicalId)
    ),
    verificationCommands: [...verificationCommands].sort((left, right) =>
      left.logicalId.localeCompare(right.logicalId)
    ),
    definitionOfDone: [...definitionOfDone].sort((left, right) =>
      left.logicalId.localeCompare(right.logicalId)
    ),
  };
}

function assertDefinitionEntries(entries, kind, logicalIds) {
  if (!Array.isArray(entries)) throw contractError('definitions');
  const expectedKeys =
    kind === 'verificationCommands' ? ['command', 'logicalId'] : ['logicalId', 'text'];
  for (const entry of entries) {
    if (!hasExactlyKeys(entry, expectedKeys)) throw contractError('definition-keys');
    if (!isItemId(entry.logicalId)) throw contractError('logical-id');
    if (!isVisibleText(kind === 'verificationCommands' ? entry.command : entry.text)) {
      throw contractError('definition-value');
    }
    if (logicalIds.has(entry.logicalId)) throw contractError('duplicate-logical-id');
    logicalIds.add(entry.logicalId);
  }
}

function assertDefinitions(definitions) {
  const logicalIds = new Set();
  for (const kind of DEFINITION_KINDS) assertDefinitionEntries(definitions[kind], kind, logicalIds);
}

function assertNoRetiredLogicalIds(previousDefinitions, definitions) {
  const currentIds = new Set(
    DEFINITION_KINDS.flatMap((kind) => definitions[kind].map(({ logicalId }) => logicalId))
  );
  for (const kind of DEFINITION_KINDS) {
    for (const { logicalId } of previousDefinitions[kind]) {
      if (definitions[kind].some((item) => item.logicalId === logicalId)) continue;
      if (currentIds.has(logicalId)) throw contractError('logical-id-kind');
      throw contractError('retired-logical-id');
    }
  }
}

function definitionIds(definitions) {
  return Object.fromEntries(
    DEFINITION_KINDS.map((kind) => [
      kind,
      new Set(definitions[kind].map(({ logicalId }) => logicalId)),
    ])
  );
}

function normalizeLifecycleProjection(value, definitions) {
  if (value === undefined) value = {};
  if (!isPlainDataObject(value)) {
    throw contractError('lifecycle-projection');
  }
  if (!Object.keys(value).every((key) => DEFINITION_KINDS.includes(key))) {
    throw contractError('lifecycle-projection');
  }
  const ids = definitionIds(definitions);
  return Object.fromEntries(
    DEFINITION_KINDS.map((kind) => {
      const states = value[kind] ?? {};
      if (!isPlainDataObject(states)) {
        throw contractError('lifecycle-projection');
      }
      for (const [logicalId, checked] of Object.entries(states)) {
        if (!ids[kind].has(logicalId) || typeof checked !== 'boolean') {
          throw contractError('lifecycle-projection');
        }
      }
      return [kind, { ...states }];
    })
  );
}

function normalizeAcceptedRecordIds(value) {
  if (!Array.isArray(value) || !value.every(isRecordId)) throw contractError('accepted-record-ids');
  const unique = [...new Set(value)];
  if (unique.length !== value.length) throw contractError('accepted-record-ids');
  return unique.sort();
}

function validateContract(contract) {
  assertDurableData(contract);
  if (contract === null || typeof contract !== 'object' || Array.isArray(contract)) {
    throw contractError('keys');
  }
  if (contract.schema !== CONTRACT_SCHEMA) throw contractError('unsupported-schema');
  if (!hasExactlyKeys(contract, CONTRACT_KEYS)) throw contractError('keys');
  if (!isRecordId(contract.recordId)) throw contractError('record-id');
  if (!Number.isInteger(contract.revision) || contract.revision <= 0)
    throw contractError('revision');
  if (!Number.isInteger(contract.contractEpoch) || contract.contractEpoch <= 0) {
    throw contractError('contract-epoch');
  }
  if (!Number.isInteger(contract.authorityEpoch) || contract.authorityEpoch <= 0) {
    throw contractError('authority-epoch');
  }
  if (!isRecordId(contract.coordinatorGrantId)) throw contractError('coordinator-grant-id');
  if (!['draft', 'sealed'].includes(contract.status)) throw contractError('status');
  if (!HASH_RE.test(contract.definitionHash)) throw contractError('definition-hash');
  if (!HASH_RE.test(contract.projectionHash)) throw contractError('projection-hash');
  const definitions = {
    acceptanceCriteria: contract.acceptanceCriteria,
    verificationCommands: contract.verificationCommands,
    definitionOfDone: contract.definitionOfDone,
  };
  assertDefinitions(definitions);
  const normalizedLifecycle = normalizeLifecycleProjection(
    contract.lifecycleProjection,
    definitions
  );
  const acceptedRecordIds = normalizeAcceptedRecordIds(contract.acceptedRecordIds);
  if (
    canonicalRecordJson(normalizedLifecycle) !== canonicalRecordJson(contract.lifecycleProjection)
  ) {
    throw contractError('lifecycle-projection');
  }
  if (canonicalRecordJson(acceptedRecordIds) !== canonicalRecordJson(contract.acceptedRecordIds)) {
    throw contractError('accepted-record-ids');
  }
  if (contract.definitionHash !== definitionHash(normalizedDefinitionDomain(definitions))) {
    throw contractError('definition-hash');
  }
  const rendered = renderContract({ contract });
  if (contract.projectionHash !== rendered.projectionHash) throw contractError('projection-hash');
  return contract;
}

function draftDefinitionInput(input, previousContract) {
  const definitions = Object.fromEntries(
    DEFINITION_KINDS.map((kind) => [kind, input[kind] ?? previousContract?.[kind] ?? []])
  );
  assertDefinitions(definitions);
  return definitions;
}

export function createDraftContract(input = {}) {
  assertInputKeys(input, DRAFT_INPUT_KEYS);
  const previousContract = input.previousContract;
  if (previousContract !== undefined) {
    validateContract(previousContract);
    if (previousContract.status !== 'draft') throw contractError('sealed-contract');
  }
  const definitions = draftDefinitionInput(input, previousContract);
  if (previousContract !== undefined) assertNoRetiredLogicalIds(previousContract, definitions);
  const lifecycleInput =
    input.lifecycleProjection ?? previousContract?.lifecycleProjection ?? Object.create(null);
  const acceptedInput = input.acceptedRecordIds ?? previousContract?.acceptedRecordIds ?? [];
  const draft = {
    schema: CONTRACT_SCHEMA,
    recordId: previousContract?.recordId ?? input.recordId,
    revision: (previousContract?.revision ?? 0) + 1,
    contractEpoch: previousContract?.contractEpoch ?? 1,
    authorityEpoch: previousContract?.authorityEpoch ?? input.authorityEpoch,
    coordinatorGrantId: previousContract?.coordinatorGrantId ?? input.coordinatorGrantId,
    status: 'draft',
    definitionHash: definitionHash(normalizedDefinitionDomain(definitions)),
    projectionHash: '',
    acceptanceCriteria: structuredClone(definitions.acceptanceCriteria),
    verificationCommands: structuredClone(definitions.verificationCommands),
    definitionOfDone: structuredClone(definitions.definitionOfDone),
    lifecycleProjection: normalizeLifecycleProjection(lifecycleInput, definitions),
    acceptedRecordIds: normalizeAcceptedRecordIds(acceptedInput),
  };
  if (!isRecordId(draft.recordId)) throw contractError('record-id');
  if (!Number.isInteger(draft.authorityEpoch) || draft.authorityEpoch <= 0) {
    throw contractError('authority-epoch');
  }
  if (!isRecordId(draft.coordinatorGrantId)) throw contractError('coordinator-grant-id');
  assertDurableData(draft);
  const rendered = renderContract({ contract: draft });
  return deepFreeze({ ...draft, projectionHash: rendered.projectionHash });
}

export function renderDeliveryContract(input) {
  return renderContract(input);
}

export function validateDeliveryContract(contract) {
  validateContract(contract);
  return true;
}

export function validateContractProjection({ contract, markdown } = {}) {
  validateContract(contract);
  return validateRenderedContractProjection({ contract, markdown });
}

export function sealContract({ contract, authorityEpoch, coordinatorGrantId } = {}) {
  validateContract(contract);
  if (contract.status === 'sealed') throw contractError('already-sealed');
  if (
    authorityEpoch !== contract.authorityEpoch ||
    coordinatorGrantId !== contract.coordinatorGrantId
  ) {
    throw contractError('authority');
  }
  if (
    contract.acceptanceCriteria.length === 0 ||
    contract.verificationCommands.length === 0 ||
    contract.definitionOfDone.length === 0
  ) {
    throw contractError('incomplete');
  }
  const snapshot = deepFreeze({ ...structuredClone(contract), status: 'sealed' });
  return deepFreeze({
    contract: snapshot,
    capsule: { recordType: 'contract-sealed', payload: snapshot },
  });
}

function resetLifecycleProjection() {
  return Object.fromEntries(DEFINITION_KINDS.map((kind) => [kind, {}]));
}

function resetLifecycleChecks(contract) {
  return Object.fromEntries(
    DEFINITION_KINDS.map((kind) => [
      kind,
      Object.entries(contract.lifecycleProjection[kind])
        .filter(([, checked]) => checked)
        .map(([logicalId]) => logicalId)
        .sort(),
    ])
  );
}

export function amendContract(input = {}) {
  assertInputKeys(input, AMEND_INPUT_KEYS);
  const {
    contract,
    expectedContractEpoch,
    authorityEpoch,
    coordinatorGrantId,
    acceptanceCriteria,
    verificationCommands,
    definitionOfDone,
  } = input;
  validateContract(contract);
  if (expectedContractEpoch !== contract.contractEpoch) throw contractError('stale-epoch');
  if (
    contract.status !== 'sealed' ||
    authorityEpoch !== contract.authorityEpoch ||
    coordinatorGrantId !== contract.coordinatorGrantId
  ) {
    throw contractError('authority');
  }
  const definitions = { acceptanceCriteria, verificationCommands, definitionOfDone };
  assertDefinitions(definitions);
  assertNoRetiredLogicalIds(contract, definitions);
  if (orderedDefinitionJson(definitions) === orderedDefinitionJson(contract)) {
    throw contractError('no-op-amendment');
  }
  const nextDefinitionHash = definitionHash(normalizedDefinitionDomain(definitions));
  const amended = {
    ...structuredClone(contract),
    revision: contract.revision + 1,
    contractEpoch: contract.contractEpoch + 1,
    definitionHash: nextDefinitionHash,
    projectionHash: '',
    acceptanceCriteria: structuredClone(acceptanceCriteria),
    verificationCommands: structuredClone(verificationCommands),
    definitionOfDone: structuredClone(definitionOfDone),
    lifecycleProjection: resetLifecycleProjection(),
    acceptedRecordIds: [],
  };
  const rendered = renderContract({ contract: amended });
  const snapshot = deepFreeze({ ...amended, projectionHash: rendered.projectionHash });
  const invalidation = deepFreeze({
    priorContractEpoch: contract.contractEpoch,
    invalidatedEvidenceKinds: ['test', 'review', 'approval'],
    removedAcceptedRecordIds: structuredClone(contract.acceptedRecordIds),
    resetLifecycleChecks: resetLifecycleChecks(contract),
  });
  return deepFreeze({
    contract: snapshot,
    invalidation,
    capsule: { recordType: 'contract-amended', payload: snapshot },
  });
}
