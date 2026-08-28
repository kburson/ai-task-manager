import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { createAitmRecordEnvelope, hashRecordPayload } from './github-records/record-envelope.mjs';
import {
  buildIncidentLedgerApprovalGrantPayload,
  buildIncidentLedgerApprovalPayload,
  buildIncidentLedgerOwnerPayload,
  buildIncidentLedgerPayload,
  projectDeliveryIncidentRecords,
  renderIncidentRecord,
} from './delivery-incident-records.mjs';
import { parseReviewApprovedMarker, parseTestStartedMarker } from './markers.mjs';
import { parseVerificationReceipt } from './verification-receipt.mjs';
import { parseDeliveryCommentForPullRequest, projectDeliveryRecords } from './delivery-records.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function fail(category) {
  throw new Error(`delivery-incident:${category}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sameCanonical(left, right) {
  try {
    return canonicalRecordJson(left) === canonicalRecordJson(right);
  } catch {
    return false;
  }
}

function recordsOfType(records, recordType) {
  if (!Array.isArray(records)) fail('dependencies');
  return records.filter((record) => record?.envelope?.recordType === recordType);
}

function exactEnvelopeRecord(records, envelope) {
  const matches = records.filter((record) => sameCanonical(record?.envelope, envelope));
  if (matches.length > 1) fail('conflicting-authority');
  return matches[0] || null;
}

async function appendWithRecovery({ append, list, envelope, body }) {
  try {
    const written = await append({ envelope, body });
    if (written && sameCanonical(written.envelope, envelope)) return written;
  } catch {
    // A transport error may occur after GitHub committed the append. Only an
    // exact canonical re-read is adoptable.
  }
  const recovered = exactEnvelopeRecord(await list(), envelope);
  if (!recovered) fail('record-write');
  return recovered;
}

export async function recordIncidentLedger({
  repository,
  convergenceIssue,
  payload: inputPayload,
  deps = {},
} = {}) {
  const build = deps.buildIncidentLedgerPayload || buildIncidentLedgerPayload;
  const observe = deps.observeLedger;
  const list = deps.listConvergenceRecords;
  const append = deps.appendConvergenceRecord;
  if (typeof observe !== 'function' || typeof list !== 'function' || typeof append !== 'function') {
    fail('dependencies');
  }
  const payload = build(inputPayload);
  if (payload.repository !== repository || payload.convergenceIssue !== convergenceIssue) {
    fail('conflicting-authority');
  }
  const observed = await observe({ repository, convergenceIssue, payload });
  if (!sameCanonical(build(observed), payload)) fail('stale-observation');

  const existing = recordsOfType(await list(), 'delivery-incident-ledger').filter(
    (record) => record.envelope.payload?.ledgerId === payload.ledgerId
  );
  if (existing.length > 1) fail('conflicting-authority');
  if (existing.length === 1) {
    if (!sameCanonical(existing[0].envelope.payload, payload)) fail('conflicting-authority');
    return deepFreeze({
      status: 'already-recorded',
      ledgerId: payload.ledgerId,
      ledgerDigest: (deps.hashRecordPayload || hashRecordPayload)(payload),
      recordId: existing[0].envelope.recordId,
      approvalCommand: `/task incident-ledger #${convergenceIssue} --approve ${payload.ledgerId} --digest ${(deps.hashRecordPayload || hashRecordPayload)(payload)}`,
    });
  }

  const envelope = deps.createLedgerEnvelope
    ? deps.createLedgerEnvelope({ payload, repository, convergenceIssue })
    : createAitmRecordEnvelope({
        recordType: 'delivery-incident-ledger',
        repository,
        issue: convergenceIssue,
        payload,
        actor: 'aitm/incident-ledger-observation',
        recordId: payload.ledgerId,
      });
  const render = deps.renderIncidentRecord || renderIncidentRecord;
  const record = await appendWithRecovery({
    append,
    list,
    envelope,
    body: render({ envelope, visibleMarkdown: 'AITM delivery incident observation ledger.\n' }),
  });
  const digest = (deps.hashRecordPayload || hashRecordPayload)(payload);
  return deepFreeze({
    status: 'recorded',
    ledgerId: payload.ledgerId,
    ledgerDigest: digest,
    recordId: record.envelope.recordId,
    approvalCommand: `/task incident-ledger #${convergenceIssue} --approve ${payload.ledgerId} --digest ${digest}`,
  });
}

