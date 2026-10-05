// @story #1481 #1887
// Exact-identity retirement for invalid verification receipts.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { mutateIssueBody as defaultMutateIssueBody } from './issue-body-mutate.mjs';
import {
  hasClaimedVerificationReceiptMarker,
  hasMalformedVerificationReceiptClaim,
  parseValidatedVerificationReceiptClaims,
  parseValidatedVerificationReceipts,
  parseVerificationReceipts,
} from './verification-receipt.mjs';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';

const pexec = promisify(execFile);

function assertIdentity({ stage, receiptId }) {
  if (typeof stage !== 'string' || stage.trim() === '') {
    throw new TypeError('verification-receipt-retirement: stage is required');
  }
  if (typeof receiptId !== 'string' || receiptId.trim() === '') {
    throw new TypeError('verification-receipt-retirement: receiptId is required');
  }
}

export function retireVerificationReceiptMarker(body, { expectedIssue, stage, receiptId } = {}) {
  assertIdentity({ stage, receiptId });
  const source = String(body || '');
  const matches = parseValidatedVerificationReceiptClaims(source, { expectedIssue }).filter(
    ({ receipt }) => receipt.stage === stage && receipt.receiptId === receiptId
  );
  if (matches.length === 0) return { status: 'already-absent', body: source };
  if (matches.length !== 1) {
    throw new Error(
      `verification-receipt-retirement: ambiguous target ${stage}/${receiptId} (${matches.length} claims)`
    );
  }

  const [{ start, end, receipt }] = matches;
  return {
    status: 'retired',
    body: source.slice(0, start) + source.slice(end),
    receipt,
    removedRange: { start, end },
  };
}

// Read-only eligibility for re-entry after rebase. A projection is never passing proof.
export function planStaleTestReceiptRetirement(body, { expectedIssue, head } = {}) {
  if (
    !Number.isInteger(expectedIssue) ||
    expectedIssue <= 0 ||
    !/^[a-f0-9]{40,64}$/.test(head ?? '')
  ) {
    throw new TypeError(
      'verification-receipt-retirement: current issue and full HEAD are required'
    );
  }
  const source = String(body || '');
  if (hasMalformedVerificationReceiptClaim(source)) {
    throw new TypeError('verification-receipt-retirement: malformed claimed marker');
  }
  // No Test claim: leave Develop-final validation and audited repair to its owner.
  if (!hasClaimedVerificationReceiptMarker(source, 'test')) return { body: source, receipt: null };
  const claims = parseValidatedVerificationReceiptClaims(source, { expectedIssue }).filter(
    ({ receipt }) => receipt.stage === 'test'
  );
  if (claims.length > 1) throw new Error('verification-receipt-retirement: ambiguous Test claims');
  const receipt = claims[0]?.receipt;
  if (!receipt || receipt.commitSha === head) return { body: source, receipt: null };
  const projected = retireVerificationReceiptMarker(source, {
    expectedIssue,
    stage: 'test',
    receiptId: receipt.receiptId,
  });
  return { body: projected.body, receipt };
}

function targetPresent(body, { expectedIssue, stage, receiptId }) {
  const permissive = parseVerificationReceipts(body).some(
    (receipt) => receipt.stage === stage && receipt.receiptId === receiptId
  );
  const validated = parseValidatedVerificationReceipts(body, { expectedIssue }).some(
    (receipt) => receipt.stage === stage && receipt.receiptId === receiptId
  );
  return permissive || validated;
}

async function defaultFetchBody({ cfg, issueNumber }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '');
}

export async function retireVerificationReceipt({
  cfg,
  issueNumber,
  stage,
  receiptId,
  staleHead,
  deps = {},
} = {}) {
  if (!cfg?.repo) throw new Error('verification-receipt-retirement: cfg.repo is required');
  if (!Number.isInteger(Number(issueNumber)) || Number(issueNumber) <= 0) {
    throw new Error('verification-receipt-retirement: issueNumber is required');
  }
  assertIdentity({ stage, receiptId });

  const mutateIssueBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const fetchBody = deps.fetchBody || defaultFetchBody;
  let mutationStatus = 'already-absent';
  const write = await mutateIssueBody({
    issueNumber: Number(issueNumber),
    repo: cfg.repo,
    allowMarkerLoss: true,
    mutate: (freshBody) => {
      if (staleHead !== undefined) {
        if (stage !== 'test') throw new Error('stale retirement requires Test stage');
        const eligible = planStaleTestReceiptRetirement(freshBody, {
          expectedIssue: Number(issueNumber),
          head: staleHead,
        });
        if (
          (eligible.receipt && eligible.receipt.receiptId !== receiptId) ||
          (!eligible.receipt &&
            targetPresent(freshBody, { expectedIssue: Number(issueNumber), stage, receiptId }))
        )
          throw new Error('verification-receipt-retirement: stale eligibility changed');
      }
      const result = retireVerificationReceiptMarker(freshBody, {
        expectedIssue: Number(issueNumber),
        stage,
        receiptId,
      });
      mutationStatus = result.status;
      return result.body;
    },
  });
  if (typeof write?.body !== 'string') {
    throw new Error('verification-receipt-retirement: write returned no verified body');
  }
  if (targetPresent(write.body, { expectedIssue: Number(issueNumber), stage, receiptId })) {
    throw new Error('verification-receipt-retirement: verified write body still contains target');
  }

  const liveBody = await fetchBody({ cfg, issueNumber: Number(issueNumber) });
  if (targetPresent(liveBody, { expectedIssue: Number(issueNumber), stage, receiptId })) {
    throw new Error('verification-receipt-retirement: fresh read-back still contains target');
  }
  if (
    staleHead !== undefined &&
    planStaleTestReceiptRetirement(liveBody, {
      expectedIssue: Number(issueNumber),
      head: staleHead,
    }).receipt
  ) {
    throw new Error(
      'verification-receipt-retirement: fresh read-back contains a new stale Test claim'
    );
  }
  return { status: mutationStatus, body: liveBody };
}
