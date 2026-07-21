// #927 — end-to-end desync proof with REAL git (no fakes for git/resolution).
//
// Reproduces the recurring bug's exact shape and asserts the fix:
//   - A bare `origin` holds `trunk`.
//   - The main working clone sits on a NON-trunk branch (`discovery/feature-B`)
//     with a STALE local `trunk` (never fast-forwarded).
//   - A sibling landed a `[#123]`-attributed commit on `origin/trunk`.
//
// The close gate, using the real `fetchTrunk` + `resolveTrunkRef` + attribution
// (nothing injected but the comment trail), must fetch, resolve `origin/trunk`,
// find the commit, and pass — WITHOUT touching local `trunk` and WITHOUT leaving
// the main worktree in an inverted-diff state.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import { commitsOnTrunkGate } from './close-gates.mjs';
import { resolveTrunkRef, fetchTrunk } from './trunk-ref.mjs';
import { projectScratchDir } from './scratch-dir.mjs';

// A plain (non-git) scratch base under <repo>/.tmp/test/. The test creates its
// own bare origin + clones inside it; each clone is its own git root, so git
// commands never ascend into this repo. Routed through projectScratchDir so the
// repo's lint:tmp guard (no system temp writes) stays satisfied.
function scratchBase(prefix) {
  return mkdtempSync(path.join(projectScratchDir('test'), prefix));
}

// git in `cwd`; identity forced so commits succeed in a bare CI env.
function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@e',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@e',
    },
  }).trim();
}

test('#927 — stale local trunk + main on a feature branch: close gate passes off origin/trunk, no desync', async (t) => {
  const base = scratchBase('aitm-927-');
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const originDir = path.join(base, 'origin.git');
  const workDir = path.join(base, 'work');
  const otherDir = path.join(base, 'other');

  // 1. Bare origin.
  git(base, ['init', '--bare', '-b', 'trunk', originDir]);

  // 2. Working clone: seed trunk with an initial commit, publish it.
  git(base, ['clone', originDir, workDir]);
  git(workDir, ['commit', '--allow-empty', '-m', 'init']);
  git(workDir, ['push', '-u', 'origin', 'trunk']);

  // 3. A sibling clone lands a `[#123]`-attributed commit on origin/trunk.
  git(base, ['clone', originDir, otherDir]);
  git(otherDir, ['commit', '--allow-empty', '-m', '[#123] feat: sibling deliverable']);
  git(otherDir, ['push', 'origin', 'trunk']);

  // 4. The main worktree moves OFF trunk and never fast-forwards it → stale.
  git(workDir, ['checkout', '-b', 'discovery/feature-B']);
  const staleTrunk = git(workDir, ['rev-parse', 'trunk']);
  const statusBefore = git(workDir, ['status', '--porcelain']);
  assert.equal(statusBefore, '', 'precondition: main worktree is clean');

  // 5. The close gate runs with the REAL resolver + fetch + attribution; only the
  //    comment trail (a gh call) is faked. cfg has no trunkRef → the default
  //    origin-first resolution must discover origin/trunk.
  const r = await commitsOnTrunkGate({
    cfg: { repo: 'o/r' },
    issueNumber: 123,
    projectDir: workDir,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n\n<!-- aitm-commits: abc1234 -->\n' }],
    },
  });

  assert.equal(r.ok, true, `gate should pass: ${r.blocker || ''}`);
  assert.equal(r.trunkRef, 'origin/trunk');

  // 6. Desync proofs: local trunk is untouched (still stale), origin/trunk moved
  //    ahead, and the main worktree never entered an inverted-diff state.
  assert.equal(git(workDir, ['rev-parse', 'trunk']), staleTrunk, 'local trunk stays stale');
  assert.notEqual(
    git(workDir, ['rev-parse', 'origin/trunk']),
    staleTrunk,
    'origin/trunk advanced past local trunk'
  );
  assert.equal(
    git(workDir, ['status', '--porcelain']),
    '',
    'main worktree clean — no inverted staged diff'
  );
  assert.equal(
    git(workDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    'discovery/feature-B',
    'main worktree still on its feature branch'
  );
});

test('#927 — no-remote fallback: resolveTrunkRef resolves the local branch, fetch is a no-op', async (t) => {
  const base = scratchBase('aitm-927-solo-');
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const repo = path.join(base, 'solo');
  git(base, ['init', '-b', 'trunk', repo]);
  git(repo, ['commit', '--allow-empty', '-m', 'init']);

  // No remote configured: fetch is best-effort and non-fatal; resolution falls
  // back to the local `trunk` branch.
  const fetched = await fetchTrunk({ cfg: {}, projectDir: repo });
  assert.equal(fetched.fetched, false);
  const ref = await resolveTrunkRef({ cfg: {}, projectDir: repo });
  assert.equal(ref, 'trunk');
});
