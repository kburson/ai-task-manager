// @story #310
// cspell:ignore nohup
// Tests for scripts/task-tracker/activity-policy.mjs
//
// Covers:
//   - classifyEdit: code globs, doc globs, WRITE_ISSUE, excludes, fallthrough.
//   - classifyBash: test runners, build commands, git commit, redirects/tee/heredoc,
//                   READ_*, doc-vs-code precedence for write targets.
//   - isAllowed: every documented (state, class) pair from epic #61 + no-active-task.
//   - loadPolicy: file present, file missing, file invalid.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import path from 'node:path';

import {
  DEFAULT_POLICY,
  STATE_MATRIX,
  classifyEdit,
  classifyBash,
  isAllowed,
  loadPolicy,
} from '../../../activity-policy.mjs';

// ---------------------------------------------------------------------------
// classifyEdit
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// classifyBash
// ---------------------------------------------------------------------------

test('classifyBash: test runners', () => {
  assert.equal(classifyBash('npm test'), 'RUN_TESTS');
  assert.equal(classifyBash('npm run test'), 'RUN_TESTS');
  assert.equal(classifyBash('npm run test -- --watch'), 'RUN_TESTS');
  assert.equal(classifyBash('node --test'), 'RUN_TESTS');
  assert.equal(classifyBash('pytest tests/'), 'RUN_TESTS');
  assert.equal(classifyBash('cargo test'), 'RUN_TESTS');
  assert.equal(classifyBash('go test ./...'), 'RUN_TESTS');
});

test('classifyBash: build commands', () => {
  assert.equal(classifyBash('npm run build'), 'RUN_BUILD');
  assert.equal(classifyBash('tsc'), 'RUN_BUILD');
  assert.equal(classifyBash('tsc -p .'), 'RUN_BUILD');
  assert.equal(classifyBash('cargo build --release'), 'RUN_BUILD');
  assert.equal(classifyBash('go build ./...'), 'RUN_BUILD');
});

test('classifyBash: git commit', () => {
  for (const command of [
    'git commit -m "msg"',
    'git commit -am quick',
    'env -u FOO git commit -m x',
    'env sh -lc "git commit -m x"',
    'sh -lc "git commit -m x"',
    'exec git commit -m x',
    'time git commit -m x',
    'nice -n 5 git commit -m x',
    'nice -5 git commit -m x',
    'nohup git commit -m x',
    '{ git commit -m x; }',
    '! git commit -m x',
    'if true; then git commit -m x; fi',
    'cat <(git commit -m x)',
  ]) {
    assert.equal(classifyBash(command), 'COMMIT_CODE', command);
  }
});

test('classifyBash: READ_* for benign commands', () => {
  assert.equal(classifyBash('ls -la'), 'READ_*');
  assert.equal(classifyBash('cat src/foo.ts'), 'READ_*');
  assert.equal(classifyBash('grep -r foo src/'), 'READ_*');
  assert.equal(classifyBash('git status'), 'READ_*');
  assert.equal(classifyBash('git log --oneline'), 'READ_*');
});

test('classifyBash: redirect write target classified by path', () => {
  assert.equal(classifyBash('echo hi > src/foo.ts'), 'WRITE_CODE');
  assert.equal(classifyBash('echo hi >> docs/x.md'), 'WRITE_DOCS');
  assert.equal(classifyBash('cat src/foo.ts > /tmp/x'), 'WRITE_OTHER');
});

test('classifyBash: tee write target', () => {
  assert.equal(classifyBash('echo x | tee src/foo.ts'), 'WRITE_CODE');
  assert.equal(classifyBash('echo x | tee -a docs/notes.md'), 'WRITE_DOCS');
  assert.equal(classifyBash('echo x | tee .tmp/safe src/foo.ts'), 'WRITE_CODE');
});

test('classifyBash: heredoc write target', () => {
  // Heredoc-to-file with redirect operator.
  assert.equal(classifyBash("cat <<'EOF' > src/foo.ts\nbody\nEOF"), 'WRITE_CODE');
});

