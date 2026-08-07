// @story #309
import assert from 'node:assert/strict';
import {
  tetherIssueToProject,
  backlogSizingWarning,
  backlogMoveWarning,
} from '../../../../../gh/lib/project-tether.mjs';

const cfg = {
  repo: 'kburson/ai-task-manager',
  projectId: 'PROJECT_1',
  kanbanFieldId: 'STATUS_FIELD',
  kanbanOptionBacklog: 'STATUS_BACKLOG',
  kanbanOptionRefine: 'STATUS_GROOM',
  kanbanOptionPlan: 'STATUS_ANALYZE',
  kanbanOptionDevelop: 'STATUS_DEVELOPMENT',
  kanbanOptionTest: 'STATUS_VALIDATE',
  kanbanOptionReview: 'STATUS_REVIEW',
  kanbanOptionDone: 'STATUS_DONE',
  priorityFieldId: 'PRIORITY_FIELD',
  priorityOptionP0: 'PRIORITY_P0',
  priorityOptionP1: 'PRIORITY_P1',
  priorityOptionP2: 'PRIORITY_P2',
  sizeFieldId: 'SIZE_FIELD',
  sizeOptionMap: { S: 'SIZE_S', M: 'SIZE_M' },
  fieldEstimate: 'ESTIMATE_FIELD',
  fieldRank: 'SEQUENCE_FIELD',
};

function makeRunner({
  projectItemOnAttempt = 1,
  issueSideItems = [],
  parentIssueId = 'PARENT_1',
  parentTitle = 'Some parent issue',
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
      return {
        addSubIssue: { issue: { id: variables.parent }, subIssue: { id: variables.child } },
      };
    }
    if (query.includes('node(id:') && query.includes('... on ProjectV2')) {
      projectChecks += 1;
      if (throwProjectItems) {
        return {
          node: {
            title: 'AITM Board',
            url: 'https://github.com/users/kburson/projects/1',
            items: { totalCount: 0, nodes: [] },
          },
        };
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
    // #545 — epic re-title on first child link: read parent title, then
    // updateIssue with the prefixed title.
    if (query.includes('... on Issue') && query.includes('title'))
      return { node: { title: parentTitle } };
    if (query.includes('updateIssue')) return { updateIssue: { issue: { id: variables.id } } };
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
    rank: 2,
    runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'VISIBLE_ITEM');
  assert.equal(
    calls.some((c) => c.query.includes('addProjectV2ItemById')),
    false
  );
  assert.equal(calls.filter((c) => c.query.includes('updateProjectV2ItemFieldValue')).length, 5);
  const sizeCall = calls.find(
    (c) => c.query.includes('updateProjectV2ItemFieldValue') && c.variables.field === 'SIZE_FIELD'
  );
  assert.equal(sizeCall.variables.option, 'SIZE_M');
}

async function testMissingItemIsAddedAndVerifiedFromProjectSide() {
  const { runGql, calls } = makeRunner({ projectItemOnAttempt: 2 });
  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 13,
    status: 'refine',
    priority: 'P1',
    size: 'S',
    estimate: 1,
    rank: 1,
    runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'VISIBLE_ITEM');
  assert.equal(calls.filter((c) => c.query.includes('addProjectV2ItemById')).length, 1);
}

async function testEstimateWritesCeilWithoutChangingOtherNumberFields() {
  const { runGql, calls } = makeRunner({ projectItemOnAttempt: 1 });
  await tetherIssueToProject({
    cfg,
    issueNumber: 21,
    estimate: 3.633,
    rank: 2.25,
    runGql,
    sleep: async () => {},
  });

  const estimateCall = calls.find(
    (call) =>
      call.query.includes('updateProjectV2ItemFieldValue') &&
      call.variables.field === 'ESTIMATE_FIELD'
  );
  const rankCall = calls.find(
    (call) =>
      call.query.includes('updateProjectV2ItemFieldValue') &&
      call.variables.field === 'SEQUENCE_FIELD'
  );
  assert.equal(estimateCall.variables.val, 4);
  assert.equal(rankCall.variables.val, 2.25);
}

