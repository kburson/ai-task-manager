// @story #1787 #1794
import { buildDeliveryScope } from './delivery-scope.mjs';
import {
  validateWorkflowExceptionEnvelope,
  WORKFLOW_EXCEPTION_RECORD_TYPE,
  WORKFLOW_EXCEPTION_SCHEMA,
  WORKFLOW_EXCEPTION_SCHEMA_V2,
} from './exception-record.mjs';

function fail(category) {
  throw new TypeError(`exception-partitions:${category}`);
}

function immutableMap(entries) {
  const map = new Map(entries);
  const refuse = () => fail('immutable');
  Object.defineProperties(map, {
    set: { value: refuse },
    delete: { value: refuse },
    clear: { value: refuse },
  });
  return Object.freeze(map);
}

export function partitionWorkflowExceptions({ records, repository, issue } = {}) {
  if (!Array.isArray(records)) fail('records');
  const ordinary = [];
  const delivery = new Map();
  const identityByRecordId = new Map();
  const deliveryKeyByExceptionId = new Map();
  for (const record of records) {
    if (record?.envelope?.recordType !== WORKFLOW_EXCEPTION_RECORD_TYPE) continue;
    const envelope = record.envelope;
    try {
      validateWorkflowExceptionEnvelope(envelope, { repository, issue });
    } catch (error) {
      fail(`invalid-record:${error.message}`);
    }
    if (identityByRecordId.has(envelope.recordId)) fail('duplicate-record-id');
    let identity;
    if (envelope.payload.schema === WORKFLOW_EXCEPTION_SCHEMA) {
      identity = 'ordinary';
      ordinary.push(record);
    } else if (envelope.payload.schema === WORKFLOW_EXCEPTION_SCHEMA_V2) {
      const { partitionKey } = buildDeliveryScope(envelope.payload.deliveryScope);
      identity = partitionKey;
      const priorKey = deliveryKeyByExceptionId.get(envelope.payload.exceptionId);
      if (priorKey && priorKey !== partitionKey) fail('duplicate-delivery-exception-id');
      deliveryKeyByExceptionId.set(envelope.payload.exceptionId, partitionKey);
      delivery.set(partitionKey, [...(delivery.get(partitionKey) ?? []), record]);
    } else {
      fail('unknown-schema');
    }
    identityByRecordId.set(envelope.recordId, identity);
  }
  for (const [key, members] of delivery) {
    const roots = members.filter(({ envelope }) => envelope.payload.revision === 1);
    if (roots.length !== 1) fail('delivery-root');
    const exceptionIds = new Set(members.map(({ envelope }) => envelope.payload.exceptionId));
    if (exceptionIds.size !== 1) fail('delivery-exception-id');
    const revisions = new Set(members.map(({ envelope }) => envelope.payload.revision));
    if (revisions.size !== members.length) fail('delivery-fork');
    const ordered = [...members].sort(
      (left, right) => left.envelope.payload.revision - right.envelope.payload.revision
    );
    for (let index = 1; index < ordered.length; index += 1) {
      const previousEnvelope = ordered[index - 1].envelope;
      const currentEnvelope = ordered[index].envelope;
      const previous = previousEnvelope.payload;
      const current = currentEnvelope.payload;
      if (
        current.revision !== previous.revision + 1 ||
        currentEnvelope.predecessor !== previousEnvelope.recordId ||
        currentEnvelope.supersedes !== previousEnvelope.recordId
      ) {
        fail('delivery-chain');
      }
      if (
        previous.waiverScopeDigest !== current.waiverScopeDigest &&
        previous.approvalEvidence.reference === current.approvalEvidence.reference
      ) {
        fail('fresh-approval-required');
      }
    }
    delivery.set(key, Object.freeze([...members]));
  }
  for (const record of [...ordinary, ...[...delivery.values()].flat()]) {
    const { envelope } = record;
    const identity = identityByRecordId.get(envelope.recordId);
    for (const link of [envelope.predecessor, envelope.supersedes]) {
      if (
        link !== null &&
        identityByRecordId.has(link) &&
        identityByRecordId.get(link) !== identity
      ) {
        fail('cross-partition-link');
      }
    }
  }
  return Object.freeze({ ordinary: Object.freeze(ordinary), delivery: immutableMap(delivery) });
}
