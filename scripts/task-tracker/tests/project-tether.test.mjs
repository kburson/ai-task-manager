import assert from 'node:assert/strict';
import { tetherIssueToProject } from '../../gh/lib/project-tether.mjs';

const cfg = {
  repo: 'kburson/ai-task-manager',
  projectId: 'PROJECT_1',
  kanbanFieldId: 'STATUS_FIELD',
  kanbanOptionBacklog: 'STATUS_BACKLOG',
  kanbanOptionReady: 'STATUS_READY',
  kanbanOptionInProgress: 'STATUS_PROGRESS',
  kanbanOptionInReview: 'STATUS_REVIEW',
  kanbanOptionDone: 'STATUS_DONE',
  priorityFieldId: 'PRIORITY_FIELD',
  priorityOptionP0: 'PRIORITY_P0',
  priorityOptionP1: 'PRIORITY_P1',
  priorityOptionP2: 'PRIORITY_P2',
  sizeFieldId: 'SIZE_FIELD',
  sizeOptionMap: { S: 'SIZE_S', M: 'SIZE_M' },
  fieldEstimate: 'ESTIMATE_FIELD',
  fieldSequence: 'SEQUENCE_FIELD',
};

function makeRunner({
  projectItemOnAttempt = 1,
  issueSideItems = [],
  parentIssueId = 'PARENT_1',
  throwProjectItems = false,
} = {}) {
  const calls = [];
  let projectChecks = 0;
  let added = 0;
  let currentIssueNumber = null;
  const runGql = async (query, variables) => {
    calls.push({ query, variables });
    if (query.includes('linkProjectV2ToRepository')) {
      return { linkProjectV2ToRepository: { repository: { nameWithOwner: cfg.repo } } };
    }
    if (query.includes('repository(owner:') && query.includes('issue(number:')) {
      const issueNumber = Number(variables.issue);
      currentIssueNumber = issueNumber;
      return {
        repository: {
          id: 'REPO_1',
          issue: {
            id: issueNumber === 99 ? parentIssueId : `ISSUE_${issueNumber}`,
            number: issueNumber,
            url: `https://github.com/${cfg.repo}/issues/${issueNumber}`,
            projectItems: { nodes: issueSideItems },
          },
        },
      };
    }
    if (query.includes('addProjectV2ItemById')) {
      added += 1;
      return { addProjectV2ItemById: { item: { id: `ADDED_${added}` } } };
    }
    if (query.includes('deleteProjectV2Item')) {
      return { deleteProjectV2Item: { deletedItemId: variables.item } };
    }
    if (query.includes('updateProjectV2ItemFieldValue')) {
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } };
    }
    if (query.includes('addSubIssue')) {
      return { addSubIssue: { issue: { id: variables.parent }, subIssue: { id: variables.child } } };
    }
    if (query.includes('node(id:') && query.includes('... on ProjectV2')) {
      projectChecks += 1;
      if (throwProjectItems) {
        return { node: { title: 'AITM Board', url: 'https://github.com/users/kburson/projects/1', items: { totalCount: 0, nodes: [] } } };
      }
      const visible = projectChecks >= projectItemOnAttempt;
      return {
        node: {
          title: 'AITM Board',
          url: 'https://github.com/users/kburson/projects/1',
          items: {
            totalCount: visible ? 1 : 0,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: visible
              ? [{ id: 'VISIBLE_ITEM', content: { number: currentIssueNumber, title: 'Task' } }]
              : [],
          },
        },
      };
    }
    throw new Error(`unexpected query: ${query}`);
  };
  return { runGql, calls };
}

async function testExistingProjectSideItemIsReused() {
  const { runGql, calls } = makeRunner({ projectItemOnAttempt: 1 });
  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 12,
    status: 'backlog',
    priority: 'P0',
    size: 'M',
    estimate: 3,
    sequence: 2,
    runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'VISIBLE_ITEM');
  assert.equal(calls.some(c => c.query.includes('addProjectV2ItemById')), false);
  assert.equal(calls.filter(c => c.query.includes('updateProjectV2ItemFieldValue')).length, 5);
}

async function testMissingItemIsAddedAndVerifiedFromProjectSide() {
  const { runGql, calls } = makeRunner({ projectItemOnAttempt: 2 });
  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 13,
    status: 'ready',
    priority: 'P1',
    size: 'S',
    estimate: 1,
    sequence: 1,
    runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'VISIBLE_ITEM');
  assert.equal(calls.filter(c => c.query.includes('addProjectV2ItemById')).length, 1);
}

async function testPhantomItemIsDeletedAndRetried() {
  const { runGql, calls } = makeRunner({
    projectItemOnAttempt: 2,
    issueSideItems: [{ id: 'PHANTOM_1', project: { id: cfg.projectId } }],
  });
  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 14,
    runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'VISIBLE_ITEM');
  assert.deepEqual(
    calls.filter(c => c.query.includes('deleteProjectV2Item')).map(c => c.variables.item),
    ['PHANTOM_1'],
  );
}

async function testRetryExhaustionMentionsProjectSideVerification() {
  const { runGql } = makeRunner({ projectItemOnAttempt: 99 });
  await assert.rejects(
    tetherIssueToProject({
      cfg,
      issueNumber: 15,
      maxAttempts: 2,
      retryDelayMs: 0,
      runGql,
      sleep: async () => {},
    }),
    /ProjectV2\.items/,
  );
}

async function testParentLinksAfterProjectVerification() {
  const { runGql, calls } = makeRunner({ projectItemOnAttempt: 1 });
  await tetherIssueToProject({
    cfg,
    issueNumber: 16,
    parentIssueNumber: 99,
    runGql,
    sleep: async () => {},
  });

  const subIssueCall = calls.find(c => c.query.includes('addSubIssue'));
  assert.equal(subIssueCall.variables.parent, 'PARENT_1');
  assert.equal(subIssueCall.variables.child, 'ISSUE_16');
  const subIssueIndex = calls.findIndex(c => c.query.includes('addSubIssue'));
  const projectVerifyIndex = calls.findIndex(c => c.query.includes('... on ProjectV2'));
  assert.ok(subIssueIndex > projectVerifyIndex);
}

async function testLooseLeafDoesNotLinkParent() {
  const { runGql, calls } = makeRunner({ projectItemOnAttempt: 1 });
  await tetherIssueToProject({
    cfg,
    issueNumber: 17,
    runGql,
    sleep: async () => {},
  });

  assert.equal(calls.some(c => c.query.includes('addSubIssue')), false);
}

await testExistingProjectSideItemIsReused();
await testMissingItemIsAddedAndVerifiedFromProjectSide();
await testPhantomItemIsDeletedAndRetried();
await testRetryExhaustionMentionsProjectSideVerification();
await testParentLinksAfterProjectVerification();
await testLooseLeafDoesNotLinkParent();

console.log('project-tether.test.mjs: all passed');
