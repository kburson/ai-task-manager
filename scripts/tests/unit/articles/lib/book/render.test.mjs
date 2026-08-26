// @chore
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  composeTarget,
  createAssetStager,
  parseArgs,
} from '../../../../../articles/compose-book.mjs';
import {
  latexmkArgs,
  pandocArgs,
  TOC_DEPTH,
  renderInvocations,
  TARGETS,
} from '../../../../../articles/lib/book/render.mjs';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';

const CHAPTER_HEADER = path.resolve(
  import.meta.dirname,
  '../../../../../../docs/articles/assets/book/chapter-openers.tex'
);
const BOOK_CSS = path.resolve(
  import.meta.dirname,
  '../../../../../../docs/articles/assets/book/book.css'
);

test('pandocArgs maps top-level headings to chapters and loads the metadata file', () => {
  const args = pandocArgs({
    manuscriptPath: '/tmp/book/manuscript.md',
    bookDir: '/repo/docs/articles/assets/book',
    target: 'pdf',
    outDir: '/tmp/book',
  });
  assert.ok(args.includes('--top-level-division=chapter'));
  assert.ok(args.includes('--metadata-file=/repo/docs/articles/assets/book/book.json'));
  assert.ok(args.includes('--toc'));
  assert.ok(args.includes('--standalone'));
  assert.ok(
    args.includes('--include-in-header=/repo/docs/articles/assets/book/chapter-openers.tex')
  );
  assert.deepEqual(args.slice(-2), ['-o', '/tmp/book/book.tex']);
});

test('the explicit PDF header keeps index setup that pandoc header inclusion replaces', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\usepackage\{makeidx\}/);
  assert.match(header, /\\makeindex/);
  assert.match(header, /\\usepackage\{adjustbox\}/);
  assert.match(header, /\\newcommand\{\\bookchapter\}/);
});

test('the PDF chapter image is proportional and never clipped', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\begin\{adjustbox\}\{max width=\{?\\textwidth\}?,center\}/);
  assert.doesNotMatch(header, /Clip=/);
  assert.doesNotMatch(header, /min size=/);
  assert.doesNotMatch(header, /\\large\\scshape Chapter \\thechapter/);
});

test('the PDF page styles put chapter numbers left and page numbers right', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\usepackage\{fancyhdr\}/);
  assert.match(header, /\\fancyhead\[L\]\{\\bookchapterheader\}/);
  assert.match(header, /\\fancyfoot\[R\]\{\\thepage\}/);
  assert.match(header, /\\fancypagestyle\{plain\}/);
  assert.match(header, /\\ifnum\\value\{chapter\}>0 Chapter \\thechapter\\fi/);
  assert.match(header, /\\renewcommand\{\\headrulewidth\}\{0pt\}/);
  assert.match(header, /\\renewcommand\{\\footrulewidth\}\{0pt\}/);
});

test('the PDF title page is banner-first, unnumbered, and uses a 34-point title', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\providecommand\{\\subtitle\}\[1\]\{\\gdef\\booksubtitle\{#1\}\}/);
  assert.match(header, /\\renewcommand\{\\maketitle\}/);
  assert.match(header, /\\thispagestyle\{empty\}/);
  assert.match(header, /\\includegraphics\{title-page\.png\}/);
  assert.match(header, /\\fontsize\{34\}\{40\}\\selectfont\\bfseries \\@title/);
  assert.match(header, /\\booksubtitle/);
  assert.match(header, /\\@author/);
});

test('the PDF body-image wrapper centers and bounds diagrams to 70 percent of text height', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\renewcommand\*\\pandocbounded/);
  assert.match(header, /\.7\\textheight/);
  assert.match(header, /\\linewidth/);
  assert.match(header, /\\makebox\[\\linewidth\]\[c\]/);
});

test('the HTML and EPUB chapter artwork caption stays visually hidden', () => {
  const css = readFileSync(BOOK_CSS, 'utf8');
  assert.match(css, /\.chapter-opener figcaption\s*\{[^}]*display:\s*none;/s);
});

test('pandocArgs emits epub and html directly', () => {
  const base = { manuscriptPath: '/m.md', bookDir: '/b', outDir: '/o' };
  const epub = pandocArgs({ ...base, target: 'epub' });
  const html = pandocArgs({ ...base, target: 'html' });
  assert.ok(epub.includes('--css=book.css'));
  assert.ok(html.includes('--css=book.css'));
  assert.deepEqual(epub.slice(-2), ['-o', '/o/book.epub']);
  assert.deepEqual(html.slice(-2), ['-o', '/o/book.html']);
});

test('latexmkArgs drives xelatex with an output directory', () => {
  const args = latexmkArgs({ texPath: '/o/book.tex', outDir: '/o' });
  assert.ok(args.includes('-xelatex'));
  assert.ok(args.includes('-interaction=nonstopmode'));
  assert.ok(args.includes('-outdir=/o'));
  assert.equal(args.at(-1), '/o/book.tex');
});

