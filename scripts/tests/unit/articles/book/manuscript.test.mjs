// @chore
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { buildManuscript } from '../../../../articles/lib/book/manuscript.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const ARTICLE_ONE = `# First Chapter

<!-- book:part title="Beginnings" -->

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
  await mkdir(path.join(bookDir, 'fragments'), { recursive: true });
  await writeFile(path.join(articlesDir, '01-first.md'), ARTICLE_ONE);
  await writeFile(path.join(articlesDir, '02-second.md'), ARTICLE_TWO);
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
    assert.match(md, /^# First Chapter$/m);
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
    assert.match(md, /^# Index$/m);
    assert.match(md, /\\printindex/);

    const sources = md.slice(md.indexOf('# Sources'));
    assert.equal(sources.split('https://dora.dev/x/').length - 1, 1, 'sources are deduped');
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
