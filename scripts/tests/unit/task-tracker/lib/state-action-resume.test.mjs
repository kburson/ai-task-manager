// @story #1117 #1454

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INLINE_HEAD_MARKER_LIMIT,
  INLINE_BODY_LIMIT,
  advanceActionLedgerHead,
  createGenesisHead,
} from '../../../../task-tracker/lib/resident-action-ledger-write.mjs';
import {
  fingerprint,
  parseBodyLedgerHead,
} from '../../../../task-tracker/lib/resident-action-ledger-codec.mjs';
import { stampBodyVersion } from '../../../../task-tracker/lib/body-version.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;

function memoryWriter(body = '## Issue\n') {
  let current = body;
  let nextId = 100;
  const comments = new Map();
  return {
    get body() {
      return current;
    },
    comments,
    deps: {
      fetchBody: async () => current,
      pushBody: async (_repo, _issue, next) => {
        current = next;
      },
      createComment: async (_issue, commentBody) => {
        const id = String(nextId++);
        comments.set(id, commentBody);
        return { id, body: commentBody };
      },
      readComment: async (_issue, id) =>
        comments.has(String(id)) ? { id: String(id), body: comments.get(String(id)) } : null,
    },
  };
}

test('genesis heads are canonical and inline within the operational budgets', () => {
  const head = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  assert.equal(head.mode, 'inline');
  assert.equal(head.visit, 'review:1');
  assert.deepEqual(head.actions, {});
  assert.equal(INLINE_HEAD_MARKER_LIMIT, 8192);
  assert.equal(INLINE_BODY_LIMIT, 57344);
});

test('advanceActionLedgerHead writes and verifies an inline head', async () => {
  const server = memoryWriter();
  const nextHead = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  const result = await advanceActionLedgerHead({
    issue: 1117,
    repo: 'o/r',
    expectedHead: null,
    nextHead,
    deps: server.deps,
  });
  assert.equal(result.mode, 'inline');
  assert.equal(parseBodyLedgerHead(server.body).visit, 'review:1');
  assert.equal(server.comments.size, 0);
});

test('advanceActionLedgerHead accepts a canonically equivalent expected head', async () => {
  const first = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  const server = memoryWriter(`## Issue\n${first.marker}`);
  const result = await advanceActionLedgerHead({
    issue: 1117,
    repo: 'o/r',
    expectedHead: first,
    nextHead: createGenesisHead({ visit: 'review:2', definition: HASH_A }),
    deps: server.deps,
  });
  assert.equal(result.mode, 'inline');
  assert.equal(parseBodyLedgerHead(server.body).visit, 'review:2');
});

test('large bodies spill automatically and verify the protected head twice', async () => {
  const server = memoryWriter('x'.repeat(INLINE_BODY_LIMIT));
  const nextHead = {
    ...createGenesisHead({ visit: 'review:1', definition: HASH_A }),
    actions: {
      review: { commentId: '9', hash: HASH_A, attemptId: 1, phase: 'intent' },
    },
  };
  const result = await advanceActionLedgerHead({
    issue: 1117,
    repo: 'o/r',
    expectedHead: null,
    nextHead,
    deps: server.deps,
  });
  assert.equal(result.mode, 'spill');
  assert.equal(server.comments.size, 1);
  const bodyHead = parseBodyLedgerHead(server.body);
  const [commentId, expectedHash] = bodyHead.head.split(/:(?=sha256:)/);
  assert.equal(fingerprint(server.comments.get(commentId)), expectedHash);
  assert.equal(result.commentVerifications, 2);
});

test('stale expected heads fail against the fresh mutation base', async () => {
  const first = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  const server = memoryWriter(`## Issue\n${first.marker}`);
  await assert.rejects(
    () =>
      advanceActionLedgerHead({
        issue: 1117,
        repo: 'o/r',
        expectedHead: null,
        nextHead: createGenesisHead({ visit: 'review:2', definition: HASH_A }),
        deps: server.deps,
      }),
    /stale-expected-head/
  );
});

test('stale expected heads are rechecked against a retry base', async () => {
  const first = createGenesisHead({ visit: 'review:1', definition: HASH_A });
  const next = createGenesisHead({ visit: 'review:2', definition: HASH_A });
  let body = stampBodyVersion(`header\n${first.marker}\nfooter`, 1);
  let pushed = false;
  const deps = {
    fetchBody: async () => body,
    pushBody: async (_repo, _issue, candidate) => {
      body = candidate;
      if (!pushed) {
        pushed = true;
        body = stampBodyVersion(`header\n${next.marker}\nfooter`, 3);
      }
    },
  };
  await assert.rejects(
    () =>
      mutateIssueBody({
        issueNumber: 1117,
        repo: 'o/r',
        mutate: (base) => base.replace('header', 'header changed'),
        allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
        validateFreshBase: (base) => {
          if (parseBodyLedgerHead(base)?.visit !== first.visit) {
            throw new Error('stale-expected-head');
          }
        },
        deps,
      }),
    /stale-expected-head/
  );
});
