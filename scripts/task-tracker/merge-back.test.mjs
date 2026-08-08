// #905 — merge a child back into its epic (design: "Merge-back protocol").
// Opportunistically sync the epic onto its parent (skip if already current),
// rebase the child onto the epic head, run the child's tests, then fast-forward
// only. Refuse on rebase conflict or test failure; clean up on success. git +
// graph + test-runner injected.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mergeBack } from './merge-back.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const GRAPH = {
  905: { parent: null, children: [910, 920] }, // root epic (parent = trunk)
  910: { parent: 905, children: [] }, // child of 905
  920: { parent: 905, children: [921] }, // nested epic under 905
  921: { parent: 920, children: [] }, // child of nested epic 920
};
const graph = (n) => GRAPH[n] ?? { parent: null, children: [] };

function makeGit({ grandparentIsAncestor = true, rebaseChildFails = false } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'merge-base' && args.includes('--is-ancestor')) {
      if (!grandparentIsAncestor) {
        const e = new Error('trunk moved ahead');
        e.status = 1;
        throw e;
      }
      return '';
    }
    // rebase of the CHILD onto the epic: args = ['rebase','feature/epic/905','feature/child/910']
    if (args[0] === 'rebase' && args[2] === 'feature/child/910' && rebaseChildFails) {
      const e = new Error('rebase conflict in child');
      e.status = 1;
      throw e;
    }
    return '';
  };
  git.calls = calls;
  return git;
}

test('clean fast-forward path: sync-skip, rebase child, test, ff, cleanup', () => {
  const git = makeGit(); // grandparent already ancestor → epic sync is a no-op
  const r = mergeBack({
    child: 910,
    path: '/wt/910',
    deps: { graph, git, runTests: () => true },
  });
  assert.equal(r.merged, true);
  assert.equal(r.epic, 'feature/epic/905');
  assert.equal(r.child, 'feature/child/910');
  const kinds = git.calls.map((c) => c.join(' '));
  // epic was NOT rebased onto trunk (grandparent unchanged) ...
  assert.ok(!kinds.includes('rebase trunk feature/epic/905'));
  // ... but the child WAS rebased onto the epic, then ff-merged, then cleaned up.
  assert.ok(kinds.includes('rebase feature/epic/905 feature/child/910'));
  assert.ok(kinds.includes('merge --ff-only feature/child/910'));
  assert.ok(kinds.includes('worktree remove /wt/910'));
  assert.ok(kinds.some((k) => k.startsWith('branch -d feature/child/910')));
});

test('nested epic follows the same recursive merge-back path into its immediate epic parent', () => {
  const git = makeGit();
  let tested;
  const r = mergeBack({
    child: 920,
    path: '/wt/920',
    deps: {
      graph,
      git,
      runTests: (args) => {
        tested = args;
        return true;
      },
    },
  });

  assert.deepEqual(r, {
    merged: true,
    epic: 'feature/epic/905',
    child: 'feature/epic/920',
  });
  assert.deepEqual(tested, { path: '/wt/920', branch: 'feature/epic/920' });

  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(kinds.includes('rebase feature/epic/905 feature/epic/920'));
  assert.ok(kinds.includes('merge --ff-only feature/epic/920'));
  assert.ok(kinds.includes('worktree remove /wt/920'));
  assert.ok(kinds.includes('branch -d feature/epic/920'));
});

test('grandparent advanced: epic is rebased onto trunk before the child merge', () => {
  const git = makeGit({ grandparentIsAncestor: false });
  mergeBack({ child: 910, path: '/wt/910', deps: { graph, git, runTests: () => true } });
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(kinds.includes('rebase trunk feature/epic/905'));
});

test('rebase conflict on the child refuses before any merge', () => {
  const git = makeGit({ rebaseChildFails: true });
  assert.throws(
    () => mergeBack({ child: 910, path: '/wt/910', deps: { graph, git, runTests: () => true } }),
    /rebase|conflict/i
  );
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(!kinds.some((k) => k.startsWith('merge --ff-only')));
});

test('post-rebase test failure refuses the merge and skips cleanup', () => {
  const git = makeGit();
  assert.throws(
    () => mergeBack({ child: 910, path: '/wt/910', deps: { graph, git, runTests: () => false } }),
    /test/i
  );
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(!kinds.some((k) => k.startsWith('merge --ff-only')));
  assert.ok(!kinds.some((k) => k.startsWith('worktree remove')));
});

test('#864: the test-runner runs bounded sections, not the retired test:all', () => {
  const src = readFileSync(path.join(__dir, 'merge-back.mjs'), 'utf8');
  // No functional caller of the retired monolith may remain.
  assert.ok(
    !/\brun',\s*'test:all'|\['run',\s*'test:all'\]/.test(src),
    'merge-back.mjs must not invoke `npm run test:all` (it is retired by #864)'
  );
  // It must instead run each bounded section, each under its own ceiling.
  for (const section of ['test:unit', 'test:integration', 'test:slow']) {
    assert.ok(
      src.includes(`'${section}'`),
      `merge-back.mjs must run the ${section} section in place of test:all`
    );
  }
});

test('refuses a non-child issue', () => {
  const git = makeGit();
  assert.throws(
    () => mergeBack({ child: 905, path: '/wt/x', deps: { graph, git, runTests: () => true } }),
    /not a child/i
  );
});

test('requires child, git, and a test runner', () => {
  const git = makeGit();
  assert.throws(
    () => mergeBack({ path: '/wt/x', deps: { graph, git, runTests: () => true } }),
    /child/i
  );
  assert.throws(() => mergeBack({ child: 910, path: '/wt/x', deps: { graph } }), /git/i);
  assert.throws(() => mergeBack({ child: 910, path: '/wt/x', deps: { graph, git } }), /runTests/i);
});
