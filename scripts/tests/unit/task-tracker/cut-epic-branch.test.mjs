// @story #905
// #905 — cut an epic branch at the correct base (design: "Worktree ownership" /
// "Branching model"). A root epic forks from trunk; a nested sub-epic forks from
// its parent epic's head. git + graph are injected so the test asserts argv only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cutEpicBranch } from '../../../task-tracker/cut-epic-branch.mjs';

const GRAPH = {
  905: { parent: null, children: [910, 911] }, // root epic
  911: { parent: 905, children: [920] }, // nested sub-epic under 905
  910: { parent: 905, children: [] }, // leaf child
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

test('root epic forks from trunk', () => {
  const { calls, deps } = makeDeps();
  const r = cutEpicBranch({ issue: 905, deps });
  assert.deepEqual(r, { branch: 'feature/epic/905', base: 'trunk' });
  assert.deepEqual(calls, [['branch', 'feature/epic/905', 'trunk']]);
});

test('nested sub-epic forks from its parent epic head, not trunk', () => {
  const { calls, deps } = makeDeps();
  const r = cutEpicBranch({ issue: 911, deps });
  assert.deepEqual(r, { branch: 'feature/epic/911', base: 'feature/epic/905' });
  assert.deepEqual(calls, [['branch', 'feature/epic/911', 'feature/epic/905']]);
});

test('refuses to cut an epic branch for a non-epic issue', () => {
  const { deps } = makeDeps();
  assert.throws(() => cutEpicBranch({ issue: 910, deps }), /not an epic/i); // child
  assert.throws(() => cutEpicBranch({ issue: 42, deps }), /not an epic/i); // story
});

test('requires an issue and injected git', () => {
  const { deps } = makeDeps();
  assert.throws(() => cutEpicBranch({ deps }), /issue/i);
  assert.throws(() => cutEpicBranch({ issue: 905, deps: { graph: deps.graph } }), /git/i);
});
