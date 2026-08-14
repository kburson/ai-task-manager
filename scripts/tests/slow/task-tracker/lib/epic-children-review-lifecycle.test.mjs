#!/usr/bin/env node
// @story #1216
// Production-shaped registry coverage for R4P epic admission and terminal
// child delivery across the parent lifecycle.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
import '../../../../task-tracker/lib/guard-bootstrap.mjs';

const REPO = 'owner/name';
const HEAD_SHA = 'abcdef1234567';
const EPIC = 860;
const CHILDREN = [872, 873, 874, 875];

// See guard-registry-review-exit for the rationale on
// `lifecycleCheckboxesRequired: false` — the body-gates-entry-done lifecycle
// gate has its own dedicated suite and is not what this test is measuring.
const CFG = { repo: REPO, projectId: 'PVT', lifecycleCheckboxesRequired: false };

function epicBody() {
  return [
    '## Scope',
    '',
    '<!-- aitm-entered-backlog: 2026-07-01T05:00:00Z -->',
    '<!-- aitm-entered-refine: 2026-07-01T05:30:00Z -->',
    '<!-- aitm-entered-plan: 2026-07-01T05:45:00Z -->',
    '<!-- aitm-entered-develop: 2026-07-01T06:00:00Z -->',
    '<!-- aitm-entered-test: 2026-07-01T06:30:00Z -->',
    '<!-- aitm-entered-review: 2026-07-01T07:00:00Z -->',
    '<!-- aitm-plan-approved: 2026-07-01T06:00:00Z -->',
    '<!-- aitm-code-complete: 2026-07-01T06:25:00Z -->',
    `<!-- aitm-sandbox-proof: ${HEAD_SHA}:2026-07-01T06:28:00Z -->`,
    `<!-- aitm-dod-verified: ${HEAD_SHA}:2026-07-01T07:30:00Z -->`,
    '<!-- aitm-review-approved: 2026-07-01T08:00:00Z -->',
    '',
  ].join('\n');
}

// Every child sits at `childState`; the epic itself is the issue under test.
function makeCtx({ fromState, toState, childState }) {
  return {
    issueNumber: EPIC,
    repo: REPO,
    fromState,
    toState,
    body: epicBody(),
    cfg: CFG,
    deps: {
      // The seam both epic-children gates read through.
      epicChildren: {
        fetchSiblings: async () =>
          CHILDREN.map((number, i) =>
            childState === 'done'
              ? {
                  number,
                  state: 'done',
                  boardState: 'done',
                  issueState: 'closed',
                  closeReason: 'completed',
                  rank: i + 1,
                }
              : {
                  number,
                  state: childState,
                  rank: i + 1,
                  blockedBy: [],
                  hasCurrentRefinement: childState !== 'backlog',
                }
          ),
      },
      // The epic has no parent, so child-cannot-lead-epic passes trivially.
      fetchParentIssue: async () => null,
      closeGates: {
        getHeadSha: async () => HEAD_SHA,
        commitsSince: async () => [],
        listComments: async () => [
          {
            id: 'cmt_commits',
            body: ['### 🔗 Commits', '', `<!-- aitm-commits: ${HEAD_SHA} -->`, ''].join('\n'),
          },
        ],
        filesForSha: async () => ['scripts/example.mjs'],
        dirtyFiles: async () => new Set(),
        resolveTrunkRef: async () => 'refs/heads/main',
        attributingCommits: async () => [{ sha: HEAD_SHA, subject: `[#${EPIC}] feat`, ts: 't' }],
      },
      commitTrail: {
        getHeadSha: async () => HEAD_SHA,
        attributingCommits: async () => [{ sha: HEAD_SHA, subject: `[#${EPIC}] feat`, ts: 't' }],
      },
    },
    fetchBlockerState: async () => null,
  };
}

function ids(result) {
  return new Set((result.refusals || []).map((r) => r.id));
}

describe('epic R4P admission and terminal delivery (#1216)', () => {
  it('R4P → Plan passes when every child is currently refined and parked at R4P', async () => {
    const result = await runGuards(
      'ready-for-plan',
      'plan',
      makeCtx({ fromState: 'ready-for-plan', toState: 'plan', childState: 'ready-for-plan' })
    );
    assert.ok(
      !ids(result).has('ready-for-plan-exit-epic-children-r4p-or-beyond'),
      `epic-children guard refused: ${JSON.stringify(result.refusals)}`
    );
  });

  it('R4P → Plan refuses when any child remains in Backlog', async () => {
    const result = await runGuards(
      'ready-for-plan',
      'plan',
      makeCtx({ fromState: 'ready-for-plan', toState: 'plan', childState: 'backlog' })
    );
    assert.equal(result.ok, false);
    assert.ok(
      ids(result).has('ready-for-plan-exit-epic-children-r4p-or-beyond'),
      `expected R4P admission refusal; got ${JSON.stringify(result.refusals)}`
    );
  });

  it('develop → test refuses while children are still at Review', async () => {
    const result = await runGuards(
      'develop',
      'test',
      makeCtx({ fromState: 'develop', toState: 'test', childState: 'review' })
    );
    assert.equal(result.ok, false);
    assert.ok(
      ids(result).has('develop-exit-epic-children-done'),
      `expected develop-exit-epic-children-done; got ${JSON.stringify(result.refusals)}`
    );
    const refusal = result.refusals.find((r) => r.id === 'develop-exit-epic-children-done');
    for (const n of CHILDREN) {
      assert.match(refusal.reason, new RegExp(`#${n}`));
    }
  });

  it('develop → test passes once every child is terminally delivered', async () => {
    const result = await runGuards(
      'develop',
      'test',
      makeCtx({ fromState: 'develop', toState: 'test', childState: 'done' })
    );
    assert.ok(
      !ids(result).has('develop-exit-epic-children-done'),
      `epic-children guard refused: ${JSON.stringify(result.refusals)}`
    );
  });

  it('review → done passes once every child is terminally delivered', async () => {
    const result = await runGuards(
      'review',
      'done',
      makeCtx({ fromState: 'review', toState: 'done', childState: 'done' })
    );
    assert.ok(
      !ids(result).has('review-exit-epic-children-done'),
      `epic-children guard refused: ${JSON.stringify(result.refusals)}`
    );
    assert.equal(result.ok, true, `registry refused: ${JSON.stringify(result.refusals)}`);
  });
});
