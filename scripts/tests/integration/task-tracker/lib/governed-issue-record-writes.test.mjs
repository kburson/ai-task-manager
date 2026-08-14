// @story #1210
import assert from 'node:assert/strict';
import test from 'node:test';

import { runIssueBodyVerb } from '../../../../task-tracker/verbs/issue-body.mjs';
import { runCommentVerb } from '../../../../task-tracker/verbs/comment.mjs';

function ctx(rest, state = {}) {
  return {
    rest,
    cfg: { repo: 'owner/repo' },
    statePath: '/state.json',
    projectDir: '/project',
    state: {
      active: '#42',
      entryStartTs: '2026-08-12T00:00:00.000Z',
      pausedAtTs: null,
      ...state,
    },
  };
}

test('CLI-facing runners require the same active issue and an open timing session', async () => {
  const deps = {
    loadState: (_path, state) => state,
    readFile: () => '{}',
  };
  await assert.rejects(
    () => runIssueBodyVerb(ctx(['41', '--operation-file', 'op.json']), deps),
    /active issue #42.*target #41/
  );
  await assert.rejects(
    () =>
      runCommentVerb(
        ctx(['42', '--key', 'audit', '--body-file', 'body.md'], { entryStartTs: null }),
        deps
      ),
    /open timing session/
  );
});

test('CLI-facing body runner reads a declarative file and calls the canonical operation core', async () => {
  const calls = [];
  const result = await runIssueBodyVerb(ctx(['42', '--operation-file', 'op.json']), {
    loadState: (_path, state) => state,
    readFile: () =>
      JSON.stringify({
        schema: 'aitm.issue-body-operation/v1',
        kind: 'replace-exact',
        expected: 'old',
        replacement: 'new',
      }),
    mutateIssueBody: async (input) => {
      calls.push(input);
      return {
        status: 'ok',
        version: 2,
        body: `${input.mutate('old')}\n\n<!-- aitm-body-version version="2" -->\n`,
      };
    },
  });
  assert.equal(result.body, 'new\n\n<!-- aitm-body-version version="2" -->\n');
  assert.equal(calls.length, 1);
});

test('CLI-facing comment runner is noninteractive but never bypasses verified upsert', async () => {
  const calls = [];
  const result = await runCommentVerb(ctx(['42', '--key', 'audit', '--body-file', 'body.md']), {
    loadState: (_path, state) => state,
    readFile: () => 'durable audit',
    upsertOwnedComment: async (input) => {
      calls.push(input);
      return { status: 'created', id: 'IC_1', body: input.body };
    },
  });
  assert.equal(result.status, 'created');
  assert.deepEqual(
    calls.map(({ issue, key, body }) => ({ issue, key, body })),
    [{ issue: 42, key: 'audit', body: 'durable audit' }]
  );
});
