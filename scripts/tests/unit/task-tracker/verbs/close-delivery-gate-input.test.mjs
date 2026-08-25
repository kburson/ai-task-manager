// @story #1397 #1399 #1406
// cspell:ignore NQDRXH
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import * as closeModule from '../../../../task-tracker/verbs/close.mjs';
import {
  buildDeliveryIntent,
  buildDeliveryReceipt,
  renderDeliveryIntentComment,
  renderDeliveryReceiptComment,
} from '../../../../task-tracker/lib/delivery-records.mjs';

const HEAD = 'a'.repeat(40);
const HISTORICAL_HEAD = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
// cspell:disable-next-line
const INTENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function body() {
  const data = Buffer.from(JSON.stringify({ stage: 'test', commitSha: HEAD })).toString(
    'base64url'
  );
  return (
    '- [x] Agent Review Passed <!-- aitm-verified gate="agent-review" result="pass" -->\n' +
    `<!-- aitm-verification-receipt stage="test" data="${data}" -->`
  );
}

function deliveryComments({
  intentId = INTENT_ID,
  prNumber = 1400,
  expectedHeadSha = HEAD,
  mergeCommitSha = MERGE,
} = {}) {
  const intent = buildDeliveryIntent({
    intentId,
    supersedesIntentId: null,
    issueNumber: 1397,
    repository: 'kburson/ai-task-manager',
    prNumber,
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    expectedHeadSha,
    mergeMethod: 'squash',
    attributionTokens: ['#1397'],
    commitTitle: '[#1397] Governed PR delivery',
    commitMessage: `PR #${prNumber}\nSource: ${expectedHeadSha}\n\nAttribution: [#1397]`,
    provider: 'codex',
    sessionId: 'session-1',
    clientCreatedAt: '2026-08-23T00:00:00.000Z',
  });
  const receipt = buildDeliveryReceipt({
    intentId,
    issueNumber: 1397,
    prNumber,
    expectedHeadSha,
    mergeCommitSha,
    baseRef: 'trunk',
    mergeMethod: 'squash',
    verifiedTrunkRef: 'origin/trunk',
    provider: 'codex',
    sessionId: 'session-1',
    verifiedAt: '2026-08-23T00:02:00.000Z',
  });
  return [
    {
      id: 1,
      body: renderDeliveryIntentComment(intent),
      created_at: '2026-08-23T00:00:01Z',
    },
    {
      id: 2,
      body: renderDeliveryReceiptComment(receipt),
      created_at: '2026-08-23T00:02:01Z',
    },
  ];
}

function pullRequest(number, headRefOid, mergeCommitSha = MERGE) {
  return {
    number,
    state: 'MERGED',
    mergedAt: '2026-08-23T00:02:00Z',
    mergeCommit: { oid: mergeCommitSha },
    headRefName: 'codex/939-full-auto-merge',
    headRefOid,
    baseRefName: 'trunk',
  };
}

async function load(pullRequests, { comments = deliveryComments() } = {}) {
  let commentReads = 0;
  const pexec = async (command, args) => {
    if (command === 'git' && args[0] === 'branch') return { stdout: 'codex/939-full-auto-merge\n' };
    if (command === 'git' && args[0] === 'rev-parse') return { stdout: `${HEAD}\n` };
    if (command === 'gh' && args[0] === 'pr') return { stdout: JSON.stringify(pullRequests) };
    if (command === 'gh' && args[0] === 'api') {
      commentReads += 1;
      return { stdout: JSON.stringify([comments]) };
    }
    throw new Error(`unexpected command: ${command} ${args.join(' ')}`);
  };
  const result = await closeModule.loadCloseDeliveryGateInput({
    issueNumber: 1397,
    cfg: { repo: 'kburson/ai-task-manager', trunkRef: 'origin/trunk' },
    projectDir: '/injected/project',
    pexec,
    body: body(),
    lifecycleEvidence: null,
    ctx: { resolveCloseParentIssue: async () => null },
  });
  return { result, commentReads };
}

test('#1397 projects delivery records under the unique accepted-head PR in either order', async () => {
  const current = pullRequest(1400, HEAD);
  const historical = pullRequest(1396, HISTORICAL_HEAD, 'd'.repeat(40));
  for (const pullRequests of [
    [historical, current],
    [current, historical],
  ]) {
    const { result, commentReads } = await load(pullRequests);
    assert.equal(commentReads, 1);
    assert.equal(result.records.liveIntent.record.prNumber, 1400);
    assert.equal(result.records.liveIntent.createdAt, '2026-08-23T00:00:01.000Z');
    assert.equal(result.records.matchingReceipt.record.expectedHeadSha, HEAD);
    assert.equal(result.records.matchingReceipt.createdAt, '2026-08-23T00:02:01.000Z');
  }
});

test('#1406 ignores valid delivery records from an earlier pull request', async () => {
  const historicalComments = deliveryComments({
    intentId: '01M0VM3K9D909E3SP8NQDRXH0R',
    prNumber: 1396,
    expectedHeadSha: HISTORICAL_HEAD,
    mergeCommitSha: 'd'.repeat(40),
  });
  const { result } = await load([pullRequest(1400, HEAD)], {
    comments: [...historicalComments, ...deliveryComments()],
  });

  assert.equal(result.records.liveIntent.record.prNumber, 1400);
  assert.equal(result.records.matchingReceipt.record.expectedHeadSha, HEAD);
});

test('#1399 rejects an invalid GitHub comment timestamp before record projection', async () => {
  const comments = deliveryComments();
  comments[0].created_at = 'not-an-instant';
  await assert.rejects(
    load([pullRequest(1400, HEAD)], { comments }),
    /close-delivery-comment-created-at/
  );
});

test('#1397 does not read comments for zero or duplicate accepted-head candidates', async () => {
  for (const pullRequests of [
    [pullRequest(1396, HISTORICAL_HEAD)],
    [pullRequest(1400, HEAD), pullRequest(1401, HEAD)],
  ]) {
    const { result, commentReads } = await load(pullRequests);
    assert.equal(commentReads, 0);
    assert.equal(result.records.matchingReceipt, null);
  }
});