// #349 — the reverse lookup `repository.issue(N).projectItems` is authoritative.
// An item it returns is NEVER a phantom: it is reused in place (fields written
// to its id), never deleted, and the forward `ProjectV2.items` scan is not even
// consulted. This is the inverted-trust fix for the destructive delete/re-add
// path that the old `testPhantomItemIsDeletedAndRetried` asserted.
async function testProjectSideItemIsAuthoritativeAndReused() {
  const { runGql, calls } = makeRunner({
    // forward scan would NEVER show the item — proves we don't depend on it.
    projectItemOnAttempt: 99,
    issueSideItems: [{ id: 'SIDE_1', project: { id: cfg.projectId, title: 'AITM Board' } }],
  });
  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 14,
    size: 'M',
    estimate: 2,
    runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'SIDE_1');
  // No destructive delete, ever.
  assert.equal(
    calls.some((c) => c.query.includes('deleteProjectV2Item')),
    false
  );
  // No re-add: the existing item was reused.
  assert.equal(
    calls.some((c) => c.query.includes('addProjectV2ItemById')),
    false
  );
  // Forward pagination not consulted — reverse lookup short-circuited it.
  assert.equal(
    calls.some((c) => c.query.includes('... on ProjectV2')),
    false
  );
}

// #349 — eventual-consistency window: the issue is added on attempt 1, the
// reverse lookup is empty until the link settles, and forward pagination NEVER
// surfaces the item. The tether must still succeed via the re-fetched
// reverse lookup on a later attempt.
async function testEventualConsistencyResolvesViaReverseLookup() {
  const calls = [];
  let issueFetches = 0;
  let added = 0;
  const runGql = async (query, variables) => {
    calls.push({ query, variables });
    if (query.includes('linkProjectV2ToRepository')) {
      return { linkProjectV2ToRepository: { repository: { nameWithOwner: cfg.repo } } };
    }
    if (query.includes('repository(owner:') && query.includes('issue(number:')) {
      issueFetches += 1;
      // Reverse lookup is empty until AFTER the add has happened (settle lag).
      const nodes =
        added > 0
          ? [{ id: 'SETTLED_ITEM', project: { id: cfg.projectId, title: 'AITM Board' } }]
          : [];
      return {
        repository: {
          id: 'REPO_1',
          issue: {
            id: `ISSUE_${variables.issue}`,
            number: Number(variables.issue),
            url: `https://github.com/${cfg.repo}/issues/${variables.issue}`,
            projectItems: { nodes },
          },
        },
      };
    }
    if (query.includes('addProjectV2ItemById')) {
      added += 1;
      return { addProjectV2ItemById: { item: { id: 'ADDED_1' } } };
    }
    if (query.includes('updateProjectV2ItemFieldValue')) {
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } };
    }
    if (query.includes('node(id:') && query.includes('... on ProjectV2')) {
      // Forward pagination NEVER surfaces the item.
      return {
        node: {
          title: 'AITM Board',
          url: 'https://github.com/users/kburson/projects/1',
          items: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
        },
      };
    }
    throw new Error(`unexpected query: ${query}`);
  };

  const result = await tetherIssueToProject({
    cfg,
    issueNumber: 20,
    maxAttempts: 3,
    retryDelayMs: 0,
    runGql,
    sleep: async () => {},
  });

  assert.equal(result.itemId, 'SETTLED_ITEM');
  assert.equal(added, 1, 'issue added exactly once');
  assert.ok(issueFetches >= 2, 'issue node re-fetched across attempts');
  assert.equal(
    calls.some((c) => c.query.includes('deleteProjectV2Item')),
    false
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
    /ProjectV2\.items/
  );
}

async function testParentLinksAfterProjectVerification() {
  const { runGql, calls } = makeRunner({ projectItemOnAttempt: 1 });
  const reconciliations = [];
  await tetherIssueToProject({
    cfg,
    issueNumber: 16,
    parentIssueNumber: 99,
    runGql,
    reconcileEpicMetadata: async (input) => {
      reconciliations.push(input);
      return { status: 'reconciled' };
    },
    sleep: async () => {},
  });

  const subIssueCall = calls.find((c) => c.query.includes('addSubIssue'));
  assert.equal(subIssueCall.variables.parent, 'PARENT_1');
  assert.equal(subIssueCall.variables.child, 'ISSUE_16');
  const subIssueIndex = calls.findIndex((c) => c.query.includes('addSubIssue'));
  const projectVerifyIndex = calls.findIndex((c) => c.query.includes('... on ProjectV2'));
  assert.ok(subIssueIndex > projectVerifyIndex);
  assert.deepEqual(
    reconciliations.map(({ issueNumber, repo, forceEpic }) => ({ issueNumber, repo, forceEpic })),
    [{ issueNumber: 99, repo: cfg.repo, forceEpic: true }]
  );
}

