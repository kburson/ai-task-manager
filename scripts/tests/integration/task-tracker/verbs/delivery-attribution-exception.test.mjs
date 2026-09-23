// @story #1755
import assert from 'node:assert/strict';
import { appendFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { hashAuthorizationStatement } from '../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs';
import { PREFLIGHT_MODE } from '../../../../task-tracker/task-tracker.mjs';
import { verbHelp } from '../../../../task-tracker/verbs/help.mjs';
import {
  buildDeliveryAttributionProposal,
  parseDeliveryAttributionExceptionComment,
  renderDeliveryAttributionExceptionComment,
} from '../../../../task-tracker/lib/delivery-attribution-exception-record.mjs';
import {
  createDeliveryAttributionExceptionRuntime,
  parseDeliveryAttributionExceptionArgs,
  runDeliveryAttributionException,
  verifyDeliveryAttributionRecordAuthority,
} from '../../../../task-tracker/verbs/delivery-attribution-exception.mjs';

const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);
const sessionId = '01a0a1d4-c130-7a42-8ccd-4f31b7d4f0ed';
const repository = 'kburson/ai-task-manager';
const scope = {
  repository,
  issueNumber: 1759,
  prNumber: 456,
  baseRef: 'trunk',
  headRef: 'feature/child/1759',
  headSha: shaB,
  sourceCommits: [
    { oid: shaA, messageHeadline: 'legacy commit' },
    { oid: shaB, messageHeadline: '[#1759] implemented' },
  ],
  attributableCommits: [
    { oid: shaA, messageHeadline: 'legacy commit' },
    { oid: shaB, messageHeadline: '[#1759] implemented' },
  ],
  verifiedMergeShas: [],
};

function harness({ provider = 'codex', transcript = true } = {}) {
  const dir = mkdtempProjectIsolated('aitm-delivery-exception-');
  const transcriptPath = path.join(dir, 'session.jsonl');
  let live = structuredClone(scope);
  let writes = 0;
  const comments = [];
  const runtime = {
    host: { provider, transcriptPath: transcript ? transcriptPath : '', sessionId },
    async fetchScope() {
      return structuredClone(live);
    },
    async listComments() {
      return structuredClone(comments);
    },
    async appendComment(body) {
      writes += 1;
      const item = {
        id: `IC_${writes}`,
        body,
        createdAt: '2026-09-23T12:00:00.000Z',
        updatedAt: '2026-09-23T12:00:00.000Z',
      };
      comments.push(item);
      return item;
    },
  };
  return {
    runtime,
    comments,
    transcriptPath,
    get writes() {
      return writes;
    },
    setScope(value) {
      live = structuredClone(value);
    },
    writeMessage(messageId, role, blocks) {
      appendFileSync(
        transcriptPath,
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            id: messageId,
            role,
            content: blocks.map((text) => ({ type: 'input_text', text })),
          },
        }) + '\n'
      );
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const base = { repository, issueNumber: 1759, now: '2026-09-23T12:00:00.000Z' };
const ids = {
  exceptionId: '01M2H000000000000000000001',
  operationId: '01M2H000000000000000000002',
};

async function firstAndFilled(h) {
  const first = await runDeliveryAttributionException({
    ...base,
    action: 'prepare',
    runtime: h.runtime,
    ids,
  });
  const request = structuredClone(first.template);
  request.proposal.mappings = [{ oid: shaA, messageHeadline: 'legacy commit', issueNumber: 1759 }];
  request.proposal.expiresAt = '2026-09-24T12:00:00.000Z';
  const filled = await runDeliveryAttributionException({
    ...base,
    action: 'prepare',
    runtime: h.runtime,
    request,
  });
  return { first, request, filled };
}

