import { deriveCanonicalWrites, canonicalPrefixVectors } from './canonical.mjs';
// @story #1853
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { deriveProposal, deriveResourceVector } from './proposal.mjs';
import { validateRevisionProposal, revisionError } from './schema.mjs';
import {
  assertMemoryCapability,
  assertRevisionMemory,
  readMemoryBody,
  readRevisionChain,
  writeMemoryBody,
} from './store.mjs';
import { parseBodyVersion } from '../body-version.mjs';
import { findLostMarkers } from '../body-invariants.mjs';
const capabilities = new WeakMap();
export function deriveLegacyWrites(proposal) {
  validateRevisionProposal(proposal);
  const p = proposal;
  if (p.authority.kind !== 'legacy-body') revisionError('legacy-authority-required');
  const derived = deriveProposal({
    observation: p.archive.observation,
    edits: p.edits,
    reason: p.reason,
    mode: p.mode,
    priorTransaction: p.priorTransaction,
    executor: p.executor,
    operationId: p.operationId,
    transactionId: p.transactionId,
  });
  if (canonicalRecordJson(derived) !== canonicalRecordJson(p)) revisionError('derived-proposal');
  if (p.archive.observation.proofRecords.some((r) => !['historical', 'delivery'].includes(r.kind)))
    revisionError('unplanned-authority-record');
  const writes = p.writeSet.filter((w) => w.resource !== 'revision-record');
  if (p.mode !== 'abort' && (writes.length !== 1 || writes[0].resource !== 'issue-body'))
    revisionError('legacy-write-set');
  return structuredClone(writes);
}
async function withBodyWriteCapability({ backend, capability, context, before, writes }, fn) {
  assertRevisionMemory(backend);
  assertMemoryCapability(backend, capability, context);
  const write = writes.find((w) => w.resource === 'issue-body');
  if (!write) revisionError('legacy-write-empty');
  const token = Object.freeze({}),
    entry = {
      backend,
      capability,
      context: structuredClone(context),
      before,
      after: write.afterBytes,
      live: true,
    };
  capabilities.set(token, entry);
  try {
    return await fn(token);
  } finally {
    entry.live = false;
  }
}
export async function withLegacyWriteCapability(input, fn) {
  return withBodyWriteCapability({ ...input, writes: deriveLegacyWrites(input.proposal) }, fn);
}
export async function withCanonicalBodyWriteCapability(input, fn) {
  assertRevisionMemory(input.backend);
  assertMemoryCapability(input.backend, input.capability, input.context);
  const chain = await readRevisionChain({ context: input.context, transport: input.backend });
  if (
    chain.status !== 'pending' ||
    chain.effective?.proposal.proposalDigest !== input.proposal.proposalDigest
  )
    revisionError('canonical-effective-event');
  const vector = { ...deriveResourceVector(input.backend.observation), revisionEventHead: null };
  if (
    canonicalRecordJson(vector) !==
    canonicalRecordJson(canonicalPrefixVectors(input.proposal, null).at(-2))
  )
    revisionError('canonical-body-order');
  const { writes } = deriveCanonicalWrites({
    proposal: input.proposal,
    contract: input.proposal.archive.observation.contract.value,
    grant: input.proposal.archive.observation.grant,
  });
  return withBodyWriteCapability({ ...input, writes }, fn);
}
export function validateLegacyCapability(token, { repo, issueNumber, backend, base, next } = {}) {
  const m = capabilities.get(token);
  if (
    !m?.live ||
    m.backend !== backend ||
    m.context.repository !== repo ||
    m.context.issue !== issueNumber
  )
    revisionError('legacy-capability');
  assertMemoryCapability(backend, m.capability, m.context);
  if (base !== undefined && base !== m.before) revisionError('legacy-before-bytes');
  if (next !== undefined && next !== m.after) revisionError('legacy-after-bytes');
  const allowed = findLostMarkers(m.before, m.after);
  if (allowed.some((name) => name !== 'aitm-plan-approved')) revisionError('unrelated-marker-loss');
  return { before: m.before, after: m.after, allowedMarkerLoss: allowed };
}
export async function writeLegacyBody({
  token,
  repo,
  issueNumber,
  deps,
  mutate,
  validateMutation,
  expectedVersion,
}) {
  // This branch cannot fall through to a default provider or an injected IO
  // callback. A memory-derived token is valid only with its same memory backend.
  if (!deps || Object.keys(deps).join(',') !== 'revisionBackend') revisionError('legacy-backend');
  const backend = deps.revisionBackend;
  const sealed = validateLegacyCapability(token, { repo, issueNumber, backend });
  const remote = readMemoryBody(backend);
  if (
    remote !== sealed.before ||
    (expectedVersion !== undefined && parseBodyVersion(remote) !== expectedVersion)
  )
    revisionError('legacy-before-bytes');
  const next = await mutate(remote);
  validateLegacyCapability(token, { repo, issueNumber, backend, base: remote, next });
  if (validateMutation) validateMutation(remote, next);
  const m = capabilities.get(token);
  writeMemoryBody({
    backend,
    capability: m.capability,
    context: m.context,
    before: remote,
    after: next,
    version: parseBodyVersion(next),
  });
  const verified = readMemoryBody(backend, 'body-readback');
  if (verified !== next) revisionError('legacy-readback');
  return { status: 'ok', attempts: 1, version: parseBodyVersion(next), body: verified };
}
