#!/usr/bin/env node
// @story #1101
// Exercises scripts/maintenance/lint-article-citations.mjs — the lint that keeps
// article bibliographies free of relative repo paths. Importing the lint reaches a
// repo source module, so this test clears the #866 reach gate.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import {
  lintArticleCitations,
  lintBibliography,
  extractBibliographyLines,
  collectRepoCitations,
  countArticles,
  ARTICLES_DIR,
  REPO_ROOT,
} from '../../../../maintenance/lint-article-citations.mjs';

const ABS =
  'https://github.com/kburson/ai-task-manager/blob/trunk/docs/introduction/core-workflow.md';

// Write `{ name: contents }` into a fake `docs/articles` under `root`.
function seedArticles(root, files) {
  const dir = path.join(root, ARTICLES_DIR);
  mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), contents, 'utf8');
  }
}

function article({ bibliography = '', trailer = '' } = {}) {
  return [
    '# Title',
    '',
    'Body prose that links to ../another-article.md on purpose.',
    '',
    '## Bibliography',
    '',
    bibliography,
    '',
    trailer,
    '',
  ].join('\n');
}

test('a bibliography of absolute URLs is clean', () => {
  const root = mkdtempProjectIsolated('lint-article-citations-');
  seedArticles(root, {
    '00-first.md': article({ bibliography: `- AI Task Manager. "Core Workflow." ${ABS}` }),
  });
  assert.deepEqual(lintArticleCitations(root), []);
});

test('a relative citation target is reported with file and line', () => {
  const root = mkdtempProjectIsolated('lint-article-citations-');
  seedArticles(root, {
    '00-first.md': article({
      bibliography: '- AI Task Manager. "Core Workflow." ../introduction/core-workflow.md',
    }),
  });
  const offenders = lintArticleCitations(root);
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /^docs\/articles\/00-first\.md:7: relative citation target/);
  assert.match(offenders[0], /\.\.\/introduction\/core-workflow\.md/);
  assert.match(offenders[0], /blob\/trunk/);
});

test('a bare repo path is reported too', () => {
  const offenders = lintBibliography(
    'docs/articles/00-first.md',
    article({ bibliography: '- AI Task Manager. "Design." docs/DESIGN.md' })
  );
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /bare repo path `docs\/DESIGN\.md`/);
});

test('body prose outside the bibliography is invisible to the lint', () => {
  const root = mkdtempProjectIsolated('lint-article-citations-');
  seedArticles(root, {
    // The body's relative link sits above the heading; only absolute URLs below it.
    '00-first.md': article({ bibliography: `- AI Task Manager. "Core Workflow." ${ABS}` }),
  });
  assert.deepEqual(lintArticleCitations(root), []);
});

test('the section scan stops at the next `##` heading', () => {
  const lines = extractBibliographyLines(
    article({
      bibliography: `- AI Task Manager. "Core Workflow." ${ABS}`,
      trailer: '## Afterword\n\nSee ../introduction/core-workflow.md for more.',
    })
  );
  assert.ok(lines.length > 0);
  assert.ok(!lines.some((l) => l.text.includes('Afterword')));
  assert.ok(!lines.some((l) => l.text.includes('../introduction')));
});

test('non-numbered docs in the articles directory are not walked', () => {
  const root = mkdtempProjectIsolated('lint-article-citations-');
  seedArticles(root, {
    '00-first.md': article({ bibliography: `- AI Task Manager. "Core Workflow." ${ABS}` }),
    'linkedin-publishing-guide.md': article({
      bibliography: '- AI Task Manager. "Core Workflow." ../introduction/core-workflow.md',
    }),
    'README.md': article({
      bibliography: '- AI Task Manager. "Design." ../DESIGN.md',
    }),
  });
  assert.deepEqual(lintArticleCitations(root), []);
  assert.equal(countArticles(root), 1);
});

test('a missing articles directory is reported rather than passing silently', () => {
  const root = mkdtempProjectIsolated('lint-article-citations-');
  const offenders = lintArticleCitations(root);
  assert.equal(offenders.length, 1);
  assert.match(offenders[0], /^docs\/articles: cannot read/);
});

test('the live corpus is clean', () => {
  assert.deepEqual(lintArticleCitations(REPO_ROOT), []);
});

// AC2 — shape alone is not enough: a typo'd path lints clean. Resolve every live
// citation back to a repo path and prove the file is present and git-tracked.
test('every live citation resolves to a tracked repo file', () => {
  const citations = collectRepoCitations(REPO_ROOT);
  assert.ok(citations.length >= 22, `expected the full corpus, saw ${citations.length}`);

  const tracked = new Set(
    execFileSync('git', ['ls-files', '--', 'docs'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  );

  for (const { rel, lineNo, target } of citations) {
    assert.ok(
      existsSync(path.join(REPO_ROOT, target)),
      `${rel}:${lineNo}: citation target ${target} does not exist`
    );
    assert.ok(
      tracked.has(target),
      `${rel}:${lineNo}: citation target ${target} is not git-tracked`
    );
  }
});
