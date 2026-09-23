// @story #1755
import assert from 'node:assert/strict';
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { hashAuthorizationStatement } from '../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
import { runDeliveryAttributionException } from '../../../../task-tracker/verbs/delivery-attribution-exception.mjs';
import { canonicalSourceInventory } from '../../../../task-tracker/lib/delivery-attribution-exception.mjs';
import {
  HEAD,
  NOW,
  NEXT_HEAD,
  cfg,
  deliver,
  makeHarness,
} from '../../../unit/task-tracker/verbs/deliver-test-harness.mjs';

const legacySha = '1'.repeat(40);
const sessionId = '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed';
const ids = {
  exceptionId: '01M2H000000000000000000001',
  operationId: '01M2H000000000000000000002',
};
const source = [
  { oid: legacySha, messageHeadline: 'legacy commit' },
  { oid: HEAD, messageHeadline: '[#939] delivered' },
];

function fixture(t) {
  const dir = mkdtempProjectIsolated('aitm-delivery-preflight-');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const transcriptPath = path.join(dir, 'session.jsonl');
  const h = makeHarness({
    commitSubjects: source.map(({ messageHeadline }) => messageHeadline),
    prCommitSubjects: source.map(({ messageHeadline }) => messageHeadline),
    prSourceCommits: structuredClone(source),
  });
  h.deps.inspectLocalSourceCommit = async ({ commitSha, headSha }) => ({
    oid: commitSha,
    localHeadSha: headSha,
    message: `${source.find(({ oid }) => oid === commitSha)?.messageHeadline}\n`,
    reachable: true,
  });
  h.deps.resolveTranscriptPath = () => transcriptPath;
  const scope = () => ({
    repository: 'kburson/ai-task-manager',
    issueNumber: 939,
    prNumber: 1400,
    boundBranch: 'codex/939-full-auto-merge',
    baseRef: 'trunk',
    headRef: 'codex/939-full-auto-merge',
    headSha: h.data.prHead ?? h.data.head,
    sourceCommits: structuredClone(h.data.prSourceCommits),
    attributableCommits: structuredClone(h.data.prSourceCommits),
    verifiedMergeShas: [],
  });
  const runtime = {
    host: { provider: 'codex', sessionId, transcriptPath },
    resolveTranscriptPath: () => transcriptPath,
    fetchScope: scope,
    listComments: async () => h.data.comments.map(({ id, body }) => ({ id, body })),
    appendComment: async (body) => {
      const item = { id: `IC_${h.data.comments.length + 1}`, body, createdAt: NOW };
      h.data.comments.push(item);
      return item;
    },
  };
  return { h, runtime, transcriptPath };
}

