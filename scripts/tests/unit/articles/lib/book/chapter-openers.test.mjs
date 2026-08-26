// @chore
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  chapterOpenerFor,
  escapeLatex,
  planChapterImages,
  stageChapterImages,
} from '../../../../../articles/lib/book/chapter-openers.mjs';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';

const article = (slug, bannerPath, over = {}) => ({
  slug,
  title: `Title ${slug}`,
  subtitle: `Subtitle ${slug}`,
  bannerPath,
  ...over,
});

const chapter = (number, members) => ({
  number,
  title: members[0].title,
  members: members.map((member, index) => ({ article: member, shift: index === 0 ? 0 : 1 })),
});

test('escapeLatex protects special characters without shell escaping', () => {
  assert.equal(escapeLatex('A & B_1'), 'A \\& B\\_1');
});

test('chapterOpenerFor emits a reviewable manuscript opener', () => {
  assert.deepEqual(
    chapterOpenerFor({
      target: 'manuscript',
      chapter: { number: 2, title: 'Title' },
      imageName: 'chapter-02-header.png',
      subtitle: 'Subtitle',
    }),
    [
      '![Chapter 2 header](chapter-02-header.png)',
      '',
      '<div align="center">Chapter 2</div>',
      '',
      '# Title',
      '',
      '<div align="center">Subtitle</div>',
      '',
    ]
  );
});

test('chapterOpenerFor emits one native PDF command and one semantic reflowable division', () => {
  const options = {
    chapter: { number: 2, title: 'A & B' },
    imageName: 'chapter-02-header.png',
    subtitle: 'C_1',
  };
  const pdf = chapterOpenerFor({ ...options, target: 'pdf' }).join('\n');
  assert.equal((pdf.match(/\\bookchapter\{/g) || []).length, 1);
  assert.equal(pdf, '\\bookchapter{chapter-02-header.png}{A \\& B}{C\\_1}');

  for (const target of ['html', 'epub']) {
    const markdown = chapterOpenerFor({ ...options, target }).join('\n');
    assert.equal((markdown.match(/\.chapter-opener/g) || []).length, 1);
    assert.ok(markdown.indexOf('# A & B') < markdown.indexOf('chapter-02-header.png'));
    assert.match(markdown, /Chapter 2/);
    assert.match(markdown, /C_1/);
  }
});

test('planChapterImages uses only the first member and deterministic chapter names', async () => {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'chapter-openers-'));
  const articlesDir = path.join(root, 'articles');
  const headersDir = path.join(articlesDir, 'assets', 'article-headers');
  const outDir = path.join(root, 'out');
  try {
    await mkdir(headersDir, { recursive: true });
    await writeFile(path.join(headersDir, 'article-01-header.png'), 'first');
    await writeFile(path.join(headersDir, 'article-02-header.png'), 'merged');
    const chapters = [
      chapter(1, [
        article('01-first', 'assets/article-headers/article-01-header.png'),
        article('02-merged', 'assets/article-headers/article-02-header.png'),
      ]),
    ];

    const plan = planChapterImages({ articlesDir, chapters, outDir });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].imageName, 'chapter-01-header.png');
    assert.equal(plan[0].sourcePath, path.join(headersDir, 'article-01-header.png'));
    assert.equal(plan[0].outputPath, path.join(outDir, 'chapter-01-header.png'));

    await stageChapterImages(plan);
    assert.equal(await readFile(plan[0].outputPath, 'utf8'), 'first');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('planChapterImages rejects invalid inputs before staging copies anything', async () => {
  const cases = [
    ['missing', 'assets/article-headers/missing.png'],
    ['non-PNG', 'assets/article-headers/article-01-header.jpg'],
    ['absolute', '/tmp/article-01-header.png'],
    ['escaping', '../article-01-header.png'],
  ];

  for (const [label, bannerPath] of cases) {
    const root = await mkdtemp(path.join(projectScratchDir('test'), `chapter-openers-${label}-`));
    const articlesDir = path.join(root, 'articles');
    const outDir = path.join(root, 'out');
    try {
      await mkdir(path.join(articlesDir, 'assets', 'article-headers'), { recursive: true });
      await assert.rejects(
        async () => {
          const plan = planChapterImages({
            articlesDir,
            chapters: [chapter(1, [article('01-first', bannerPath)])],
            outDir,
          });
          await stageChapterImages(plan);
        },
        /banner|read/i,
        label
      );
      assert.deepEqual(await readdir(outDir).catch(() => []), [], `${label} copied no files`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('planChapterImages rejects duplicate staged names', async () => {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'chapter-openers-duplicate-'));
  const articlesDir = path.join(root, 'articles');
  const headersDir = path.join(articlesDir, 'assets', 'article-headers');
  try {
    await mkdir(headersDir, { recursive: true });
    await writeFile(path.join(headersDir, 'one.png'), 'one');
    await writeFile(path.join(headersDir, 'two.png'), 'two');
    assert.throws(
      () =>
        planChapterImages({
          articlesDir,
          chapters: [
            chapter(1, [article('01', 'assets/article-headers/one.png')]),
            chapter(1, [article('02', 'assets/article-headers/two.png')]),
          ],
          outDir: path.join(root, 'out'),
        }),
      /duplicate chapter image output/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