function recordTipId(records) {
  if (records.length === 0) return null;
  const ids = new Set(records.map(({ envelope }) => envelope.recordId));
  const superseded = new Set();
  for (const { envelope } of records) {
    if (envelope.supersedes !== null && envelope.supersedes !== undefined) {
      if (!ids.has(envelope.supersedes)) fail('conflicting-authority');
      superseded.add(envelope.supersedes);
    }
  }
  const tips = records.filter(({ envelope }) => !superseded.has(envelope.recordId));
  if (tips.length !== 1) fail('ambiguous-authority');
  return tips[0].envelope.recordId;
}

function assertProviderApprovalRecord(record, login) {
  if (
    record?.authorLogin !== login ||
    typeof record?.createdAt !== 'string' ||
    record.updatedAt !== record.createdAt
  ) {
    fail('conflicting-authority');
  }
  return record;
}

export async function approveIncidentLedger({
  repository,
  convergenceIssue,
  ledgerId,
  ledgerDigest,
  deps = {},
} = {}) {
  if (
    typeof deps.authenticate !== 'function' ||
    typeof deps.listConvergenceRecords !== 'function' ||
    typeof deps.listOwnerRecords !== 'function' ||
    typeof deps.appendConvergenceRecord !== 'function' ||
    typeof deps.appendOwnerRecord !== 'function'
  ) {
    fail('dependencies');
  }
  const authenticated = await deps.authenticate();
  if (typeof authenticated?.login !== 'string') {
    fail('authentication');
  }
  const hash = deps.hashRecordPayload || hashRecordPayload;
  const listConvergence = deps.listConvergenceRecords;
  const convergenceRecords = await listConvergence();
  const ledgers = recordsOfType(convergenceRecords, 'delivery-incident-ledger').filter(
    (record) => record.envelope.payload?.ledgerId === ledgerId
  );
  if (ledgers.length !== 1)
    fail(ledgers.length === 0 ? 'missing-authority' : 'ambiguous-authority');
  const ledgerRecord = ledgers[0];
  const ledgerPayload = ledgerRecord.envelope.payload;
  if (
    ledgerPayload.repository !== repository ||
    ledgerPayload.convergenceIssue !== convergenceIssue ||
    hash(ledgerPayload) !== ledgerDigest
  ) {
    fail('conflicting-authority');
  }

  const listOwners = deps.listOwnerRecords;
  const initialOwnerRecords = recordsOfType(await listOwners(), 'delivery-incident-ledger-owner');
  const pinnedOwnerTip = recordTipId(initialOwnerRecords);
  if (initialOwnerRecords.length > 0) {
    const approvalRecords = recordsOfType(convergenceRecords, 'delivery-incident-ledger-approval');
    const approvalTip = recordTipId(approvalRecords);
    const ownerTip = initialOwnerRecords.find(
      ({ envelope }) => envelope.recordId === pinnedOwnerTip
    );
    const ownerApprovalId = ownerTip?.envelope?.payload?.approvalRecordId;
    const pendingApproval = approvalRecords.find(
      ({ envelope }) => envelope.recordId === approvalTip
    );
    const pendingGrant = convergenceRecords.find(
      ({ envelope }) =>
        envelope.recordType === 'delivery-incident-ledger-approval-grant' &&
        envelope.recordId === pendingApproval?.envelope?.payload?.grantRecordId
    );
    const hasExactPendingReplacement =
      approvalTip !== ownerApprovalId &&
      pendingApproval?.envelope?.supersedes === ownerApprovalId &&
      pendingApproval?.envelope?.payload?.repository === repository &&
      pendingApproval?.envelope?.payload?.convergenceIssue === convergenceIssue &&
      pendingApproval?.envelope?.payload?.ledgerId === ledgerId &&
      pendingApproval?.envelope?.payload?.ledgerDigest === ledgerDigest &&
      pendingApproval?.envelope?.payload?.ledgerRecordId === ledgerRecord.envelope.recordId &&
      pendingApproval?.authorLogin === authenticated.login &&
      pendingApproval?.updatedAt === pendingApproval?.createdAt &&
      pendingGrant?.envelope?.payload?.repository === repository &&
      pendingGrant?.envelope?.payload?.convergenceIssue === convergenceIssue &&
      pendingGrant?.envelope?.payload?.ledgerId === ledgerId &&
      pendingGrant?.envelope?.payload?.ledgerDigest === ledgerDigest &&
      pendingGrant?.envelope?.payload?.ledgerRecordId === ledgerRecord.envelope.recordId &&
      pendingGrant?.authorLogin === authenticated.login &&
      pendingGrant?.updatedAt === pendingGrant?.createdAt &&
      pendingApproval?.envelope?.payload?.approvedAt === pendingGrant?.createdAt;
    const recordsForOwnerPreflight = hasExactPendingReplacement
      ? convergenceRecords.filter(
          ({ envelope }) => envelope.recordId !== pendingApproval.envelope.recordId
        )
      : convergenceRecords;
    let existingProjection;
    try {
      existingProjection = (deps.projectDeliveryIncidentRecords || projectDeliveryIncidentRecords)([
        ...recordsForOwnerPreflight,
        ...initialOwnerRecords,
      ]);
    } catch {
      fail('conflicting-authority');
    }
    if (existingProjection?.approvedLedgerOwner?.envelope?.recordId !== pinnedOwnerTip) {
      fail('conflicting-authority');
    }
    if (approvalTip !== ownerApprovalId && !hasExactPendingReplacement) {
      fail('conflicting-authority');
    }
  }

  const grantPayload = (
    deps.buildIncidentLedgerApprovalGrantPayload || buildIncidentLedgerApprovalGrantPayload
  )({
    schema: 'aitm.delivery-incident-ledger-approval-grant/v1',
    repository,
    convergenceIssue,
    ledgerId,
    ledgerDigest,
    ledgerRecordId: ledgerRecord.envelope.recordId,
  });
  const grantCandidates = recordsOfType(
    convergenceRecords,
    'delivery-incident-ledger-approval-grant'
  ).filter((record) => record.envelope.payload?.ledgerId === ledgerId);
  const matchingGrants = grantCandidates.filter(
    (record) =>
      sameCanonical(record.envelope.payload, grantPayload) &&
      record.authorLogin === authenticated.login &&
      record.updatedAt === record.createdAt
  );
  if (grantCandidates.length !== matchingGrants.length || matchingGrants.length > 1) {
    fail('conflicting-authority');
  }
  let grantRecord = matchingGrants[0] || null;
  if (!grantRecord) {
    const envelope = deps.createApprovalGrantEnvelope
      ? deps.createApprovalGrantEnvelope({
          payload: grantPayload,
          repository,
          convergenceIssue,
        })
      : createAitmRecordEnvelope({
          recordType: 'delivery-incident-ledger-approval-grant',
          repository,
          issue: convergenceIssue,
          payload: grantPayload,
          actor: authenticated.login,
        });
    const render = deps.renderIncidentRecord || renderIncidentRecord;
    grantRecord = await appendWithRecovery({
      append: deps.appendConvergenceRecord,
      list: listConvergence,
      envelope,
      body: render({ envelope, visibleMarkdown: 'AITM authenticated incident approval grant.\n' }),
    });
  }
  assertProviderApprovalRecord(grantRecord, authenticated.login);

  const approvalCandidates = recordsOfType(
    await listConvergence(),
    'delivery-incident-ledger-approval'
  ).filter((record) => record.envelope.payload?.ledgerId === ledgerId);
  const matchingApprovals = approvalCandidates.filter((record) => {
    const { envelope } = record;
    const payload = envelope.payload;
    return (
      payload.repository === repository &&
      payload.convergenceIssue === convergenceIssue &&
      payload.ledgerDigest === ledgerDigest &&
      payload.ledgerRecordId === ledgerRecord.envelope.recordId &&
      payload.grantRecordId === grantRecord.envelope.recordId &&
      payload.approvedBy === authenticated.login &&
      payload.approvedAt === grantRecord.createdAt &&
      record.authorLogin === authenticated.login &&
      record.updatedAt === record.createdAt
    );
  });
  if (approvalCandidates.length !== matchingApprovals.length || matchingApprovals.length > 1) {
    fail('conflicting-authority');
  }
  let approvalRecord = matchingApprovals[0] || null;
  let approvalWritten = false;
  if (!approvalRecord) {
    const buildApproval =
      deps.buildIncidentLedgerApprovalPayload || buildIncidentLedgerApprovalPayload;
    const approvalPayload = buildApproval({
      schema: 'aitm.delivery-incident-ledger-approval/v1',
      repository,
      convergenceIssue,
      ledgerId,
      ledgerDigest,
      ledgerRecordId: ledgerRecord.envelope.recordId,
      grantRecordId: grantRecord.envelope.recordId,
      approvedBy: authenticated.login,
      approvedAt: grantRecord.createdAt,
    });
    const approvalSupersedes = recordTipId(
      recordsOfType(convergenceRecords, 'delivery-incident-ledger-approval')
    );
    const envelope = deps.createApprovalEnvelope
      ? deps.createApprovalEnvelope({
          payload: approvalPayload,
          repository,
          convergenceIssue,
          supersedes: approvalSupersedes,
        })
      : createAitmRecordEnvelope({
          recordType: 'delivery-incident-ledger-approval',
          repository,
          issue: convergenceIssue,
          payload: approvalPayload,
          actor: authenticated.login,
          supersedes: approvalSupersedes,
        });
    const render = deps.renderIncidentRecord || renderIncidentRecord;
    approvalRecord = await appendWithRecovery({
      append: deps.appendConvergenceRecord,
      list: listConvergence,
      envelope,
      body: render({ envelope, visibleMarkdown: 'AITM human-approved incident ledger.\n' }),
    });
    approvalWritten = true;
  }
  assertProviderApprovalRecord(approvalRecord, authenticated.login);

  const currentOwnerRecords = recordsOfType(await listOwners(), 'delivery-incident-ledger-owner');
  if (recordTipId(currentOwnerRecords) !== pinnedOwnerTip) fail('conflicting-authority');

  const ownerPayload = (deps.buildIncidentLedgerOwnerPayload || buildIncidentLedgerOwnerPayload)({
    schema: 'aitm.delivery-incident-ledger-owner/v1',
    repository,
    incidentIssue: ledgerPayload.incidentIssue,
    convergenceIssue,
    ledgerId,
    ledgerDigest,
    approvalRecordId: approvalRecord.envelope.recordId,
  });
  const matchingOwners = currentOwnerRecords.filter(({ envelope }) =>
    sameCanonical(envelope.payload, ownerPayload)
  );
  if (matchingOwners.length > 1) fail('conflicting-authority');
  const currentOwnerTip = pinnedOwnerTip;
  if (matchingOwners.length === 1 && matchingOwners[0].envelope.recordId !== currentOwnerTip) {
    fail('conflicting-authority');
  }
  if (matchingOwners.length === 0) {
    const supersedes = currentOwnerTip;
    const envelope = deps.createOwnerEnvelope
      ? deps.createOwnerEnvelope({
          payload: ownerPayload,
          repository,
          incidentIssue: ledgerPayload.incidentIssue,
          supersedes,
        })
      : createAitmRecordEnvelope({
          recordType: 'delivery-incident-ledger-owner',
          repository,
          issue: ledgerPayload.incidentIssue,
          payload: ownerPayload,
          actor: authenticated.login,
          supersedes,
        });
    const render = deps.renderIncidentRecord || renderIncidentRecord;
    await appendWithRecovery({
      append: deps.appendOwnerRecord,
      list: listOwners,
      envelope,
      body: render({ envelope, visibleMarkdown: 'AITM incident ledger owner pointer.\n' }),
    });
  }

  const finalApprovals = recordsOfType(
    await listConvergence(),
    'delivery-incident-ledger-approval'
  ).filter((record) => record.envelope.recordId === approvalRecord.envelope.recordId);
  const finalOwners = recordsOfType(await listOwners(), 'delivery-incident-ledger-owner').filter(
    ({ envelope }) => sameCanonical(envelope.payload, ownerPayload)
  );
  if (finalApprovals.length !== 1 || finalOwners.length !== 1) fail('record-readback');
  try {
    (deps.projectDeliveryIncidentRecords || projectDeliveryIncidentRecords)([
      ...(await listConvergence()),
      ...(await listOwners()),
    ]);
  } catch {
    fail('conflicting-authority');
  }
  return deepFreeze({
    status: approvalWritten || matchingOwners.length === 0 ? 'approved' : 'already-approved',
    ledgerId,
    ledgerDigest,
    approvalRecordId: approvalRecord.envelope.recordId,
    ownerRecordId: finalOwners[0].envelope.recordId,
  });
}

