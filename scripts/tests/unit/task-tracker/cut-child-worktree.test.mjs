// @story #905
// #905 — cut a child worktree from its epic head, by construction (design:
// "Worktree ownership"). This is the correct-by-construction replacement for a
// free-form `Agent({isolation:"worktree"})` cut: the base is the epic branch, never
// trunk. git + graph injected; the test asserts the `git worktree add` argv.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cutChildWorktree, realGraphNode } from '../../../task-tracker/cut-child-worktree.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const GRAPH = {
  905: { parent: null, children: [910] }, // root epic
  911: { parent: 905, children: [920] }, // nested sub-epic
  910: { parent: 905, children: [] }, // child of root epic
  920: { parent: 911, children: [] }, // child of nested epic
  42: { parent: null, children: [] }, // story
};
function makeDeps() {
  const calls = [];
  return {
    calls,
    deps: {
      graph: (n) => GRAPH[n] ?? { parent: null, children: [] },
      git: (args) => {
        calls.push(args);
        return '';
      },
    },
  };
}

test('child worktree is based on its epic head, not trunk', () => {
  const { calls, deps } = makeDeps();
  const r = cutChildWorktree({ issue: 910, path: '/wt/910', deps });
  assert.deepEqual(r, {
    branch: 'feature/child/910',
    path: '/wt/910',
    base: 'feature/epic/905',
  });
  assert.deepEqual(calls, [
    ['worktree', 'add', '-b', 'feature/child/910', '/wt/910', 'feature/epic/905'],
  ]);
});

test('child of a nested epic is based on the nested epic head', () => {
  const { calls, deps } = makeDeps();
  const r = cutChildWorktree({ issue: 920, path: '/wt/920', deps });
  assert.equal(r.base, 'feature/epic/911');
  assert.deepEqual(calls, [
    ['worktree', 'add', '-b', 'feature/child/920', '/wt/920', 'feature/epic/911'],
  ]);
});

test('refuses a non-child issue', () => {
  const { deps } = makeDeps();
  assert.throws(() => cutChildWorktree({ issue: 905, path: '/wt/x', deps }), /not a child/i);
  assert.throws(() => cutChildWorktree({ issue: 42, path: '/wt/x', deps }), /not a child/i);
});

test('requires issue, path, and injected git', () => {
  const { deps } = makeDeps();
  assert.throws(() => cutChildWorktree({ path: '/wt/x', deps }), /issue/i);
  assert.throws(() => cutChildWorktree({ issue: 910, deps }), /path/i);
  assert.throws(
    () => cutChildWorktree({ issue: 910, path: '/wt/x', deps: { graph: deps.graph } }),
    /git/i
  );
});

test("#1284: child worktree uses the parent epic's recorded custom branch authority", () => {
  const { calls, deps } = makeDeps();
  const customDeps = {
    ...deps,
    graph: (n) =>
      n === 910
        ? { ...GRAPH[910], parentAuthoritativeBranch: 'codex/1268-implementation-plan' }
        : (() => {
            throw new Error(`unexpected graph lookup for #${n}`);
          })(),
  };
  const result = cutChildWorktree({ issue: 910, path: '/wt/910', deps: customDeps });
  assert.equal(result.base, 'codex/1268-implementation-plan');
  assert.deepEqual(calls, [
    ['worktree', 'add', '-b', 'feature/child/910', '/wt/910', 'codex/1268-implementation-plan'],
  ]);
});

test('#1284: invalid parent branch authority makes zero mutating Git calls', () => {
  const { calls, deps } = makeDeps();
  const invalidDeps = {
    ...deps,
    graph: (n) =>
      n === 910
        ? { ...GRAPH[910], parentAuthorityError: 'malformed current worktree authority' }
        : (() => {
            throw new Error(`unexpected graph lookup for #${n}`);
          })(),
  };
  assert.throws(
    () => cutChildWorktree({ issue: 910, path: '/wt/910', deps: invalidDeps }),
    /malformed current/i
  );
  assert.deepEqual(calls, []);
});

test('#1486: production graph loading delegates authority to the shared adapter', () => {
  const source = readFileSync(
    path.join(__dir, '../../../task-tracker/cut-child-worktree.mjs'),
    'utf8'
  );
  assert.match(source, /graph-node-authority\.mjs/);
  assert.doesNotMatch(source, /query\(\$owner/);
  assert.doesNotMatch(source, /resolveCurrentIssueWorktree(?:Location|Branch)\s*\(/);
});

test('#1486: production graph loading maps injected parent authority and fallback', async () => {
  const baseDeps = {
    fetchParentIssue: async () => 905,
    fetchEpicChildren: async () => [{ number: 910 }],
  };
  const custom = await realGraphNode(
    910,
    { repo: 'owner/repo' },
    {
      ...baseDeps,
      fetchParentIssueBody: async () =>
        '<!-- aitm-worktree-location worktree="/wt/905" branch="cloud-test-automation" sid="test" ts="2026-09-11T00:00:00Z" -->',
    }
  );
  assert.deepEqual(custom, {
    parent: 905,
    children: [910],
    parentAuthoritativeBranch: 'cloud-test-automation',
  });

  const fallback = await realGraphNode(
    910,
    { repo: 'owner/repo' },
    {
      ...baseDeps,
      fetchParentIssueBody: async () => '## Legacy parent',
    }
  );
  assert.deepEqual(fallback, { parent: 905, children: [910] });
});

test('#1486: production graph loading propagates parent authority parse failures', async () => {
  await assert.rejects(
    realGraphNode(
      910,
      { repo: 'owner/repo' },
      {
        fetchParentIssue: async () => 905,
        fetchEpicChildren: async () => [],
        fetchParentIssueBody: async () =>
          '<!-- aitm-worktree-location worktree="/wt/905" branch="cloud-test-automation" -->',
      }
    ),
    /malformed/
  );
});
