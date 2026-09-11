#!/usr/bin/env node
// @story #1580 #1581

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MARKDOWNLINT = path.join(
  REPO_ROOT,
  'node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs'
);
const REVIEWER_IGNORE_GLOB = 'docs/superpowers/reviews/**/*-reviewer-*-review.md';
const DISPLACED_REVIEW_PATHS = [
  'docs/superpowers/reviews/1381/plan/2026-08-23-1381-governed-delivery-convergence-r3-reviewer-claude-review.md',
  'docs/superpowers/reviews/1219/plan/2026-09-04-1219-continuous-agent-delivery-amendment-r7-reviewer-claude-review.md',
  'docs/superpowers/reviews/1219/spec/2026-09-04-1219-continuous-agent-delivery-amendment-design-r5-reviewer-claude-review.md',
  'docs/superpowers/reviews/1578/plan/2026-09-10-1578-package-boundary-ceiling-r2-reviewer-claude-review.md',
  'docs/superpowers/reviews/1578/plan/2026-09-10-1578-package-boundary-ceiling-r4-reviewer-claude-review.md',
];

function runMarkdownlint(cwd, relativePath) {
  const result = spawnSync(process.execPath, [MARKDOWNLINT, '--no-globs', `:${relativePath}`], {
    cwd,
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout || ''}\n${result.stderr || ''}` };
}

test('Markdownlint replaces every exact reviewer exception with one role-based policy', () => {
  const config = JSON.parse(readFileSync(path.join(REPO_ROOT, '.markdownlint-cli2.jsonc')));
  const digestFixture = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'scripts/tests/fixtures/legacy-review-archive-sha256.json'))
  );
  const digestByPath = new Map(digestFixture.files.map((entry) => [entry.path, entry.sha256]));
  const workflow = readFileSync(path.join(REPO_ROOT, 'docs/guides/workflow.md'), 'utf8');

  assert.ok(
    !config.ignores.includes('docs/superpowers/reviews/**'),
    'the governed review archive must not be ignored broadly'
  );
  assert.deepEqual(
    config.ignores.filter((entry) => entry.includes('/reviews/') && entry.includes('-reviewer-')),
    [REVIEWER_IGNORE_GLOB]
  );
  assert.match(workflow, new RegExp(REVIEWER_IGNORE_GLOB.replaceAll('*', '\\*')));
  assert.match(workflow, /owner responses[\s\S]*remain author-controlled/);

  for (const reviewPath of DISPLACED_REVIEW_PATHS) {
    const expectedHash = digestByPath.get(reviewPath);
    assert.ok(expectedHash, `legacy digest fixture must include ${reviewPath}`);
    const bytes = readFileSync(path.join(REPO_ROOT, reviewPath));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      expectedHash,
      `immutable reviewer artifact changed: ${reviewPath}`
    );
  }
});

test('Markdownlint ignores reviewer bytes but still reports an equivalent owner response', () => {
  const fixture = mkdtempProjectIsolated('markdownlint-reviewer-policy-');
  try {
    writeFileSync(path.join(fixture, '.gitignore'), '');
    copyFileSync(
      path.join(REPO_ROOT, '.markdownlint-cli2.jsonc'),
      path.join(fixture, '.markdownlint-cli2.jsonc')
    );

    const archive = path.join(fixture, 'docs/superpowers/reviews/999/plan');
    mkdirSync(archive, { recursive: true });
    const reviewerPath = 'docs/superpowers/reviews/999/plan/example-r1-reviewer-claude-review.md';
    const ownerPath = 'docs/superpowers/reviews/999/plan/example-r1-owner-codex-response.md';
    const invalidMarkdown = '# Evidence\n\nQuoted token: ` spaced`\n';
    writeFileSync(path.join(fixture, reviewerPath), invalidMarkdown);
    writeFileSync(path.join(fixture, ownerPath), invalidMarkdown);

    const reviewer = runMarkdownlint(fixture, reviewerPath);
    assert.equal(reviewer.status, 0, reviewer.output);
    assert.match(reviewer.output, /Summary: 0 issues in 0 files/);

    const owner = runMarkdownlint(fixture, ownerPath);
    assert.equal(owner.status, 1, owner.output);
    assert.match(owner.output, new RegExp(ownerPath));
    assert.match(owner.output, /MD038/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
