#!/usr/bin/env node
// @story #913 (epic #912)
// Unit tests for lib/close-gates-lineage.mjs — Axis-1 lineage-aware done gate.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { resolveDoneTargetBranch, lineageDoneGate } from './close-gates-lineage.mjs';

// A sub-issue graph fixture: a two-level epic tree.
//   #912 (root epic, on trunk) → #913 (child)
//   #859 (root epic) → #860 (sub-epic) → #872 (grandchild)
const GRAPH = {
  912: { parent: null, children: [913, 914] },
  913: { parent: 912, children: [] },
  914: { parent: 912, children: [] },
  859: { parent: null, children: [860] },
  860: { parent: 859, children: [872] },
  872: { parent: 860, children: [] },
  777: { parent: null, children: [] }, // standalone story, trunk-only repo
};
const graph = (n) => GRAPH[n] ?? { parent: null, children: [] };

const TRAIL_COMMENT = {
  body: '### 🔗 Commits\n<!-- aitm-commits shas="9a1b2c3" -->\n| 9a1b2c3 | [#913] feat | me | 2026 |',
};
const listWithTrail = async () => [TRAIL_COMMENT];
const listNoTrail = async () => [];

// ── AC-1 / AC-4: leaf greps the parent branch, and trunk-only degenerates ──────

test('resolveDoneTargetBranch: child resolves to its epic parent branch', () => {
  const b = resolveDoneTargetBranch({ issueNumber: 913, deps: { graph } });
  assert.equal(b, 'feature/epic/912');
});

test('resolveDoneTargetBranch: standalone story degenerates to trunk (no regression)', () => {
  const b = resolveDoneTargetBranch({ issueNumber: 777, deps: { graph } });
  assert.equal(b, 'trunk');
});

test('resolveDoneTargetBranch: honors a custom trunk name', () => {
  const b = resolveDoneTargetBranch({ issueNumber: 777, deps: { graph, trunk: 'main' } });
  assert.equal(b, 'main');
});

// ── AC-2: walk-up to nearest surviving ancestor when the parent branch is gone ─

test('resolveDoneTargetBranch: grandchild resolves to sub-epic branch when it survives', () => {
  const b = resolveDoneTargetBranch({
    issueNumber: 872,
    deps: { graph, branchExists: (br) => br === 'feature/epic/860' },
  });
  assert.equal(b, 'feature/epic/860');
});

test('resolveDoneTargetBranch: walks up to root-epic branch when sub-epic branch is gone', () => {
  const b = resolveDoneTargetBranch({
    issueNumber: 872,
    // sub-epic branch #860 deleted after merge-back; root-epic #859 survives.
    deps: { graph, branchExists: (br) => br === 'feature/epic/859' },
  });
  assert.equal(b, 'feature/epic/859');
});

test('resolveDoneTargetBranch: walks all the way to trunk when every ancestor branch is gone', () => {
  const b = resolveDoneTargetBranch({
    issueNumber: 872,
    deps: { graph, branchExists: () => false },
  });
  assert.equal(b, 'trunk');
});

// ── lineageDoneGate: skip semantics preserved (parity with commitsOnTrunkGate) ─

test('lineageDoneGate: no commit-trail → skip', async () => {
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 913,
    projectDir: '/x',
    deps: { graph, listComments: listNoTrail },
  });
  assert.deepEqual(r, { ok: true, skipped: 'no-commits-marker' });
});

test('lineageDoneGate: empty trail marker → skip', async () => {
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 913,
    projectDir: '/x',
    deps: {
      graph,
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits shas="" -->' }],
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 'empty-commits-marker');
});

// ── AC-1: leaf gate asserts [#N] on the parent branch, not flat trunk ──────────

test('lineageDoneGate: child with [#N] reachable on its epic branch → passes', async () => {
  const seenRefs = [];
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 913,
    projectDir: '/x',
    deps: {
      graph,
      branchExists: () => true,
      listComments: listWithTrail,
      attributingCommits: async (_n, { refs }) => {
        seenRefs.push(...refs);
        return refs.includes('feature/epic/912') ? [{ sha: '9a1b2c3' }] : [];
      },
    },
  });
  assert.equal(r.ok, true, r.blocker);
  assert.equal(r.doneBranch, 'feature/epic/912');
  // The attribution search was scoped to the PARENT BRANCH, not trunk.
  assert.deepEqual(seenRefs, ['feature/epic/912']);
});