test('prepare has a read-only first pass and a digest-bound filled pass without writes', async () => {
  const h = harness();
  try {
    const { first, filled } = await firstAndFilled(h);
    assert.equal(first.status, 'template');
    assert.equal(first.template.proposal.exceptionId, ids.exceptionId);
    assert.equal(first.template.proposal.operationId, ids.operationId);
    assert.equal(first.template.proposal.sourceDigest.startsWith('sha256:'), true);
    assert.deepEqual(first.mappingCandidates, [{ oid: shaA, messageHeadline: 'legacy commit' }]);
    assert.equal(Object.hasOwn(first, 'proposalDigest'), false);
    assert.equal(filled.status, 'prepared');
    assert.match(filled.proposalDigest, /^sha256:[0-9a-f]{64}$/);
    assert.match(filled.statement, new RegExp(filled.proposalDigest));
    assert.equal(h.writes, 0);
  } finally {
    h.cleanup();
  }
});

test('filled prepare refuses a mapping whose complete receipt would exceed the comment limit', async () => {
  const h = harness();
  try {
    const headline = '-'.repeat(16000);
    h.setScope({
      ...scope,
      sourceCommits: [{ oid: shaA, messageHeadline: headline }, scope.sourceCommits[1]],
      attributableCommits: [{ oid: shaA, messageHeadline: headline }, scope.sourceCommits[1]],
    });
    const first = await runDeliveryAttributionException({
      ...base,
      action: 'prepare',
      runtime: h.runtime,
      ids,
    });
    const request = structuredClone(first.template);
    request.proposal.mappings = [{ oid: shaA, messageHeadline: headline, issueNumber: 1759 }];
    await assert.rejects(
      runDeliveryAttributionException({ ...base, action: 'prepare', runtime: h.runtime, request }),
      /comment-upper-bound/
    );
    assert.equal(h.writes, 0);
  } finally {
    h.cleanup();
  }
});

test('filled prepare refuses absent ids, invalid issue and expiry, bad mapping, and changed inventory', async () => {
  const h = harness();
  try {
    const { request } = await firstAndFilled(h);
    for (const mutate of [
      (x) => {
        delete x.proposal.exceptionId;
      },
      (x) => {
        x.proposal.operationId = 'changed';
      },
      (x) => {
        x.proposal.mappings[0].issueNumber = 0;
      },
      (x) => {
        x.proposal.expiresAt = 'tomorrow';
      },
      (x) => {
        x.proposal.mappings = [];
      },
    ]) {
      const changed = structuredClone(request);
      mutate(changed);
      await assert.rejects(
        runDeliveryAttributionException({
          ...base,
          action: 'prepare',
          runtime: h.runtime,
          request: changed,
        })
      );
    }
    h.setScope({
      ...scope,
      sourceCommits: [{ oid: shaA, messageHeadline: 'changed commit' }, scope.sourceCommits[1]],
    });
    await assert.rejects(
      runDeliveryAttributionException({ ...base, action: 'prepare', runtime: h.runtime, request })
    );
    assert.equal(h.writes, 0);
  } finally {
    h.cleanup();
  }
});

test('unsupported host refuses prepare and record even with a session name', async () => {
  const h = harness({ provider: 'claude' });
  try {
    await assert.rejects(
      runDeliveryAttributionException({ ...base, action: 'prepare', runtime: h.runtime, ids }),
      /authorization-host-unsupported/
    );
    await assert.rejects(
      runDeliveryAttributionException({
        ...base,
        action: 'record',
        runtime: h.runtime,
        request: {},
      }),
      /authorization-host-unsupported/
    );
  } finally {
    h.cleanup();
  }
});

