// @story #602
// Coverage leaf for `scripts/task-tracker/tag-story-ids.mjs`.
//
// `tag-story-ids.mjs` is a run-once maintenance script: its rewrite loop adds
// `// @story #NNN` tags to every discovered
// `*.test.mjs`. It is driven as a child process with `cwd` pointed at a
// throwaway directory holding fixture files. Two runs cover every branch: a
// non-git sandbox (git-log throws → fallback) and a git sandbox (git-log
// resolves a real issue number, plus the empty-log fallback).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  mkdtempOutsideRepo,
  mkdtempProjectIsolated,
} from '../../../../task-tracker/lib/scratch-dir.mjs';

const SCRIPT = fileURLToPath(
  new URL('../../../../task-tracker/tag-story-ids.mjs', import.meta.url)
);

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

test('tag helpers can be imported without mutating the caller worktree', () => {
  const cwd = mkdtempOutsideRepo('tag-story-import-');
  const untouched = write(cwd, 'scripts/gh/untouched.test.mjs', 'export const untouched = true;\n');
  const scriptUrl = pathToFileURL(SCRIPT).href;
  const res = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { fixMisplacedTag, insertTag } from ${JSON.stringify(scriptUrl)};\n` +
        "if (insertTag('x\\n', '#42') !== '// @story #42\\nx\\n') process.exit(1);\n" +
        "if (fixMisplacedTag('// @story #42\\n#!/usr/bin/env node\\nx\\n') !== '#!/usr/bin/env node\\n// @story #42\\nx\\n') process.exit(1);",
    ],
    { cwd, encoding: 'utf8' }
  );

  assert.equal(res.status, 0, res.stderr);
  assert.equal(readFileSync(untouched, 'utf8'), 'export const untouched = true;\n');
});

test('insertTag preserves CRLF line endings', async () => {
  const { insertTag } = await import(pathToFileURL(SCRIPT).href);

  assert.equal(
    insertTag('export const x = true;\r\n', '#42'),
    '// @story #42\r\nexport const x = true;\r\n'
  );
});

test('tagger preserves a valid header with a later template shebang line', () => {
  const cwd = mkdtempOutsideRepo('tag-story-template-shebang-');
  const content = '// @story #42\nconst x = `\n#!/usr/bin/env node\n`;\n';
  const fixture = write(cwd, 'scripts/gh/template-shebang.test.mjs', content);

  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Tagged: 0, Fixed shebang order: 0, Skipped \(already correct\): 1/);
  assert.equal(readFileSync(fixture, 'utf8'), content);
});

test('non-git sandbox: fixes misplaced tags and discovers co-located tests', () => {
  const cwd = mkdtempOutsideRepo('tag-story-plain-');

  // The canonical tree, a co-located test, and the legacy providers tree all
  // exist so discovery cannot be constrained by any historical root list.
  const misplaced = write(
    cwd,
    'scripts/tests/unit/a-misplaced.test.mjs',
    '// @story #5\n#!/usr/bin/env node\nconsole.log(1)\n'
  );
  const tagged = write(
    cwd,
    'scripts/providers/tests/b-tagged.test.mjs',
    '// @story #7\nconsole.log(2)\n'
  );
  const shebang = write(
    cwd,
    'scripts/tests/unit/c-shebang.test.mjs',
    '#!/usr/bin/env node\nconsole.log(3)\n'
  );
  const taggedShebang = write(
    cwd,
    'scripts/gh/c-tagged-shebang.test.mjs',
    '#!/usr/bin/env node\n// @story #8\nconsole.log(4)\n'
  );
  const coLocated = write(cwd, 'scripts/gh/d-colocated.test.mjs', 'export const x = 1;\n');
  const bodyStoryLiteral = write(
    cwd,
    'scripts/gh/e-malformed.test.mjs',
    'export const malformed = true;\n// @story #9\n'
  );
  const invalidShebangOrder = write(
    cwd,
    'scripts/gh/f-invalid-shebang-order.test.mjs',
    '// cspell:ignore metachar\n// @story #10\n#!/usr/bin/env node\nconsole.log(5)\n'
  );

  const res = run(cwd);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Tagged: 3, Fixed shebang order: 2, Skipped \(already correct\): 2/);
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

  // A correctly tagged shebang file remains byte-identical.
  assert.equal(
    readFileSync(taggedShebang, 'utf8'),
    '#!/usr/bin/env node\n// @story #8\nconsole.log(4)\n'
  );

  // A co-located untagged file gets the tag prepended on line 1.
  assert.equal(readFileSync(coLocated, 'utf8').split('\n')[0], '// @story #309');

  // A body comment that resembles a story tag remains in place; only the
  // missing header receives fallback attribution.
  assert.equal(
    readFileSync(bodyStoryLiteral, 'utf8'),
    '// @story #309\nexport const malformed = true;\n// @story #9\n'
  );

  // A shebang after the cspell/story header is moved ahead of both lines.
  assert.equal(
    readFileSync(invalidShebangOrder, 'utf8'),
    '#!/usr/bin/env node\n// cspell:ignore metachar\n// @story #10\nconsole.log(5)\n'
  );
});

test('git sandbox: resolves creation issue from git log; empty log falls back', () => {
  const cwd = mkdtempProjectIsolated('tag-story-git-');

  // Committed file whose creation commit message carries an issue ref.
  const committed = write(cwd, 'scripts/gh/e-committed.test.mjs', 'export const e = 1;\n');
  execFileSync('git', ['add', '-f', committed], { cwd, env: GIT_ENV });
  execFileSync('git', ['commit', '-q', '--no-verify', '-m', '#42 add e fixture'], {
    cwd,
    env: GIT_ENV,
  });

  // Uncommitted file in the other root → git log --diff-filter=A is empty → fallback.
  const uncommitted = write(
    cwd,
    'scripts/providers/tests/f-uncommitted.test.mjs',
    'export const f = 2;\n'
  );

  const res = run(cwd);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Tagged: 2/);

  assert.equal(readFileSync(committed, 'utf8').split('\n')[0], '// @story #42');
  assert.equal(readFileSync(uncommitted, 'utf8').split('\n')[0], '// @story #309');
});

test('git sandbox: preserves a body story literal and uses creation attribution', () => {
  const cwd = mkdtempProjectIsolated('tag-story-body-literal-');
  const literal = write(
    cwd,
    'scripts/gh/body-literal.test.mjs',
    'const example = `\n// @story #42\n`;\n'
  );
  execFileSync('git', ['add', '-f', literal], { cwd, env: GIT_ENV });
  execFileSync('git', ['commit', '-q', '--no-verify', '-m', '#77 add body literal fixture'], {
    cwd,
    env: GIT_ENV,
  });

  const result = run(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Tagged: 1/);
  assert.equal(
    readFileSync(literal, 'utf8'),
    '// @story #77\nconst example = `\n// @story #42\n`;\n'
  );
});
