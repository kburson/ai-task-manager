// @chore
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { buildManuscript } from '../../../../articles/lib/book/manuscript.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'docs', 'articles');
const BOOK_DIR = path.join(ARTICLES_DIR, 'assets', 'book');

test('the live corpus composes into a manuscript', async () => {
  const built = await buildManuscript({
    articlesDir: ARTICLES_DIR,
    bookDir: BOOK_DIR,
    target: 'manuscript',
  });

  assert.ok(built.chapters >= 15, `expected the drafted series, got ${built.chapters} chapters`);
  assert.ok(built.footnotes > 0, 'the series cites sources; footnotes must exist');
  assert.ok(built.indexTerms > 0, 'the glossary terms should appear somewhere in the prose');
});

test('the composed manuscript leaks no markers, captions, or relative paths', async () => {
  const { markdown } = await buildManuscript({
    articlesDir: ARTICLES_DIR,
    bookDir: BOOK_DIR,
    target: 'manuscript',
  });

  assert.equal(markdown.includes('book:'), false, 'a marker survived into the manuscript');
  assert.equal(/_Part \d+ of a series/.test(markdown), false, 'a series caption survived');
  assert.equal(markdown.includes('## Series Link'), false);
  assert.equal(markdown.includes('## Series Roadmap'), false);
  assert.equal(markdown.includes('## LinkedIn Article Shape'), false);
  assert.equal(
    /\]\((?!https?:|#)[^)]+\)/.test(markdown.replace(/^!\[.*$/gm, '')),
    false,
    'a relative link survived and would be dead on paper'
  );
});
