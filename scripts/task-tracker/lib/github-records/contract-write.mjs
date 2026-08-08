import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  invalidateContractProof,
  projectContractLifecycle,
  renderDeliveryContract,
  sealContract,
  validateDeliveryContract,
} from './delivery-contract.mjs';
import { createAitmRecordEnvelope, createRecordId, renderAitmRecord } from './record-envelope.mjs';
import { appendCapsule, isCapsuleRecordType } from './capsule-chain.mjs';
import { parseIssueDirectory } from './issue-directory.mjs';
import {
  getCommentsByNodeIds,
  listIssueCommentsSince,
  updateIssueComment,
} from './github-comment-store.mjs';
import { gql } from '../../../gh/lib/github-projects.mjs';

const ACTIONS = new Set(['set-check', 'record-evidence', 'seal', 'invalidate']);

function fail(category) {
  throw new TypeError(`contract-write:${category}`);
}

function operationId({ issue, action, kind, logicalId, checked, contract, evidence }) {
  const input = JSON.stringify({
    issue,
    action,
    kind: kind ?? null,
    logicalId: logicalId ?? null,
    checked: checked ?? null,
    contractEpoch: contract.contractEpoch,
    evidence: evidence ?? null,
  });
  return `contract-write:${createHash('sha256').update(input).digest('hex')}`;
}

function existingOperation(records, id) {
  const matches = records.filter((record) => record?.envelope?.payload?.operationId === id);
  if (matches.length > 1) fail('operation-conflict');
  return matches[0] ?? null;
}

function existingForPlan(records, plan) {
  const byOperation = existingOperation(records, plan.operationId);
  if (byOperation !== null) return byOperation;
  if (!['contract-sealed', 'contract-amended'].includes(plan.envelope.recordType)) return null;
  const matches = records.filter(
    (record) =>
      record?.envelope?.recordType === plan.envelope.recordType &&
      record?.envelope?.payload?.projectionHash === plan.projectedContract.projectionHash
  );
  if (matches.length > 1) fail('operation-conflict');
  return matches[0] ?? null;
}

function projectedContract({ contract, action, kind, logicalId, checked, recordId }) {
  if (action === 'seal') {
    return sealContract({
      contract,
      authorityEpoch: contract.authorityEpoch,
      coordinatorGrantId: contract.coordinatorGrantId,
    }).contract;
  }
  if (action === 'invalidate') {
    return invalidateContractProof({
      contract,
      authorityEpoch: contract.authorityEpoch,
      coordinatorGrantId: contract.coordinatorGrantId,
    }).contract;
  }
  return projectContractLifecycle({
    contract,
    kind,
    logicalId,
    checked,
    acceptedRecordId: recordId,
  });
}

function capsulePayload({ id, action, kind, logicalId, checked, contract, projected, evidence }) {
  if (action === 'seal' || action === 'invalidate') return projected;
  return {
    schema: 'aitm.contract-write/v1',
    operationId: id,
    action,
    contractEpoch: contract.contractEpoch,
    kind,
    logicalId,
    checked,
    evidence: evidence ?? null,
    projectedRevision: projected.revision,
    projectedHash: projected.projectionHash,
  };
}

export function planContractWrite({
  repository,
  issue,
  contract,
  action,
  kind,
  logicalId,
  checked = true,
  evidence = null,
  recordId = createRecordId(),
  predecessor = null,
  actor = 'aitm/contract-write',
  createdAt,
} = {}) {
  if (
    typeof repository !== 'string' ||
    !Number.isInteger(issue) ||
    issue <= 0 ||
    !ACTIONS.has(action)
  ) {
    fail('input');
  }
  validateDeliveryContract(contract);
  const id = operationId({ issue, action, kind, logicalId, checked, contract, evidence });
  const projected = projectedContract({ contract, action, kind, logicalId, checked, recordId });
  const payload = capsulePayload({
    id,
    action,
    kind,
    logicalId,
    checked,
    contract,
    projected,
    evidence,
  });
  const recordType =
    action === 'seal'
      ? 'contract-sealed'
      : action === 'invalidate'
        ? 'contract-amended'
        : 'record-disposition';
  const envelope = createAitmRecordEnvelope({
    repository,
    issue,
    recordType,
    payload,
    actor,
    epoch: contract.authorityEpoch,
    grantId: contract.coordinatorGrantId,
    predecessor,
    recordId,
    createdAt,
  });
  return Object.freeze({
    operationId: id,
    envelope,
    projectedContract: projected,
    request: Object.freeze({
      repository,
      issue,
      contract,
      action,
      kind,
      logicalId,
      checked,
      evidence,
      predecessor,
      actor,
    }),
  });
}