test('lineageDoneGate: child not on parent branch → refuses naming the branch', async () => {
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 913,
    projectDir: '/x',
    deps: {
      graph,
      branchExists: () => true,
      listComments: listWithTrail,
      attributingCommits: async () => [],
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-not-on-parent-branch/);
  assert.match(r.blocker, /feature\/epic\/912/);
});

// ── AC-4: trunk-only repo — leaf attribution is scoped to trunk, no regression ─

test('lineageDoneGate: standalone story scopes attribution to trunk', async () => {
  const seenRefs = [];
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 777,
    projectDir: '/x',
    deps: {
      graph,
      branchExists: () => true,
      listComments: listWithTrail,
      attributingCommits: async (_n, { refs }) => {
        seenRefs.push(...refs);
        return [{ sha: '9a1b2c3' }];
      },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.doneBranch, 'trunk');
  assert.deepEqual(seenRefs, ['trunk']);
});

// ── AC-3: epic done check asserts the derived child-trail on the epic's branch ─

const epicTrailAllChildren = async () =>
  ['h1\x1f[#913] feat\x1fme\x1f2026-01-01', 'h2\x1f[#914] feat\x1fme\x1f2026-01-02'].join('\n');

test('lineageDoneGate: epic passes when every child commit is on the epic branch', async () => {
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 912,
    projectDir: '/x',
    deps: {
      graph,
      branchExists: () => true,
      listComments: listWithTrail,
      epicTrailLog: epicTrailAllChildren,
    },
  });
  assert.equal(r.ok, true, r.blocker);
  assert.equal(r.epicHead, 'feature/epic/912');
});

test('lineageDoneGate: epic excludes a closed not-planned child from delivery reachability', async () => {
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 912,
    projectDir: '/x',
    deps: {
      graph: (issue) => {
        if (Number(issue) === 912) {
          return {
            parent: null,
            children: [
              { number: 913, title: 'delivered child' },
              { number: 914, title: 'abandoned duplicate', closeReason: 'NOT_PLANNED' },
            ],
          };
        }
        return { parent: 912, children: [] };
      },
      branchExists: () => true,
      listComments: listWithTrail,
      epicTrailLog: async () => 'h1\x1f[#913] feat\x1fme\x1f2026-01-01',
    },
  });
  assert.equal(r.ok, true, r.blocker);
  assert.equal(r.epicHead, 'feature/epic/912');
});

test('lineageDoneGate: epic refuses naming children whose commit is not on the epic branch', async () => {
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 912,
    projectDir: '/x',
    deps: {
      graph,
      branchExists: () => true,
      listComments: listWithTrail,
      // only #913's commit is reachable; #914 is missing.
      epicTrailLog: async () => 'h1\x1f[#913] feat\x1fme\x1f2026-01-01',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-epic-child-trail-incomplete/);
  assert.match(r.blocker, /#914/);
  assert.deepEqual(r.unreachable, [914]);
});

test('lineageDoneGate: nested epic uses its surviving parent when its own branch is missing', async () => {
  const seenHeads = [];
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 860,
    projectDir: '/x',
    deps: {
      graph,
      branchExists: (branch) => branch === 'feature/epic/859',
      listComments: listWithTrail,
      epicTrailLog: async ({ epicHead }) => {
        seenHeads.push(epicHead);
        return 'h1\x1f[#872] feat\x1fme\x1f2026-01-01';
      },
    },
  });
  assert.equal(r.ok, true, r.blocker);
  assert.equal(r.epicHead, 'feature/epic/859');
  assert.deepEqual(seenHeads, ['feature/epic/859']);
});

test('lineageDoneGate: nested epic fallback still refuses an incomplete child trail', async () => {
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 860,
    projectDir: '/x',
    deps: {
      graph,
      branchExists: (branch) => branch === 'feature/epic/859',
      listComments: listWithTrail,
      epicTrailLog: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-epic-child-trail-incomplete/);
  assert.equal(r.epicHead, 'feature/epic/859');
  assert.deepEqual(r.unreachable, [872]);
});

test('lineageDoneGate: root epic falls back to the configured trunk when its branch is gone', async () => {
  const seenHeads = [];
  const r = await lineageDoneGate({
    cfg: { repo: 'o/r' },
    issueNumber: 912,
    projectDir: '/x',
    deps: {
      graph,
      trunk: 'origin/trunk',
      branchExists: () => false,
      listComments: listWithTrail,
      epicTrailLog: async ({ epicHead }) => {
        seenHeads.push(epicHead);
        return epicTrailAllChildren();
      },
    },
  });
  assert.equal(r.ok, true, r.blocker);
  assert.equal(r.epicHead, 'origin/trunk');
  assert.deepEqual(seenHeads, ['origin/trunk']);
});
