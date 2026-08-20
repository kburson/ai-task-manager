// @story #1099
// Transform-level tests for the article publisher. No filesystem writes and no
// Mermaid rendering happen here — this is the fast lane. The end-to-end run
// over the real corpus (including rendering) lives in
// tests/slow/publish-articles-e2e.test.mjs.

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { buildCompanionPost, parseShapeSection } from '../../../articles/lib/companion-post.mjs';
import { extractMermaidFences } from '../../../articles/lib/diagrams.mjs';
import {
  markdownToHtml,
  renderInline,
  toPlainText,
} from '../../../articles/lib/markdown-to-html.mjs';
import { parseArticle } from '../../../articles/lib/parse-article.mjs';
import { convertArticle, listArticles } from '../../../articles/lib/publish.mjs';
import { cellToPlainTitle, roadmapToBullets } from '../../../articles/lib/roadmap.mjs';
import { applyStripRules } from '../../../articles/lib/strip-rules.mjs';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

const SLUG = '99-fixture-article';

const FIXTURE = `# The Fixture Article

<!-- markdownlint-disable MD034 -->

![The Fixture Article](assets/article-headers/article-99-header.png)
_Part 1 of a series_

## Draft Thesis

A paragraph with **bold**, _italic_, \`code\`, and a [real link](https://example.com/one).

- first bullet
- second bullet

1. first step
2. second step

> A quoted line.

\`\`\`mermaid
flowchart TB
    A["one"] --> B["two"]
\`\`\`

## Series Link

The next article, [Second](01-second.md), continues the argument.

## Series Roadmap

| Status      | #      | Article                            | Role     |
| ----------- | ------ | ---------------------------------- | -------- |
| **Current** | **00** | **[The Fixture Article](00-a.md)** | Opener   |
|             | 01     | [Second](01-second.md)             | Follow-up |

## LinkedIn Article Shape

Opening hook:

> The hook line.

Middle:

- First point.
- Second point.

Close:

> The closing line.

## Bibliography

- Someone. "A Source." https://example.com/source
`;

function convertFixture() {
  return convertArticle({ source: FIXTURE, slug: SLUG });
}

test('listArticles excludes sources marked DRAFT in their leading comment preamble', async () => {
  const articlesDir = await mkdtemp(path.join(projectScratchDir('test'), 'publish-articles-'));
  try {
    await Promise.all([
      writeFile(path.join(articlesDir, '03-third.md'), '# Third fixture\n'),
      writeFile(
        path.join(articlesDir, '02-draft.md'),
        '<!-- markdownlint-disable MD034 -->\n<!-- DRAFT: pending review -->\n# Draft fixture\n'
      ),
      writeFile(path.join(articlesDir, '01-first.md'), '# First fixture\n'),
      writeFile(
        path.join(articlesDir, '04-comment-after-content.md'),
        '# Publishable fixture\n\n<!-- DRAFT: pending review -->\n'
      ),
    ]);

    const articles = await listArticles(articlesDir);

    assert.deepEqual(
      articles.map((article) => article.file),
      ['01-first.md', '03-third.md', '04-comment-after-content.md']
    );
  } finally {
    await rm(articlesDir, { recursive: true, force: true });
  }
});

test('parseArticle lifts title and banner and splits sections', () => {
  const parsed = parseArticle(FIXTURE);
  assert.equal(parsed.title, 'The Fixture Article');
  assert.equal(parsed.bannerPath, 'assets/article-headers/article-99-header.png');
  const headings = parsed.sections.map((section) => section.heading);
  assert.deepEqual(headings, [
    null,
    'Draft Thesis',
    'Series Link',
    'Series Roadmap',
    'LinkedIn Article Shape',
    'Bibliography',
  ]);
});

test('parseArticle strips every HTML comment', () => {
  const parsed = parseArticle(FIXTURE);
  const all = parsed.sections.flatMap((section) => section.lines).join('\n');
  assert.ok(!all.includes('<!--'));
});

test('parseArticle rejects an unterminated fence', () => {
  assert.throws(() => parseArticle('# T\n\n```mermaid\nflowchart TB\n'), /unterminated code fence/);
});

// AC3 — every strip-before-publish element is gone from the converted body.
test('AC3 converted body drops comments, banner, Series Link heading, table, and Shape', () => {
  const { html } = convertFixture();
  assert.ok(!html.includes('<!--'), 'HTML comment survived');
  assert.ok(!html.includes('article-99-header.png'), 'inline banner survived');
  assert.ok(!html.includes('Series Link'), 'Series Link heading survived');
  assert.ok(!html.includes('|'), 'roadmap table pipes survived');
  assert.ok(!html.includes('LinkedIn Article Shape'), 'Shape section survived');
  assert.ok(html.includes('The next article'), 'Series Link prose was dropped with its heading');
});

// AC2 — real markup elements, and no literal Markdown left behind.
test('AC2 converted body preserves formatting as markup', () => {
  const { html } = convertFixture();
  for (const fragment of [
    '<h1>The Fixture Article</h1>',
    '<h2>Draft Thesis</h2>',
    '<strong>bold</strong>',
    '<em>italic</em>',
    '<code>code</code>',
    '<a href="https://example.com/one">real link</a>',
    '<li>first bullet</li>',
    '<ol>',
    '<blockquote><p>A quoted line.</p></blockquote>',
  ]) {
    assert.ok(html.includes(fragment), `missing ${fragment}`);
  }
});