test('record requires the exact filtered Codex user statement, readback, and is idempotent', async () => {
  const h = harness();
  try {
    const { request, filled } = await firstAndFilled(h);
    const messageId = 'msg_user';
    h.writeMessage(messageId, 'user', ['<user-memory>injected</user-memory>', filled.statement]);
    request.authorizationSource = {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId,
      messageId,
      statementHash: hashAuthorizationStatement(filled.statement),
    };
    const first = await runDeliveryAttributionException({
      ...base,
      action: 'record',
      runtime: h.runtime,
      request,
    });
    assert.equal(first.status, 'recorded');
    assert.equal(h.writes, 1);
    assert.equal(
      parseDeliveryAttributionExceptionComment(h.comments[0].body).authority.sourceReference,
      `codex://sessions/${sessionId}/messages/${messageId}`
    );
    const retry = await runDeliveryAttributionException({
      ...base,
      action: 'record',
      runtime: h.runtime,
      request,
    });
    assert.equal(retry.status, 'already-recorded');
    assert.equal(h.writes, 1);
    assert.equal(
      (
        await verifyDeliveryAttributionRecordAuthority(
          parseDeliveryAttributionExceptionComment(h.comments[0].body),
          h.runtime
        )
      ).status,
      'verified'
    );
  } finally {
    h.cleanup();
  }
});

test('agent, injection-only, wrong hash, and ordinary comment cannot authorize a record', async () => {
  const h = harness();
  try {
    const { request, filled } = await firstAndFilled(h);
    request.authorizationSource = {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId,
      messageId: 'msg_user',
      statementHash: hashAuthorizationStatement(filled.statement),
    };
    for (const [role, blocks] of [
      ['assistant', [filled.statement]],
      ['user', ['<user-memory>injected</user-memory>']],
      ['user', ['Not the statement']],
    ]) {
      h.writeMessage('msg_user', role, blocks);
      await assert.rejects(
        runDeliveryAttributionException({ ...base, action: 'record', runtime: h.runtime, request })
      );
    }
    h.comments.push({ id: 'ordinary', body: filled.statement });
    assert.equal(h.writes, 0);
  } finally {
    h.cleanup();
  }
});

test('show stays read-only on an unsupported host', async () => {
  const h = harness({ provider: 'claude', transcript: false });
  try {
    const result = await runDeliveryAttributionException({
      ...base,
      action: 'show',
      runtime: h.runtime,
    });
    assert.equal(result.status, 'missing');
    assert.equal(h.writes, 0);
  } finally {
    h.cleanup();
  }
});

test('edited grant blocks show and exact retry readback', async () => {
  const h = harness();
  try {
    const { request, filled } = await firstAndFilled(h);
    request.authorizationSource = {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId,
      messageId: 'msg_grant',
      statementHash: hashAuthorizationStatement(filled.statement),
    };
    h.writeMessage('msg_grant', 'user', [filled.statement]);
    await runDeliveryAttributionException({
      ...base,
      action: 'record',
      runtime: h.runtime,
      request,
    });
    h.comments[0].updatedAt = '2026-09-23T12:00:01.000Z';
    await assert.rejects(
      runDeliveryAttributionException({ ...base, action: 'show', runtime: h.runtime }),
      /edited-comment/
    );
    await assert.rejects(
      runDeliveryAttributionException({ ...base, action: 'record', runtime: h.runtime, request }),
      /edited-comment/
    );
    assert.equal(h.writes, 1);
  } finally {
    h.cleanup();
  }
});

test('argument parser requires one explicit positive issue', () => {
  assert.deepEqual(parseDeliveryAttributionExceptionArgs(['prepare', '#1759', '--json']), {
    action: 'prepare',
    issueNumber: 1759,
    inputFile: null,
    json: true,
  });
  assert.throws(() => parseDeliveryAttributionExceptionArgs(['show', '#0']), /usage/);
  assert.equal(PREFLIGHT_MODE['delivery-attribution-exception'], undefined);
});

test('command help exposes the complete two-pass and revision workflow', () => {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    verbHelp('delivery-attribution-exception');
  } finally {
    console.log = original;
  }
  const help = lines.join('\n');
  for (const action of ['prepare', 'record', 'show', 'revise', 'revoke']) {
    assert.match(help, new RegExp(`delivery-attribution-exception ${action} #1759`));
  }
  assert.match(help, /authorization-host-unsupported/);
  assert.match(help, /preparation grants no authority/i);
});

