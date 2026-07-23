#!/usr/bin/env node
// @story #877
// Integration: the epic child-state invariant across the develop → test →
// review → done arc, driven through the REAL guard registry (not the gate
// functions in isolation).
//
// This is the end-to-end shape of the deadlock #877 fixes, observed live on
// epic #860: children #872-875 all sat at `review` with the aggregate suite
// green, yet develop → test refused with `epic-children-not-done`. Under the
// PR-based flow a child cannot reach `done` until the epic branch lands on
// trunk, and the branch cannot land until the epic itself passes Test and
// Review — so the old gate left the epic with no legal forward move.
//
// The contract pinned here:
//   children all at `review`  →  develop→test OK, test→review OK, review→done REFUSED
//   children all at `done`    →  review→done OK
//
// The refusal half matters as much as the pass half: it proves the child-done
// invariant was MOVED by #877, not dropped.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runGuards } from '../../../lib/guard-registry.mjs';
import '../../../lib/guard-bootstrap.mjs';

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
          CHILDREN.map((number, i) => ({ number, state: childState, rank: i + 1 })),
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

describe('epic children at review: forward arcs open, close arc still gated (#877)', () => {
  it('develop → test passes when every child is at review', async () => {
    const result = await runGuards(
      'develop',
      'test',
      makeCtx({ fromState: 'develop', toState: 'test', childState: 'review' })
    );
    assert.ok(
      !ids(result).has('develop-exit-epic-children-done'),
      `epic-children guard refused: ${JSON.stringify(result.refusals)}`
    );
  });

  it('test → review passes when every child is at review', async () => {
    const result = await runGuards(
      'test',
      'review',
      makeCtx({ fromState: 'test', toState: 'review', childState: 'review' })
    );
    assert.ok(
      !ids(result).has('develop-exit-epic-children-done'),
      `epic-children guard refused: ${JSON.stringify(result.refusals)}`
    );
    assert.ok(
      !ids(result).has('review-exit-epic-children-done'),
      'review-exit guard must not fire on the test → review arc'
    );
  });

  it('review → done REFUSES while children are still at review', async () => {
    const result = await runGuards(
      'review',
      'done',
      makeCtx({ fromState: 'review', toState: 'done', childState: 'review' })
    );
    assert.equal(result.ok, false);
    assert.ok(
      ids(result).has('review-exit-epic-children-done'),
      `expected review-exit-epic-children-done; got ${JSON.stringify(result.refusals)}`
    );
    const refusal = result.refusals.find((r) => r.id === 'review-exit-epic-children-done');
    for (const n of CHILDREN) {
      assert.match(refusal.reason, new RegExp(`#${n}`));
    }
  });

  it('review → done passes once every child reaches done', async () => {
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

  it('develop → test still REFUSES when a child is behind review', async () => {
    const result = await runGuards(
      'develop',
      'test',
      makeCtx({ fromState: 'develop', toState: 'test', childState: 'develop' })
    );
    assert.equal(result.ok, false);
    assert.ok(
      ids(result).has('develop-exit-epic-children-done'),
      `expected develop-exit-epic-children-done; got ${JSON.stringify(result.refusals)}`
    );
    const refusal = result.refusals.find((r) => r.id === 'develop-exit-epic-children-done');
    assert.match(refusal.reason, /epic-children-not-in-review/);
  });
});
