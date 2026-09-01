// @story #1481
// Exact-identity retirement for invalid verification receipts.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { mutateIssueBody as defaultMutateIssueBody } from './issue-body-mutate.mjs';
import {
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
  return { status: mutationStatus, body: liveBody };
}
