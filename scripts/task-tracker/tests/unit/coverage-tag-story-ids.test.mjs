// @story #602
// Coverage leaf for `scripts/task-tracker/tag-story-ids.mjs`.
//
// `tag-story-ids.mjs` is a run-once maintenance script: it executes its scan/
// rewrite loop at import time and writes `// @story #NNN` tags into every
// `*.test.mjs` under two hard-coded roots. It cannot be imported in-process
// (that would mutate this repo's real test files), so it is driven as a child
// process with `cwd` pointed at a throwaway directory holding fixture files.
// Two runs cover every branch: a non-git sandbox (git-log throws → fallback,
// plus the missing-root catch) and a git sandbox (git-log resolves a real
// issue number, plus the empty-log fallback).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempOutsideRepo, mkdtempProjectIsolated } from '../../lib/scratch-dir.mjs';

const SCRIPT = fileURLToPath(new URL('../../tag-story-ids.mjs', import.meta.url));

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'aitm-test',
  GIT_AUTHOR_EMAIL: 'aitm-test@example.com',
  GIT_COMMITTER_NAME: 'aitm-test',
  GIT_COMMITTER_EMAIL: 'aitm-test@example.com',
};

function run(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
}

function write(cwd, rel, content) {
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

test('non-git sandbox: fixes misplaced tags, skips tagged, tags untagged via fallback', () => {
  const cwd = mkdtempOutsideRepo('tag-story-plain-');

  // Only the task-tracker root exists — the providers root is absent, which
  // exercises the roots.flatMap() try/catch fallback to [].
  const misplaced = write(
    cwd,
    'scripts/task-tracker/tests/a-misplaced.test.mjs',
    '// @story #5\n#!/usr/bin/env node\nconsole.log(1)\n'
  );
  const tagged = write(
    cwd,
    'scripts/task-tracker/tests/b-tagged.test.mjs',
    '// @story #7\nconsole.log(2)\n'
  );
  const shebang = write(
    cwd,
    'scripts/task-tracker/tests/c-shebang.test.mjs',
    '#!/usr/bin/env node\nconsole.log(3)\n'
  );
  // Nested subdirectory → exercises findTestFiles recursion.
  const plain = write(
    cwd,
    'scripts/task-tracker/tests/sub/d-plain.test.mjs',
    'export const x = 1;\n'
  );

  const res = run(cwd);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Tagged: 2, Fixed shebang order: 1, Skipped \(already correct\): 1/);
  // No git repo → findCreationIssue throws → fallback list printed.
  assert.match(res.stdout, /fallback #309/);

  // Misplaced tag now has the shebang back on line 1.
  const misLines = readFileSync(misplaced, 'utf8').split('\n');
  assert.equal(misLines[0], '#!/usr/bin/env node');
  assert.equal(misLines[1], '// @story #5');

  // Already-tagged file is untouched.
  assert.equal(readFileSync(tagged, 'utf8'), '// @story #7\nconsole.log(2)\n');

  // Shebang-first untagged file gets the tag on line 2.
  const shLines = readFileSync(shebang, 'utf8').split('\n');
  assert.equal(shLines[0], '#!/usr/bin/env node');
  assert.equal(shLines[1], '// @story #309');

  // Plain untagged file gets the tag prepended on line 1.
  assert.equal(readFileSync(plain, 'utf8').split('\n')[0], '// @story #309');
});

test('git sandbox: resolves creation issue from git log; empty log falls back', () => {
  const cwd = mkdtempProjectIsolated('tag-story-git-');

  // Committed file whose creation commit message carries an issue ref.
  const committed = write(
    cwd,
    'scripts/providers/tests/e-committed.test.mjs',
    'export const e = 1;\n'
  );
  execFileSync('git', ['add', '-f', committed], { cwd, env: GIT_ENV });
  execFileSync('git', ['commit', '-q', '--no-verify', '-m', '#42 add e fixture'], {
    cwd,
    env: GIT_ENV,
  });

  // Uncommitted file in the other root → git log --diff-filter=A is empty → fallback.
  const uncommitted = write(
    cwd,
    'scripts/task-tracker/tests/f-uncommitted.test.mjs',
    'export const f = 2;\n'
  );

  const res = run(cwd);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Tagged: 2/);

  assert.equal(readFileSync(committed, 'utf8').split('\n')[0], '// @story #42');
  assert.equal(readFileSync(uncommitted, 'utf8').split('\n')[0], '// @story #309');
});