test('revise and revoke require fresh user messages and append linked records', async () => {
  const h = harness();
  try {
    const { request, filled } = await firstAndFilled(h);
    request.authorizationSource = {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId,
      messageId: 'msg_grant',
      statementHash: hashAuthorizationStatement(filled.statement),
    };
    h.writeMessage('msg_grant', 'user', [filled.statement]);
    const grant = await runDeliveryAttributionException({
      ...base,
      action: 'record',
      runtime: h.runtime,
      request,
    });
    const revision = structuredClone(request);
    revision.action = 'revise';
    revision.proposal.exceptionId = '01M2H000000000000000000003';
    revision.proposal.expiresAt = '2026-09-25T12:00:00.000Z';
    const revised = await runDeliveryAttributionException({
      ...base,
      action: 'prepare',
      runtime: h.runtime,
      request: revision,
    });
    revision.authorizationSource = {
      ...request.authorizationSource,
      messageId: 'msg_revision',
      statementHash: hashAuthorizationStatement(revised.statement),
    };
    h.writeMessage('msg_revision', 'user', [revised.statement]);
    const second = await runDeliveryAttributionException({
      ...base,
      action: 'revise',
      runtime: h.runtime,
      request: revision,
    });
    assert.equal(second.status, 'revised');
    assert.equal(
      parseDeliveryAttributionExceptionComment(h.comments[1].body).predecessorId,
      grant.recordId
    );

    const revocation = structuredClone(revision);
    revocation.action = 'revoke';
    revocation.proposal.exceptionId = '01M2H000000000000000000004';
    const revokePrepared = await runDeliveryAttributionException({
      ...base,
      action: 'prepare',
      runtime: h.runtime,
      request: revocation,
    });
    revocation.authorizationSource = {
      ...request.authorizationSource,
      messageId: 'msg_revoke',
      statementHash: hashAuthorizationStatement(revokePrepared.statement),
    };
    h.writeMessage('msg_revoke', 'user', [revokePrepared.statement]);
    const third = await runDeliveryAttributionException({
      ...base,
      action: 'revoke',
      runtime: h.runtime,
      request: revocation,
    });
    assert.equal(third.status, 'revoked');
    const retry = await runDeliveryAttributionException({
      ...base,
      action: 'revoke',
      runtime: h.runtime,
      request: revocation,
    });
    assert.equal(retry.status, 'already-recorded');
    assert.equal(h.writes, 3);
    assert.equal(
      parseDeliveryAttributionExceptionComment(h.comments[2].body).predecessorId,
      second.recordId
    );
    assert.equal(
      (await runDeliveryAttributionException({ ...base, action: 'show', runtime: h.runtime }))
        .status,
      'revoked'
    );
    const fork = parseDeliveryAttributionExceptionComment(h.comments[0].body);
    fork.recordId = '01M2H000000000000000000099';
    h.comments.splice(2, 0, {
      id: 'IC_fork',
      body: renderDeliveryAttributionExceptionComment(fork),
      createdAt: '2026-09-23T12:00:00.000Z',
      updatedAt: '2026-09-23T12:00:00.000Z',
    });
    assert.equal(
      (await runDeliveryAttributionException({ ...base, action: 'show', runtime: h.runtime }))
        .status,
      'blocked'
    );
  } finally {
    h.cleanup();
  }
});

test('runtime writes to the parsed issue when the input file name is numeric', async () => {
  const calls = [];
  const ctx = {
    cfg: { repo: repository, trunkRef: 'origin/trunk' },
    projectDir: process.cwd(),
    rest: ['record', '--input-file', '1760', '#1759'],
  };
  const runtime = createDeliveryAttributionExceptionRuntime(ctx, {
    issueNumber: 1759,
    run: async (name, args) => {
      calls.push({ name, args });
      return { stdout: JSON.stringify({ node_id: 'IC_test' }) };
    },
  });
  await runtime.appendComment('exact body');
  assert.equal(calls[0].args[1], 'repos/kburson/ai-task-manager/issues/1759/comments');
});