export async function executeContractWrite({ plan, records = [], deps = {}, crashAt } = {}) {
  if (!plan?.operationId || !plan?.envelope || !plan?.projectedContract) fail('plan');
  if (
    typeof deps.appendRecord !== 'function' ||
    typeof deps.updateProjection !== 'function' ||
    typeof deps.readProjection !== 'function'
  ) {
    fail('deps');
  }
  let record = existingForPlan(records, plan);
  let replayed = record !== null;
  if (record !== null && record.envelope.recordId !== plan.envelope.recordId) {
    plan = planContractWrite({
      ...plan.request,
      recordId: record.envelope.recordId,
      createdAt: record.envelope.createdAt,
      predecessor: record.envelope.predecessor,
    });
  }
  if (record === null) {
    record = await deps.appendRecord({
      envelope: plan.envelope,
      visibleMarkdown: `AITM contract write: ${plan.envelope.recordType}.\n`,
    });
    if (typeof crashAt === 'function') await crashAt({ phase: 'after-capsule' });
  }
  const current = await deps.readProjection();
  if (!isDeepStrictEqual(current, plan.projectedContract)) {
    if (!isDeepStrictEqual(current, plan.request.contract)) fail('stale-contract');
    await deps.updateProjection({ contract: plan.projectedContract });
    if (typeof crashAt === 'function') await crashAt({ phase: 'after-projection' });
  }
  const verified = await deps.readProjection();
  if (!isDeepStrictEqual(verified, plan.projectedContract)) {
    fail('projection-readback');
  }
  return Object.freeze({ record, replayed, contract: plan.projectedContract });
}