test('classifyBash: shell metachars inside quoted args do not trigger write detection', () => {
  // `<pkg-version>` inside a single-quoted label looks like a redirect but
  // must be ignored. Regression for /task check labels containing HTML-style
  // markers.
  assert.equal(
    classifyBash("node scripts/task-tracker/task-tracker.mjs check 'marker <pkg-version> stamped'"),
    'READ_*'
  );
  // Double-quoted variant.
  assert.equal(
    classifyBash('node scripts/task-tracker/task-tracker.mjs check "label with > and >> inside"'),
    'READ_*'
  );
  // Real redirect outside quotes still detected.
  assert.equal(classifyBash("echo 'inside > quotes' > src/real.ts"), 'WRITE_CODE');
});

test('classifyBash: touch/mkdir code path', () => {
  assert.equal(classifyBash('touch src/new.ts'), 'WRITE_CODE');
  assert.equal(classifyBash('mkdir -p docs/sub'), 'WRITE_DOCS');
  assert.equal(classifyBash('touch .tmp/safe src/new.ts'), 'WRITE_CODE');
  assert.equal(classifyBash('rm .tmp/safe docs/removed.md'), 'WRITE_DOCS');
  assert.equal(classifyBash("printf '%s' 'touch' 'src/not-a-command.ts'"), 'READ_*');
});

test('classifyBash: intended scratch-only writes are allowed but source targets remain code', () => {
  for (const command of [
    'cp src/input.mjs .tmp/inspect/output.mjs',
    'touch .tmp/inspect/touched.mjs',
    'install -m 755 src/input.mjs .tmp/inspect/installed.mjs',
    'mkdir -m 755 .tmp/inspect/directory',
    'printf x >| .tmp/inspect/clobbered.txt',
    "find . -exec sh -c 'touch .tmp/inspect/found.txt' {} +",
    'find .tmp/inspect -delete',
  ]) {
    assert.equal(classifyBash(command), 'READ_*', command);
  }

  for (const command of [
    'cp .tmp/inspect/input.mjs src/output.mjs',
    'touch src/touched.mjs',
    'install -m 755 .tmp/inspect/input.mjs src/installed.mjs',
    'mkdir -m 755 src/directory',
    'printf x >| src/clobbered.mjs',
    "find . -exec sh -c 'touch src/found.mjs' {} \\;",
    'find src -delete',
  ]) {
    assert.equal(classifyBash(command), 'WRITE_CODE', command);
  }
});

test('classifyBash: GitHub issue mutations are issue writes, not reads', () => {
  assert.equal(classifyBash('gh issue edit 1049 --add-label bug'), 'WRITE_ISSUE');
  assert.equal(classifyBash('gh issue reopen 1049'), 'WRITE_ISSUE');
});

// ---------------------------------------------------------------------------
// STATE_MATRIX + isAllowed
// ---------------------------------------------------------------------------

test('STATE_MATRIX: matches epic #61 allow-list verbatim', () => {
  assert.deepEqual([...STATE_MATRIX.backlog].sort(), ['READ_*', 'WRITE_ISSUE'].sort());
  assert.deepEqual([...STATE_MATRIX.refine].sort(), ['READ_*', 'WRITE_ISSUE'].sort());
  assert.deepEqual(
    [...STATE_MATRIX.plan].sort(),
    ['READ_*', 'RUN_TESTS', 'WRITE_DOCS', 'WRITE_ISSUE'].sort()
  );
  assert.deepEqual(
    [...STATE_MATRIX.develop].sort(),
    [
      'COMMIT_CODE',
      'READ_*',
      'RUN_BUILD',
      'RUN_TESTS',
      'WRITE_CODE',
      'WRITE_DOCS',
      'WRITE_ISSUE',
    ].sort()
  );
  assert.deepEqual(
    [...STATE_MATRIX.test].sort(),
    ['READ_*', 'RUN_BUILD', 'RUN_TESTS', 'WRITE_ISSUE'].sort()
  );
  assert.deepEqual([...STATE_MATRIX.review].sort(), ['READ_*', 'WRITE_DOCS', 'WRITE_ISSUE'].sort());
  assert.deepEqual([...STATE_MATRIX.done].sort(), ['READ_*'].sort());
});

