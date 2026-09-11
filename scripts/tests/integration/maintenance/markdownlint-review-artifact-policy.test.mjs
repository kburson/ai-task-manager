#!/usr/bin/env node
// @story #1580

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import assert from 'node:assert/strict';
import test from 'node:test';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MARKDOWNLINT = path.join(
  REPO_ROOT,
  'node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs'
);
const REVIEW_FILES = [
  {
    path: 'docs/superpowers/reviews/1578/plan/2026-09-10-1578-package-boundary-ceiling-r2-reviewer-claude-review.md',
    sha256: 'b0cffbbadf279230590bfa9295aed21c44ca8e8474d5714b6375710bbdeb0416',
  },
  {
    path: 'docs/superpowers/reviews/1578/plan/2026-09-10-1578-package-boundary-ceiling-r4-reviewer-claude-review.md',
    sha256: 'ea86a94e36f9bf907921278cd43f691f84f90fe3dba975fa43a893c8d098ff1d',
  },
];

test('Markdownlint excludes the byte-preserved #1578 reviewer responses exactly', () => {
  const config = JSON.parse(readFileSync(path.join(REPO_ROOT, '.markdownlint-cli2.jsonc')));

  assert.ok(
    !config.ignores.includes('docs/superpowers/reviews/**'),
    'the governed review archive must not be ignored broadly'
  );

  for (const review of REVIEW_FILES) {
    assert.ok(
      config.ignores.includes(review.path),
      `markdownlint must ignore exact immutable reviewer artifact: ${review.path}`
    );
    const bytes = readFileSync(path.join(REPO_ROOT, review.path));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      review.sha256,
      `immutable reviewer artifact changed: ${review.path}`
    );
  }

  const lint = spawnSync(
    process.execPath,
    [MARKDOWNLINT, '--no-globs', ...REVIEW_FILES.map((review) => `:${review.path}`)],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  assert.equal(lint.status, 0, `${lint.stdout || ''}\n${lint.stderr || ''}`);
});