function clean(value) {
  return String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveLogicalId(contract, kind, logicalId, label) {
  const kinds = kind ? [kind] : ['acceptanceCriteria', 'verificationCommands', 'definitionOfDone'];
  if (logicalId) {
    const matchedKind = kinds.find((candidate) =>
      contract[candidate].some((entry) => entry.logicalId === logicalId)
    );
    if (matchedKind) return { kind: matchedKind, logicalId };
  }
  const wanted = clean(label);
  const matches = kinds.flatMap((candidate) =>
    contract[candidate]
      .filter((entry) => clean(entry.text ?? entry.command) === wanted)
      .map((entry) => ({ kind: candidate, logicalId: entry.logicalId }))
  );
  if (matches.length !== 1) fail(matches.length === 0 ? 'logical-id' : 'ambiguous-logical-id');
  return matches[0];
}

function defaultGraphql({ query, variables }) {
  return gql(query, variables).then((data) => ({ data }));
}

async function createCommentWithGh({ repository, issue, body, pexec }) {
  const { stdout } = await pexec(
    'gh',
    [
      'api',
      `repos/${repository}/issues/${issue}/comments`,
      '--method',
      'POST',
      '-f',
      `body=${body}`,
    ],
    {}
  );
  const parsed = JSON.parse(stdout);
  if (typeof parsed.node_id !== 'string') fail('comment-write');
  return { commentNodeId: parsed.node_id };
}

export async function writeDirectoryContractOperation({
  repository,
  issue,
  issueBody,
  action,
  kind,
  logicalId,
  label,
  checked = true,
  evidence = null,
  pexec,
  graphql = defaultGraphql,
  crashAt,
  deps = {},
} = {}) {
  const loaded = await readDirectoryContract({
    repository,
    issue,
    issueBody,
    graphql,
    readContractRecord: deps.readContractRecord,
  });
  if (loaded === null) return Object.freeze({ status: 'legacy' });
  if (typeof pexec !== 'function' && typeof deps.createIssueComment !== 'function') fail('deps');
  const { commentNodeId, contract, readContractRecord } = loaded;
  const target =
    action === 'set-check' || action === 'record-evidence'
      ? resolveLogicalId(contract, kind, logicalId, label)
      : undefined;
  const listRecords =
    deps.listRecords ??
    (async () =>
      (
        await listIssueCommentsSince({
          repository,
          issue,
          since: '1970-01-01T00:00:00.000Z',
          graphql,
        })
      ).filter((record) => isCapsuleRecordType(record.envelope.recordType)));
  let records = await listRecords();
  if (
    action === 'set-check' &&
    contract.lifecycleProjection[target.kind][target.logicalId] === checked
  ) {
    return Object.freeze({
      status: 'directory-written',
      replayed: true,
      record: null,
      contract,
    });
  }
  const predecessors = new Set(
    records.map((record) => record.envelope.predecessor).filter((value) => value !== null)
  );
  const heads = records.filter((record) => !predecessors.has(record.envelope.recordId));
  if (heads.length > 1) fail('ambiguous-head');
  const plan = planContractWrite({
    repository,
    issue,
    contract,
    action,
    kind: target?.kind,
    logicalId: target?.logicalId,
    checked,
    evidence,
    predecessor: heads[0]?.envelope.recordId ?? null,
  });
  const createIssueComment =
    deps.createIssueComment ?? ((input) => createCommentWithGh({ ...input, pexec }));
  const readBackComment =
    deps.readBackComment ??
    (async (input) =>
      (await getCommentsByNodeIds({ ids: [input.commentNodeId], repository, issue, graphql }))[0]);
  const appendRecord = async ({ envelope, visibleMarkdown }) => {
    const result = await appendCapsule({
      repository,
      issue,
      expectedHeadRecordId: envelope.predecessor,
      candidate: { envelope, visibleMarkdown },
      deps: { listIssueComments: listRecords, createIssueComment, readBackComment },
    });
    records = await listRecords();
    return result.record;
  };
  const readProjection = async () => (await readContractRecord()).envelope.payload;
  const updateProjection = async ({ contract: nextContract }) => {
    const body = renderContractProjectionRecord({
      repository,
      issue,
      contract: nextContract,
      actor: 'aitm/contract-write',
    });
    if (deps.updateProjection) return deps.updateProjection({ contract: nextContract, body });
    return updateIssueComment({ commentNodeId, repository, issue, body, graphql });
  };
  const result = await executeContractWrite({
    plan,
    records,
    crashAt,
    deps: { appendRecord, updateProjection, readProjection },
  });
  return Object.freeze({ status: 'directory-written', ...result });
}

export async function readDirectoryContract({
  repository,
  issue,
  issueBody,
  graphql = defaultGraphql,
  readContractRecord: injectedReader,
} = {}) {
  const directory = parseIssueDirectory({ issueBody });
  if (directory === null) return null;
  const commentNodeId = directory.singletons['delivery-contract'];
  const readContractRecord =
    injectedReader ??
    (async () =>
      (await getCommentsByNodeIds({ ids: [commentNodeId], repository, issue, graphql }))[0]);
  const contractRecord = await readContractRecord();
  const contract = contractRecord.envelope.payload;
  validateDeliveryContract(contract);
  return Object.freeze({ commentNodeId, contract, readContractRecord });
}

export function renderContractProjectionRecord({ repository, issue, contract, actor } = {}) {
  validateDeliveryContract(contract);
  const envelope = createAitmRecordEnvelope({
    repository,
    issue,
    recordType: 'singleton-projection',
    payload: contract,
    actor,
    epoch: contract.authorityEpoch,
    grantId: contract.coordinatorGrantId,
    recordId: contract.recordId,
  });
  return renderAitmRecord({
    envelope,
    visibleMarkdown: renderDeliveryContract({ contract }).markdown,
  });
}