function acceptedShaFromBody(body) {
  return (
    parseVerificationReceipt(body, 'review')?.commitSha ??
    parseVerificationReceipt(body, 'test')?.commitSha ??
    parseTestStartedMarker(body)?.sha ??
    null
  );
}

function approvalFromBody(body) {
  const marker = parseReviewApprovedMarker(body);
  if (!marker) return { approvalMode: null, approvalSha: null };
  return {
    approvalMode: marker.fullAuto ? 'full-auto' : 'human',
    approvalSha: marker.approvedSha,
  };
}

export function readIssueDeliveryAuthority(body) {
  return deepFreeze({ acceptedSha: acceptedShaFromBody(body), ...approvalFromBody(body) });
}

export function resolveSingleDeliveredEvidence({ comments, repository, issueNumber } = {}) {
  if (!Array.isArray(comments)) fail('stale-observation');
  const candidatePrNumbers = new Set();
  for (const comment of comments) {
    if (!/<!--\s*aitm-delivery-(?:intent|receipt)\b/i.test(comment?.body || '')) continue;
    for (const match of String(comment.body).matchAll(/"prNumber":([1-9][0-9]*)/g)) {
      candidatePrNumbers.add(Number(match[1]));
    }
  }
  const delivered = [];
  for (const prNumber of candidatePrNumbers) {
    let projection;
    try {
      projection = projectDeliveryRecords(
        comments
          .map((comment) =>
            parseDeliveryCommentForPullRequest(
              { id: comment.id, body: comment.body, createdAt: comment.createdAt },
              { repository, issueNumber, prNumber }
            )
          )
          .filter(Boolean)
      );
    } catch {
      fail('stale-observation');
    }
    if (projection.liveIntent !== null && projection.matchingReceipt !== null) {
      const urlById = new Map(comments.map((comment) => [comment.id, comment.url]));
      delivered.push({
        prNumber,
        expectedHeadSha: projection.liveIntent.record.expectedHeadSha,
        mergeCommitSha: projection.matchingReceipt.record.mergeCommitSha,
        intentUrl: urlById.get(projection.liveIntent.id) ?? null,
        receiptUrl: urlById.get(projection.matchingReceipt.id) ?? null,
      });
    }
  }
  if (
    delivered.length !== 1 ||
    delivered[0].intentUrl === null ||
    delivered[0].receiptUrl === null
  ) {
    fail('stale-observation');
  }
  return deepFreeze(delivered[0]);
}

