// @story #222
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tetherIssueToProject } from '../../../gh/lib/project-tether.mjs';

function makeRunGql({ itemId = 'PVTI_test' } = {}) {
  const calls = [];
  async function runGql(query, vars) {
    calls.push({ query, vars });
    if (/repository\(owner/.test(query)) {
      return {
        repository: {
          id: 'REPO_test',
          issue: {
            id: 'ISSUE_test',
            number: vars.issue,
            title: 't',
            url: 'u',
            projectItems: { nodes: [] },
          },
        },
      };
    }
    if (/linkProjectV2ToRepository/.test(query)) return {};
    if (/node\(id: \$project\)/.test(query)) {
      return {
        node: {
          title: 'p',
          url: 'pu',
          items: {
            totalCount: 1,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: itemId,
                isArchived: false,
                content: { number: vars.project ? 222 : 222, title: 't', url: 'u' },
              },
            ],
          },
        },
      };
    }
    if (/updateProjectV2ItemFieldValue/.test(query)) {
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: itemId } } };
    }
    throw new Error(`unexpected query: ${query.slice(0, 80)}`);
  }
  return { runGql, calls };
}

test('#222: rank write fires exactly one number-write mutation when fieldRank is configured', async () => {
  const cfg = {
    repo: 'kburson/ai-task-manager',
    projectId: 'PVT_test',
    fieldRank: 'PVTF_sequence',
  };
  const { runGql, calls } = makeRunGql();
  await tetherIssueToProject({ cfg, issueNumber: 222, rank: 222, runGql });
  const writes = calls.filter(
    (c) => /updateProjectV2ItemFieldValue/.test(c.query) && c.vars.field === 'PVTF_sequence'
  );
  assert.equal(writes.length, 1, 'exactly one rank write mutation');
  assert.equal(writes[0].vars.val, 222, 'mutation carries val=222');
});

test('#222: missing Rank fieldId emits stderr warning and skips write', async () => {
  const cfg = { repo: 'kburson/ai-task-manager', projectId: 'PVT_test' };
  const { runGql, calls } = makeRunGql();

  const captured = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    captured.push(String(chunk));
    return true;
  };
  try {
    await tetherIssueToProject({ cfg, issueNumber: 222, rank: 222, runGql });
  } finally {
    process.stderr.write = origWrite;
  }

  const writes = calls.filter((c) => /updateProjectV2ItemFieldValue/.test(c.query));
  assert.equal(writes.length, 0, 'no field-write mutation when fieldId is missing');
  const warned = captured.join('');
  assert.match(warned, /rank=222 supplied but no Rank field id configured/);
});
