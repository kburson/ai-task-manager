#!/usr/bin/env node
// @story #1219 #1580 #1581
// cspell:ignore Protocolwordzz

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
const CSPELL = path.join(REPO_ROOT, 'node_modules/cspell/bin.mjs');
const REVIEWER_IGNORE_GLOB = 'docs/superpowers/reviews/**/*-reviewer-*-review.md';
const PEER_REVIEW_RESPONSE_IGNORE_GLOBS = [
  'docs/superpowers/reviews/**/*-review-*-author-response-*.md',
  'docs/superpowers/reviews/**/*-review-*-reviewer-response-*.md',
];
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

function runCspell(cwd, relativePath) {
  const result = spawnSync(process.execPath, [CSPELL, '--no-progress', relativePath], {
    cwd,
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout || ''}\n${result.stderr || ''}` };
}

test('Markdownlint replaces every exact reviewer exception with one role-based policy', () => {
  const config = JSON.parse(readFileSync(path.join(REPO_ROOT, '.markdownlint-cli2.jsonc')));
  const cspellConfig = JSON.parse(readFileSync(path.join(REPO_ROOT, 'cspell.json')));
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
    [REVIEWER_IGNORE_GLOB, PEER_REVIEW_RESPONSE_IGNORE_GLOBS[1]]
  );
  assert.deepEqual(
    config.ignores.filter((entry) => entry.includes('/reviews/') && entry.includes('-response-')),
    PEER_REVIEW_RESPONSE_IGNORE_GLOBS
  );
  assert.match(workflow, new RegExp(REVIEWER_IGNORE_GLOB.replaceAll('*', '\\*')));
  for (const ignoreGlob of PEER_REVIEW_RESPONSE_IGNORE_GLOBS) {
    assert.match(workflow, new RegExp(ignoreGlob.replaceAll('*', '\\*')));
    assert.ok(cspellConfig.ignorePaths.includes(ignoreGlob));
  }
  assert.match(workflow, /legacy[\s\S]*owner[\s\S]*responses[\s\S]*remain author-controlled/);

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

test('Markdownlint ignores sealed ai-peer-review responses but still governs legacy owner responses', () => {
  const fixture = mkdtempProjectIsolated('markdownlint-peer-review-policy-');
  try {
    writeFileSync(path.join(fixture, '.gitignore'), '');
    copyFileSync(
      path.join(REPO_ROOT, '.markdownlint-cli2.jsonc'),
      path.join(fixture, '.markdownlint-cli2.jsonc')
    );

    const archive = path.join(fixture, 'docs/superpowers/reviews/999/spec');
    mkdirSync(archive, { recursive: true });
    const authorPath =
      'docs/superpowers/reviews/999/spec/example-review-review-0123456789abcdef0123456789abcdef-author-response-1.md';
    const reviewerPath =
      'docs/superpowers/reviews/999/spec/example-review-review-0123456789abcdef0123456789abcdef-reviewer-response-1.md';
    const legacyOwnerPath = 'docs/superpowers/reviews/999/spec/example-r1-owner-codex-response.md';
    const invalidMarkdown = '# Evidence\n\nQuoted token: ` spaced`\n';
    writeFileSync(path.join(fixture, authorPath), invalidMarkdown);
    writeFileSync(path.join(fixture, reviewerPath), invalidMarkdown);
    writeFileSync(path.join(fixture, legacyOwnerPath), invalidMarkdown);

    for (const responsePath of [authorPath, reviewerPath]) {
      const response = runMarkdownlint(fixture, responsePath);
      assert.equal(response.status, 0, response.output);
      assert.match(response.output, /Summary: 0 issues in 0 files/);
    }

    const legacyOwner = runMarkdownlint(fixture, legacyOwnerPath);
    assert.equal(legacyOwner.status, 1, legacyOwner.output);
    assert.match(legacyOwner.output, new RegExp(legacyOwnerPath));
    assert.match(legacyOwner.output, /MD038/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('CSpell ignores sealed ai-peer-review responses but still governs legacy owner responses', () => {
  const fixture = mkdtempProjectIsolated('cspell-peer-review-policy-');
  try {
    writeFileSync(path.join(fixture, '.gitignore'), '');
    copyFileSync(path.join(REPO_ROOT, 'cspell.json'), path.join(fixture, 'cspell.json'));
    copyFileSync(
      path.join(REPO_ROOT, 'cspell-dictionary.txt'),
      path.join(fixture, 'cspell-dictionary.txt')
    );

    const archive = path.join(fixture, 'docs/superpowers/reviews/999/spec');
    mkdirSync(archive, { recursive: true });
    const authorPath =
      'docs/superpowers/reviews/999/spec/example-review-review-0123456789abcdef0123456789abcdef-author-response-1.md';
    const reviewerPath =
      'docs/superpowers/reviews/999/spec/example-review-review-0123456789abcdef0123456789abcdef-reviewer-response-1.md';
    const legacyOwnerPath = 'docs/superpowers/reviews/999/spec/example-r1-owner-codex-response.md';
    const misspelling = '# Evidence\n\nProtocolwordzz\n';
    writeFileSync(path.join(fixture, authorPath), misspelling);
    writeFileSync(path.join(fixture, reviewerPath), misspelling);
    writeFileSync(path.join(fixture, legacyOwnerPath), misspelling);

    for (const responsePath of [authorPath, reviewerPath]) {
      const response = runCspell(fixture, responsePath);
      assert.match(response.output, /Files checked: 0/);
      assert.doesNotMatch(response.output, /Protocolwordzz/);
    }

    const legacyOwner = runCspell(fixture, legacyOwnerPath);
    assert.equal(legacyOwner.status, 1, legacyOwner.output);
    assert.match(legacyOwner.output, /Protocolwordzz/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
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
