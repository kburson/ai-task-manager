// @story #1854
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { amendContract } from '../github-records/delivery-contract.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
  parseAitmRecord,
} from '../github-records/record-envelope.mjs';
import { validateCapsuleChain } from '../github-records/capsule-chain.mjs';
import {
  resolveCoordinatorAuthority,
  authorizeCoordinatorOperation,
} from '../github-records/coordination-authority.mjs';
import { hashBytes, revisionError, exactKeys } from './schema.mjs';
import { deriveProposal, deriveResourceVector } from './proposal.mjs';
import {
  assertRevisionMemory,
  assertMemoryCapability,
  readMemoryAuthority,
  readRevisionChain,
  memoryNow,
  writeMemoryCanonical,
} from './store.mjs';
import { withCanonicalBodyWriteCapability } from './legacy.mjs';
import { mutateIssueBody } from '../issue-body-mutate.mjs';
import { parseBodyVersion } from '../body-version.mjs';
const tokens = new WeakMap();
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const kinds = ['acceptanceCriteria', 'verificationCommands', 'definitionOfDone'];
export function validateCanonicalAmendmentCapability(token, contract, definitions) {
  const held = tokens.get(token);
  if (!held?.live || !equal(held.contract, contract) || !equal(held.definitions, definitions))
    revisionError('canonical-amendment-capability');
  return true;
}
export function deriveCanonicalAmendment(observation, after) {
  const contract = observation.contract.value;
  const definitions = {
    acceptanceCriteria: after
      .filter((d) => d.section === 'ac')
      .map((d) => ({ logicalId: d.identity, text: d.text })),
    verificationCommands: after
      .filter((d) => d.section === 'vc')
      .map((d) => ({ logicalId: d.identity, command: d.text })),
    definitionOfDone: after
      .filter((d) => d.section === 'dod')
      .map((d) => ({ logicalId: d.identity, text: d.text })),
  };
  const roots = new Set(definitions.verificationCommands.map((d) => d.logicalId));
  for (const item of after) {
    if (observation.retiredIdentities.includes(item.identity))
      revisionError('retired-identity-resurrection');
    if (item.section === 'vc' && item.identity !== item.rootId)
      revisionError('canonical-root-identity');
    if (item.declaration.kind === 'vc-list' && item.declaration.vcIds.some((id) => !roots.has(id)))
      revisionError('missing-canonical-root-reference');
    for (const kind of kinds) {
      const old = contract[kind].find((d) => d.logicalId === item.identity);
      if (
        old &&
        kind !==
          { ac: 'acceptanceCriteria', vc: 'verificationCommands', dod: 'definitionOfDone' }[
            item.section
          ]
      )
        revisionError('logical-id-kind');
      if (old && item.section !== 'vc' && old.text !== item.text)
        revisionError('changed-criterion-identity');
    }
  }
  const token = Object.freeze({});
  const held = {
    contract: structuredClone(contract),
    definitions: structuredClone(definitions),
    live: true,
  };
  tokens.set(token, held);
  try {
    return amendContract({
      contract,
      expectedContractEpoch: contract.contractEpoch,
      authorityEpoch: contract.authorityEpoch,
      coordinatorGrantId: contract.coordinatorGrantId,
      ...definitions,
      criteriaRevisionCapability: token,
    }).contract;
  } finally {
    held.live = false;
  }
}
export function canonicalRecordId(seed) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let n = BigInt('0x' + hashBytes(seed).slice(7, 38)),
    value = '';
  for (let i = 0; i < 26; i++) {
    value = alphabet[Number(n % 32n)] + value;
    n /= 32n;
  }
  return value;
}
export function canonicalRecords(observation) {
  const archive = observation.canonicalArchive;
  if (!archive) revisionError('canonical-authority-archive');
  return archive.records.map((record) => {
    const parsed = parseAitmRecord({
      commentNodeId: record.recordId,
      body: record.bytes,
      expectedRepository: observation.repository,
      expectedIssue: observation.issue,
    });
    if (parsed.envelope.recordId !== record.recordId) revisionError('canonical-record-identity');
    return parsed;
  });
}
export function validateCanonicalArchive(observation) {
  const archive = observation.canonicalArchive;
  exactKeys(
    archive,
    ['records', 'issueHierarchy', 'coordinationProjectionBytes', 'observedAt'],
    'canonical-archive'
  );
  if (
    !Array.isArray(archive.records) ||
    !archive.records.length ||
    !Array.isArray(archive.issueHierarchy)
  )
    revisionError('canonical-archive');
  if (
    !Number.isFinite(Date.parse(archive.observedAt)) ||
    new Date(archive.observedAt).toISOString() !== archive.observedAt
  )
    revisionError('canonical-observation-time');
  for (const item of archive.records) exactKeys(item, ['recordId', 'bytes'], 'canonical-record');
  for (const item of archive.issueHierarchy)
    exactKeys(item, ['issue', 'parentIssue'], 'canonical-hierarchy');
  const records = canonicalRecords(observation);
  const chain = validateCapsuleChain({
    records,
    repository: observation.repository,
    issue: observation.issue,
  });
  if (chain.forks.length) revisionError('canonical-chain-fork');
  const heads = records.filter(
    (r) => !records.some((next) => next.envelope.predecessor === r.envelope.recordId)
  );
  if (
    heads.length !== 1 ||
    heads[0].envelope.recordId !== observation.capsule.head ||
    archive.records.find((r) => r.recordId === observation.capsule.head)?.bytes !==
      observation.capsule.bytes
  )
    revisionError('canonical-chain-head');
  JSON.parse(archive.coordinationProjectionBytes);
  return records;
}
export function assertCanonicalAuthority(observation, now, operation = 'amend-contract') {
  try {
    const records = validateCanonicalArchive(observation),
      archive = observation.canonicalArchive;
    if (Date.parse(archive.observedAt) > Date.parse(now)) revisionError('future-canonical-time');
    if (records.some((r) => Date.parse(r.envelope.createdAt) > Date.parse(now)))
      revisionError('future-canonical-time');
    const authority = resolveCoordinatorAuthority({
      records,
      repository: observation.repository,
      issue: observation.issue,
      issueHierarchy: archive.issueHierarchy,
      coordinationProjection: JSON.parse(archive.coordinationProjectionBytes),
      now,
    });
    const result = authorizeCoordinatorOperation({
      authority,
      grantId: observation.grant.identity,
      epoch: observation.grant.epoch,
      coordinator: observation.grant.coordinator,
      issue: observation.issue,
      operation,
      branch: observation.executor.branch,
    });
    if (
      !result.authorized ||
      observation.grant.coordinator.session !== observation.executor.sessionId ||
      !equal(authority.grant, JSON.parse(observation.grant.bytes))
    )
      revisionError('revision-authority-unavailable');
    return authority;
  } catch (error) {
    if (error.message === 'criteria-revision:future-canonical-time') throw error;
    revisionError('revision-authority-unavailable');
  }
}
export function canonicalCapsuleWrite(observation, contract, operationId) {
  const recordId = canonicalRecordId(operationId + '-amendment');
  const envelope = createAitmRecordEnvelope({
    repository: observation.repository,
    issue: observation.issue,
    recordType: 'contract-amended',
    payload: contract,
    recordId,
    predecessor: observation.capsule.head,
    actor: observation.grant.coordinator.actor,
    epoch: observation.grant.epoch,
    grantId: observation.grant.identity,
    createdAt: observation.canonicalArchive.observedAt,
  });
  const afterBytes = renderAitmRecord({
    envelope,
    visibleMarkdown: 'AITM criteria contract amendment.\n',
  });
  return {
    resource: 'capsule',
    beforeHash: hashBytes(observation.capsule.bytes),
    afterHash: hashBytes(afterBytes),
    recordId,
    afterBytes,
  };
}
export function deriveCanonicalWrites({ proposal, contract, grant }) {
  const p = proposal;
  if (p?.authority.kind !== 'canonical-contract') revisionError('canonical-authority-required');
  const derived = deriveProposal({
    observation: p.archive.observation,
    ...(Object.hasOwn(p.archive, 'nativeIndividualProofs')
      ? { nativeIndividualProofs: p.archive.nativeIndividualProofs }
      : {}),
    edits: p.edits,
    reason: p.reason,
    mode: p.mode,
    priorTransaction: p.priorTransaction,
    executor: p.executor,
    operationId: p.operationId,
    transactionId: p.transactionId,
  });
  if (
    !equal(derived, p) ||
    !equal(contract, p.archive.observation.contract.value) ||
    !equal(grant, p.archive.observation.grant)
  )
    revisionError('derived-canonical-proposal');
  const writes = p.writeSet.filter((w) => w.resource !== 'revision-record');
  return {
    after:
      p.mode === 'abort'
        ? structuredClone(contract)
        : JSON.parse(writes.find((w) => w.resource === 'delivery-contract').afterBytes),
    writes: structuredClone(writes),
  };
}