test('parseArgs defaults to every target', () => {
  const options = parseArgs([]);
  assert.deepEqual(options.targets, TARGETS);
  assert.equal(options.doctor, false);
});

test('parseArgs accepts a single target and a doctor flag', () => {
  assert.deepEqual(parseArgs(['--target', 'epub']).targets, ['epub']);
  assert.equal(parseArgs(['--doctor']).doctor, true);
  assert.equal(parseArgs(['--out', '/x']).out, '/x');
});

test('parseArgs rejects unknown targets and unknown flags', () => {
  assert.throws(() => parseArgs(['--target', 'mobi']), /unknown target/);
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
});

test('renderInvocations runs pandoc with cwd set to outDir, so bare-filename image references (e.g. from extractBookDiagrams) resolve', () => {
  const invocations = renderInvocations({
    manuscriptPath: '/tmp/book/manuscript.md',
    bookDir: '/repo/docs/articles/assets/book',
    outDir: '/tmp/book',
    target: 'epub',
  });
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].command, 'pandoc');
  assert.deepEqual(invocations[0].options, { cwd: '/tmp/book' });
});

test('the reviewable manuscript target never invokes pandoc', () => {
  assert.deepEqual(
    renderInvocations({
      manuscriptPath: '/tmp/book/manuscript.md',
      bookDir: '/repo/docs/articles/assets/book',
      outDir: '/tmp/book',
      target: 'manuscript',
    }),
    []
  );
});

test('composeTarget stages assets before writing and rendering every target', async () => {
  const outDir = await mkdtemp(path.join(projectScratchDir('test'), 'compose-target-'));
  const built = {
    markdown: '# Book\n',
    chapters: 1,
    footnotes: 0,
    indexTerms: 0,
    diagrams: [],
    chapterImages: [{ chapter: 1 }],
  };
  try {
    for (const target of ['manuscript', 'html']) {
      const calls = [];
      await composeTarget({
        target,
        outDir,
        articlesDir: '/articles',
        bookDir: '/book',
        build: async () => {
          calls.push('build');
          return built;
        },
        ensureAssets: async (images) => {
          assert.equal(images, built.chapterImages);
          calls.push('stage');
        },
        write: async () => calls.push('write'),
        renderDiagrams: async () => calls.push('diagrams'),
        render: async () => calls.push('render'),
        log: () => {},
      });
      assert.deepEqual(
        calls,
        target === 'manuscript'
          ? ['build', 'stage', 'write']
          : ['build', 'stage', 'write', 'diagrams', 'render']
      );
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('createAssetStager copies chapter, title, and CSS assets once', async () => {
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'book-assets-'));
  const articlesDir = path.join(root, 'articles');
  const bookDir = path.join(articlesDir, 'assets', 'book');
  const headersDir = path.join(articlesDir, 'assets', 'article-headers');
  const outDir = path.join(root, 'out');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  try {
    await mkdir(bookDir, { recursive: true });
    await mkdir(headersDir, { recursive: true });
    await writeFile(path.join(headersDir, 'article-01-header.png'), png);
    await writeFile(path.join(bookDir, 'title-page.png'), png);
    await writeFile(path.join(bookDir, 'book.css'), '.book {}\n');
    const stage = createAssetStager({ articlesDir, bookDir, outDir });
    await stage([
      {
        chapter: 1,
        slug: '01-first',
        bannerPath: 'assets/article-headers/article-01-header.png',
      },
    ]);
    assert.deepEqual(await readFile(path.join(outDir, 'chapter-01-header.png')), png);
    assert.deepEqual(await readFile(path.join(outDir, 'title-page.png')), png);
    assert.equal(await readFile(path.join(outDir, 'book.css'), 'utf8'), '.book {}\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renderInvocations also runs latexmk with cwd set to outDir for the pdf target, so LaTeX image includes resolve', () => {
  const invocations = renderInvocations({
    manuscriptPath: '/tmp/book/manuscript.md',
    bookDir: '/repo/docs/articles/assets/book',
    outDir: '/tmp/book',
    target: 'pdf',
  });
  assert.equal(invocations.length, 2);
  assert.deepEqual(
    invocations.map((i) => i.command),
    ['pandoc', 'latexmk']
  );
  assert.deepEqual(invocations[0].options, { cwd: '/tmp/book' });
  assert.deepEqual(invocations[1].options, { cwd: '/tmp/book' });
});

test('toc depth is per target: chapters plus sections in the pdf, unchanged elsewhere', () => {
  const base = { manuscriptPath: '/o/m.md', bookDir: '/b', outDir: '/o' };
  const depthOf = (target) =>
    pandocArgs({ ...base, target }).find((arg) => arg.startsWith('--toc-depth='));

  assert.equal(
    depthOf('pdf'),
    '--toc-depth=1',
    'under the book class 1 is section, 2 is subsection'
  );
  assert.equal(depthOf('epub'), '--toc-depth=2');
  assert.equal(depthOf('html'), '--toc-depth=2');
  assert.equal(TOC_DEPTH.pdf, 1);
});
