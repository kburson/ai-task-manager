// @story #1673
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { annotateSuccessfulGuidanceMutation } from '../../../../guidance/annotation.mjs';
import { listIssueComments } from '../../../../scripts/task-tracker/lib/owned-comment.mjs';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const admission = {
  admitted: true,
  trust: 'project-owned-diverged',
  validation: { source: { catalogFileDigest: DIGEST } },
};
const input = {
  admission,
  issue: 1673,
  repository: 'kburson/ai-task-manager',
  projectDir: '/tmp/annotation-fixture',
};

function harness() {
  const comments = [];
  const calls = { list: 0, post: 0, lock: 0 };
  let tail = Promise.resolve();
  const deps = {
    withLock: async (_options, fn) => {
      calls.lock += 1;
      const prior = tail;
      let release;
      tail = new Promise((resolve) => {
        release = resolve;
      });
      await prior;
      try {
        return await fn();
      } finally {
        release();
      }
    },
    listComments: async () => {
      calls.list += 1;
      return { issueId: 'I_1673', comments: [...comments] };
    },
    postComment: async ({ body }) => {
      calls.post += 1;
      comments.push({
        id: `IC_${calls.post}`,
        body,
        repository: input.repository,
        issue: input.issue,
      });
      return { id: `IC_${calls.post}` };
    },
  };
  return { comments, calls, deps };
}

test('read-only, failed, or published operations never query or annotate', async () => {
  const h = harness();
  assert.deepEqual(
    await annotateSuccessfulGuidanceMutation({ ...input, mutationSucceeded: false, deps: h.deps }),
    { status: 'skipped' }
  );
  assert.deepEqual(
    await annotateSuccessfulGuidanceMutation({
      ...input,
      admission: { ...admission, trust: 'published' },
      mutationSucceeded: true,
      deps: h.deps,
    }),
    { status: 'skipped' }
  );
  assert.deepEqual(h.calls, { list: 0, post: 0, lock: 0 });
});

test('first successful mutation posts one versioned annotation, retries and edits do not post again', async () => {
  const h = harness();
  const first = await annotateSuccessfulGuidanceMutation({
    ...input,
    mutationSucceeded: true,
    deps: h.deps,
  });
  assert.equal(first.status, 'posted');
  assert.match(h.comments[0].body, /aitm-guidance-override:v1/);
  assert.match(h.comments[0].body, /Executable workflow guards remain authoritative/);
  assert.match(h.comments[0].body, new RegExp(DIGEST));
  const edited = {
    ...admission,
    validation: { source: { catalogFileDigest: `sha256:${'b'.repeat(64)}` } },
  };
  assert.deepEqual(
    await annotateSuccessfulGuidanceMutation({
      ...input,
      admission: edited,
      mutationSucceeded: true,
      deps: h.deps,
    }),
    { status: 'existing' }
  );
  assert.equal(h.calls.post, 1);
});

test('concurrent attempts serialize lookup and post under the issue lock', async () => {
  const h = harness();
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      annotateSuccessfulGuidanceMutation({ ...input, mutationSucceeded: true, deps: h.deps })
    )
  );
  assert.deepEqual(
    results.map((result) => result.status),
    ['posted', 'existing', 'existing']
  );
  assert.equal(h.calls.post, 1);
});

test('lookup or post failure is a visible warning without rolling back the mutation', async () => {
  for (const failure of ['listComments', 'postComment']) {
    const h = harness();
    h.deps[failure] = async () => {
      throw new Error('simulated transport failure');
    };
    assert.deepEqual(
      await annotateSuccessfulGuidanceMutation({
        ...input,
        mutationSucceeded: true,
        deps: h.deps,
      }),
      { status: 'warning', code: 'guidance-annotation-failed' }
    );
  }
});

test('annotation lookup reaches later GitHub comment pages before deciding to post', async () => {
  const h = harness();
  const cursors = [];
  h.deps.listComments = ({ repository, issue }) =>
    listIssueComments({
      repository,
      issue,
      graphql: async ({ variables }) => {
        cursors.push(variables.after);
        const last = variables.after === 'page-one';
        return {
          data: {
            repository: {
              issue: {
                id: 'I_1673',
                number: 1673,
                repository: { nameWithOwner: repository },
                comments: {
                  nodes: [
                    {
                      id: last ? 'IC_existing' : 'IC_other',
                      body: last ? '<!-- aitm-guidance-override:v1 source="old" -->' : 'other',
                      issue: { number: 1673, repository: { nameWithOwner: repository } },
                    },
                  ],
                  pageInfo: { hasNextPage: !last, endCursor: last ? null : 'page-one' },
                },
              },
            },
          },
        };
      },
    });
  const result = await annotateSuccessfulGuidanceMutation({
    ...input,
    mutationSucceeded: true,
    deps: h.deps,
  });
  assert.deepEqual(result, { status: 'existing' });
  assert.deepEqual(cursors, [null, 'page-one']);
  assert.equal(h.calls.post, 0);
});
