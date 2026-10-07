import { validateCanonicalArchive } from './canonical.mjs';
// @story #1851
// Closed internal data contracts. Validation proves consistency, not remote freshness.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { validateDeliveryContract } from '../github-records/delivery-contract.mjs';
import { validateAuthorizationSource } from '../workflow-policy/authority-resolver.mjs';
import { deriveProposal } from './proposal.mjs';
export const REVISION_SCHEMA = 'aitm.criteria-revision/v1';
export const OBSERVATION_SCHEMA = 'aitm.criteria-revision-observation/v1';
export const REVISION_MODES = Object.freeze(['revision', 'resume', 'abort', 'forward-repair']);
export const PROOF_KINDS = Object.freeze([
  'ac-proof',
  'vc-proof',
  'dod-proof',
  'aggregate-proof',
  'checkbox-assertion',
  'plan-approval',
  'test',
  'agent-review',
  'final-review',
  'historical',
  'delivery',
]);
export const hashBytes = (value) =>
  `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
export const hashRevisionValue = (value) => hashBytes(canonicalRecordJson(value));
export function revisionError(category) {
  throw new TypeError(`criteria-revision:${category}`);
}
export function exactKeys(value, keys, category = 'keys') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) revisionError(category);
  const actual = Object.keys(value).sort(),
    expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((x, i) => x !== expected[i]))
    revisionError(category);
}
function array(value, category) {
  if (!Array.isArray(value)) revisionError(category);
  return value;
}
export function identifier(value, category = 'identifier') {
  if (
    typeof value !== 'string' ||
    !/^[-_a-zA-Z0-9]+$/.test(value) ||
    Buffer.byteLength(value, 'ascii') > 256
  )
    revisionError(category);
  return value;
}
export function text(value, category = 'text', { empty = false, line = false } = {}) {
  if (
    typeof value !== 'string' ||
    (!empty && value.trim() === '') ||
    (line && (/[\r\n]/.test(value) || value.includes('\0')))
  )
    revisionError(category);
  return value;
}
function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) revisionError('integer');
}
function digest(value, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) revisionError('digest');
}
function unique(values, category) {
  if (new Set(values).size !== values.length) revisionError(category);
}
function strings(values, category) {
  array(values, category).forEach((x) => text(x, category, { line: true }));
  unique(values, category);
}
function bindings(value) {
  array(value, 'bindings').forEach((x) => {
    exactKeys(x, ['identity', 'hash']);
    text(x.identity);
    digest(x.hash);
  });
  unique(
    value.map((x) => x.identity),
    'duplicate-binding'
  );
}
export function validateExecutor(value) {
  exactKeys(value, ['adapter', 'sessionId', 'worktree', 'branch']);
  if (value.adapter !== 'codex-session/v1') revisionError('executor-host');
  identifier(value.sessionId);
  text(value.branch, 'branch', { line: true });
  if (!path.isAbsolute(value.worktree)) revisionError('worktree');
  return value;
}
function domain(value) {
  exactKeys(value, ['hostId', 'commonDirectory']);
  identifier(value.hostId);
  if (typeof value.commonDirectory !== 'string' || !path.isAbsolute(value.commonDirectory))
    revisionError('writer-domain');
}
function coordinator(value) {
  exactKeys(value, ['actor', 'platform', 'session']);
  text(value.actor);
  text(value.platform);
  identifier(value.session);
}
export function validateDeclaration(value, { replacement = false } = {}) {
  if (value?.kind === 'vc-list') {
    exactKeys(value, ['kind', 'vcIds'], 'declaration-keys');
    strings(value.vcIds, 'vc-ids');
    if (!value.vcIds.length || value.vcIds.some((x) => !/^\d+$|^[a-z][a-z0-9-]{0,63}$/.test(x)))
      revisionError('declaration');
  } else if (!replacement && value?.kind === 'commands') {
    exactKeys(value, ['kind', 'commands'], 'declaration-keys');
    strings(value.commands, 'commands');
    if (!value.commands.length) revisionError('declaration');
  } else if (!replacement && value?.kind === 'none') exactKeys(value, ['kind'], 'declaration-keys');
  else revisionError('declaration');
  return value;
}
export function validateEdits(value) {
  exactKeys(value, ['acceptanceCriteria', 'verificationCommands']);
  array(value.acceptanceCriteria, 'ac-edits');
  array(value.verificationCommands, 'vc-edits');
  for (const edit of value.acceptanceCriteria) {
    exactKeys(edit, ['operation', 'occurrence', 'oldBytes', 'oldHash', 'replacements']);
    integer(edit.occurrence, 1);
    text(edit.oldBytes);
    digest(edit.oldHash);
    if (!['replace', 'delete', 'split'].includes(edit.operation))
      revisionError('ac-edit-operation');
    array(edit.replacements, 'replacements');
    if (
      (edit.operation === 'replace' && edit.replacements.length !== 1) ||
      (edit.operation === 'delete' && edit.replacements.length !== 0) ||
      (edit.operation === 'split' && edit.replacements.length < 2)
    )
      revisionError('ac-edit-arity');
    for (const item of edit.replacements) {
      exactKeys(item, ['text', 'declaration']);
      text(item.text, 'replacement-text', { line: true });
      if (/<!--|-->|^#{1,6}\s/.test(item.text)) revisionError('replacement-text');
      validateDeclaration(item.declaration, { replacement: true });
    }
  }
  unique(
    value.acceptanceCriteria.map((x) => x.occurrence),
    'ambiguous-occurrence'
  );
  for (const edit of value.verificationCommands) {
    const keys =
      edit.operation === 'add'
        ? ['operation', 'id', 'command']
        : edit.operation === 'delete'
          ? ['operation', 'id', 'oldCommand', 'oldHash']
          : ['operation', 'id', 'oldCommand', 'oldHash', 'command'];
    exactKeys(edit, keys);
    if (!['add', 'replace', 'delete'].includes(edit.operation)) revisionError('vc-edit-operation');
    identifier(edit.id);
    if (edit.operation !== 'add') {
      text(edit.oldCommand, 'command', { line: true });
      digest(edit.oldHash);
    }
    if (edit.operation !== 'delete') {
      text(edit.command, 'command', { line: true });
      if (/<!--|-->|`/.test(edit.command)) revisionError('command');
    }
  }
  unique(
    value.verificationCommands.map((x) => x.id),
    'duplicate-vc-edit'
  );
  return value;
}
export function validateDefinitions(value) {
  array(value, 'definitions');
  for (const item of value) {
    exactKeys(item, [
      'identity',
      'section',
      'rootId',
      'occurrence',
      'text',
      'declaration',
      'declarationBytes',
      'commands',
      'sourceBindings',
      'originalBytes',
      'checked',
      'proof',
    ]);
    text(item.identity);
    if (!['ac', 'vc', 'dod'].includes(item.section)) revisionError('section');
    integer(item.occurrence, 1);
    if (item.rootId !== null) identifier(item.rootId);
    text(item.text);
    text(item.originalBytes);
    text(item.declarationBytes, 'declaration-bytes', { empty: true });
    validateDeclaration(item.declaration);
    array(item.commands, 'commands').forEach((x) => text(x, 'command', { line: true }));
    bindings(item.sourceBindings);
    if (typeof item.checked !== 'boolean') revisionError('checked');
    if (item.proof !== null) {
      exactKeys(item.proof, ['identity', 'bytes']);
      text(item.proof.identity);
      text(item.proof.bytes);
    }
  }
  unique(
    value.map((x) => x.identity),
    'duplicate-identity'
  );
  return value;
}
export function validateRevisionObservation(value) {
  canonicalRecordJson(value);
  exactKeys(value, [
    'schema',
    'repository',
    'issue',
    'writerDomain',
    'executor',
    'stage',
    'issueState',
    'delivery',
    'sourceKind',
    'body',
    'contract',
    'capsule',
    'grant',
    'protectedSourceBindings',
    'criterionBindings',
    'proofRecords',
    'revisionRecords',
    'identities',
    'retiredIdentities',
    'revision',
    'revisionId',
    ...(value.sourceKind === 'canonical-contract' ? ['canonicalArchive'] : []),
  ]);
  if (value.schema !== OBSERVATION_SCHEMA) revisionError('observation-schema');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)) revisionError('repository');
  integer(value.issue, 1);
  domain(value.writerDomain);
  validateExecutor(value.executor);
  if (
    !['backlog', 'refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review', 'done'].includes(
      value.stage
    ) ||
    !['open', 'closed'].includes(value.issueState)
  )
    revisionError('stage');
  exactKeys(value.delivery, ['state', 'records']);
  if (!['none', 'delivered', 'unknown'].includes(value.delivery.state)) revisionError('delivery');
  array(value.delivery.records, 'delivery-records').forEach((x) => {
    exactKeys(x, ['identity', 'bytes']);
    text(x.identity);
    text(x.bytes);
  });
  exactKeys(value.body, ['bytes', 'version']);
  text(value.body.bytes);
  integer(value.body.version);
  bindings(value.protectedSourceBindings);
  integer(value.revision);
  if (value.revision === 0) {
    if (value.revisionId !== null) revisionError('revision-identity');
  } else identifier(value.revisionId);
  for (const b of array(value.criterionBindings, 'criterion-bindings')) {
    exactKeys(b, ['criterionIdentity', 'vcIds', 'sourceBindings']);
    text(b.criterionIdentity);
    strings(b.vcIds, 'vc-ids');
    bindings(b.sourceBindings);
  }
  unique(
    value.criterionBindings.map((x) => x.criterionIdentity),
    'duplicate-binding'
  );
  for (const record of array(value.proofRecords, 'proof-records')) {
    exactKeys(record, ['kind', 'identity', 'bytes', 'criterionIdentity']);
    if (!PROOF_KINDS.includes(record.kind)) revisionError('proof-kind');
    text(record.identity);
    text(record.bytes);
    if (record.criterionIdentity !== null) text(record.criterionIdentity);
  }
  unique(
    value.proofRecords.map((x) => x.identity),
    'duplicate-proof'
  );
  exactKeys(value.revisionRecords, ['complete', 'records']);
  if (value.revisionRecords.complete !== true) revisionError('revision-pagination');
  for (const record of array(value.revisionRecords.records, 'revision-records')) {
    exactKeys(record, ['eventId', 'transactionId', 'operationId', 'proposalDigest', 'bytes']);
    identifier(record.eventId);
    identifier(record.transactionId);
    identifier(record.operationId);
    digest(record.proposalDigest);
    text(record.bytes);
  }
  unique(
    value.revisionRecords.records.map((x) => x.eventId),
    'duplicate-event'
  );
  const operations = new Map();
  for (const record of value.revisionRecords.records) {
    const binding = `${record.transactionId}:${record.proposalDigest}`;
    if (operations.has(record.operationId) && operations.get(record.operationId) !== binding)
      revisionError('duplicate-operation');
    operations.set(record.operationId, binding);
  }
  strings(value.retiredIdentities, 'retired-identities');
  if (value.identities !== null) {
    for (const item of array(value.identities, 'identities')) {
      exactKeys(item, ['identity', 'section', 'rootId', 'definitionHash']);
      text(item.identity);
      if (!['ac', 'vc', 'dod'].includes(item.section)) revisionError('section');
      if (item.rootId !== null) identifier(item.rootId);
      digest(item.definitionHash);
    }
    unique(
      value.identities.map((x) => x.identity),
      'duplicate-identity'
    );
  }
  if (value.sourceKind === 'legacy-body') {
    if (value.contract !== null || value.capsule !== null || value.grant !== null)
      revisionError('legacy-authority');
  } else if (value.sourceKind === 'canonical-contract') {
    exactKeys(value.contract, ['value', 'bytes']);
    validateDeliveryContract(value.contract.value);
    text(value.contract.bytes);
    if (
      canonicalRecordJson(JSON.parse(value.contract.bytes)) !==
      canonicalRecordJson(value.contract.value)
    )
      revisionError('contract-bytes');
    exactKeys(value.capsule, ['head', 'bytes']);
    identifier(value.capsule.head);
    text(value.capsule.bytes);
    exactKeys(value.grant, ['identity', 'epoch', 'coordinator', 'bytes']);
    identifier(value.grant.identity);
    integer(value.grant.epoch, 1);
    coordinator(value.grant.coordinator);
    text(value.grant.bytes);
    if (
      value.grant.identity !== value.contract.value.coordinatorGrantId ||
      value.grant.epoch !== value.contract.value.authorityEpoch
    )
      revisionError('canonical-authority');
    const rawGrant = JSON.parse(value.grant.bytes);
    if (
      rawGrant.schema !== 'aitm.coordinator-grant/v1' ||
      rawGrant.grantId !== value.grant.identity ||
      rawGrant.epoch !== value.grant.epoch ||
      canonicalRecordJson(rawGrant.coordinator) !== canonicalRecordJson(value.grant.coordinator)
    )
      revisionError('canonical-authority');
    validateCanonicalArchive(value);
  } else revisionError('authority-kind');
  return value;
}
function vector(value) {
  exactKeys(value, [
    'revisionEventHead',
    'capsuleHead',
    'contractHash',
    'projectionHash',
    'terminalObservation',
    'authorityIdentities',
  ]);
  if (value.revisionEventHead !== null) identifier(value.revisionEventHead);
  if (value.capsuleHead !== null) identifier(value.capsuleHead);
  digest(value.contractHash, true);
  digest(value.projectionHash);
  exactKeys(value.terminalObservation, ['stage', 'issueState', 'deliveryState']);
  Object.values(value.terminalObservation).forEach((x) => text(x));
  array(value.authorityIdentities, 'authority-identities').forEach((x) => {
    exactKeys(x, ['kind', 'identity', 'hash']);
    text(x.kind);
    text(x.identity);
    digest(x.hash);
  });
}
export function validateRevisionProposal(value) {
  canonicalRecordJson(value);
  exactKeys(value, [
    'schema',
    'repository',
    'issue',
    'transactionId',
    'operationId',
    'reason',
    'mode',
    'priorTransaction',
    'observedResourceVector',
    'executor',
    'writerDomain',
    'authority',
    'before',
    'edits',
    'identityMap',
    'invalidation',
    'archive',
    'writeSet',
    'after',
    'proposalDigest',
  ]);
  if (value.schema !== REVISION_SCHEMA) revisionError('schema');
  identifier(value.transactionId);
  identifier(value.operationId);
  text(value.reason);
  validateExecutor(value.executor);
  domain(value.writerDomain);
  if (!REVISION_MODES.includes(value.mode)) revisionError('mode');
  if (value.mode === 'revision') {
    if (value.priorTransaction !== null || value.observedResourceVector !== null)
      revisionError('prior-resource-vector');
  } else {
    if (value.priorTransaction === null) revisionError('prior');
    exactKeys(value.priorTransaction, ['transactionId', 'eventId']);
    identifier(value.priorTransaction.transactionId);
    identifier(value.priorTransaction.eventId);
    if (value.priorTransaction.transactionId !== value.transactionId) revisionError('prior');
    if (value.observedResourceVector === null) revisionError('resource-vector');
    digest(value.observedResourceVector);
  }
  exactKeys(value.authority, ['kind', 'locator', 'coordinator', 'epoch', 'hashes']);
  if (!['legacy-body', 'canonical-contract'].includes(value.authority.kind))
    revisionError('authority-kind');
  text(value.authority.locator);
  if (value.authority.coordinator !== null) coordinator(value.authority.coordinator);
  if (value.authority.epoch !== null) integer(value.authority.epoch, 1);
  bindings(value.authority.hashes);
  exactKeys(value.before, [
    'stage',
    'issueState',
    'bodyVersion',
    'bodyHash',
    'contractEpoch',
    'contractHash',
    'capsuleHead',
    'protectedSourceBindings',
  ]);
  text(value.before.stage);
  text(value.before.issueState);
  integer(value.before.bodyVersion);
  digest(value.before.bodyHash);
  digest(value.before.contractHash, true);
  if (value.before.contractEpoch !== null) integer(value.before.contractEpoch, 1);
  if (value.before.capsuleHead !== null) identifier(value.before.capsuleHead);
  bindings(value.before.protectedSourceBindings);
  validateEdits(value.edits);
  for (const item of array(value.identityMap, 'identity-map')) {
    exactKeys(item, ['section', 'beforeIdentity', 'beforeHash', 'afterIdentities']);
    text(item.section);
    text(item.beforeIdentity);
    digest(item.beforeHash);
    strings(item.afterIdentities, 'identity-map');
  }
  unique(
    value.identityMap.map((x) => x.beforeIdentity),
    'duplicate-identity'
  );
  for (const item of array(value.invalidation, 'invalidation')) {
    exactKeys(item, [
      'kind',
      'identity',
      'criterionIdentity',
      'bytesHash',
      'disposition',
      'dependencyHash',
      'destinationRevision',
    ]);
    if (!PROOF_KINDS.includes(item.kind)) revisionError('proof-kind');
    text(item.identity);
    if (item.criterionIdentity !== null) text(item.criterionIdentity);
    digest(item.bytesHash);
    if (!['retired', 'preserved-individual', 'historical'].includes(item.disposition))
      revisionError('disposition');
    digest(item.dependencyHash, true);
    identifier(item.destinationRevision);
    if (
      item.disposition === 'preserved-individual' &&
      (!['ac-proof', 'vc-proof', 'dod-proof'].includes(item.kind) ||
        item.criterionIdentity === null ||
        item.dependencyHash === null)
    )
      revisionError('disposition');
  }
  unique(
    value.invalidation.map((x) => x.identity),
    'duplicate-proof'
  );
  exactKeys(value.archive, ['observation', 'definitions', 'resourceVector',
    ...(Object.hasOwn(value.archive, 'nativeIndividualProofs') ? ['nativeIndividualProofs'] : [])]);
  if (Object.hasOwn(value.archive, 'nativeIndividualProofs')) array(value.archive.nativeIndividualProofs, 'native-individual-array');
  validateRevisionObservation(value.archive.observation);
  validateDefinitions(value.archive.definitions);
  vector(value.archive.resourceVector);
  if (
    value.mode !== 'revision' &&
    value.observedResourceVector !== hashRevisionValue(value.archive.resourceVector)
  )
    revisionError('resource-vector');
  for (const item of array(value.writeSet, 'write-set')) {
    exactKeys(item, ['resource', 'beforeHash', 'afterHash', 'recordId', 'afterBytes']);
    if (
      ![
        'issue-body',
        'delivery-contract',
        'revision-record',
        'capsule',
        'proof-projection',
      ].includes(item.resource)
    )
      revisionError('resource');
    digest(item.beforeHash, true);
    digest(item.afterHash);
    identifier(item.recordId);
    text(item.afterBytes);
    if (item.afterHash !== hashBytes(item.afterBytes)) revisionError('write-set-bytes');
  }
  exactKeys(value.after, ['semanticContractDigest', 'revisionId', 'revision', 'definitions']);
  digest(value.after.semanticContractDigest);
  if (value.after.revisionId !== null) identifier(value.after.revisionId);
  integer(value.after.revision, value.mode === 'abort' ? 0 : 1);
  validateDefinitions(value.after.definitions);
  digest(value.proposalDigest);
  const rest = { ...value };
  delete rest.proposalDigest;
  if (value.proposalDigest !== hashRevisionValue(rest)) revisionError('proposal-digest');
  return value;
}
export function validateRevisionRequest(value) {
  canonicalRecordJson(value);
  exactKeys(value, ['schema', 'action', 'proposal', 'authorizationSource']);
  if (value.schema !== REVISION_SCHEMA) revisionError('schema');
  if (!['apply', 'recover'].includes(value.action)) revisionError('action');
  validateRevisionProposal(value.proposal);
  if ((value.action === 'apply') !== (value.proposal.mode === 'revision'))
    revisionError('action-mode');
  validateAuthorizationSource(value.authorizationSource);
  identifier(value.authorizationSource.sessionId, 'authorization-source-identifier');
  identifier(value.authorizationSource.messageId, 'authorization-source-identifier');
  const p = value.proposal,
    derived = deriveProposal({
      observation: p.archive.observation,
      ...(Object.hasOwn(p.archive, 'nativeIndividualProofs') ? { nativeIndividualProofs: p.archive.nativeIndividualProofs } : {}),
      edits: p.edits,
      reason: p.reason,
      mode: p.mode,
      priorTransaction: p.priorTransaction,
      executor: p.executor,
      operationId: p.operationId,
      transactionId: p.transactionId,
    });
  if (canonicalRecordJson(derived) !== canonicalRecordJson(p)) revisionError('derived-proposal');
  return value;
}

