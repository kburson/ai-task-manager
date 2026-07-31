// @story #1049
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { postCommitTrail } from '../../../commit-trail-handler.mjs';
import {
  buildInitialTrail,
  appendCommitRow,
  buildRow,
  updateMarker,
} from '../../../lib/commit-trail.mjs';

const INFO = {
  sha: 'abc12340000000',
  subject: '[#1049] feat: fenced trail',
  author: 'agent',
  ts: '2026-07-30T12:00:00.000Z',
  isWorktree: false,
};

function expectedBody() {
  let body = buildInitialTrail({ issueNumber: '1049' });
  body = appendCommitRow(
    body,
    buildRow(
      {
        ...INFO,
        commitUrl: `https://github.com/o/r/commit/${INFO.sha}`,
      },
      { worktreeCols: false }
    )
  );
  return updateMarker(body, INFO.sha);
}

test('postCommitTrail reverifies before create and post-mutation readback', async () => {
  const events = [];
  let body = null;
  const result = await postCommitTrail({
    issueNumber: '1049',
    repo: 'o/r',
    info: INFO,
    cwd: '/repo',
    deps: {
      withGovernedEffect: async (options, callback) => {
        events.push(`open:${options.issueId}:${options.operation}`);
        return callback({
          reverify: async () => {
            events.push('verify');
          },
        });
      },
      find: async () => {
        events.push('find');
        return body == null ? null : { id: 'C_1', body };
      },
      create: async (_issue, _repo, nextBody) => {
        events.push('create');
        body = nextBody;
      },
      update: async () => {
        throw new Error('unexpected update');
      },
    },
  });
  assert.equal(result.action, 'created');
  assert.equal(body, expectedBody());
  assert.deepEqual(events, [
    'open:1049:issue-attributed-commit',
    'verify',
    'find',
    'verify',
    'create',
    'verify',
    'find',
  ]);
});

test('postCommitTrail fence drift after read blocks remote mutation and readback', async () => {
  const events = [];
  let verifyCount = 0;
  let mutations = 0;
  await assert.rejects(
    () =>
      postCommitTrail({
        issueNumber: '1049',
        repo: 'o/r',
        info: INFO,
        cwd: '/repo',
        deps: {
          withGovernedEffect: async (_options, callback) =>
            callback({
              reverify: async () => {
                verifyCount += 1;
                events.push(`verify:${verifyCount}`);
                if (verifyCount === 2) {
                  const error = new Error('fence lost after local commit');
                  error.code = 'fence-stale';
                  throw error;
                }
              },
            }),
          find: async () => {
            events.push('find');
            return null;
          },
          create: async () => {
            mutations += 1;
          },
          update: async () => {
            mutations += 1;
          },
        },
      }),
    (error) => error.code === 'fence-stale'
  );
  assert.deepEqual(events, ['verify:1', 'find', 'verify:2']);
  assert.equal(mutations, 0);
});

test('postCommitTrail reverifies before update and validates its readback', async () => {
  const events = [];
  let remote = {
    id: 'C_1',
    body: [
      '### 🔗 Commits',
      '',
      '<!-- aitm-ledger-caveat -->',
      '> caveat',
      '',
      '<!-- aitm-commits shas="old12340000000" -->',
      '',
      '| SHA | Subject | Author | When |',
      '|---|---|---|---|',
      '| `old123` | old | agent | before |',
    ].join('\n'),
  };
  const result = await postCommitTrail({
    issueNumber: '1049',
    repo: 'o/r',
    info: INFO,
    cwd: '/repo',
    deps: {
      withGovernedEffect: async (_options, callback) =>
        callback({
          reverify: async () => {
            events.push('verify');
          },
        }),
      find: async () => {
        events.push('find');
        return remote;
      },
      update: async (id, body) => {
        events.push('update');
        remote = { id, body };
      },
      create: async () => {
        throw new Error('unexpected create');
      },
    },
  });
  assert.equal(result.action, 'updated');
  assert.match(remote.body, new RegExp(INFO.sha));
  assert.deepEqual(events, ['verify', 'find', 'verify', 'update', 'verify', 'find']);
});