export async function observeIncidentLedgerLive(payload, deps = {}, { phase = 'baseline' } = {}) {
  if (!['baseline', 'terminal'].includes(phase)) fail('phase');
  for (const dependency of [
    'readTrunkSha',
    'fetchIssue',
    'fetchBoardState',
    'fetchPullRequest',
    'listComments',
    'isOnTrunk',
  ]) {
    if (typeof deps[dependency] !== 'function') fail('dependencies');
  }
  const trunkSha = await deps.readTrunkSha();
  if (trunkSha !== payload?.baselineTrunkSha) fail('stale-observation');
  for (const row of payload.rows || []) {
    const [issue, boardState, comments] = await Promise.all([
      deps.fetchIssue(row.issueNumber),
      deps.fetchBoardState(row.issueNumber),
      deps.listComments(row.issueNumber),
    ]);
    if (
      String(issue?.state || '').toUpperCase() !== row.observedGitHubState ||
      boardState !== row.observedBoardState
    ) {
      fail('stale-observation');
    }
    const acceptedSha = acceptedShaFromBody(issue.body || '');
    const approval = approvalFromBody(issue.body || '');
    if (
      acceptedSha !== row.acceptedSha ||
      approval.approvalMode !== row.approvalMode ||
      approval.approvalSha !== row.approvalSha
    ) {
      fail('stale-observation');
    }
    if (!Array.isArray(comments)) fail('stale-observation');
    if (row.prNumber === null) {
      if (
        row.intentUrl !== null ||
        row.receiptUrl !== null ||
        comments.some((comment) => /<!--\s*aitm-delivery-(?:intent|receipt)\b/i.test(comment.body))
      ) {
        fail('stale-observation');
      }
    } else {
      let deliveryProjection;
      try {
        const parsedRecords = comments
          .map((comment) =>
            parseDeliveryCommentForPullRequest(
              { id: comment.id, body: comment.body, createdAt: comment.createdAt },
              {
                repository: payload.repository,
                issueNumber: row.issueNumber,
                prNumber: row.prNumber,
              }
            )
          )
          .filter(Boolean);
        deliveryProjection = projectDeliveryRecords(parsedRecords);
      } catch {
        fail('stale-observation');
      }
      const urlById = new Map(comments.map((comment) => [comment.id, comment.url]));
      const actualIntentUrl = deliveryProjection.liveIntent
        ? (urlById.get(deliveryProjection.liveIntent.id) ?? null)
        : null;
      const actualReceiptUrl = deliveryProjection.matchingReceipt
        ? (urlById.get(deliveryProjection.matchingReceipt.id) ?? null)
        : null;
      const recoversReceipt = phase === 'terminal' && row.intendedOutcome === 'recover-then-close';
      if (
        actualIntentUrl !== row.intentUrl ||
        (recoversReceipt ? actualReceiptUrl === null : actualReceiptUrl !== row.receiptUrl) ||
        (deliveryProjection.liveIntent !== null &&
          deliveryProjection.liveIntent.record.expectedHeadSha !== row.acceptedSha) ||
        (deliveryProjection.matchingReceipt !== null &&
          deliveryProjection.matchingReceipt.record.mergeCommitSha !== row.mergeSha)
      ) {
        fail('stale-observation');
      }
    }
    if (row.prNumber !== null) {
      const pullRequest = await deps.fetchPullRequest(row.prNumber);
      if (
        pullRequest?.number !== row.prNumber ||
        pullRequest?.headRefOid !== row.prHeadSha ||
        pullRequest?.mergeCommitSha !== row.mergeSha
      ) {
        fail('stale-observation');
      }
    } else if (row.prHeadSha !== null || row.mergeSha !== null) {
      fail('stale-observation');
    }
    const trunkEvidenceSha = row.mergeSha ?? row.acceptedSha;
    const observedOnTrunk =
      trunkEvidenceSha === null ? false : await deps.isOnTrunk(trunkEvidenceSha);
    if (observedOnTrunk !== row.codeOnTrunk) fail('stale-observation');
  }
  return deepFreeze(structuredClone(payload));
}

