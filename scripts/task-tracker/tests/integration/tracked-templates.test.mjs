// @story #569
// Integration test for #569: the two skill-installed-but-team-editable shared
// templates — `.ai-task-manager/pickup-directive.md` and
// `.ai-task-manager/definition-of-done.md` — MUST be tracked in git, NOT
// gitignored.
//
// Why this matters: `git worktree add` (and Claude Code's
// `isolation: "worktree"`, which only runs `git worktree add`) produces a
// checkout containing exactly the tracked files at HEAD and nothing else.
// When these templates were gitignored, every fresh worktree — including the
// one the Test gate provisions under CI emulation — came up missing them, and
// four template-sensitive suites false-redded on the absent files. Tracking
// them closes the seed gap at its root: a fresh worktree carries the templates
// with no seeding step.
//
// This suite asserts three things against the committed HEAD:
//   1. Neither template is git-ignored (`git check-ignore`).
//   2. Both templates are tracked (`git ls-files --error-unmatch`).
//   3. A throwaway `git worktree add` checkout from HEAD contains both files
//      with no seeding step.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');

const TEMPLATES = [
  '.ai-task-manager/pickup-directive.md',
  '.ai-task-manager/definition-of-done.md',
];

function git(args, opts = {}) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', ...opts });
}

test('neither template is git-ignored', () => {
  // `git check-ignore <paths>` prints the ignored paths and exits 0 if ANY are
  // ignored; exit 1 with no output means none are ignored — the state we want.
  const res = git(['check-ignore', ...TEMPLATES]);
  assert.equal(
    res.status,
    1,
    `expected no template to be git-ignored, but check-ignore reported:\n${res.stdout}`
  );
  assert.equal(res.stdout.trim(), '');
});

test('both templates are tracked in git', () => {
  // --error-unmatch makes ls-files exit non-zero if a path is not tracked.
  const res = git(['ls-files', '--error-unmatch', ...TEMPLATES]);
  assert.equal(res.status, 0, `expected both templates to be tracked, got:\n${res.stderr}`);
});

test('a fresh worktree from HEAD carries both templates with no seeding step', () => {
  const wtParent = mkdtempSync(path.join(os.tmpdir(), 'aitm-tracked-templates-'));
  const wtPath = path.join(wtParent, 'wt');
  try {
    const add = git(['worktree', 'add', '--detach', wtPath, 'HEAD']);
    assert.equal(add.status, 0, `git worktree add failed:\n${add.stderr}`);

    for (const rel of TEMPLATES) {
      assert.ok(
        existsSync(path.join(wtPath, rel)),
        `fresh worktree is missing ${rel} (seed gap not closed)`
      );
    }
  } finally {
    git(['worktree', 'remove', '--force', wtPath]);
    rmSync(wtParent, { recursive: true, force: true });
  }
});