async function grant(f, overrides = {}) {
  const base = {
    action: 'prepare',
    issueNumber: 939,
    repository: 'kburson/ai-task-manager',
    runtime: f.runtime,
    now: NOW,
  };
  const first = await runDeliveryAttributionException({ ...base, ids });
  const request = structuredClone(first.template);
  request.proposal.mappings = [
    { oid: legacySha, messageHeadline: 'legacy commit', issueNumber: 939 },
  ];
  request.proposal.expiresAt = '2026-08-23T14:00:00.000Z';
  for (const [key, value] of Object.entries(overrides)) request.proposal[key] = value;
  const prepared = await runDeliveryAttributionException({ ...base, request });
  request.authorizationSource = {
    schema: 'aitm.authorization-source/v1',
    adapter: 'codex-session/v1',
    sessionId,
    messageId: 'msg_grant',
    statementHash: hashAuthorizationStatement(prepared.statement),
  };
  appendFileSync(
    f.transcriptPath,
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
  return request;
}

test('ordinary open-PR mixed history refuses without a recorded waiver', async (t) => {
  const { h } = fixture(t);
  await assert.rejects(deliver(h), /delivery-preflight:attribution/);
  assert.equal(h.calls.createIssueComment, 0);
});

test('already-merged external recovery never consumes an open-PR waiver', async (t) => {
  const f = fixture(t);
  await grant(f);
  f.h.data.prState = 'MERGED';
  await assert.rejects(deliver(f.h), /delivery-preflight:attribution/);
  assert.equal(f.h.calls.createIssueComment, 0);
});

test('Codex-authorized scoped waiver emits v2 intent after late source revalidation', async (t) => {
  const f = fixture(t);
  await grant(f);
  const result = await deliver(f.h);
  assert.equal(result.status, 'action-required');
  assert.equal(result.intent.schema, 'aitm.delivery-intent/v2');
  assert.equal(result.intent.attributionDisposition, 'waived');
  assert.equal(result.intent.operationId, ids.operationId);
  assert.equal(result.intent.sourceDigest, canonicalSourceInventory(source, HEAD).sourceDigest);
  assert.deepEqual(result.intent.attributionTokens, ['#939']);
  assert.equal(f.h.calls.fetchPullRequest, 2);
});

test('late changed source order refuses action after the pending intent', async (t) => {
  const f = fixture(t);
  await grant(f);
  const create = f.h.deps.createIssueComment;
  f.h.deps.createIssueComment = async (input) => {
    const result = await create(input);
    f.h.data.prSourceCommits = [source[1], source[0]];
    f.h.data.prCommitSubjects = f.h.data.prSourceCommits.map(
      ({ messageHeadline }) => messageHeadline
    );
    return result;
  };
  await assert.rejects(deliver(f.h), /deliver:late-attribution|delivery-attribution-exception/);
  assert.equal(f.h.calls.createIssueComment, 1);
});

test('unchanged pending waived intent resumes the same operation without a new comment', async (t) => {
  const f = fixture(t);
  await grant(f);
  const first = await deliver(f.h);
  const second = await deliver(f.h);
  assert.equal(second.status, 'action-required');
  assert.equal(second.intent.intentId, first.intent.intentId);
  assert.equal(second.intent.operationId, ids.operationId);
  assert.equal(f.h.calls.createIssueComment, 1);
  assert.equal(f.h.calls.fetchPullRequest, 4);
});

for (const [name, mutate] of [
  [
    'head',
    (h) => {
      h.data.prHead = 'b'.repeat(40);
    },
  ],
  [
    'subject',
    (h) => {
      h.data.prSourceCommits[0].messageHeadline = 'rewritten legacy commit';
      h.data.prCommitSubjects[0] = 'rewritten legacy commit';
    },
  ],
  [
    'local object',
    (h) => {
      h.deps.inspectLocalSourceCommit = async () => {
        throw new Error('missing');
      };
    },
  ],
  [
    'removed record',
    (h) => {
      h.data.comments.splice(0, 1);
    },
  ],
]) {
  test(`late changed ${name} refuses provider action`, async (t) => {
    const f = fixture(t);
    await grant(f);
    const create = f.h.deps.createIssueComment;
    f.h.deps.createIssueComment = async (input) => {
      const result = await create(input);
      mutate(f.h);
      return result;
    };
    await assert.rejects(deliver(f.h), /deliver:late-attribution/);
    assert.equal(f.h.calls.createIssueComment, 1);
  });
}

test('malformed exception record blocks delivery before intent', async (t) => {
  const f = fixture(t);
  await grant(f);
  f.h.data.comments.push({
    id: 'IC_bad',
    createdAt: NOW,
    body: '### Delivery attribution exception\n\nbroken',
  });
  await assert.rejects(deliver(f.h), /delivery-attribution-exception-record/);
  assert.equal(f.h.calls.createIssueComment, 0);
});

test('competing active records and expired authority refuse before intent', async (t) => {
  const duplicate = fixture(t);
  await grant(duplicate);
  duplicate.h.data.comments.push({ ...duplicate.h.data.comments[0], id: 'IC_duplicate' });
  await assert.rejects(
    deliver(duplicate.h),
    /delivery-attribution-exception-record:duplicate-identity/
  );
  assert.equal(duplicate.h.calls.createIssueComment, 0);

  const expired = fixture(t);
  await grant(expired);
  expired.h.deps.now = () => '2026-08-24T14:00:00.000Z';
  await assert.rejects(deliver(expired.h), /delivery-attribution-exception-record:inactive/);
  assert.equal(expired.h.calls.createIssueComment, 0);
});

test('authorized revocation posted after intent blocks the provider action', async (t) => {
  const f = fixture(t);
  const request = await grant(f);
  const create = f.h.deps.createIssueComment;
  f.h.deps.createIssueComment = async (input) => {
    const result = await create(input);
    const revocation = structuredClone(request);
    revocation.action = 'revoke';
    revocation.proposal.exceptionId = '01M2H000000000000000000004';
    const args = {
      issueNumber: 939,
      repository: 'kburson/ai-task-manager',
      runtime: f.runtime,
      now: '2026-08-22T14:00:01.000Z',
    };
    const prepared = await runDeliveryAttributionException({
      ...args,
      action: 'prepare',
      request: revocation,
    });
    revocation.authorizationSource = {
      ...request.authorizationSource,
      messageId: 'msg_revoke',
      statementHash: hashAuthorizationStatement(prepared.statement),
    };
    appendFileSync(
      f.transcriptPath,
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          id: 'msg_revoke',
          role: 'user',
          content: [{ type: 'input_text', text: prepared.statement }],
        },
      }) + '\n'
    );
    await runDeliveryAttributionException({ ...args, action: 'revoke', request: revocation });
    return result;
  };
  await assert.rejects(deliver(f.h), /deliver:late-attribution/);
  assert.equal(f.h.calls.createIssueComment, 1);
});

