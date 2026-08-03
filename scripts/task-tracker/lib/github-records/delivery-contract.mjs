import { createHash } from 'node:crypto';

import { canonicalRecordJson } from './canonical-json.mjs';
import {
  renderDeliveryContract as renderContract,
  validateContractProjection,
} from './delivery-contract-renderer.mjs';

function definitionHash(definitions) {
  return `sha256:${createHash('sha256').update(canonicalRecordJson(definitions)).digest('hex')}`;
}

function contractError(category) {
  return new TypeError(`delivery-contract:${category}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function createDraftContract({
  previousContract,
  recordId,
  authorityEpoch,
  coordinatorGrantId,
  acceptanceCriteria = [],
  verificationCommands = [],
  definitionOfDone = [],
  lifecycleProjection = {},
  acceptedRecordIds = [],
} = {}) {
  const definitions = { acceptanceCriteria, verificationCommands, definitionOfDone };
  const draft = {
    schema: 'aitm.delivery-contract/v1',
    recordId: previousContract?.recordId ?? recordId,
    revision: (previousContract?.revision ?? 0) + 1,
    contractEpoch: previousContract?.contractEpoch ?? 1,
    authorityEpoch: previousContract?.authorityEpoch ?? authorityEpoch,
    coordinatorGrantId: previousContract?.coordinatorGrantId ?? coordinatorGrantId,
    status: 'draft',
    definitionHash: definitionHash(definitions),
    projectionHash: '',
    acceptanceCriteria: structuredClone(acceptanceCriteria),
    verificationCommands: structuredClone(verificationCommands),
    definitionOfDone: structuredClone(definitionOfDone),
    lifecycleProjection: structuredClone(lifecycleProjection),
    acceptedRecordIds: structuredClone(acceptedRecordIds),
  };
  const rendered = renderContract({ contract: draft });
  return Object.freeze({ ...draft, projectionHash: rendered.projectionHash });
}

export function renderDeliveryContract(input) {
  return renderContract(input);
}

export { validateContractProjection };

export function sealContract({ contract, authorityEpoch, coordinatorGrantId } = {}) {
  if (contract?.status === 'sealed') throw contractError('already-sealed');
  if (
    contract?.status !== 'draft' ||
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

export function amendContract() {
  throw new TypeError('delivery-contract:not-implemented');
}
