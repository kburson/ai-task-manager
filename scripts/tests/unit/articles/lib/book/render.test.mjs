// @chore
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
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
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x05, 0x60, 0x00, 0x00, 0x03, 0x00, 0x08, 0x02, 0x00, 0x00, 0x00, 0x25, 0xb1, 0x59,
  0xea,
]);

async function createEpubFixture(root, name = 'book.epub') {
  const source = path.join(root, 'source');
  const epubDir = path.join(source, 'EPUB');
  const target = path.join(root, name);
  await mkdir(path.join(epubDir, 'text'), { recursive: true });
  await mkdir(path.join(epubDir, 'media'), { recursive: true });
  await mkdir(path.join(source, 'META-INF'), { recursive: true });
  await writeFile(path.join(source, 'mimetype'), 'application/epub+zip');
  await writeFile(path.join(source, 'META-INF', 'container.xml'), '<container/>');
  await writeFile(
    path.join(epubDir, 'content.opf'),
    '<package><manifest><item id="title_page_xhtml" href="text/title_page.xhtml" media-type="application/xhtml+xml" /><item id="cover" href="media/cover.png" properties="cover-image" media-type="image/png" /></manifest></package>'
  );
  await writeFile(
    path.join(epubDir, 'text', 'title_page.xhtml'),
    '<section epub:type="titlepage" class="titlepage">\n  <h1 class="title">Book</h1>\n</section>'
  );
  await writeFile(path.join(epubDir, 'media', 'cover.png'), PNG_HEADER);
  execFileSync('zip', ['-X', '-q', '-0', target, 'mimetype'], { cwd: source });
  execFileSync('zip', ['-X', '-q', '-r', target, 'META-INF', 'EPUB'], { cwd: source });
  return target;
}

async function createSymlinkEpubFixture(root) {
  const source = path.join(root, 'source');
  const outside = path.join(root, 'outside');
  const target = path.join(root, 'symlink.epub');
  await mkdir(path.join(source, 'META-INF'), { recursive: true });
  await mkdir(outside);
  await writeFile(path.join(source, 'mimetype'), 'application/epub+zip');
  await writeFile(path.join(source, 'META-INF', 'container.xml'), '<container/>');
  await writeFile(path.join(outside, 'sentinel.txt'), 'outside content must stay untouched');
  await symlink(outside, path.join(source, 'EPUB'));
  execFileSync('zip', ['-X', '-q', '-y', target, 'mimetype', 'META-INF', 'EPUB'], {
    cwd: source,
  });
  return { target, outside };
}

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
  assert.match(header, /\\setlength\{\\headheight\}\{14pt\}/);
  assert.match(header, /\\fancyhead\[L\]\{\\bookchapterheader\}/);
  assert.match(header, /\\fancyfoot\[R\]\{\\thepage\}/);
  assert.match(header, /\\fancypagestyle\{plain\}/);
  assert.match(header, /\\ifnum\\value\{chapter\}>0 Chapter \\thechapter\\fi/);
  assert.match(header, /\\renewcommand\{\\headrulewidth\}\{0pt\}/);
  assert.match(header, /\\renewcommand\{\\footrulewidth\}\{0pt\}/);
});

test('the PDF uses unique physical-page anchors across visible numbering resets', () => {
  const header = readFileSync(CHAPTER_HEADER, 'utf8');
  assert.match(header, /\\PassOptionsToPackage\{hypertexnames=false\}\{hyperref\}/);
  assert.doesNotMatch(header, /pageanchor=false/);
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

test('the reflowable stylesheet keeps title, chapter, and diagram images proportional', () => {
  const css = readFileSync(BOOK_CSS, 'utf8');
  assert.match(css, /#title-block-header::before\s*\{[^}]*url\(['"]title-page\.png['"]\)/s);
  assert.match(css, /#title-block-header h1\.title\s*\{[^}]*font-size:\s*2\.75rem/s);
  assert.match(
    css,
    /\.chapter-opener \.chapter-image img\s*\{[^}]*max-width:\s*100%;[^}]*width:\s*auto;[^}]*height:\s*auto;[^}]*object-fit:\s*contain;/s
  );
  assert.match(
    css,
    /\.book-diagram\s*\{[^}]*max-width:\s*100%;[^}]*max-height:\s*70vh;[^}]*object-fit:\s*contain;/s
  );
  assert.doesNotMatch(css, /object-fit:\s*cover/);
});

test('the reflowable stylesheet supports Pandoc EPUB title-page banners', () => {
  const css = readFileSync(BOOK_CSS, 'utf8');
  assert.match(css, /\.titlepage\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
  assert.match(css, /\.titlepage \.title-banner\s*\{[^}]*order:\s*-1;[^}]*width:\s*100%;/s);
  assert.match(css, /\.titlepage h1\.title\s*\{[^}]*font-size:\s*2\.75rem/s);
});

test('the EPUB banner inserter uses manifest media before the title', async () => {
  const { insertEpubTitleBanner } = await import('../../../../../articles/lib/book/render.mjs');
  assert.equal(typeof insertEpubTitleBanner, 'function');
  const template = insertEpubTitleBanner({
    titlePage:
      '<section epub:type="titlepage" class="titlepage">\n  <h1 class="title">Book</h1>\n</section>',
    titleHref: 'text/title_page.xhtml',
    coverHref: 'media/file35.png',
    coverWidth: 1376,
    coverHeight: 768,
  });
  assert.match(
    template,
    /class="title-banner"[\s\S]*xlink:href="\.\.\/media\/file35\.png"[\s\S]*<h1 class="title">Book<\/h1>/
  );
  assert.match(template, /viewBox="0 0 1376 768"/);
});