test('revoke readback refuses a competing valid revision appended at the same predecessor', async () => {
  const h = harness();
  try {
    const { request, filled } = await firstAndFilled(h);
    request.authorizationSource = {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId,
      messageId: 'msg_grant',
      statementHash: hashAuthorizationStatement(filled.statement),
    };
    h.writeMessage('msg_grant', 'user', [filled.statement]);
    await runDeliveryAttributionException({
      ...base,
      action: 'record',
      runtime: h.runtime,
      request,
    });
    const revocation = structuredClone(request);
    revocation.action = 'revoke';
    revocation.proposal.exceptionId = '01M2H000000000000000000003';
    const prepared = await runDeliveryAttributionException({
      ...base,
      action: 'prepare',
      runtime: h.runtime,
      request: revocation,
    });
    revocation.authorizationSource = {
      ...request.authorizationSource,
      messageId: 'msg_revoke',
      statementHash: hashAuthorizationStatement(prepared.statement),
    };
    h.writeMessage('msg_revoke', 'user', [prepared.statement]);
    const original = h.runtime.appendComment;
    h.runtime.appendComment = async (body) => {
      const stored = await original(body);
      const competing = parseDeliveryAttributionExceptionComment(body);
      competing.kind = 'revision';
      competing.recordId = '01M2H000000000000000000099';
      competing.proposal.exceptionId = '01M2H000000000000000000098';
      competing.proposalDigest = buildDeliveryAttributionProposal(
        competing.proposal
      ).proposalDigest;
      competing.authority.sourceReference = `codex://sessions/${sessionId}/messages/msg_competing`;
      competing.authority.statement = 'A different verified user statement';
      h.comments.push({
        id: 'IC_competing',
        body: renderDeliveryAttributionExceptionComment(competing),
        createdAt: '2026-09-23T12:00:00.000Z',
        updatedAt: '2026-09-23T12:00:00.000Z',
      });
      return stored;
    };
    await assert.rejects(
      runDeliveryAttributionException({
        ...base,
        action: 'revoke',
        runtime: h.runtime,
        request: revocation,
      }),
      /delivery-attribution-exception-record:chain/
    );
  } finally {
    h.cleanup();
  }
});

test('transport ambiguity needs an exact appended comment on readback', async () => {
  const h = harness();
  try {
    const { request, filled } = await firstAndFilled(h);
    request.authorizationSource = {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId,
      messageId: 'msg_user',
      statementHash: hashAuthorizationStatement(filled.statement),
    };
    h.writeMessage('msg_user', 'user', [filled.statement]);
    const original = h.runtime.appendComment;
    h.runtime.appendComment = async (body) => {
      await original(body);
      throw new Error('transport lost');
    };
    assert.equal(
      (
        await runDeliveryAttributionException({
          ...base,
          action: 'record',
          runtime: h.runtime,
          request,
        })
      ).status,
      'recorded'
    );
    assert.equal(h.writes, 1);
  } finally {
    h.cleanup();
  }
});

test('an exact retry refuses a competing recorded chain instead of claiming activation', async () => {
  const h = harness();
  try {
    const { request, filled } = await firstAndFilled(h);
    request.authorizationSource = {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId,
      messageId: 'msg_user',
      statementHash: hashAuthorizationStatement(filled.statement),
    };
    h.writeMessage('msg_user', 'user', [filled.statement]);
    await runDeliveryAttributionException({
      ...base,
      action: 'record',
      runtime: h.runtime,
      request,
    });
    const competing = parseDeliveryAttributionExceptionComment(h.comments[0].body);
    competing.recordId = '01M2H000000000000000000099';
    h.comments.push({
      id: 'IC_competing',
      body: renderDeliveryAttributionExceptionComment(competing),
      createdAt: '2026-09-23T12:00:00.000Z',
      updatedAt: '2026-09-23T12:00:00.000Z',
    });
    await assert.rejects(
      runDeliveryAttributionException({ ...base, action: 'record', runtime: h.runtime, request }),
      /delivery-attribution-exception-record:/
    );
    assert.equal(h.writes, 1);
  } finally {
    h.cleanup();
  }
});