export function resolveApprovedIncidentLedger({
  records,
  repository,
  convergenceIssue,
  incidentIssue,
  deps = {},
} = {}) {
  if (
    !Array.isArray(records) ||
    typeof repository !== 'string' ||
    !REPOSITORY_RE.test(repository) ||
    !Number.isSafeInteger(convergenceIssue) ||
    !Number.isSafeInteger(incidentIssue)
  ) {
    fail('missing-authority');
  }
  let projection;
  try {
    projection = (deps.projectDeliveryIncidentRecords || projectDeliveryIncidentRecords)(records);
  } catch (error) {
    const message = error?.message || '';
    fail(
      /reviewed-set|extra-row/i.test(message)
        ? 'extra-row'
        : /ambiguous|fork/i.test(message)
          ? 'ambiguous-authority'
          : /conflict|duplicate|stale|approval-authority/i.test(message)
            ? 'conflicting-authority'
            : 'missing-authority'
    );
  }
  const ledgerPayload = projection?.approvedLedger?.envelope?.payload;
  const approvalEnvelope = projection?.approvedLedgerApproval?.envelope;
  const ownerEnvelope = projection?.approvedLedgerOwner?.envelope;
  if (
    ledgerPayload?.repository !== repository ||
    ledgerPayload?.convergenceIssue !== convergenceIssue ||
    ledgerPayload?.incidentIssue !== incidentIssue ||
    typeof ledgerPayload?.ledgerId !== 'string' ||
    typeof approvalEnvelope?.payload?.ledgerDigest !== 'string' ||
    typeof ownerEnvelope?.recordId !== 'string'
  ) {
    fail('conflicting-authority');
  }
  return deepFreeze({
    repository,
    convergenceIssue,
    incidentIssue,
    ledgerId: ledgerPayload.ledgerId,
    ledgerDigest: approvalEnvelope.payload.ledgerDigest,
    approvalRecordId: approvalEnvelope.recordId,
    ownerRecordId: ownerEnvelope.recordId,
    ledgerPayload,
    projection,
  });
}

