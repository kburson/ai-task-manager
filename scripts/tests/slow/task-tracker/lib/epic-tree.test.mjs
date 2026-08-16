// @story #905
// Integration test for epic-aware git branching (#905). Drives the owned
// creation + merge-back path against a REAL scratch git repo with REAL
// worktrees — no fakes for git, only an in-memory sub-issue graph:
//
//   cut-epic-branch → cut-child-worktree → commit in the child → merge-back
//
// and the fail-closed edit-guard end-to-end (a correct child passes, a #859
// wrong-base child cut from trunk is refused). This is the end-to-end proof that
// the pure cores compose correctly on top of real git plumbing; it is NOT an AC
// verifier and runs under the full suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { cutEpicBranch } from '../../../../task-tracker/cut-epic-branch.mjs';
import { cutChildWorktree } from '../../../../task-tracker/cut-child-worktree.mjs';
import { mergeBack } from '../../../../task-tracker/merge-back.mjs';
import { computeEvaluation, runHook } from '../../../../task-tracker/epic-base-edit-guard.mjs';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'aitm-test',
  GIT_AUTHOR_EMAIL: 'aitm-test@example.com',
  GIT_COMMITTER_NAME: 'aitm-test',
  GIT_COMMITTER_EMAIL: 'aitm-test@example.com',
};

function gitFor(dir) {
  return (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: GIT_ENV }).trim();
}

// One managed epic tree: root epic 905 with children 910, 911, 920.
const GRAPH = {
  905: { parent: null, children: [910, 911, 920] },
  910: { parent: 905, children: [] },
  911: { parent: 905, children: [] },
  920: { parent: 905, children: [] },
};
const graph = (n) => GRAPH[n] ?? { parent: null, children: [] };

// Commit a file on the child's worktree so merge-back has something to fast-forward.
function commitInWorktree(wtPath, file, body) {
  const gwt = gitFor(wtPath);
  writeFileSync(path.join(wtPath, file), body);
  gwt(['add', '-f', file]);
  gwt(['commit', '-q', '--no-verify', '-m', `[#child] ${file}`]);
}

function siblingPath(repo, suffix) {
  return path.join(path.dirname(repo), `${path.basename(repo)}-${suffix}`);
}

test('end-to-end: cut epic, cut two children, merge both back linearly', () => {
  const repo = mkdtempProjectIsolated('epic-tree-happy-', 'test');
  const git = gitFor(repo);
  const deps = { graph, git, trunk: 'trunk' };

  // Epic forks from trunk; at fork the epic head equals trunk.
  const { branch: epic, base } = cutEpicBranch({ issue: 905, deps });
  assert.equal(epic, 'feature/epic/905');
  assert.equal(base, 'trunk');
  assert.equal(git(['rev-parse', 'feature/epic/905']), git(['rev-parse', 'trunk']));

  // Child 910: cut from the epic head, add a commit, merge back.
  const wt910 = siblingPath(repo, 'wt910');
  const cut910 = cutChildWorktree({ issue: 910, path: wt910, deps });
  assert.equal(cut910.branch, 'feature/child/910');
  assert.equal(cut910.base, 'feature/epic/905');
  commitInWorktree(wt910, 'a910.txt', 'from 910\n');

  const r910 = mergeBack({
    child: 910,
    path: wt910,
    deps: { graph, git, worktreeGit: gitFor(wt910), runTests: () => true, trunk: 'trunk' },
  });
  assert.equal(r910.merged, true);
  // Epic absorbed the child commit; the child branch and worktree are gone.
  assert.match(git(['log', '--format=%H', 'feature/epic/905']), /[0-9a-f]{40}/);
  assert.ok(git(['show', 'feature/epic/905:a910.txt']).includes('from 910'));
  assert.equal(git(['branch', '--list', 'feature/child/910']), '');
  assert.ok(!existsSync(wt910), 'worktree removed');

  // Child 911: same, on top of the now-advanced epic.
  const wt911 = siblingPath(repo, 'wt911');
  cutChildWorktree({ issue: 911, path: wt911, deps });
  commitInWorktree(wt911, 'b911.txt', 'from 911\n');
  mergeBack({
    child: 911,
    path: wt911,
    deps: { graph, git, worktreeGit: gitFor(wt911), runTests: () => true, trunk: 'trunk' },
  });
  assert.ok(git(['show', 'feature/epic/905:b911.txt']).includes('from 911'));

  // Epic is a clean linear descendant of trunk (trunk is still an ancestor).
  assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', 'trunk', 'feature/epic/905']));
  // Both children's commits are reachable and ordered above trunk.
  const log = git(['log', '--format=%s', 'trunk..feature/epic/905']);
  assert.ok(log.includes('a910.txt') && log.includes('b911.txt'));
});

