// @story #1711
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runUserStory } from '../../../../task-tracker/verbs/user-story.mjs';
const story = {
  asA: 'release operator',
  iWant: 'stop partial publication',
  soThat: 'consumers receive complete releases',
};
const cfg = { repo: 'o/r' };
for (const status of ['ok', 'no-op'])
  for (const returnedBody of [true, false]) {
    test(`${status}: Plan feedback uses ${returnedBody ? 'verified' : 'fetched'} body and never approves`, async () => {
      let reads = 0;
      let resolutions = 0;
      const result = await runUserStory({
        target: 1711,
        story,
        cfg,
        projectDir: '/repo',
        deps: {
          mutateIssueBody: async ({ mutate }) => ({
            status,
            ...(returnedBody ? { body: mutate('## Scope\n') } : {}),
          }),
          readIssueState: async () => 'plan',
          fetchIssueBody: async () => {
            reads++;
            return 'fresh body';
          },
          resolveStoryIntent: async ({ body, projectDir }) => {
            resolutions++;
            assert.equal(projectDir, '/repo');
            assert.equal(
              body,
              returnedBody
                ? '## User Story\n\nAs a release operator\nI want to stop partial publication\nSo that consumers receive complete releases\n\n## Scope\n'
                : 'fresh body'
            );
            return { ok: true, source: 'deep-dive' };
          },
        },
      });
      assert.equal(result.status, status === 'no-op' ? 'no-op' : 'written');
      assert.equal(reads, returnedBody ? 0 : 1);
      assert.equal(resolutions, 1);
      assert.equal(result.advisory.source, 'deep-dive');
      assert.match(result.advisory.message, /approval binds the final story/i);
    });
  }
for (const stage of ['state', 'body', 'intent'])
  for (const status of ['ok', 'no-op']) {
    test(`${status}: ${stage} failures remain advisory`, async () => {
      const result = await runUserStory({
        target: 1711,
        story,
        cfg,
        projectDir: '/repo',
        deps: {
          mutateIssueBody: async () => ({ status }),
          readIssueState: async () => {
            if (stage === 'state') throw new Error('state offline');
            return 'plan';
          },
          fetchIssueBody: async () => {
            if (stage === 'body') throw new Error('body offline');
            return 'body';
          },
          resolveStoryIntent: async () => {
            throw new Error('intent offline');
          },
        },
      });
      assert.equal(result.status, status === 'no-op' ? 'no-op' : 'written');
      assert.equal(result.advisory.ok, false);
      assert.match(result.advisory.message, /offline/);
    });
  }
test('outside Plan reads state once and performs no body or intent read', async () => {
  let reads = 0;
  const result = await runUserStory({
    target: 1711,
    story,
    cfg,
    deps: {
      mutateIssueBody: async () => ({ status: 'ok' }),
      readIssueState: async () => {
        reads++;
        return 'develop';
      },
      fetchIssueBody: () => assert.fail('no body fetch'),
      resolveStoryIntent: () => assert.fail('no intent read'),
    },
  });
  assert.equal(reads, 1);
  assert.equal(result.status, 'written');
  assert.equal(result.advisory, undefined);
});
