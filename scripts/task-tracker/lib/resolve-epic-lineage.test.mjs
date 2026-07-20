// #905 — lineage resolution (design: "Lineage resolution"). Intended lineage is
// derived live from the GitHub sub-issue graph, never stored in the branch name.
// The single graph lookup is injected so these tests need no `gh`/git.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveEpicLineage } from './resolve-epic-lineage.mjs';

// A tiny sub-issue graph. `graph(issue) → { parent, children }`.
//   905  root epic  → children [910, 911]
//   910  child of 905 (leaf)
//   911  nested sub-epic under 905 → children [920]
//   920  child of the nested epic 911 (leaf)
//   42   standalone story (no parent, no children)
const GRAPH = {
  905: { parent: null, children: [910, 911] },
  910: { parent: 905, children: [] },
  911: { parent: 905, children: [920] },
  920: { parent: 911, children: [] },
  42: { parent: null, children: [] },
};
const deps = { graph: (n) => GRAPH[n] ?? { parent: null, children: [] } };

test('root epic → its own epic branch, parent trunk', () => {
  assert.deepEqual(resolveEpicLineage(905, { deps }), {
    role: 'epic',
    branch: 'feature/epic/905',
    epicBranch: 'feature/epic/905',
    parentBranch: 'trunk',
  });
});

test('leaf child → epic branch is its parent, base is that epic', () => {
  assert.deepEqual(resolveEpicLineage(910, { deps }), {
    role: 'child',
    branch: 'feature/child/910',
    epicBranch: 'feature/epic/905',
    parentBranch: 'feature/epic/905',
  });
});

test('nested sub-epic → role epic, own branch, parent is the outer epic', () => {
  assert.deepEqual(resolveEpicLineage(911, { deps }), {
    role: 'epic',
    branch: 'feature/epic/911',
    epicBranch: 'feature/epic/911',
    parentBranch: 'feature/epic/905',
  });
});

test('child of a nested epic → its epic is the nested epic', () => {
  assert.deepEqual(resolveEpicLineage(920, { deps }), {
    role: 'child',
    branch: 'feature/child/920',
    epicBranch: 'feature/epic/911',
    parentBranch: 'feature/epic/911',
  });
});

test('standalone story → no epic, parent trunk', () => {
  assert.deepEqual(resolveEpicLineage(42, { deps }), {
    role: 'story',
    branch: 'feature/story/42',
    epicBranch: null,
    parentBranch: 'trunk',
  });
});

test('accepts a managed branch name as input, not just an issue number', () => {
  assert.deepEqual(
    resolveEpicLineage('feature/child/910', { deps }),
    resolveEpicLineage(910, { deps })
  );
});

test('re-parented child follows the current graph edge (rebase target moves)', () => {
  // Same child 910, but the live graph now attaches it under nested epic 911.
  const moved = { graph: (n) => (n === 910 ? { parent: 911, children: [] } : GRAPH[n]) };
  const r = resolveEpicLineage(910, { deps: moved });
  assert.equal(r.epicBranch, 'feature/epic/911');
  assert.equal(r.parentBranch, 'feature/epic/911');
});

test('trunk name is injectable', () => {
  const r = resolveEpicLineage(42, { deps: { ...deps, trunk: 'main' } });
  assert.equal(r.parentBranch, 'main');
});

test('#927 — the resolved trunk ref roots both a root epic and a standalone story', () => {
  const resolvedDeps = { ...deps, trunk: 'origin/trunk' };
  // Root epic forks from the resolved ref.
  assert.equal(resolveEpicLineage(905, { deps: resolvedDeps }).parentBranch, 'origin/trunk');
  // Standalone story likewise bases on the resolved ref (not local `trunk`).
  assert.equal(resolveEpicLineage(42, { deps: resolvedDeps }).parentBranch, 'origin/trunk');
});

test('rejects an unresolvable input', () => {
  assert.throws(() => resolveEpicLineage('not-a-branch', { deps }), /resolve-epic-lineage/);
  assert.throws(() => resolveEpicLineage(0, { deps }), /resolve-epic-lineage/);
  assert.throws(() => resolveEpicLineage(null, { deps }), /resolve-epic-lineage/);
});

test('requires an injected graph lookup', () => {
  assert.throws(() => resolveEpicLineage(905, {}), /graph/);
});
