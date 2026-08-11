// @story #1207

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { fetchConfiguredProjectIssue } from '../../../../gh/lib/github-projects.mjs';

const args = { repo: 'o/r', projectId: 'TARGET', issueNumber: 1207 };

function item(projectId, id = `ITEM_${projectId}`) {
  return {
    id,
    project: { id: projectId },
    fieldValueByName: { name: 'Assigned', optionId: 'OPT_ASSIGNED' },
  };
}

function response({ nodes, hasNextPage = false, endCursor = null, assignees = ['alice'] }) {
  return {
    repository: {
      issue: {
        id: 'ISSUE_1207',
        assignees: { nodes: assignees.map((login) => ({ login })) },
        projectItems: { nodes, pageInfo: { hasNextPage, endCursor } },
      },
    },
  };
}

test('configured membership beyond the first ten is returned with same-snapshot assignees', async () => {
  const nodes = Array.from({ length: 11 }, (_, index) => item(`FOREIGN_${index}`));
  nodes.push(item('TARGET'));
  const calls = [];
  const result = await fetchConfiguredProjectIssue({
    ...args,
    gqlFn: async (query, variables) => {
      calls.push({ query, variables });
      return response({ nodes, assignees: ['Alice'] });
    },
  });

  assert.equal(result.projectItem.id, 'ITEM_TARGET');
  assert.deepEqual(result.assignees, ['Alice']);
  assert.match(calls[0].query, /projectItems\(first:\s*100,\s*after:\s*\$cursor\)/);
});

test('configured membership lookup paginates until exhaustion', async () => {
  const cursors = [];
  const result = await fetchConfiguredProjectIssue({
    ...args,
    gqlFn: async (_query, variables) => {
      cursors.push(variables.cursor ?? null);
      return variables.cursor == null
        ? response({ nodes: [item('FOREIGN')], hasNextPage: true, endCursor: 'NEXT' })
        : response({ nodes: [item('TARGET')], assignees: ['bob'] });
    },
  });

  assert.deepEqual(cursors, [null, 'NEXT']);
  assert.equal(result.projectItem.id, 'ITEM_TARGET');
  assert.deepEqual(result.assignees, ['bob']);
});

test('exhausted lookup returns an explicit missing membership without partial success', async () => {
  const result = await fetchConfiguredProjectIssue({
    ...args,
    gqlFn: async () => response({ nodes: [item('FOREIGN')] }),
  });
  assert.equal(result.issueId, 'ISSUE_1207');
  assert.equal(result.projectItem, null);
});

for (const scenario of [
  {
    label: 'repeated cursor',
    pages: [
      response({ nodes: [], hasNextPage: true, endCursor: 'SAME' }),
      response({ nodes: [], hasNextPage: true, endCursor: 'SAME' }),
    ],
    pattern: /cursor.*progress|repeated cursor/i,
  },
  {
    label: 'missing cursor',
    pages: [response({ nodes: [], hasNextPage: true, endCursor: null })],
    pattern: /missing.*cursor|endCursor/i,
  },
]) {
  test(`${scenario.label} is a fail-closed pagination refusal`, async () => {
    let index = 0;
    await assert.rejects(
      () =>
        fetchConfiguredProjectIssue({
          ...args,
          gqlFn: async () => scenario.pages[Math.min(index++, scenario.pages.length - 1)],
        }),
      scenario.pattern
    );
  });
}

test('transport failure propagates instead of looking like missing membership', async () => {
  await assert.rejects(
    () =>
      fetchConfiguredProjectIssue({
        ...args,
        gqlFn: async () => {
          throw new Error('membership transport unavailable');
        },
      }),
    /membership transport unavailable/
  );
});

test('bounded safety limit refuses a partial scan while another page remains', async () => {
  await assert.rejects(
    () =>
      fetchConfiguredProjectIssue({
        ...args,
        maxPages: 1,
        gqlFn: async () =>
          response({ nodes: [item('FOREIGN')], hasNextPage: true, endCursor: 'NEXT' }),
      }),
    /safety limit|partial/i
  );
});
