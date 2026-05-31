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
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_POLICY,
  STATE_MATRIX,
  classifyEdit,
  classifyBash,
  isAllowed,
  loadPolicy,
} from '../activity-policy.mjs';

// ---------------------------------------------------------------------------
// classifyEdit
// ---------------------------------------------------------------------------

test('classifyEdit: code globs', () => {
  assert.equal(classifyEdit('src/foo.ts'), 'WRITE_CODE');
  assert.equal(classifyEdit('lib/util.js'), 'WRITE_CODE');
  assert.equal(classifyEdit('bin/cli.mjs'), 'WRITE_CODE');
  assert.equal(classifyEdit('scripts/foo.mjs'), 'WRITE_CODE');
  assert.equal(classifyEdit('scripts/nested/deep/file.js'), 'WRITE_CODE');
});

test('classifyEdit: codeGlobExcludes honored when configured', () => {
  const policy = {
    codeGlobs: ['scripts/**'],
    codeGlobExcludes: ['scripts/task-tracker/**', 'scripts/gh/**'],
    codeGlobReincludes: [],
    docGlobs: [],
    testRunners: [],
    buildCommands: [],
  };
  assert.equal(classifyEdit('scripts/task-tracker/foo.mjs', policy), 'WRITE_OTHER');
  assert.equal(classifyEdit('scripts/task-tracker/lib/bar.mjs', policy), 'WRITE_OTHER');
  assert.equal(classifyEdit('scripts/gh/baz.mjs', policy), 'WRITE_OTHER');
});

test('classifyEdit: codeGlobReincludes carve-out for tests under excluded paths', () => {
  const policy = {
    codeGlobs: ['scripts/**'],
    codeGlobExcludes: ['scripts/task-tracker/**', 'scripts/gh/**'],
    codeGlobReincludes: ['scripts/task-tracker/tests/**', 'scripts/gh/tests/**'],
    docGlobs: [],
    testRunners: [],
    buildCommands: [],
  };
  assert.equal(classifyEdit('scripts/task-tracker/tests/foo.test.mjs', policy), 'WRITE_CODE');
  assert.equal(classifyEdit('scripts/gh/tests/bar.test.mjs', policy), 'WRITE_CODE');
});

test('classifyEdit: doc globs', () => {
  assert.equal(classifyEdit('docs/notes.md'), 'WRITE_DOCS');
  assert.equal(classifyEdit('CLAUDE.md'), 'WRITE_DOCS');
  assert.equal(classifyEdit('README.md'), 'WRITE_DOCS');
  assert.equal(classifyEdit('any/path/README.md'), 'WRITE_DOCS');
  assert.equal(classifyEdit('.claude/plans/foo.md'), 'WRITE_DOCS');
  assert.equal(classifyEdit('docs/plans/2026.md'), 'WRITE_DOCS');
});

test('classifyEdit: WRITE_ISSUE for .github issue templates', () => {
  assert.equal(classifyEdit('.github/ISSUE_TEMPLATE/bug.md'), 'WRITE_ISSUE');
  assert.equal(classifyEdit('.github/ISSUE_TEMPLATE/feature.yml'), 'WRITE_ISSUE');
});

test('classifyEdit: doc-glob precedence over code-glob', () => {
  // `scripts/foo.md` matches both code (`scripts/**`) and docs (`**/*.md`); doc wins.
  assert.equal(classifyEdit('scripts/foo.md'), 'WRITE_DOCS');
});

test('classifyEdit: fallthrough', () => {
  assert.equal(classifyEdit('random/file.txt'), 'WRITE_OTHER');
  assert.equal(classifyEdit('tmp/x.json'), 'WRITE_OTHER');
});

test('classifyEdit: configGlobs — repo-root tooling config classifies as WRITE_CODE', () => {
  // Ignore lists
  assert.equal(classifyEdit('.gitignore'), 'WRITE_CODE');
  assert.equal(classifyEdit('.prettierignore'), 'WRITE_CODE');
  assert.equal(classifyEdit('.eslintignore'), 'WRITE_CODE');
  assert.equal(classifyEdit('.markdownlintignore'), 'WRITE_CODE');
  // Editor / runtime version pins
  assert.equal(classifyEdit('.editorconfig'), 'WRITE_CODE');
  assert.equal(classifyEdit('.npmrc'), 'WRITE_CODE');
  assert.equal(classifyEdit('.nvmrc'), 'WRITE_CODE');
  assert.equal(classifyEdit('.node-version'), 'WRITE_CODE');
  // Linter / formatter configs
  assert.equal(classifyEdit('eslint.config.mjs'), 'WRITE_CODE');
  assert.equal(classifyEdit('eslint.config.js'), 'WRITE_CODE');
  assert.equal(classifyEdit('prettier.config.mjs'), 'WRITE_CODE');
  assert.equal(classifyEdit('.prettierrc'), 'WRITE_CODE');
  assert.equal(classifyEdit('.prettierrc.json'), 'WRITE_CODE');
  assert.equal(classifyEdit('cspell.json'), 'WRITE_CODE');
  assert.equal(classifyEdit('cspell.config.yaml'), 'WRITE_CODE');
  assert.equal(classifyEdit('markdownlint.json'), 'WRITE_CODE');
  assert.equal(classifyEdit('.markdownlint.json'), 'WRITE_CODE');
  // TS / JS configs
  assert.equal(classifyEdit('tsconfig.json'), 'WRITE_CODE');
  assert.equal(classifyEdit('tsconfig.build.json'), 'WRITE_CODE');
  assert.equal(classifyEdit('jsconfig.json'), 'WRITE_CODE');
  // Package manifests / lock files
  assert.equal(classifyEdit('package.json'), 'WRITE_CODE');
  assert.equal(classifyEdit('package-lock.json'), 'WRITE_CODE');
  assert.equal(classifyEdit('pnpm-lock.yaml'), 'WRITE_CODE');
  assert.equal(classifyEdit('yarn.lock'), 'WRITE_CODE');
  // Claude settings
  assert.equal(classifyEdit('.claude/settings.json'), 'WRITE_CODE');
  assert.equal(classifyEdit('.claude/settings.local.json'), 'WRITE_CODE');
});

test('loadPolicy: configGlobs override propagates from project-local file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aitm-policy-cfg-'));
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(dir, '.ai-task-manager', 'activity-policy.json'),
    JSON.stringify({ configGlobs: ['custom.config.*'] })
  );
  const p = loadPolicy(dir);
  assert.deepEqual(p.configGlobs, ['custom.config.*']);
  // Other keys fall back to defaults.
  assert.deepEqual(p.codeGlobs, DEFAULT_POLICY.codeGlobs);
});

test('loadPolicy: missing configGlobs falls back to defaults', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aitm-policy-cfg2-'));
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(dir, '.ai-task-manager', 'activity-policy.json'),
    JSON.stringify({ codeGlobs: ['src/**'] })
  );
  const p = loadPolicy(dir);
  assert.deepEqual(p.configGlobs, DEFAULT_POLICY.configGlobs);
});

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
  assert.equal(classifyBash('git commit -m "msg"'), 'COMMIT_CODE');
  assert.equal(classifyBash('git commit -am quick'), 'COMMIT_CODE');
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
  const dir = mkdtempSync(path.join(tmpdir(), 'apolicy-'));
  const p = loadPolicy(dir);
  assert.deepEqual(p, DEFAULT_POLICY);
});

test('loadPolicy: present file is parsed', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'apolicy-'));
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
  const dir = mkdtempSync(path.join(tmpdir(), 'apolicy-'));
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
