// @chore
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { parseArticle } from '../../../../../articles/lib/parse-article.mjs';
import { parseBibliography } from '../../../../../articles/lib/book/footnotes.mjs';
import { buildManuscript } from '../../../../../articles/lib/book/manuscript.mjs';
import { scanSections } from '../../../../../articles/lib/book/markers.mjs';
import { listSpine } from '../../../../../articles/lib/book/spine.mjs';
import { applyBookStrip } from '../../../../../articles/lib/book/strip.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../../..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'docs', 'articles');
const BOOK_DIR = path.join(ARTICLES_DIR, 'assets', 'book');

test('the live corpus composes into a manuscript', async () => {
  const built = await buildManuscript({
    articlesDir: ARTICLES_DIR,
    bookDir: BOOK_DIR,
    target: 'manuscript',
  });

  assert.equal(built.chapters, 15, `expected the drafted series, got ${built.chapters} chapters`);
  assert.equal(built.chapterImages.length, 15, 'every live chapter has one opener image');
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

test('every bibliography list item in the corpus becomes a parsed entry', async () => {
  const spine = await listSpine(ARTICLES_DIR);
  let listItems = 0;
  let parsed = 0;

  for (const entry of spine) {
    const start = entry.source.indexOf('\n## Bibliography\n');
    if (start === -1) continue;
    const rest = entry.source
      .slice(start + 1)
      .split('\n')
      .slice(1);
    const end = rest.findIndex((line) => line.startsWith('## '));
    const section = end === -1 ? rest : rest.slice(0, end);
    listItems += section.filter((line) => /^[-*+] /.test(line)).length;

    const article = parseArticle(entry.source, { keepComments: true });
    const scanned = scanSections(article.sections, entry.file);
    const { bibliographyLines } = applyBookStrip(scanned);
    parsed += parseBibliography(bibliographyLines, entry.file).length;
  }

  assert.ok(listItems > 100, `expected the full corpus of citations, counted ${listItems}`);
  assert.equal(parsed, listItems, 'no bibliography entry is dropped');
});

test('the Sources appendix carries every citation in the corpus', async () => {
  const { markdown } = await buildManuscript({
    articlesDir: ARTICLES_DIR,
    bookDir: BOOK_DIR,
    target: 'manuscript',
  });
  const spine = await listSpine(ARTICLES_DIR);
  const sources = markdown.slice(markdown.indexOf('# Sources'));

  const urls = new Set();
  for (const entry of spine) {
    const article = parseArticle(entry.source, { keepComments: true });
    const scanned = scanSections(article.sections, entry.file);
    const { bibliographyLines } = applyBookStrip(scanned);
    for (const parsedEntry of parseBibliography(bibliographyLines, entry.file)) {
      if (parsedEntry.url) urls.add(parsedEntry.url);
      else assert.ok(sources.includes(parsedEntry.raw), `missing source: ${parsedEntry.raw}`);
    }
  }
  for (const url of urls) assert.ok(sources.includes(url), `missing source url: ${url}`);
});

test('chapter one carries footnotes sourced from its own bibliography', async () => {
  const { markdown } = await buildManuscript({
    articlesDir: ARTICLES_DIR,
    bookDir: BOOK_DIR,
    target: 'pdf',
  });
  const definitions = [...markdown.matchAll(/^\[\^c01-\d+\]: (.*)$/gm)].map((m) => m[1]);
  assert.ok(definitions.length > 0, 'chapter one cites sources');
  for (const text of definitions) {
    assert.match(
      text,
      /"/,
      `footnote fell back to a bare label instead of its bibliography entry: ${text}`
    );
  }
});

test('epub and html carry no latex, and the pdf keeps its index out of the appendices', async () => {
  for (const target of ['epub', 'html']) {
    const { markdown } = await buildManuscript({
      articlesDir: ARTICLES_DIR,
      bookDir: BOOK_DIR,
      target,
    });
    for (const token of ['\\index{', '\\newpage', '\\part{', '\\appendix', '\\printindex']) {
      assert.equal(markdown.includes(token), false, `${target} leaked ${token}`);
    }
    assert.match(markdown, /<div class="chapter-number">Chapter 1<\/div>/);
  }

  const manuscript = await buildManuscript({
    articlesDir: ARTICLES_DIR,
    bookDir: BOOK_DIR,
    target: 'manuscript',
  });
  assert.equal(
    manuscript.markdown.includes('\\'),
    false,
    'the manuscript contains no latex at all'
  );

  const pdf = await buildManuscript({
    articlesDir: ARTICLES_DIR,
    bookDir: BOOK_DIR,
    target: 'pdf',
  });
  assert.equal(/^# Index$/m.test(pdf.markdown), false, 'the index is not an appendix chapter');
  assert.match(pdf.markdown, /\\printindex/);
  assert.ok(
    pdf.markdown.indexOf('\\mainmatter') <
      pdf.markdown.indexOf('\\bookchapter{chapter-01-header.png}'),
    'chapter one is the first main-matter chapter'
  );
});

test('no html comment survives into any target', async () => {
  for (const target of ['manuscript', 'pdf', 'epub', 'html']) {
    const { markdown } = await buildManuscript({
      articlesDir: ARTICLES_DIR,
      bookDir: BOOK_DIR,
      target,
    });
    const comments = [...markdown.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1].trim());
    assert.deepEqual(comments, [], `${target} shipped an html comment`);
  }
});