test('isAllowed: every state allows READ_*', () => {
  for (const s of ['backlog', 'refine', 'plan', 'develop', 'test', 'review', 'done']) {
    assert.equal(isAllowed(s, 'READ_*'), true, `${s} should allow READ_*`);
  }
});

test('isAllowed: develop allows everything', () => {
  for (const c of [
    'WRITE_CODE',
    'COMMIT_CODE',
    'WRITE_DOCS',
    'WRITE_ISSUE',
    'RUN_TESTS',
    'RUN_BUILD',
    'READ_*',
  ]) {
    assert.equal(isAllowed('develop', c), true);
  }
});

// #281 AC3 + AC4 — Plan stage refuses WRITE_CODE (file writes) and
// COMMIT_CODE (git commits), but allows WRITE_DOCS / WRITE_ISSUE / RUN_TESTS
// / READ_*. The grandfather marker is deliberately NOT honored at this layer:
// AC3/AC4 are forward-looking gates, not legacy-artifact bypasses.
test('isAllowed: plan refuses WRITE_CODE / COMMIT_CODE / WRITE_OTHER / RUN_BUILD', () => {
  assert.equal(isAllowed('plan', 'WRITE_CODE'), false);
  assert.equal(isAllowed('plan', 'COMMIT_CODE'), false);
  assert.equal(isAllowed('plan', 'WRITE_OTHER'), false);
  assert.equal(isAllowed('plan', 'RUN_BUILD'), false);
  // Permitted in plan — planning docs, issue body edits, test runs.
  assert.equal(isAllowed('plan', 'WRITE_DOCS'), true);
  assert.equal(isAllowed('plan', 'WRITE_ISSUE'), true);
  assert.equal(isAllowed('plan', 'RUN_TESTS'), true);
  assert.equal(isAllowed('plan', 'READ_*'), true);
});

test('isAllowed: refine refuses WRITE_CODE / COMMIT_CODE / RUN_TESTS / RUN_BUILD', () => {
  assert.equal(isAllowed('refine', 'WRITE_CODE'), false);
  assert.equal(isAllowed('refine', 'COMMIT_CODE'), false);
  assert.equal(isAllowed('refine', 'WRITE_DOCS'), false);
  assert.equal(isAllowed('refine', 'RUN_TESTS'), false);
  assert.equal(isAllowed('refine', 'RUN_BUILD'), false);
});

test('isAllowed: test refuses WRITE_CODE; allows tests/build', () => {
  assert.equal(isAllowed('test', 'WRITE_CODE'), false);
  assert.equal(isAllowed('test', 'COMMIT_CODE'), false);
  assert.equal(isAllowed('test', 'WRITE_DOCS'), false);
  assert.equal(isAllowed('test', 'RUN_TESTS'), true);
  assert.equal(isAllowed('test', 'RUN_BUILD'), true);
  assert.equal(isAllowed('test', 'WRITE_ISSUE'), true);
});

test('isAllowed: review allows docs + issues only (no code)', () => {
  assert.equal(isAllowed('review', 'WRITE_DOCS'), true);
  assert.equal(isAllowed('review', 'WRITE_ISSUE'), true);
  assert.equal(isAllowed('review', 'WRITE_CODE'), false);
  assert.equal(isAllowed('review', 'COMMIT_CODE'), false);
  assert.equal(isAllowed('review', 'RUN_TESTS'), false);
});

test('isAllowed: done allows READ_* only', () => {
  assert.equal(isAllowed('done', 'READ_*'), true);
  for (const c of [
    'WRITE_CODE',
    'COMMIT_CODE',
    'WRITE_DOCS',
    'WRITE_ISSUE',
    'RUN_TESTS',
    'RUN_BUILD',
  ]) {
    assert.equal(isAllowed('done', c), false, `done should refuse ${c}`);
  }
});