test('AC2 converted body contains no literal Markdown syntax', () => {
  const body = convertFixture().html.split('<body>')[1];
  for (const pattern of [/\*\*/, /\]\(/, /!\[/, /^#{1,6} /m, /^> /m, /^- /m, /`/]) {
    assert.ok(!pattern.test(body), `literal Markdown ${pattern} survived`);
  }
});

test('relative links become plain text; absolute links stay hyperlinks', () => {
  assert.equal(renderInline('see [Second](01-second.md) now'), 'see Second now');
  assert.equal(renderInline('see [x](https://e.com/a)'), 'see <a href="https://e.com/a">x</a>');
});

test('bare URLs autolink without emphasis chewing through them', () => {
  const html = renderInline('Source. https://example.com/a_b_c');
  assert.equal(html, 'Source. <a href="https://example.com/a_b_c">https://example.com/a_b_c</a>');
});

test('code spans are protected from the emphasis passes', () => {
  assert.equal(renderInline('`a_b_c` and _real_'), '<code>a_b_c</code> and <em>real</em>');
});

test('escaping happens before markup so angle brackets cannot inject', () => {
  assert.equal(renderInline('a <b> & "c"'), 'a &lt;b&gt; &amp; &quot;c&quot;');
});

test('a Markdown table reaching the HTML renderer throws', () => {
  assert.throws(() => markdownToHtml(['| a | b |']), /LinkedIn cannot render tables/);
});

// AC4 — the roadmap table becomes a bullet list with the current entry bolded.
test('AC4 roadmap table becomes bullets with the current article bolded', () => {
  const { html } = convertFixture();
  assert.ok(html.includes('<p>This is article 1 of 2 in the series:</p>'));
  assert.ok(html.includes('<li><strong>The Fixture Article</strong></li>'));
  assert.ok(html.includes('<li>Second</li>'));
});

test('roadmap cells lose bold and link syntax', () => {
  assert.equal(cellToPlainTitle('**[A Title](00-a.md)**'), 'A Title');
  assert.equal(cellToPlainTitle('Plain'), 'Plain');
});

test('a roadmap without exactly one Current row throws', () => {
  const rows = [
    '| Status | # | Article | Role |',
    '| --- | --- | --- | --- |',
    '| | 00 | [A](a.md) | r |',
  ];
  assert.throws(() => roadmapToBullets(rows), /exactly one Current row/);
});

// AC7 — each fence becomes a placeholder naming the image to upload.
test('AC7 mermaid fences become placeholders naming their image files', () => {
  const { html, diagrams } = convertFixture();
  assert.deepEqual(
    diagrams.map((diagram) => diagram.imageName),
    [`${SLUG}-diagram-1.png`]
  );
  assert.ok(html.includes(`INSERT IMAGE HERE: <code>${SLUG}-diagram-1.png</code>`));
  assert.ok(diagrams[0].code.includes('flowchart TB'));
});

test('fences are numbered in document order across sections', () => {
  const sections = [
    { heading: 'One', lines: ['```mermaid', 'a', '```'] },
    { heading: 'Two', lines: ['```mermaid', 'b', '```'] },
  ];
  const { diagrams } = extractMermaidFences(sections, 'x');
  assert.deepEqual(
    diagrams.map((diagram) => [diagram.imageName, diagram.code]),
    [
      ['x-diagram-1.png', 'a'],
      ['x-diagram-2.png', 'b'],
    ]
  );
});

test('a non-mermaid fence throws rather than leaking as literal text', () => {
  const sections = [{ heading: null, lines: ['```bash', 'ls', '```'] }];
  assert.throws(() => extractMermaidFences(sections, 'x'), /unsupported code fence language/);
});

// AC5 — the companion post is assembled from the Shape section alone.
test('AC5 companion post carries hook, bullets, close, and a URL placeholder', () => {
  const { companionPost, html } = convertFixture();
  const lines = companionPost.trim().split('\n');
  assert.equal(lines[0], 'The hook line.');
  assert.ok(companionPost.includes('- First point.'));
  assert.ok(companionPost.includes('The closing line.'));
  assert.ok(companionPost.includes('<PASTE THE PUBLISHED ARTICLE URL HERE>'));
  assert.ok(!companionPost.includes('A paragraph with'), 'article body leaked into the feed post');
  assert.ok(!html.includes('The hook line.'), 'feed-post content leaked into the article body');
});

test('the companion post is plain text, not markup', () => {
  const { companionPost } = convertFixture();
  assert.ok(!companionPost.includes('<p>'));
  assert.ok(!companionPost.includes('**'));
});

test('a Shape section missing a closing quote throws', () => {
  assert.throws(
    () => parseShapeSection(['> only one', '', '- a point']),
    /opening and a closing quote/
  );
});

test('a Shape section with no bullets throws', () => {
  assert.throws(() => parseShapeSection(['> one', '', '> two']), /no middle bullets/);
});

test('buildCompanionPost titles the article link line', () => {
  const post = buildCompanionPost({
    title: 'T',
    shapeLines: ['> hook', '', '- a', '', '> close'],
  });
  assert.ok(post.includes('Read "T": '));
});

test('an article with no LinkedIn Article Shape section throws', () => {
  const article = parseArticle('# T\n\n## Body\n\ntext\n');
  assert.throws(() => applyStripRules(article), /no `## LinkedIn Article Shape` section/);
});

test('toPlainText strips inline markup', () => {
  assert.equal(toPlainText('**a** _b_ `c` [d](https://e.com)'), 'a b c d');
});