export function validatePlanApprovalPayload(payload) {
  const hash = /^sha256:[0-9a-f]{64}$/;
  exactKeys(
    payload,
    [
      'schema',
      'revisionId',
      'semanticContractDigest',
      'contractEpoch',
      'sourceBindings',
      'provenance',
    ],
    'plan-approval-binding'
  );
  if (
    payload.schema !== 'aitm.plan-approval-binding/v1' ||
    (payload.revisionId !== null &&
      (typeof payload.revisionId !== 'string' || !payload.revisionId)) ||
    !hash.test(payload.semanticContractDigest) ||
    (payload.contractEpoch !== null &&
      (!Number.isSafeInteger(payload.contractEpoch) || payload.contractEpoch < 1))
  )
    revisionError('plan-approval-binding');
  if (!Array.isArray(payload.sourceBindings) || payload.sourceBindings.length !== 3)
    revisionError('plan-approval-source-binding');
  const names = new Set();
  for (const source of payload.sourceBindings) {
    exactKeys(source, ['identity', 'hash'], 'plan-approval-source-binding');
    if (
      !['user-story', 'story-intent', 'linked-plan'].includes(source.identity) ||
      names.has(source.identity) ||
      !hash.test(source.hash)
    )
      revisionError('plan-approval-source-binding');
    names.add(source.identity);
  }
  exactKeys(
    payload.provenance,
    ['mode', 'authorityReference', 'auditReference'],
    'plan-approval-provenance'
  );
  if (
    !['human', 'full-auto'].includes(payload.provenance.mode) ||
    ['authorityReference', 'auditReference'].some(
      (key) => typeof payload.provenance[key] !== 'string' || !payload.provenance[key].trim()
    )
  )
    revisionError('plan-approval-provenance');
  return payload;
}