test('isAllowed: no-active-task policy (state == null)', () => {
  assert.equal(isAllowed(null, 'WRITE_CODE'), false);
  assert.equal(isAllowed(null, 'COMMIT_CODE'), false);
  assert.equal(isAllowed(null, 'WRITE_DOCS'), true);
  assert.equal(isAllowed(null, 'WRITE_ISSUE'), true);
  assert.equal(isAllowed(null, 'RUN_TESTS'), true);
  assert.equal(isAllowed(null, 'RUN_BUILD'), true);
  assert.equal(isAllowed(null, 'READ_*'), true);
  assert.equal(isAllowed(undefined, 'WRITE_CODE'), false);
  assert.equal(isAllowed(undefined, 'WRITE_DOCS'), true);
});

test('isAllowed: unknown state refuses everything except READ_* via no-fallback', () => {
  // Unknown state is treated as not matching the matrix; refuse.
  assert.equal(isAllowed('bogus', 'WRITE_CODE'), false);
  assert.equal(isAllowed('bogus', 'WRITE_DOCS'), false);
  // READ_* still passes because READ_* is universally allowed (never blocked).
  assert.equal(isAllowed('bogus', 'READ_*'), true);
});

// ---------------------------------------------------------------------------
// loadPolicy
// ---------------------------------------------------------------------------

test('loadPolicy: missing file returns DEFAULT_POLICY', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'apolicy-'));
  const p = loadPolicy(dir);
  assert.deepEqual(p, DEFAULT_POLICY);
});

test('loadPolicy: present file is parsed', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'apolicy-'));
  mkdirSync(path.join(dir, '.ai-task-manager'));
  const custom = {
    codeGlobs: ['custom/**'],
    codeGlobExcludes: [],
    docGlobs: ['notes/**'],
    testRunners: ['mytest'],
    buildCommands: ['mybuild'],
  };
  writeFileSync(path.join(dir, '.ai-task-manager', 'activity-policy.json'), JSON.stringify(custom));
  const p = loadPolicy(dir);
  assert.deepEqual(p.codeGlobs, ['custom/**']);
  assert.deepEqual(p.testRunners, ['mytest']);
});

test('loadPolicy: invalid json falls back to DEFAULT_POLICY', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'apolicy-'));
  mkdirSync(path.join(dir, '.ai-task-manager'));
  writeFileSync(path.join(dir, '.ai-task-manager', 'activity-policy.json'), '{not-json');
  const p = loadPolicy(dir);
  assert.deepEqual(p, DEFAULT_POLICY);
});

// ---------------------------------------------------------------------------
// classifyEdit / classifyBash accept policy override
// ---------------------------------------------------------------------------

test('classifyEdit: respects custom policy', () => {
  const policy = {
    codeGlobs: ['app/**'],
    codeGlobExcludes: [],
    docGlobs: ['notes/**'],
    testRunners: [],
    buildCommands: [],
  };
  assert.equal(classifyEdit('app/main.ts', policy), 'WRITE_CODE');
  assert.equal(classifyEdit('notes/foo.md', policy), 'WRITE_DOCS');
  assert.equal(classifyEdit('src/foo.ts', policy), 'WRITE_OTHER');
});

test('classifyBash: respects custom policy testRunners/buildCommands', () => {
  const policy = {
    codeGlobs: ['src/**'],
    codeGlobExcludes: [],
    docGlobs: ['docs/**', '**/*.md'],
    testRunners: ['mytest'],
    buildCommands: ['mybuild'],
  };
  assert.equal(classifyBash('mytest --foo', policy), 'RUN_TESTS');
  assert.equal(classifyBash('mybuild release', policy), 'RUN_BUILD');
  assert.equal(classifyBash('npm test', policy), 'READ_*'); // not in custom testRunners
});
