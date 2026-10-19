// @story #1990
// @story #1210
import { currentUnitAuthority } from '../../../unit/task-tracker/lib/decomposition-unit-admission-fixture.mjs';
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

test('CLI-facing body runner uses the real canonical protected write and reassessment', async () => {
  const current = await currentUnitAuthority({
    issue: 42,
    repository: 'owner/repo',
    body: '## Scope\nfixture scope before revision\n\n## AITM Progress Markers\n',
  });
  const files = [];
  const result = await runIssueBodyVerb(
    {
      ...ctx(['42', '--operation-file', 'op.json']),
      cfg: current.cfg,
      projectDir: current.projectDir,
    },
    {
      loadState: (_path, state) => state,
      decomposition: { subject: current.subject, runtime: current.runtime },
      writeDeps: current.authority.deps,
      readFile: (file) => {
        files.push(file);
        return JSON.stringify({
          schema: 'aitm.issue-body-operation/v1',
          kind: 'replace-exact',
          expected: 'fixture scope before revision',
          replacement: 'fixture scope after revision',
        });
      },
    }
  );
  assert.equal(result.status, 'ok');
  assert.match(result.body, /## Scope\nfixture scope after revision/);
  assert.deepEqual(files, ['op.json']);
  assert.equal((await current.runtime.collect(current.subject)).projection.status, 'current');
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