test('the EPUB postprocessor rejects unsafe archive and manifest paths', async () => {
  const { assertSafeArchiveEntry, resolveEpubPath, validateZipEntries } =
    await import('../../../../../articles/lib/book/render.mjs');
  assert.equal(typeof assertSafeArchiveEntry, 'function');
  assert.equal(typeof resolveEpubPath, 'function');
  const root = path.join('/safe', 'EPUB');
  assert.equal(assertSafeArchiveEntry(root, 'EPUB/text/title_page.xhtml'), true);
  for (const unsafe of ['/absolute', '../traversal', 'EPUB/../escape', 'EPUB\\backslash']) {
    assert.throws(() => assertSafeArchiveEntry(root, unsafe), /unsafe EPUB path/);
  }
  for (const unsafeHref of ['/absolute', '../traversal', 'text/../../escape', 'text\\title']) {
    assert.throws(() => resolveEpubPath(root, unsafeHref), /unsafe EPUB path/);
  }
  assert.throws(() => validateZipEntries(root, ['mimetype'], []), /metadata/);
  assert.throws(() => validateZipEntries(root, ['mimetype'], ['l']), /entry type/);
});

test('the EPUB postprocessor validates the complete PNG signature, IHDR, and CRC', async () => {
  const { pngDimensions } = await import('../../../../../articles/lib/book/render.mjs');
  assert.equal(typeof pngDimensions, 'function');
  assert.deepEqual(pngDimensions(PNG_HEADER), { width: 1376, height: 768 });
  assert.throws(() => pngDimensions(Buffer.from('not a png')), /not a PNG/);
  assert.throws(() => pngDimensions(PNG_HEADER.subarray(0, 24)), /IHDR/);
  const missingIhdr = Buffer.from(PNG_HEADER);
  missingIhdr.writeUInt32BE(12, 8);
  assert.throws(() => pngDimensions(missingIhdr), /IHDR/);
  const corruptCrc = Buffer.from(PNG_HEADER);
  corruptCrc[32] ^= 0xff;
  assert.throws(() => pngDimensions(corruptCrc), /CRC/);
});

test('a malicious symlink archive is rejected before extraction or outside access', async () => {
  const { injectEpubTitleBanner } = await import('../../../../../articles/lib/book/render.mjs');
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'epub-symlink-archive-'));
  try {
    const { target, outside } = await createSymlinkEpubFixture(root);
    let extractionAttempted = false;
    await assert.rejects(
      injectEpubTitleBanner(target, {
        run: async () => {
          extractionAttempted = true;
        },
      }),
      /entry type/
    );
    assert.equal(extractionAttempted, false);
    assert.equal(
      await readFile(path.join(outside, 'sentinel.txt'), 'utf8'),
      'outside content must stay untouched'
    );
    assert.equal((await lstat(path.join(root, 'source', 'EPUB'))).isSymbolicLink(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the extracted-tree guard rejects symlinks before manifest access', async () => {
  const { assertExtractedEpubTreeSafe } =
    await import('../../../../../articles/lib/book/render.mjs');
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'epub-extracted-symlink-'));
  try {
    await symlink(path.join(root, 'outside'), path.join(root, 'EPUB'));
    await assert.rejects(assertExtractedEpubTreeSafe(root), /unsafe EPUB extracted entry/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the EPUB postprocessor rebuilds a custom output atomically with stored mimetype', async () => {
  const { injectEpubTitleBanner } = await import('../../../../../articles/lib/book/render.mjs');
  assert.equal(typeof injectEpubTitleBanner, 'function');
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'epub-custom-output-'));
  const customOutput = path.join(root, 'custom-output');
  try {
    await mkdir(customOutput);
    const epubPath = await createEpubFixture(customOutput);
    await injectEpubTitleBanner(epubPath);
    const titlePage = execFileSync('unzip', ['-p', epubPath, 'EPUB/text/title_page.xhtml'], {
      encoding: 'utf8',
    });
    assert.ok(titlePage.indexOf('class="title-banner"') < titlePage.indexOf('<h1 class="title">'));
    assert.equal(
      execFileSync('unzip', ['-Z1', epubPath], { encoding: 'utf8' }).split('\n')[0],
      'mimetype'
    );
    assert.match(
      execFileSync('unzip', ['-lv', epubPath], { encoding: 'utf8' }),
      /Stored\s+\s*20.*mimetype/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a failed ZIP rewrite preserves the original target and removes adjacent staging', async () => {
  const { injectEpubTitleBanner, runCommand } =
    await import('../../../../../articles/lib/book/render.mjs');
  const root = await mkdtemp(path.join(projectScratchDir('test'), 'epub-rewrite-failure-'));
  try {
    const epubPath = await createEpubFixture(root);
    const original = await readFile(epubPath);
    await assert.rejects(
      injectEpubTitleBanner(epubPath, {
        run: async (command, args, options) => {
          if (command === 'zip') throw new Error('forced ZIP failure');
          return runCommand(command, args, options);
        },
      }),
      /forced ZIP failure/
    );
    assert.deepEqual(await readFile(epubPath), original);
    assert.deepEqual(await readdir(root), ['book.epub', 'source']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pandocArgs emits epub and html directly', () => {
  const base = { manuscriptPath: '/m.md', bookDir: '/b', outDir: '/o' };
  const epub = pandocArgs({ ...base, target: 'epub' });
  const html = pandocArgs({ ...base, target: 'html' });
  assert.ok(epub.includes('--css=book.css'));
  assert.ok(epub.includes('--epub-cover-image=title-page.png'));
  assert.equal(
    epub.some((arg) => arg.startsWith('--template=')),
    false
  );
  assert.ok(html.includes('--css=book.css'));
  assert.equal(html.includes('--epub-cover-image=title-page.png'), false);
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
