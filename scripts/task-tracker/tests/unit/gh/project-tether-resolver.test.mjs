// @story #1207
import assert from 'node:assert/strict';
import test from 'node:test';

import { tetherIssueToProject } from '../../../../gh/lib/project-tether.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJECT' };

function issueItem(projectId = cfg.projectId, id = 'ISSUE_SIDE') {
  return {
    id,
    project: { id: projectId, title: 'Board', url: 'https://example.test/board' },
    fieldValueByName: { name: 'Backlog', optionId: 'BACKLOG' },
    fieldValues: { nodes: [] },
  };
}

function forwardItem({ repo = cfg.repo, number = 42, id = 'FORWARD' } = {}) {
  return {
    id,
    isArchived: false,
    content: {
      number,
      title: 'Issue',
      url: `https://example.test/${repo}/issues/${number}`,
      repository: { nameWithOwner: repo },
    },
  };
}

function issueResponse({ nodes = [], hasNextPage = false, endCursor = null } = {}) {
  return {
    repository: {
      id: 'REPO',
      issue: {
        id: 'ISSUE_42',
        number: 42,
        title: 'Issue',
        url: 'https://example.test/o/r/issues/42',
        assignees: { nodes: [{ login: 'alice' }] },
        projectItems: { nodes, pageInfo: { hasNextPage, endCursor } },
      },
    },
  };
}

function basicIssueResponse() {
  return {
    repository: {
      id: 'REPO',
      issue: {
        id: 'ISSUE_42',
        number: 42,
        title: 'Issue',
        url: 'https://example.test/o/r/issues/42',
      },
    },
  };
}

function makeResolverHarness({ issuePages, forwardPages, issuePageErrorAt = -1 } = {}) {
  const mutations = [];
  const cursors = { issue: [], forward: [] };
  let issuePage = 0;
  let forwardPage = 0;
  let added = false;
  const runGql = async (query, variables) => {
    if (query.includes('linkProjectV2ToRepository')) {
      mutations.push('link');
      return { linkProjectV2ToRepository: { repository: { nameWithOwner: cfg.repo } } };
    }
    if (query.includes('addProjectV2ItemById')) {
      mutations.push('add');
      added = true;
      return { addProjectV2ItemById: { item: { id: 'ADDED' } } };
    }
    if (query.includes('updateProjectV2ItemFieldValue')) {
      mutations.push('field');
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } };
    }
    if (query.includes('repository(owner:') && query.includes('issue(number:')) {
      if (!query.includes('projectItems(') || !query.includes('assignees(first: 100)')) {
        return basicIssueResponse();
      }
      const cursor = variables.cursor ?? null;
      cursors.issue.push(cursor);
      if (issuePage === issuePageErrorAt) throw new Error('issue membership transport failed');
      if (added) return issueResponse({ nodes: [issueItem(cfg.projectId, 'TARGET')] });
      const page = issuePages[Math.min(issuePage++, issuePages.length - 1)];
      return issueResponse(page);
    }
    if (query.includes('node(id:') && query.includes('... on ProjectV2')) {
      const cursor = variables.after ?? null;
      cursors.forward.push(cursor);
      const page = forwardPages[Math.min(forwardPage++, forwardPages.length - 1)];
      if (page instanceof Error) throw page;
      return {
        node: {
          title: 'Board',
          url: 'https://example.test/board',
          items: {
            totalCount: page.nodes.length,
            nodes: page.nodes,
            pageInfo: {
              hasNextPage: page.hasNextPage ?? false,
              endCursor: page.endCursor ?? null,
            },
          },
        },
      };
    }
    throw new Error(`unexpected query: ${query}`);
  };
  return { runGql, mutations, cursors };
}

test('configured issue-side membership beyond fifty is found without add or fallback', async () => {
  const nodes = Array.from({ length: 60 }, (_, index) =>
    issueItem(`FOREIGN_${index}`, `FOREIGN_ITEM_${index}`)
  );
  nodes.push(issueItem(cfg.projectId, 'TARGET'));
  const harness = makeResolverHarness({
    issuePages: [{ nodes }],
    forwardPages: [{ nodes: [] }],
  });

  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 42,
    runGql: harness.runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'TARGET');
  assert.deepEqual(harness.cursors.issue, [null]);
  assert.deepEqual(harness.cursors.forward, []);
  assert.deepEqual(harness.mutations, []);
});

test('project-side fallback rejects another repository with the same issue number', async () => {
  const harness = makeResolverHarness({
    issuePages: [{ nodes: [] }],
    forwardPages: [{ nodes: [forwardItem({ repo: 'other/repo', id: 'WRONG' })] }],
  });

  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 42,
    maxAttempts: 2,
    retryDelayMs: 0,
    runGql: harness.runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'TARGET');
  assert.ok(harness.mutations.includes('add'));
  assert.ok(!harness.mutations.includes('field'));
});

test('project-side fallback accepts the exact repository and issue number', async () => {
  const harness = makeResolverHarness({
    issuePages: [{ nodes: [] }],
    forwardPages: [{ nodes: [forwardItem({ repo: 'o/r', id: 'EXACT' })] }],
  });

  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 42,
    runGql: harness.runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'EXACT');
  assert.deepEqual(harness.mutations, []);
});

for (const scenario of [
  {
    label: 'missing cursor',
    issuePages: [{ nodes: [] }],
    forwardPages: [{ nodes: [], hasNextPage: true, endCursor: null }],
    pattern: /cursor|endCursor/i,
  },
  {
    label: 'repeated cursor',
    issuePages: [{ nodes: [] }],
    forwardPages: [
      { nodes: [], hasNextPage: true, endCursor: 'SAME' },
      { nodes: [], hasNextPage: true, endCursor: 'SAME' },
      { nodes: [] },
    ],
    pattern: /cursor.*progress|cursor.*advance|repeated/i,
  },
  {
    label: 'project scan safety limit',
    issuePages: [{ nodes: [] }],
    forwardPages: [
      { nodes: [], hasNextPage: true, endCursor: 'ONE' },
      { nodes: [], hasNextPage: true, endCursor: 'TWO' },
      { nodes: [] },
    ],
    projectScanMaxPages: 2,
    pattern: /safety limit|partial/i,
  },
  {
    label: 'project scan transport failure',
    issuePages: [{ nodes: [] }],
    forwardPages: [new Error('project membership transport unavailable')],
    pattern: /project membership transport unavailable/,
  },
]) {
  test(`${scenario.label} refuses without any mutation after an incomplete scan`, async () => {
    const harness = makeResolverHarness(scenario);
    await assert.rejects(
      () =>
        tetherIssueToProject({
          cfg,
          issueNumber: 42,
          maxAttempts: 1,
          projectScanMaxPages: scenario.projectScanMaxPages,
          runGql: harness.runGql,
          sleep: async () => {},
        }),
      scenario.pattern
    );
    assert.deepEqual(harness.mutations, []);
  });
}

test('issue-side pagination transport failure refuses without fallback or mutation', async () => {
  const harness = makeResolverHarness({
    issuePages: [{ nodes: [], hasNextPage: true, endCursor: 'NEXT' }, { nodes: [] }],
    forwardPages: [{ nodes: [] }],
    issuePageErrorAt: 1,
  });

  await assert.rejects(
    () =>
      tetherIssueToProject({
        cfg,
        issueNumber: 42,
        runGql: harness.runGql,
        sleep: async () => {},
      }),
    /issue membership transport failed/
  );
  assert.deepEqual(harness.cursors.forward, []);
  assert.deepEqual(harness.mutations, []);
});
