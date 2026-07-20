// #905 — re-sync an epic onto trunk (design: "Epic↔trunk re-sync"). Rebase the
// epic onto trunk, then republish with --force-with-lease. Also exposes the
// opportunistic is-ancestor check merge-back consults before a child merge. git +
// graph injected; the test asserts argv and the ancestor-driven branch.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { syncEpic, epicNeedsSync } from './sync-epic.mjs';

const GRAPH = {
  905: { parent: null, children: [910] }, // root epic
  910: { parent: 905, children: [] }, // child
};
function makeGit({ ancestor = true, rebaseFails = false } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'merge-base' && args.includes('--is-ancestor')) {
      if (!ancestor) {
        const e = new Error('not an ancestor');
        e.status = 1;
        throw e;
      }
      return '';
    }
    if (args[0] === 'rebase' && rebaseFails) {
      const e = new Error('rebase conflict');
      e.status = 1;
      throw e;
    }
    return '';
  };
  git.calls = calls;
  return git;
}
const graph = (n) => GRAPH[n] ?? { parent: null, children: [] };

test('syncEpic rebases the epic onto trunk then force-with-lease pushes', () => {
  const git = makeGit();
  const r = syncEpic({ epic: 905, deps: { graph, git } });
  assert.equal(r.branch, 'feature/epic/905');
  assert.equal(r.pushed, true);
  assert.deepEqual(git.calls, [
    ['rebase', 'trunk', 'feature/epic/905'],
    ['push', '--force-with-lease', 'origin', 'feature/epic/905'],
  ]);
});

test('syncEpic skips the push when noPushToOrigin is set (rebase-only)', () => {
  const git = makeGit();
  const r = syncEpic({ epic: 905, deps: { graph, git, noPushToOrigin: true } });
  assert.equal(r.pushed, false);
  assert.deepEqual(git.calls, [['rebase', 'trunk', 'feature/epic/905']]);
});

test('syncEpic surfaces a rebase conflict rather than pushing a bad state', () => {
  const git = makeGit({ rebaseFails: true });
  assert.throws(() => syncEpic({ epic: 905, deps: { graph, git } }), /rebase/i);
  // never reached the push
  assert.ok(!git.calls.some((c) => c[0] === 'push'));
});

test('syncEpic refuses a non-epic issue', () => {
  const git = makeGit();
  assert.throws(() => syncEpic({ epic: 910, deps: { graph, git } }), /not an epic/i);
});

test('epicNeedsSync: true when origin/trunk is NOT yet an ancestor of the epic', () => {
  const git = makeGit({ ancestor: false });
  assert.equal(epicNeedsSync({ epic: 905, deps: { graph, git } }), true);
  assert.deepEqual(git.calls[0], [
    'merge-base',
    '--is-ancestor',
    'origin/trunk',
    'feature/epic/905',
  ]);
});

test('epicNeedsSync: false when the epic already contains origin/trunk', () => {
  const git = makeGit({ ancestor: true });
  assert.equal(epicNeedsSync({ epic: 905, deps: { graph, git } }), false);
});

test('requires an issue and injected git', () => {
  assert.throws(() => syncEpic({ deps: { graph, git: makeGit() } }), /epic/i);
  assert.throws(() => syncEpic({ epic: 905, deps: { graph } }), /git/i);
});