export function canonicalAfterObservation(proposal, count = Infinity) {
  const o = structuredClone(proposal.archive.observation);
  let ordinal = 0;
  for (const write of proposal.writeSet.filter((w) => w.resource !== 'revision-record')) {
    if (ordinal++ >= count) break;
    if (write.resource === 'capsule') {
      const record = { recordId: write.recordId, bytes: write.afterBytes };
      if (!o.canonicalArchive.records.some((r) => r.recordId === write.recordId))
        o.canonicalArchive.records.push(record);
      o.capsule = { head: write.recordId, bytes: write.afterBytes };
    } else if (write.resource === 'delivery-contract')
      o.contract = { value: JSON.parse(write.afterBytes), bytes: write.afterBytes };
    else if (write.resource === 'proof-projection') Object.assign(o, JSON.parse(write.afterBytes));
    else if (write.resource === 'issue-body')
      o.body = { bytes: write.afterBytes, version: parseBodyVersion(write.afterBytes) };
  }
  return o;
}
export function canonicalPrefixVectors(proposal, head) {
  return Array.from(
    { length: proposal.writeSet.filter((w) => w.resource !== 'revision-record').length + 1 },
    (_, count) => ({
      ...deriveResourceVector(canonicalAfterObservation(proposal, count)),
      revisionEventHead: head,
    })
  );
}
export function sameRevisionObservation(left, right) {
  const a = structuredClone(left),
    b = structuredClone(right);
  if (a.canonicalArchive) delete a.canonicalArchive.observedAt;
  if (b.canonicalArchive) delete b.canonicalArchive.observedAt;
  return equal(a, b);
}
export async function applyCanonicalRevision({ capability, proposal, deps }) {
  assertRevisionMemory(deps);
  if (!equal(deps.observation.executor, proposal.executor)) revisionError('canonical-executor');
  const context = {
    repository: proposal.repository,
    issue: proposal.issue,
    executor: deps.observation.executor,
  };
  assertMemoryCapability(deps, capability, context);
  const chain = await readRevisionChain({ context, transport: deps });
  if (
    chain.status !== 'pending' ||
    chain.effective?.proposal.proposalDigest !== proposal.proposalDigest
  )
    revisionError('canonical-effective-event');
  const { writes } = deriveCanonicalWrites({
    proposal,
    contract: proposal.archive.observation.contract.value,
    grant: proposal.archive.observation.grant,
  });
  for (const write of writes) {
    const o = readMemoryAuthority(deps, context);
    assertCanonicalAuthority(o, memoryNow(deps));
    if (write.resource === 'issue-body') {
      if (hashBytes(o.body.bytes) === write.afterHash) continue;
      await withCanonicalBodyWriteCapability(
        { backend: deps, capability, context, proposal, before: o.body.bytes },
        (token) =>
          mutateIssueBody({
            repo: context.repository,
            issueNumber: context.issue,
            mutate: () => write.afterBytes,
            criteriaRevisionCapability: token,
            deps: { revisionBackend: deps },
            expectedVersion: o.body.version,
          })
      );
    } else await writeMemoryCanonical({ backend: deps, capability, context, proposal, write });
  }
}
