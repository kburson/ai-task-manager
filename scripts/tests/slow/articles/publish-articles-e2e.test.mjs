// @story #1099
// End-to-end publish over the real nine-article corpus, including Mermaid
// rendering through headless Chromium. This lives in the slow lane on purpose:
// it spawns the Mermaid CLI ~32 times and would otherwise eat the fast lane's
// wall-time ceiling. Transform-level coverage is in
// scripts/tests/unit/articles/publish-articles.test.mjs.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';

import {
  ARTICLE_HTML,
  COMPANION_POST,
  DIAGRAM_LIBRARY_DIR,
  listArticles,
  publishAll,
} from '../../../articles/lib/publish.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../..');
const ARTICLES_DIR = path.join(REPO_ROOT, 'docs', 'articles');
const DIAGRAMS_DIR = path.join(ARTICLES_DIR, 'assets', 'diagrams');
// Output stays inside the repo's own scratch area — `lint:tmp` forbids reaching
// for a system temp path.
const OUT_ROOT = path.join(REPO_ROOT, '.tmp', 'published-e2e');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

let articles;
let sourceStatusBefore;

function gitStatusOfArticles() {
  return execFileSync('git', ['status', '--porcelain', '--', 'docs/articles'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

async function assertValidPng(file) {
  const bytes = await readFile(file);
  assert.ok(bytes.length > 0, `${file} is empty`);
  assert.ok(bytes.subarray(0, 4).equals(PNG_MAGIC), `${file} is not a PNG`);
}

before(async () => {
  await rm(OUT_ROOT, { recursive: true, force: true });
  articles = await listArticles(ARTICLES_DIR);
  sourceStatusBefore = gitStatusOfArticles();
  await publishAll({ articlesDir: ARTICLES_DIR, outRoot: OUT_ROOT });
});

after(async () => {
  await rm(OUT_ROOT, { recursive: true, force: true });
});

test('the corpus is the expected nine articles', () => {
  assert.equal(articles.length, 9);
});

// AC1 — one complete folder per article.
test('AC1 every article gets a folder with body, feed post, banner, and diagrams', async () => {
  for (const article of articles) {
    const dir = path.join(OUT_ROOT, article.slug);
    const entries = await readdir(dir);
    assert.ok(entries.includes(ARTICLE_HTML), `${article.slug} has no ${ARTICLE_HTML}`);
    assert.ok(entries.includes(COMPANION_POST), `${article.slug} has no ${COMPANION_POST}`);

    const banner = `article-${article.number}-header.png`;
    assert.ok(entries.includes(banner), `${article.slug} has no ${banner}`);
    await assertValidPng(path.join(dir, banner));

    const diagrams = entries.filter((name) => /-diagram-\d+\.png$/.test(name));
    assert.ok(diagrams.length > 0, `${article.slug} rendered no diagrams`);
    for (const name of diagrams) await assertValidPng(path.join(dir, name));
  }
});

// AC2 / AC3 — the shipped bodies are real markup with nothing left to strip.
test('AC2 and AC3 hold for every converted article body', async () => {
  const seenTags = [];
  for (const article of articles) {
    const html = await readFile(path.join(OUT_ROOT, article.slug, ARTICLE_HTML), 'utf8');
    const body = html.split('<body>')[1];

    assert.ok(!html.includes('<!--'), `${article.slug}: HTML comment survived`);
    assert.ok(!body.includes('Series Link'), `${article.slug}: Series Link heading survived`);
    assert.ok(!body.includes('LinkedIn Article Shape'), `${article.slug}: Shape survived`);
    assert.ok(
      !body.includes(`article-${article.number}-header.png`),
      `${article.slug}: banner survived`
    );
    assert.ok(!body.includes('|'), `${article.slug}: table pipes survived`);

    for (const pattern of [/\*\*/, /\]\(/, /!\[/, /^#{1,6} /m, /^> /m, /^- /m]) {
      assert.ok(!pattern.test(body), `${article.slug}: literal Markdown ${pattern} survived`);
    }
    for (const tag of ['<h1>', '<h2>', '<p>', '<ul>', '<strong>', '<em>']) {
      assert.ok(body.includes(tag), `${article.slug}: no ${tag} in the converted body`);
    }
    assert.ok(!/src=|href="(?!http)/.test(html), `${article.slug}: body is not self-contained`);
    seenTags.push(body);
  }
  // Blockquotes, numbered lists, and hyperlinks are not universal across the
  // corpus — article 06, for instance, cites only internal repo paths and so
  // has no absolute URL to hyperlink. Assert them once over the whole run.
  for (const tag of ['<blockquote>', '<ol>', '<a href="http']) {
    assert.ok(
      seenTags.some((body) => body.includes(tag)),
      `no converted body preserved a ${tag} element`
    );
  }
});

// AC5 — the feed post is separate from and disjoint with the article body.
test('AC5 every article ships a standalone companion feed announcement', async () => {
  for (const article of articles) {
    const dir = path.join(OUT_ROOT, article.slug);
    const post = await readFile(path.join(dir, COMPANION_POST), 'utf8');
    const html = await readFile(path.join(dir, ARTICLE_HTML), 'utf8');

    assert.ok(post.trim().length > 0, `${article.slug}: empty feed post`);
    assert.ok(post.includes('<PASTE THE PUBLISHED ARTICLE URL HERE>'));
    assert.ok(!post.includes('<p>'), `${article.slug}: feed post carries markup`);

    // The hook and closing lines are deliberately echoed from the article prose
    // — the guide says so — so disjointness is asserted the other way: the feed
    // post must carry no section of the article body, and must stay short
    // enough to be a feed post rather than a smuggled copy of the article.
    const source = await readFile(article.path, 'utf8');
    for (const heading of source.match(/^## .+$/gm) ?? []) {
      assert.ok(
        !post.includes(heading.slice(3).trim()),
        `${article.slug}: feed post dragged in the "${heading}" section`
      );
    }
    assert.ok(
      post.length < html.length / 5,
      `${article.slug}: feed post is ${post.length} chars — article body text leaked in`
    );
  }
});

// AC6 — the full .mmd library renders under descriptive names.
test('AC6 every .mmd source renders to a valid image named after it', async () => {
  const sources = (await readdir(DIAGRAMS_DIR)).filter((name) => name.endsWith('.mmd')).sort();
  assert.ok(sources.length > 0, 'no .mmd sources found');

  const rendered = await readdir(path.join(OUT_ROOT, DIAGRAM_LIBRARY_DIR));
  for (const source of sources) {
    const expected = source.replace(/\.mmd$/, '.png');
    assert.ok(rendered.includes(expected), `${source} did not render to ${expected}`);
    await assertValidPng(path.join(OUT_ROOT, DIAGRAM_LIBRARY_DIR, expected));
  }
});

// AC7 — every placeholder names a file that is actually in the folder.
test('AC7 each diagram placeholder names a file present in the same folder', async () => {
  let placeholders = 0;
  for (const article of articles) {
    const dir = path.join(OUT_ROOT, article.slug);
    const html = await readFile(path.join(dir, ARTICLE_HTML), 'utf8');
    const named = [...html.matchAll(/INSERT IMAGE HERE: <code>([^<]+)<\/code>/g)].map((m) => m[1]);
    assert.ok(named.length > 0, `${article.slug}: no diagram placeholders`);
    for (const name of named) {
      await assertValidPng(path.join(dir, name));
      placeholders += 1;
    }
  }
  assert.equal(placeholders, 14, 'the corpus carries 14 in-body Mermaid fences');
});

// AC8 — a single-article run touches only that article's folder.
test('AC8 a single-article run leaves every other article untouched', async () => {
  const target = articles[4];
  const neighbor = articles[0];
  const neighborDir = path.join(OUT_ROOT, neighbor.slug);
  const before = await Promise.all(
    (await readdir(neighborDir)).sort().map(async (name) => {
      const info = await stat(path.join(neighborDir, name));
      return `${name}:${info.size}:${info.mtimeMs}`;
    })
  );

  await publishAll({ articlesDir: ARTICLES_DIR, outRoot: OUT_ROOT, only: target.number });

  const after = await Promise.all(
    (await readdir(neighborDir)).sort().map(async (name) => {
      const info = await stat(path.join(neighborDir, name));
      return `${name}:${info.size}:${info.mtimeMs}`;
    })
  );
  assert.deepEqual(after, before, 'a single-article run rewrote another article');

  const entries = await readdir(path.join(OUT_ROOT, target.slug));
  assert.ok(entries.includes(ARTICLE_HTML));
});

test('an unmatched --article selector fails loudly', async () => {
  await assert.rejects(
    publishAll({ articlesDir: ARTICLES_DIR, outRoot: OUT_ROOT, only: 'no-such-article' }),
    /no article matched/
  );
});

// AC9 — the source tree is read-only to the publisher.
test('AC9 a full publish run modifies nothing under docs/articles', () => {
  assert.equal(gitStatusOfArticles(), sourceStatusBefore);
});
