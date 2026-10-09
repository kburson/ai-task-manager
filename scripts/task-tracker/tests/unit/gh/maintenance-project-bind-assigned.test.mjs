// @story #1207
import assert from 'node:assert/strict';
import test from 'node:test';

import { runBindIssuesToNewProject } from '../../../../maintenance/bind-issues-to-new-project.mjs';
import { writeProjectFieldValue } from '../../../../gh/lib/github-projects.mjs';

const cfg = {
  repo: 'o/r',
  projectId: 'PROJECT',
  kanbanFieldId: 'STATUS',
  fieldIds: {},
};
const assignedBody =
  '<!-- aitm-last-known-state state="assigned" ts="2026-08-11T00:00:00.000Z" -->';

function snapshot({ assignees = ['alice'] } = {}) {
  return {
    repository: {
      issue: {
        id: 'ISSUE_42',
        assignees: { nodes: assignees.map((login) => ({ login })) },
        projectItems: {
          nodes: [
            {
              id: 'ITEM',
              project: { id: cfg.projectId },
              fieldValueByName: { name: 'Backlog', optionId: 'BACKLOG' },
              fieldValues: { nodes: [] },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  };
}

function baseDeps({ assignees = ['alice'], transportFailure = false } = {}) {
  const mutations = [];
  let locks = 0;
  return {
    mutations,
    lockCount: () => locks,
    deps: {
      listAllIssues: async () => [{ number: 42, state: 'open' }],
      fieldOptionMap: async () => ({ STATUS: { Assigned: 'OPT_ASSIGNED' } }),
      loadProjectFieldDefs: () => [],
      projectItemForIssue: async () => ({ issueId: 'ISSUE_42', itemId: 'ITEM' }),
      fetchIssueBody: async () => assignedBody,
      writeProjectFieldValue,
      gqlFn: async (query, variables) => {
        if (query.includes('assignees(first: 100)')) {
          if (transportFailure) throw new Error('maintenance assignee read unavailable');
          return snapshot({ assignees });
        }
        if (query.includes('updateProjectV2ItemFieldValue')) {
          mutations.push(variables);
          return { updateProjectV2ItemFieldValue: { projectV2Item: { id: variables.item } } };
        }
        throw new Error(`unexpected query: ${query}`);
      },
      withIssueLockFn: async (_options, fn) => {
        locks += 1;
        return fn();
      },
      projectDir: '/project',
      out: { write() {} },
      err: { write() {} },
    },
  };
}

test('maintenance Assigned replay refuses empty/read-failed assignees with zero Status write', async () => {
  for (const scenario of [{ assignees: [] }, { transportFailure: true }]) {
    const harness = baseDeps(scenario);
    const result = await runBindIssuesToNewProject({ cfg, dryRun: false }, harness.deps);

    assert.equal(result.errors, 1);
    assert.equal(result.statusSet, 0);
    assert.deepEqual(harness.mutations, []);
    assert.equal(harness.lockCount(), 1);
  }
});

test('maintenance Assigned replay writes once under the issue guard when an owner exists', async () => {
  const harness = baseDeps({ assignees: ['Alice'] });
  const result = await runBindIssuesToNewProject({ cfg, dryRun: false }, harness.deps);

  assert.equal(result.errors, 0);
  assert.equal(result.statusSet, 1);
  assert.equal(harness.lockCount(), 1);
  assert.equal(harness.mutations.length, 1);
  assert.equal(harness.mutations[0].option, 'OPT_ASSIGNED');
});