function validateObservedRows(observedRows, ledgerRows) {
  if (!Array.isArray(observedRows) || observedRows.length !== ledgerRows.length) {
    fail('stale-observation');
  }
  return observedRows.map((observation, index) => {
    const row = ledgerRows[index];
    if (
      observation === null ||
      typeof observation !== 'object' ||
      observation.issueNumber !== row.issueNumber ||
      observation.observationMatches !== true ||
      !Array.isArray(observation.evidence) ||
      observation.evidence.some((item) => typeof item !== 'string')
    ) {
      fail('stale-observation');
    }
    return { row, observation };
  });
}

export async function verifyIncidentLedgerPhase({
  authority,
  phase = 'terminal',
  verifiedTrunkSha,
  deps = {},
} = {}) {
  if (!['pre-close', 'terminal'].includes(phase)) fail('phase');
  if (!authority?.ledgerPayload || !SHA_RE.test(verifiedTrunkSha || '')) {
    fail('missing-authority');
  }
  if (typeof deps.observeRows !== 'function') fail('dependencies');
  if (phase === 'pre-close') {
    if (
      typeof deps.verifyPreCloseTopology !== 'function' ||
      (await deps.verifyPreCloseTopology({ authority })) !== true
    ) {
      fail('stale-observation');
    }
  } else if (
    typeof deps.verifyTerminalAuthority !== 'function' ||
    (await deps.verifyTerminalAuthority({ authority, verifiedTrunkSha })) !== true
  ) {
    fail('stale-observation');
  }
  const observed = validateObservedRows(
    await deps.observeRows({ authority, phase, verifiedTrunkSha }),
    authority.ledgerPayload.rows
  );
  const outcomes = observed.map(({ row, observation }) => {
    if (
      phase === 'terminal' &&
      (observation.terminalMatches !== true || observation.outcomeEvidenceMatches !== true)
    ) {
      fail('stale-observation');
    }
    if (phase === 'pre-close') {
      const mustAlreadyBeTerminal = row.intendedOutcome.startsWith('retain-');
      if (observation.terminalMatches !== mustAlreadyBeTerminal) {
        fail('stale-observation');
      }
    }
    return {
      issueNumber: row.issueNumber,
      intendedOutcome: row.intendedOutcome,
      status: observation.terminalMatches === true ? 'verified-terminal' : 'pending-authorized',
      evidence: [...observation.evidence],
    };
  });
  return deepFreeze({
    schema: 'aitm.delivery-incident-verification/v1',
    repository: authority.repository,
    convergenceIssue: authority.convergenceIssue,
    ledgerId: authority.ledgerId,
    ledgerDigest: authority.ledgerDigest,
    baselineTrunkSha: authority.ledgerPayload.baselineTrunkSha,
    verifiedTrunkSha,
    outcomes,
    ok: true,
  });
}