test('end-to-end: merge-back refuses when the child tests fail (no merge, no cleanup)', () => {
  const repo = mkdtempProjectIsolated('epic-tree-test-fail-', 'test');
  const git = gitFor(repo);
  const deps = { graph, git, trunk: 'trunk' };
  cutEpicBranch({ issue: 905, deps });
  const wt = siblingPath(repo, 'wt910');
  cutChildWorktree({ issue: 910, path: wt, deps });
  commitInWorktree(wt, 'a910.txt', 'from 910\n');

  const epicHeadBefore = git(['rev-parse', 'feature/epic/905']);
  assert.throws(
    () =>
      mergeBack({
        child: 910,
        path: wt,
        deps: { graph, git, worktreeGit: gitFor(wt), runTests: () => false, trunk: 'trunk' },
      }),
    /test/i
  );
  // Epic untouched, worktree still present.
  assert.equal(git(['rev-parse', 'feature/epic/905']), epicHeadBefore);
  assert.ok(existsSync(wt), 'worktree preserved on refusal');
});

test('end-to-end guard: correct child passes, #859 wrong-base child is refused', () => {
  const repo = mkdtempProjectIsolated('epic-tree-guard-', 'test');
  const git = gitFor(repo);
  const deps = { graph, git, trunk: 'trunk' };
  cutEpicBranch({ issue: 905, deps });

  // Advance the epic with a real child so its head diverges from trunk.
  const wt910 = siblingPath(repo, 'wt910');
  cutChildWorktree({ issue: 910, path: wt910, deps });
  commitInWorktree(wt910, 'a910.txt', 'from 910\n');
  mergeBack({
    child: 910,
    path: wt910,
    deps: { graph, git, worktreeGit: gitFor(wt910), runTests: () => true, trunk: 'trunk' },
  });

  // A CORRECT child cut from the (advanced) epic head passes the invariant.
  const wt911 = siblingPath(repo, 'wt911');
  cutChildWorktree({ issue: 911, path: wt911, deps });
  const okEval = computeEvaluation('feature/child/911', { graph, git });
  assert.equal(okEval.pass, true);

  // The #859 failure: a child cut straight from trunk instead of the epic head.
  const wt920 = siblingPath(repo, 'wt920');
  git(['worktree', 'add', '-b', 'feature/child/920', wt920, 'trunk']);
  const badEval = computeEvaluation('feature/child/920', { graph, git });
  assert.equal(badEval.pass, false);

  // Through the PreToolUse hook: the wrong-base child's source edit is BLOCKED,
  // the correct child's is ALLOWED. Scratch paths stay writable on both.
  const editWrong = {
    tool_name: 'Edit',
    tool_input: { file_path: path.join(wt920, 'scripts/x.mjs') },
  };
  const blocked = runHook(editWrong, {
    projectDir: repo,
    graph,
    git,
    currentBranch: () => 'feature/child/920',
  });
  assert.equal(blocked.decision, 'block');

  const editRight = {
    tool_name: 'Edit',
    tool_input: { file_path: path.join(wt911, 'scripts/x.mjs') },
  };
  const allowed = runHook(editRight, {
    projectDir: repo,
    graph,
    git,
    currentBranch: () => 'feature/child/911',
  });
  assert.equal(allowed.decision, 'allow');
});

test('#1284: a custom-named epic cuts and validates a child at its exact head', () => {
  const repo = mkdtempProjectIsolated('epic-tree-custom-authority-', 'test');
  const git = gitFor(repo);
  const customEpic = 'codex/1268-implementation-plan';
  const customGraph = (n) =>
    n === 910
      ? { ...GRAPH[910], parentAuthoritativeBranch: customEpic }
      : GRAPH[n] ?? { parent: null, children: [] };

  git(['branch', customEpic, 'trunk']);
  const epicWorktree = siblingPath(repo, 'custom-epic');
  git(['worktree', 'add', epicWorktree, customEpic]);
  commitInWorktree(epicWorktree, 'epic.txt', 'custom epic head\n');
  const customHead = git(['rev-parse', customEpic]);

  const childWorktree = siblingPath(repo, 'custom-child');
  const cut = cutChildWorktree({
    issue: 910,
    path: childWorktree,
    deps: { graph: customGraph, git, trunk: 'trunk' },
  });
  assert.equal(cut.base, customEpic);
  assert.equal(git(['merge-base', 'feature/child/910', customEpic]), customHead);
  assert.equal(
    computeEvaluation('feature/child/910', { graph: customGraph, git, trunk: 'trunk' }).pass,
    true
  );
});
