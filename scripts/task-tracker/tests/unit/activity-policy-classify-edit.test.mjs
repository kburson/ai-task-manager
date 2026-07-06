// @story #310
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
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import path from 'node:path';

import {
  DEFAULT_POLICY,
  STATE_MATRIX,
  classifyEdit,
  classifyBash,
  isAllowed,
  loadPolicy,
} from '../../activity-policy.mjs';

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

test('classifyEdit: deployGlobs — repo-root container/deploy files classify as WRITE_CODE', () => {
  assert.equal(classifyEdit('Dockerfile'), 'WRITE_CODE');
  assert.equal(classifyEdit('Dockerfile.prod'), 'WRITE_CODE');
  assert.equal(classifyEdit('Dockerfile.dev'), 'WRITE_CODE');
  assert.equal(classifyEdit('web.dockerfile'), 'WRITE_CODE');
  assert.equal(classifyEdit('.dockerignore'), 'WRITE_CODE');
  assert.equal(classifyEdit('Containerfile'), 'WRITE_CODE');
  assert.equal(classifyEdit('compose.yml'), 'WRITE_CODE');
  assert.equal(classifyEdit('compose.yaml'), 'WRITE_CODE');
  assert.equal(classifyEdit('docker-compose.yml'), 'WRITE_CODE');
  assert.equal(classifyEdit('docker-compose.yaml'), 'WRITE_CODE');
  assert.equal(classifyEdit('nginx.conf'), 'WRITE_CODE');
});

test('classifyEdit: deployGlobs in DEFAULT_POLICY', () => {
  assert.ok(DEFAULT_POLICY.deployGlobs.includes('Dockerfile'));
  assert.ok(DEFAULT_POLICY.deployGlobs.includes('.dockerignore'));
});

test('classifyEdit: doc precedence still wins over deployGlobs', () => {
  // A markdown note about a Dockerfile is docs, not code — docGlobs is
  // checked before deployGlobs.
  assert.equal(classifyEdit('Dockerfile.md'), 'WRITE_DOCS');
});

test('loadPolicy: configGlobs override propagates from project-local file', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-policy-cfg-'));
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
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-policy-cfg2-'));
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(dir, '.ai-task-manager', 'activity-policy.json'),
    JSON.stringify({ codeGlobs: ['src/**'] })
  );
  const p = loadPolicy(dir);
  assert.deepEqual(p.configGlobs, DEFAULT_POLICY.configGlobs);
});
