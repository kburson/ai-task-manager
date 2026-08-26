// @chore
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { buildManuscript } from '../../../../../articles/lib/book/manuscript.mjs';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';

const ARTICLE_ONE = `# First Chapter

<!-- book:part title="Beginnings" -->

**First Subtitle**

![First Chapter](assets/article-headers/article-01-header.png)
_Part 1 of a series of articles on Agentic Agile Delivery_

Opening prose about an evidence gate and a [report](https://dora.dev/x/).

## Body One

More prose, see [Second](02-second.md).

## Series Link

The next article continues.

## Bibliography

- DORA. "A Report." https://dora.dev/x/
`;

const ARTICLE_TWO = `# Second Chapter

<!-- book:merge-into-previous -->

**Second Subtitle**

![Second Chapter](assets/article-headers/article-02-header.png)
_Part 2 of a series of articles on Agentic Agile Delivery_

<!-- book:include path=fragments/bridge.md -->

Second prose citing the same [report](https://dora.dev/x/).

## Body Two

Deeper text.

## Series Link

Done.

## Bibliography

- DORA. "A Report." https://dora.dev/x/
`;

const GLOSSARY = `# Glossary

## Evidence gate

_Aliases:_ evidence gates

A transition check that requires observable proof before work advances.
`;

async function fixture() {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'manuscript-'));
  const articlesDir = path.join(root, 'articles');
  const bookDir = path.join(articlesDir, 'assets', 'book');
  const headersDir = path.join(articlesDir, 'assets', 'article-headers');
  await mkdir(path.join(bookDir, 'fragments'), { recursive: true });
  await mkdir(headersDir, { recursive: true });
  await writeFile(path.join(articlesDir, '01-first.md'), ARTICLE_ONE);
  await writeFile(path.join(articlesDir, '02-second.md'), ARTICLE_TWO);
  await writeFile(path.join(headersDir, 'article-01-header.png'), 'first image');
  await writeFile(path.join(headersDir, 'article-02-header.png'), 'second image');
  await writeFile(path.join(bookDir, 'glossary.md'), GLOSSARY);
  await writeFile(path.join(bookDir, 'introduction.md'), '# Introduction\n\nWhy this book.\n');
  await writeFile(
    path.join(bookDir, 'book.json'),
    JSON.stringify({ title: 'The Book', author: ['A. Author'] })
  );
  await writeFile(path.join(bookDir, 'fragments', 'bridge.md'), 'A bridging paragraph.\n');
  return { root, articlesDir, bookDir };
}

