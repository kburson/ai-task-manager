// @story #1755
import assert from 'node:assert/strict';
import { appendFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { hashAuthorizationStatement } from '../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
import { runDeliveryAttributionException } from '../../../../task-tracker/verbs/delivery-attribution-exception.mjs';
import {
  buildDeliveryAttributionProposal,
  parseDeliveryAttributionExceptionComment,
  renderDeliveryAttributionExceptionComment,
} from '../../../../task-tracker/lib/delivery-attribution-exception-record.mjs';
import {
  HEAD,
  NOW,
  deliver,
  makeHarness,
} from '../../../unit/task-tracker/verbs/deliver-test-harness.mjs';

const legacySha = '1'.repeat(40);
const sessionId = '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed';
const source = [
  { oid: legacySha, messageHeadline: 'legacy commit' },
  { oid: HEAD, messageHeadline: '[#939] delivered' },
];

async function fixture(t) {
  const dir = mkdtempProjectIsolated('aitm-delivery-receipt-');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const transcriptPath = path.join(dir, 'session.jsonl');
  const h = makeHarness({
    commitSubjects: source.map(({ messageHeadline }) => messageHeadline),
    prCommitSubjects: source.map(({ messageHeadline }) => messageHeadline),
    prSourceCommits: structuredClone(source),
    historyCommitMessage: 'Merged source without attribution trailer',
  });
  h.deps.inspectLocalSourceCommit = async ({ commitSha, headSha }) => ({
    oid: commitSha,
    localHeadSha: headSha,
    message: `${h.data.prSourceCommits.find(({ oid }) => oid === commitSha)?.messageHeadline}\n`,
    reachable: true,
  });
  h.deps.resolveTranscriptPath = () => transcriptPath;
  const runtime = {
    host: { provider: 'codex', sessionId, transcriptPath },
    resolveTranscriptPath: () => transcriptPath,
    fetchScope: async () => ({
      repository: 'kburson/ai-task-manager',
      issueNumber: 939,
      prNumber: 1400,
      boundBranch: 'codex/939-full-auto-merge',
      baseRef: 'trunk',
      headRef: 'codex/939-full-auto-merge',
      headSha: HEAD,
      sourceCommits: structuredClone(h.data.prSourceCommits),
      attributableCommits: structuredClone(h.data.prSourceCommits),
      verifiedMergeShas: [],
    }),
    listComments: async () =>
      h.data.comments.map(({ id, body, createdAt, updatedAt }) => ({
        id,
        body,
        createdAt,
        updatedAt,
      })),
    appendComment: async (body) => {
      const item = { id: `IC_${h.data.comments.length + 1}`, body, createdAt: NOW, updatedAt: NOW };
      h.data.comments.push(item);
      return item;
    },
  };
  const base = {
    action: 'prepare',
    issueNumber: 939,
    repository: 'kburson/ai-task-manager',
    runtime,
    now: NOW,
  };
  const ids = {
    exceptionId: '01M2H000000000000000000001',
    operationId: '01M2H000000000000000000002',
  };
  const first = await runDeliveryAttributionException({ ...base, ids });
  const request = structuredClone(first.template);
  request.proposal.mappings = [
    { oid: legacySha, messageHeadline: 'legacy commit', issueNumber: 939 },
  ];
  request.proposal.expiresAt = '2026-08-23T14:00:00.000Z';
  const prepared = await runDeliveryAttributionException({ ...base, request });
  request.authorizationSource = {
    schema: 'aitm.authorization-source/v1',
    adapter: 'codex-session/v1',
    sessionId,
    messageId: 'msg_grant',
    statementHash: hashAuthorizationStatement(prepared.statement),
  };
  appendFileSync(
    transcriptPath,
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        id: 'msg_grant',
        role: 'user',
        content: [{ type: 'input_text', text: prepared.statement }],
      },
    }) + '\n'
  );
  await runDeliveryAttributionException({ ...base, action: 'record', request });
  return h;
}

test('post-merge waived delivery emits a v3 receipt with warning and immutable authority', async (t) => {
  const h = await fixture(t);
  const pending = await deliver(h);
  assert.equal(pending.intent.schema, 'aitm.delivery-intent/v2');
  h.data.prState = 'MERGED';
  const result = await deliver(h);
  assert.equal(result.status, 'delivered');
  assert.equal(result.receipt.schema, 'aitm.delivery-receipt/v3');
  assert.equal(result.receipt.attributionDisposition, 'waived');
  assert.deepEqual(result.receipt.metadataWarnings, ['missing-merge-attribution-trailer']);
  assert.equal(result.receipt.intentId, pending.intent.intentId);
  assert.match(result.receipt.exceptionRecord.authority.sourceReference, /codex:\/\/sessions/);
  const comment = h.data.comments.at(-1).body;
  assert.match(comment, /Attribution waived/);
  assert.match(comment, /legacy commit/);
  assert.equal(h.calls.fetchPullRequest >= 4, true);
});

test('post-merge source drift refuses a waived receipt', async (t) => {
  const h = await fixture(t);
  await deliver(h);
  h.data.prState = 'MERGED';
  h.data.prSourceCommits[0].messageHeadline = 'changed source';
  await assert.rejects(deliver(h), /delivery-verification:waived-authority/);
  assert.equal(
    h.data.comments.some(({ body }) => body.startsWith('<!-- aitm-delivery-receipt ')),
    false
  );
});

test('post-merge conflicting actual attribution refuses a waived receipt', async (t) => {
  const h = await fixture(t);
  const pending = await deliver(h);
  h.data.prState = 'MERGED';
  h.deps.inspectMergeCommit = async () => ({
    parents: ['d'.repeat(40)],
    commitTitle: pending.intent.commitTitle,
    commitMessage: 'Attribution: [#999]',
  });
  await assert.rejects(deliver(h), /delivery-verification:attribution/);
  assert.equal(
    h.data.comments.some(({ body }) => body.startsWith('<!-- aitm-delivery-receipt ')),
    false
  );
});

test('post-merge revoked exception refuses a waived receipt', async (t) => {
  const h = await fixture(t);
  await deliver(h);
  h.data.prState = 'MERGED';
  const grant = parseDeliveryAttributionExceptionComment(h.data.comments[0].body);
  const revision = buildDeliveryAttributionProposal({
    ...grant.proposal,
    exceptionId: '01M2H000000000000000000004',
  });
  const revoked = {
    ...grant,
    kind: 'revocation',
    recordId: '01M2H000000000000000000004',
    predecessorId: grant.recordId,
    proposal: revision.proposal,
    proposalDigest: revision.proposalDigest,
    authority: { ...grant.authority, sourceReference: 'codex://sessions/other/messages/revoke' },
    createdAt: '2026-08-22T14:00:02.000Z',
  };
  h.data.comments.push({
    id: 'IC_revoke',
    body: renderDeliveryAttributionExceptionComment(revoked),
    createdAt: '2026-08-22T14:00:03.000Z',
    updatedAt: '2026-08-22T14:00:03.000Z',
  });
  await assert.rejects(deliver(h), /delivery-attribution-exception-record:inactive/);
  assert.equal(
    h.data.comments.some(({ body }) => body.startsWith('<!-- aitm-delivery-receipt ')),
    false
  );
});