test('revision refuses a reused exception id before writing a poisoned chain', async () => {
  const h = harness();
  try {
    const { request, filled } = await firstAndFilled(h);
    request.authorizationSource = {
      schema: 'aitm.authorization-source/v1',
      adapter: 'codex-session/v1',
      sessionId,
      messageId: 'msg_grant',
      statementHash: hashAuthorizationStatement(filled.statement),
    };
    h.writeMessage('msg_grant', 'user', [filled.statement]);
    await runDeliveryAttributionException({
      ...base,
      action: 'record',
      runtime: h.runtime,
      request,
    });
    const revision = structuredClone(request);
    revision.action = 'revise';
    const prepared = await runDeliveryAttributionException({
      ...base,
      action: 'prepare',
      runtime: h.runtime,
      request: revision,
    });
    revision.authorizationSource = {
      ...request.authorizationSource,
      messageId: 'msg_revision',
      statementHash: hashAuthorizationStatement(prepared.statement),
    };
    h.writeMessage('msg_revision', 'user', [prepared.statement]);
    await assert.rejects(
      runDeliveryAttributionException({
        ...base,
        action: 'revise',
        runtime: h.runtime,
        request: revision,
      }),
      /duplicate-identity/
    );
    assert.equal(h.writes, 1);
  } finally {
    h.cleanup();
  }
});

test('filled prepare refuses a candidate whose escaped rendered comment exceeds the bound', async () => {
  const h = harness();
  try {
    const hugeSubject = '🚀'.repeat(13_000);
    h.setScope({
      ...scope,
      sourceCommits: [{ oid: shaA, messageHeadline: hugeSubject }, scope.sourceCommits[1]],
      attributableCommits: [{ oid: shaA, messageHeadline: hugeSubject }, scope.sourceCommits[1]],
    });
    const first = await runDeliveryAttributionException({
      ...base,
      action: 'prepare',
      runtime: h.runtime,
      ids,
    });
    const request = structuredClone(first.template);
    request.proposal.mappings = [{ oid: shaA, messageHeadline: hugeSubject, issueNumber: 1759 }];
    await assert.rejects(
      runDeliveryAttributionException({ ...base, action: 'prepare', runtime: h.runtime, request }),
      /comment-upper-bound/
    );
  } finally {
    h.cleanup();
  }
});

test('prepare refuses to open a waiver when every source commit is canonically attributed', async () => {
  const h = harness();
  try {
    const canonical = { oid: shaA, messageHeadline: '[#1759] first commit' };
    h.setScope({
      ...scope,
      sourceCommits: [canonical, scope.sourceCommits[1]],
      attributableCommits: [canonical, scope.sourceCommits[1]],
    });
    await assert.rejects(
      runDeliveryAttributionException({ ...base, action: 'prepare', runtime: h.runtime, ids }),
      /no-exception-needed/
    );
    assert.equal(h.writes, 0);
  } finally {
    h.cleanup();
  }
});

test('prepare refuses a PR branch bound to another issue', async () => {
  const h = harness();
  try {
    h.setScope({ ...scope, headRef: 'feature/child/1760' });
    await assert.rejects(
      runDeliveryAttributionException({ ...base, action: 'prepare', runtime: h.runtime, ids }),
      /issue-branch/
    );
    assert.equal(h.writes, 0);
  } finally {
    h.cleanup();
  }
});

test('prepare accepts an opaque branch when it exactly matches durable issue authority', async () => {
  const h = harness();
  try {
    h.setScope({
      ...scope,
      headRef: 'codex/defect-1759-delivery-attribution-exception',
      boundBranch: 'codex/defect-1759-delivery-attribution-exception',
    });
    const result = await runDeliveryAttributionException({
      ...base,
      action: 'prepare',
      runtime: h.runtime,
      ids,
    });
    assert.equal(result.status, 'template');
    assert.equal(
      result.template.proposal.headRef,
      'codex/defect-1759-delivery-attribution-exception'
    );
  } finally {
    h.cleanup();
  }
});