test('buildManuscript composes chapters, front matter, and appendices', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    const result = await buildManuscript({ articlesDir, bookDir, target: 'pdf' });
    const md = result.markdown;

    assert.equal(result.chapters, 1, 'merge-into-previous folds article 02 into chapter 1');
    assert.equal(result.footnotes, 2);
    assert.equal(result.sources, 1);
    assert.equal(result.indexTerms, 1);
    assert.equal(result.chapterImages.length, 1);
    assert.equal(
      result.chapterImages[0].bannerPath,
      'assets/article-headers/article-01-header.png'
    );
    assert.equal(result.chapterImages[0].subtitle, 'First Subtitle');
    assert.equal((md.match(/\\bookchapter\{/g) || []).length, 1, 'one opener per chapter');
    assert.equal(md.includes('Second Subtitle'), false, 'merged-member subtitle is not prose');
    assert.equal(md.split('First Subtitle').length - 1, 1, 'first subtitle appears only in opener');
    assert.match(md, /\\bookchapter\{chapter-01-header\.png\}\{First Chapter\}\{First Subtitle\}/);
    assert.match(md, /^## Second Chapter$/m, 'merged article title demotes to a section');
    assert.match(md, /^### Body Two$/m, 'merged article sections shift one level');
    assert.match(md, /^## Body One$/m);

    assert.equal(md.includes('_Part 1 of a series'), false);
    assert.equal(md.includes('article-01-header.png'), false);
    assert.equal(md.includes('The next article continues.'), false);
    assert.equal(md.includes('book:'), false, 'no marker survives into the manuscript');

    assert.match(md, /\\part\{Beginnings\}/);
    assert.match(md, /A bridging paragraph\./);
    assert.match(md, /Second \(Chapter 1\)/);
    assert.match(md, /\[\^c01-1\]/);
    assert.match(md, /\[\^c01-1\]: DORA\. "A Report\." <https:\/\/dora\.dev\/x\/>/);
    assert.match(md, /\\index\{Evidence gate\}/);
    assert.match(md, /^# Introduction$/m);
    assert.match(md, /^# Glossary$/m);
    assert.match(md, /^# Sources$/m);
    assert.equal(
      /^# Index$/m.test(md),
      false,
      'the index is not an appendix chapter; \\printindex writes its own heading'
    );
    assert.match(md, /\\printindex/);

    const sources = md.slice(md.indexOf('# Sources'));
    assert.equal(sources.split('https://dora.dev/x/').length - 1, 1, 'sources are deduped');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('each target emits exactly one target-specific opener for a merged chapter', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    for (const target of ['manuscript', 'pdf', 'epub', 'html']) {
      const { markdown, chapterImages } = await buildManuscript({ articlesDir, bookDir, target });
      assert.equal(chapterImages.length, 1);
      assert.equal((markdown.match(/bookchapter/g) || []).length, target === 'pdf' ? 1 : 0);
      assert.equal(
        (markdown.match(/chapter-opener/g) || []).length,
        ['html', 'epub'].includes(target) ? 1 : 0
      );
      assert.equal(
        markdown.split('chapter-01-header.png').length - 1,
        1,
        `${target} uses the first member banner once`
      );
      assert.equal(markdown.includes('article-02-header.png'), false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the manuscript target emits no latex and no index markup', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    const { markdown } = await buildManuscript({ articlesDir, bookDir, target: 'manuscript' });
    assert.equal(markdown.includes('\\index{'), false);
    assert.equal(markdown.includes('\\part{'), false);
    assert.equal(markdown.includes('\\printindex'), false);
    assert.match(markdown, /^# Beginnings$/m, 'parts become plain headings');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a missing include fragment fails loudly', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    await rm(path.join(bookDir, 'fragments', 'bridge.md'));
    await assert.rejects(
      () => buildManuscript({ articlesDir, bookDir, target: 'pdf' }),
      /bridge\.md/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the pdf wraps front matter so the introduction does not consume chapter 1', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    const { markdown } = await buildManuscript({ articlesDir, bookDir, target: 'pdf' });
    const frontmatter = markdown.indexOf('\\frontmatter');
    const intro = markdown.indexOf('# Introduction');
    const mainmatter = markdown.indexOf('\\mainmatter');
    const firstChapter = markdown.indexOf('\\bookchapter{chapter-01-header.png}');

    assert.notEqual(frontmatter, -1, 'the pdf opens in front matter');
    assert.notEqual(mainmatter, -1, 'the pdf switches to main matter');
    assert.ok(frontmatter < intro, 'frontmatter precedes the introduction');
    assert.ok(intro < mainmatter, 'mainmatter follows the introduction');
    assert.ok(mainmatter < firstChapter, 'mainmatter precedes chapter 1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the pdf carries a copyright page built from book.json rights', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    await writeFile(
      path.join(bookDir, 'book.json'),
      JSON.stringify({ title: 'The Book', author: ['A. Author'], rights: 'Copyright 2026 A.' })
    );
    const pdf = await buildManuscript({ articlesDir, bookDir, target: 'pdf' });
    assert.match(pdf.markdown, /\\noindent Copyright 2026 A\./);
    assert.ok(
      pdf.markdown.indexOf('\\noindent Copyright 2026 A.') < pdf.markdown.indexOf('# Introduction'),
      'the copyright page sits inside the front matter'
    );

    const epub = await buildManuscript({ articlesDir, bookDir, target: 'epub' });
    assert.equal(epub.markdown.includes('\\noindent'), false, 'no latex in the epub manuscript');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('epub and html carry semantic headings plus separate chapter numbers', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    for (const target of ['epub', 'html']) {
      const { markdown } = await buildManuscript({ articlesDir, bookDir, target });
      assert.match(markdown, /^# First Chapter \{\.chapter-title\}$/m);
      assert.match(markdown, /<div class="chapter-number">Chapter 1<\/div>/);
      assert.match(markdown, /^# Introduction$/m, 'the introduction stays unnumbered');
    }
    const pdf = await buildManuscript({ articlesDir, bookDir, target: 'pdf' });
    assert.match(pdf.markdown, /\\bookchapter\{chapter-01-header\.png\}/);
    assert.equal(pdf.markdown.includes('# First Chapter'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the epub index links its anchors and never repeats an anchor id', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    const { markdown } = await buildManuscript({ articlesDir, bookDir, target: 'epub' });
    const ids = [...markdown.matchAll(/id="(ix-[^"]+)"/g)].map((m) => m[1]);
    assert.ok(ids.length > 0, 'anchors are emitted');
    assert.equal(new Set(ids).size, ids.length, 'anchor ids are unique');
    for (const id of ids) {
      assert.ok(markdown.includes(`](#${id})`), `anchor ${id} is linked from the index`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('book:index records an index entry and gets a book-unique anchor', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    await writeFile(
      path.join(articlesDir, '01-first.md'),
      ARTICLE_ONE.replace(
        '## Body One',
        '## Body One\n\n<!-- book:index term="Trunk-based delivery" -->'
      )
    );
    await writeFile(
      path.join(articlesDir, '02-second.md'),
      ARTICLE_TWO.replace(
        '## Body Two',
        '## Body Two\n\n<!-- book:index term="Story governance" -->'
      )
    );

    const { markdown } = await buildManuscript({ articlesDir, bookDir, target: 'epub' });
    const index = markdown.slice(markdown.indexOf('# Index'));
    assert.match(index, /\*\*Trunk-based delivery\*\*/, 'the manual term reaches the index page');
    assert.match(index, /\*\*Story governance\*\*/);

    const manual = [...markdown.matchAll(/id="(ix-manual-[^"]+)"/g)].map((m) => m[1]);
    assert.equal(manual.length, 2);
    assert.equal(new Set(manual).size, 2, 'manual anchors do not collide across sections');
    for (const id of manual) assert.ok(index.includes(`](#${id})`), `${id} is linked`);

    const pdf = await buildManuscript({ articlesDir, bookDir, target: 'pdf' });
    assert.match(pdf.markdown, /\\index\{Trunk-based delivery\}/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fenced code is never rewritten into footnotes or shifted', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    await writeFile(
      path.join(articlesDir, '01-first.md'),
      ARTICLE_ONE.replace(
        '## Body One',
        '## Body One\n\n```md\n# Not a heading\n[click here](https://example.com)\n[a](b.txt)\n```'
      )
    );
    const { markdown } = await buildManuscript({ articlesDir, bookDir, target: 'manuscript' });
    assert.match(markdown, /^\[click here\]\(https:\/\/example\.com\)$/m, 'no footnote marker');
    assert.match(markdown, /^\[a\]\(b\.txt\)$/m, 'a relative link in a sample does not fail');
    assert.match(markdown, /^# Not a heading$/m, 'a fenced heading is not shifted');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('book:demote applies for the remainder of the article, across sections', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    await writeFile(
      path.join(articlesDir, '01-first.md'),
      ARTICLE_ONE.replace(
        '## Body One\n',
        '## Body One\n\n<!-- book:demote by=1 -->\n\n### Sub One\n\n## Body Two\n\n### Sub Two\n'
      )
    );
    const { markdown } = await buildManuscript({ articlesDir, bookDir, target: 'manuscript' });
    assert.match(markdown, /^#### Sub One$/m, 'the demote applies in its own section');
    assert.match(markdown, /^#### Sub Two$/m, 'and keeps applying in the next section');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a demote in one article does not bleed into the next', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    await writeFile(
      path.join(articlesDir, '01-first.md'),
      ARTICLE_ONE.replace('## Body One\n', '## Body One\n\n<!-- book:demote by=1 -->\n')
    );
    await writeFile(
      path.join(articlesDir, '02-second.md'),
      ARTICLE_TWO.replace('<!-- book:merge-into-previous -->\n\n', '')
    );
    const { markdown } = await buildManuscript({ articlesDir, bookDir, target: 'manuscript' });
    assert.match(markdown, /^## Body Two$/m, 'the next article starts from a clean shift');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('non-marker html comments never reach the manuscript', async () => {
  const { root, articlesDir, bookDir } = await fixture();
  try {
    await writeFile(
      path.join(articlesDir, '01-first.md'),
      `<!-- markdownlint-disable MD034 -->\n<!-- TODO: needs new artwork -->\n${ARTICLE_ONE}`
    );
    await writeFile(
      path.join(bookDir, 'introduction.md'),
      '# Introduction\n\n<!-- STUB: replace me -->\n\nWhy this book.\n'
    );
    await writeFile(path.join(bookDir, 'fragments', 'bridge.md'), '<!-- draft -->\nA bridge.\n');

    const { markdown } = await buildManuscript({ articlesDir, bookDir, target: 'html' });
    assert.equal(markdown.includes('markdownlint-disable'), false);
    assert.equal(markdown.includes('TODO'), false);
    assert.equal(markdown.includes('STUB'), false);
    assert.equal(markdown.includes('<!-- draft -->'), false);
    assert.match(markdown, /A bridge\./, 'the fragment prose survives');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