test('a revised active record cannot launder an unverified earlier chain link', async (t) => {
  const f = fixture(t);
  const request = await grant(f);
  const revision = structuredClone(request);
  revision.action = 'revise';
  revision.proposal.exceptionId = '01M2H000000000000000000003';
  revision.proposal.expiresAt = '2026-08-24T14:00:00.000Z';
  const base = {
    issueNumber: 939,
    repository: 'kburson/ai-task-manager',
    runtime: f.runtime,
    now: '2026-08-22T14:00:01.000Z',
  };
  const prepared = await runDeliveryAttributionException({
    ...base,
    action: 'prepare',
    request: revision,
  });
  revision.authorizationSource = {
    ...request.authorizationSource,
    messageId: 'msg_revision',
    statementHash: hashAuthorizationStatement(prepared.statement),
  };
  appendFileSync(
    f.transcriptPath,
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        id: 'msg_revision',
        role: 'user',
        content: [{ type: 'input_text', text: prepared.statement }],
      },
    }) + '\n'
  );
  await runDeliveryAttributionException({ ...base, action: 'revise', request: revision });
  writeFileSync(
    f.transcriptPath,
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        id: 'msg_revision',
        role: 'user',
        content: [{ type: 'input_text', text: prepared.statement }],
      },
    }) + '\n'
  );
  await assert.rejects(deliver(f.h), /authorization-source/);
  assert.equal(f.h.calls.createIssueComment, 0);
});

for (const [name, change] of [
  [
    'dirty tree',
    (h) => {
      h.deps.listDirtyPaths = async () => ['changed-file'];
    },
  ],
  [
    'issue owner',
    (h) => {
      const fetch = h.deps.fetchIssue;
      h.deps.fetchIssue = async () => ({ ...(await fetch()), assignees: [] });
    },
  ],
  [
    'Review lifecycle',
    (h) => {
      const fetch = h.deps.fetchIssue;
      h.deps.fetchIssue = async () => ({ ...(await fetch()), projectState: 'Test' });
    },
  ],
  [
    'hosted CI',
    (h) => {
      h.data.checks.required[0].conclusion = 'FAILURE';
    },
  ],
  [
    'mergeability',
    (h) => {
      const fetch = h.deps.fetchPullRequest;
      h.deps.fetchPullRequest = async (args) => ({
        ...(await fetch(args)),
        mergeable: 'CONFLICTING',
      });
    },
  ],
]) {
  test(`waiver preserves ${name} refusal`, async (t) => {
    const f = fixture(t);
    await grant(f);
    change(f.h);
    await assert.rejects(deliver(f.h), /delivery-preflight/);
    assert.equal(f.h.calls.createIssueComment, 0);
  });
}

test('waiver preserves active binding, accepted Test head, and provider mechanism gates', async (t) => {
  const binding = fixture(t);
  await grant(binding);
  await assert.rejects(
    deliver(binding.h, { state: { active: '#940', entryStartTs: NOW } }),
    /delivery-preflight:active-issue-mismatch/
  );

  const testHead = fixture(t);
  await grant(testHead);
  testHead.h.data.testReceiptSha = NEXT_HEAD;
  await assert.rejects(deliver(testHead.h), /delivery-preflight:head-mismatch/);

  const provider = fixture(t);
  await grant(provider);
  await assert.rejects(
    deliver(provider.h, {
      cfg: { ...cfg(), fullAutoMerge: { mechanism: 'direct', mergeMethod: 'squash' } },
    }),
    /delivery-preflight:configuration/
  );
  for (const f of [binding, testHead, provider]) assert.equal(f.h.calls.createIssueComment, 0);
});