async function testLooseLeafDoesNotLinkParent() {
  const { runGql, calls } = makeRunner({ projectItemOnAttempt: 1 });
  await tetherIssueToProject({
    cfg,
    issueNumber: 17,
    runGql,
    sleep: async () => {},
  });

  assert.equal(
    calls.some((c) => c.query.includes('addSubIssue')),
    false
  );
}

async function testSizeFieldMissingFailsLoudly() {
  const { runGql } = makeRunner({ projectItemOnAttempt: 1 });
  await assert.rejects(
    tetherIssueToProject({
      cfg: { ...cfg, sizeFieldId: '' },
      issueNumber: 18,
      size: 'M',
      runGql,
      sleep: async () => {},
    }),
    /sizeFieldId/i
  );
}

async function testSizeOptionMissingFailsLoudly() {
  const { runGql } = makeRunner({ projectItemOnAttempt: 1 });
  await assert.rejects(
    tetherIssueToProject({
      cfg,
      issueNumber: 19,
      size: 'XL',
      runGql,
      sleep: async () => {},
    }),
    /Size option.*XL/i
  );
}

function testBacklogSizingWarning() {
  // Fires: backlog + size + estimate
  assert.match(
    backlogSizingWarning({ status: 'backlog', size: 'S', estimate: 3 }) || '',
    /sized.+Backlog/i
  );
  // No warning: backlog + size only (no estimate)
  assert.equal(backlogSizingWarning({ status: 'backlog', size: 'S' }), null);
  // No warning: backlog + estimate only (no size)
  assert.equal(backlogSizingWarning({ status: 'backlog', estimate: 3 }), null);
  // No warning: groom + size + estimate
  assert.equal(backlogSizingWarning({ status: 'refine', size: 'S', estimate: 3 }), null);
  // Treat estimate=true (boolean flag without value) as missing
  assert.equal(backlogSizingWarning({ status: 'backlog', size: 'S', estimate: true }), null);
  // estimate=0 is a real number — counts as "estimated"
  assert.match(
    backlogSizingWarning({ status: 'backlog', size: 'XS', estimate: 0 }) || '',
    /Backlog/
  );
}

function testBacklogMoveWarning() {
  // Fires: target=backlog with sized + estimated body fields
  assert.match(
    backlogMoveWarning({ targetState: 'backlog', fieldValues: { size: 'M', estimate: 5 } }) || '',
    /sized.+Backlog/i
  );
  // No warning: target is something other than backlog
  assert.equal(
    backlogMoveWarning({ targetState: 'refine', fieldValues: { size: 'M', estimate: 5 } }),
    null
  );
  // No warning: size missing
  assert.equal(
    backlogMoveWarning({ targetState: 'backlog', fieldValues: { size: null, estimate: 5 } }),
    null
  );
  // No warning: estimate missing or non-numeric
  assert.equal(
    backlogMoveWarning({ targetState: 'backlog', fieldValues: { size: 'M', estimate: null } }),
    null
  );
  // No warning: no fields parsed at all
  assert.equal(backlogMoveWarning({ targetState: 'backlog', fieldValues: null }), null);
}

await testExistingProjectSideItemIsReused();
await testMissingItemIsAddedAndVerifiedFromProjectSide();
await testEstimateWritesCeilWithoutChangingOtherNumberFields();
await testProjectSideItemIsAuthoritativeAndReused();
await testEventualConsistencyResolvesViaReverseLookup();
await testRetryExhaustionMentionsProjectSideVerification();
await testParentLinksAfterProjectVerification();
await testLooseLeafDoesNotLinkParent();
await testSizeFieldMissingFailsLoudly();
await testSizeOptionMissingFailsLoudly();
testBacklogSizingWarning();
testBacklogMoveWarning();

console.log('project-tether.test.mjs: all passed');
