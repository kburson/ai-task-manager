import { assertNoSecretRecordData } from '../github-records/record-secret-policy.mjs';
// @story #1853
// Complete single-comment archives. Rendering never truncates or redacts data.
import { renderApprovalStatement } from './proposal.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import {
  exactKeys,
  identifier,
  hashBytes,
  hashRevisionValue,
  revisionError,
  validateRevisionRequest,
} from './schema.mjs';
export const EVENT_SCHEMA = 'aitm.criteria-revision-event/v1';
const prefix = `<!-- ${EVENT_SCHEMA} -->\n\`\`\`json\n`;
const suffix = '\n```\n';
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
export function revisionEventId(transactionId, operationId, type) {
  return `event-${hashRevisionValue([transactionId, operationId, type]).slice(7)}`;
}
export function createRevisionEvent({
  request,
  predecessorEventId,
  rootEventId,
  rootProposalDigest,
  authorizer = null,
}) {
  validateRevisionRequest(request);
  const p = request.proposal,
    type = p.mode === 'revision' ? 'prepared' : 'recovery-authorized';
  const eventId = revisionEventId(p.transactionId, p.operationId, type);
  return {
    schema: EVENT_SCHEMA,
    type,
    eventId,
    predecessorEventId,
    authorizer: authorizer === null ? null : structuredClone(authorizer),
    repository: p.repository,
    issue: p.issue,
    transactionId: p.transactionId,
    operationId: p.operationId,
    proposalDigest: p.proposalDigest,
    rootEventId: rootEventId ?? eventId,
    rootProposalDigest: rootProposalDigest ?? p.proposalDigest,
    proposal: structuredClone(p),
    authorizationSource: structuredClone(request.authorizationSource),
    executor: structuredClone(p.executor),
    writerDomain: structuredClone(p.writerDomain),
    observedResourceVector: structuredClone(p.archive.resourceVector),
    outcome: null,
  };
}
export function expectedResourceVector(proposal, head, { abort = false } = {}) {
  const v = structuredClone(proposal.archive.resourceVector);
  v.revisionEventHead = head;
  if (!abort)
    for (const write of proposal.writeSet) {
      if (write.resource === 'issue-body') {
        v.projectionHash = write.afterHash;
        const b = v.authorityIdentities.find((x) => x.kind === 'body');
        if (!b) revisionError('body-authority');
        b.hash = write.afterHash;
      } else if (write.resource === 'delivery-contract') v.contractHash = write.afterHash;
    }
  return v;
}
export function createTerminalEvent({ events, type = 'applied' }) {
  const effective = events.findLast((x) => x.proposal !== null);
  if (!effective) revisionError('missing-effective-operation');
  const root = events.find((x) => x.eventId === effective.rootEventId);
  if (!root || !['applied', 'aborted'].includes(type)) revisionError('terminal-root');
  if ((type === 'aborted') !== (effective.proposal.mode === 'abort'))
    revisionError('abort-authorization');
  const head = events.at(-1).eventId;
  return {
    ...structuredClone(effective),
    type,
    eventId: revisionEventId(effective.transactionId, effective.operationId, type),
    predecessorEventId: head,
    proposal: null,
    observedResourceVector: expectedResourceVector(effective.proposal, head, {
      abort: type === 'aborted',
    }),
    outcome: {
      originalDigest: root.proposal.after.semanticContractDigest,
      effectiveDigest: effective.proposal.after.semanticContractDigest,
      revision: effective.proposal.after.revision,
      revisionId: effective.proposal.after.revisionId,
    },
  };
}
export function validateRevisionEvent(e) {
  exactKeys(
    e,
    [
      'schema',
      'type',
      'authorizer',
      'eventId',
      'predecessorEventId',
      'repository',
      'issue',
      'transactionId',
      'operationId',
      'proposalDigest',
      'rootEventId',
      'rootProposalDigest',
      'proposal',
      'authorizationSource',
      'executor',
      'writerDomain',
      'observedResourceVector',
      'outcome',
    ],
    'event-keys'
  );
  if (e.authorizer !== null) {
    exactKeys(
      e.authorizer,
      [
        'reference',
        'statement',
        'statementHash',
        'principal',
        'executingSession',
        'origin',
        'verificationLevel',
      ],
      'authorizer'
    );
    if (
      (e.authorizer.principal !== null &&
        (typeof e.authorizer.principal !== 'string' || !e.authorizer.principal.trim())) ||
      e.authorizer.executingSession !== e.executor.sessionId ||
      e.authorizer.origin !== 'codex-session-transcript' ||
      e.authorizer.verificationLevel !== 'host-verified-user-message' ||
      e.authorizer.reference !==
        `codex://sessions/${e.authorizationSource.sessionId}/messages/${e.authorizationSource.messageId}` ||
      e.authorizer.statementHash !== e.authorizationSource.statementHash ||
      hashBytes(e.authorizer.statement) !== e.authorizer.statementHash ||
      (e.proposal && e.authorizer.statement !== renderApprovalStatement(e.proposal))
    )
      revisionError('authorizer');
  }
  if (
    e.schema !== EVENT_SCHEMA ||
    !['prepared', 'recovery-authorized', 'applied', 'aborted'].includes(e.type)
  )
    revisionError('event-schema');
  for (const id of [e.eventId, e.transactionId, e.operationId, e.rootEventId]) identifier(id);
  if (e.predecessorEventId !== null) identifier(e.predecessorEventId);
  if (e.eventId !== revisionEventId(e.transactionId, e.operationId, e.type))
    revisionError('event-identity');
  if (['prepared', 'recovery-authorized'].includes(e.type)) {
    const p = e.proposal;
    validateRevisionRequest({
      schema: 'aitm.criteria-revision/v1',
      action: e.type === 'prepared' ? 'apply' : 'recover',
      proposal: p,
      authorizationSource: e.authorizationSource,
    });
    for (const key of [
      'repository',
      'issue',
      'transactionId',
      'operationId',
      'proposalDigest',
      'executor',
      'writerDomain',
    ])
      if (!equal(e[key], p[key])) revisionError('event-proposal-binding');
    if (!equal(e.observedResourceVector, p.archive.resourceVector) || e.outcome !== null)
      revisionError('event-observation');
    if (
      e.type === 'prepared' &&
      (e.rootEventId !== e.eventId || e.rootProposalDigest !== p.proposalDigest)
    )
      revisionError('event-root');
  } else {
    if (e.proposal !== null) revisionError('terminal-proposal');
    exactKeys(
      e.outcome,
      ['originalDigest', 'effectiveDigest', 'revision', 'revisionId'],
      'terminal-outcome'
    );
  }
  return e;
}
const REFERENCE_SCHEMA = 'aitm.criteria-revision-event-reference/v1';
function wireEvent(event) {
  const wire = structuredClone(event);
  if (wire.proposal)
    wire.proposal.archive.observation.revisionRecords.records =
      wire.proposal.archive.observation.revisionRecords.records.map(({ bytes, ...record }) => ({
        ...record,
        reference: {
          schema: REFERENCE_SCHEMA,
          eventId: record.eventId,
          bytesHash: hashBytes(bytes),
        },
      }));
  return wire;
}
export function renderRevisionEvent(event) {
  validateRevisionEvent(event);
  assertNoSecretRecordData(event, {
    safeKeyNames: [
      'authority',
      'authorityIdentities',
      'authorizer',
      'authorizationSource',
      'authorityEpoch',
    ],
  });
  const bytes = prefix + canonicalRecordJson(wireEvent(event)) + suffix;
  if (Buffer.byteLength(bytes, 'utf8') > 60000) revisionError('revision-archive-too-large');
  return bytes;
}
// Parse only the closed canonical envelope before the complete paginated reader
// supplies the actual referenced comments. A reference never stands in for bytes.
export function readRevisionEnvelope(bytes) {
  if (typeof bytes !== 'string') revisionError('event-bytes');
  if (!bytes.includes(EVENT_SCHEMA)) return null;
  if (!bytes.startsWith(prefix) || !bytes.endsWith(suffix)) revisionError('event-envelope');
  if (Buffer.byteLength(bytes, 'utf8') > 60000) revisionError('revision-archive-too-large');
  let e;
  try {
    e = JSON.parse(bytes.slice(prefix.length, -suffix.length));
  } catch {
    revisionError('event-json');
  }
  if (prefix + canonicalRecordJson(e) + suffix !== bytes) revisionError('event-noncanonical');
  return e;
}
function referenceRecords(event) {
  return event.proposal?.archive?.observation?.revisionRecords?.records ?? [];
}
function resolveReferences(event, available, visiting = new Set(), verified = new Set()) {
  if (visiting.has(event.eventId)) revisionError('event-reference-cycle');
  if (verified.has(event.eventId)) return;
  visiting.add(event.eventId);
  for (const record of referenceRecords(event)) {
    exactKeys(
      record,
      ['eventId', 'transactionId', 'operationId', 'proposalDigest', 'reference'],
      'event-reference-record'
    );
    exactKeys(record.reference, ['schema', 'eventId', 'bytesHash'], 'event-reference');
    const ref = record.reference;
    if (ref.schema !== REFERENCE_SCHEMA || ref.eventId !== record.eventId)
      revisionError('event-reference');
    if (visiting.has(ref.eventId)) revisionError('event-reference-cycle');
    const bytes = available.get(ref.eventId);
    if (typeof bytes !== 'string' || hashBytes(bytes) !== ref.bytesHash)
      revisionError('event-reference-unavailable');
    const prior = readRevisionEnvelope(bytes);
    if (
      !prior ||
      ['eventId', 'transactionId', 'operationId', 'proposalDigest'].some(
        (k) => prior[k] !== record[k]
      )
    )
      revisionError('event-reference-binding');
    resolveReferences(prior, available, visiting, verified);
  }
  visiting.delete(event.eventId);
  verified.add(event.eventId);
}
export function parseRevisionEvent(bytes, { records = [] } = {}) {
  const wire = readRevisionEnvelope(bytes);
  if (wire === null) return null;
  const available = new Map();
  for (const record of records) {
    if (available.has(record.eventId)) revisionError('duplicate-event-reference');
    available.set(record.eventId, record.bytes);
  }
  resolveReferences(wire, available);
  const event = structuredClone(wire);
  if (event.proposal)
    event.proposal.archive.observation.revisionRecords.records = referenceRecords(wire).map(
      ({ reference, ...record }) => ({ ...record, bytes: available.get(reference.eventId) })
    );
  if (renderRevisionEvent(event) !== bytes) revisionError('event-noncanonical');
  return event;
}
export function revisionRecord(event) {
  return {
    eventId: event.eventId,
    transactionId: event.transactionId,
    operationId: event.operationId,
    proposalDigest: event.proposalDigest,
    bytes: renderRevisionEvent(event),
  };
}
