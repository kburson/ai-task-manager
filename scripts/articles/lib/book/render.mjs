// Rendering. Pandoc for every target; latexmk on top of it for PDF, because a
// table of contents and a makeindex index both need multiple passes and pandoc
// runs the engine exactly once.

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

export const TARGETS = ['manuscript', 'pdf', 'epub', 'html'];

const OUTPUT_NAME = { pdf: 'book.tex', epub: 'book.epub', html: 'book.html' };

/**
 * `--toc-depth` is not a portable number. Under the `book` class pandoc turns
 * it into `\setcounter{tocdepth}{N}`, where 0 is chapter and 1 is section — so
 * the 2 that gives EPUB and HTML a chapter-plus-section contents listed every
 * `###` subsection in the PDF. The PDF therefore wants 1.
 */
export const TOC_DEPTH = { pdf: 1, epub: 2, html: 2 };

export function pandocArgs({ manuscriptPath, bookDir, target, outDir }) {
  const presentationArgs =
    target === 'pdf'
      ? [`--include-in-header=${path.join(bookDir, 'chapter-openers.tex')}`]
      : target === 'epub'
        ? ['--css=book.css', '--epub-cover-image=title-page.png']
        : target === 'html'
          ? ['--css=book.css']
          : [];
  return [
    manuscriptPath,
    `--metadata-file=${path.join(bookDir, 'book.json')}`,
    '--top-level-division=chapter',
    '--toc',
    `--toc-depth=${TOC_DEPTH[target] ?? 2}`,
    '--standalone',
    ...presentationArgs,
    '-o',
    path.join(outDir, OUTPUT_NAME[target]),
  ];
}

export function latexmkArgs({ texPath, outDir }) {
  return ['-xelatex', '-interaction=nonstopmode', '-halt-on-error', `-outdir=${outDir}`, texPath];
}

function epubManifestHref(opf, id) {
  const item = opf.match(
    new RegExp(`<item\\b(?=[^>]*\\bid="${id}")(?=[^>]*\\bhref="([^"]+)")[^>]*\\/?>`)
  );
  if (!item) throw new Error(`EPUB manifest is missing ${id}`);
  return item[1];
}

function epubCoverHref(opf) {
  const item = opf.match(
    /<item\b(?=[^>]*\bproperties="[^"]*\bcover-image\b[^"]*")(?=[^>]*\bhref="([^"]+)")[^>]*\/?>/
  );
  if (!item) throw new Error('EPUB manifest is missing a cover-image item');
  return item[1];
}

function pngDimensions(png) {
  if (png.length < 24 || png.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('EPUB cover image is not a PNG');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width === 0 || height === 0) throw new Error('EPUB cover image has invalid dimensions');
  return { width, height };
}

export function insertEpubTitleBanner({
  titlePage,
  titleHref,
  coverHref,
  coverWidth,
  coverHeight,
}) {
  const imageHref = path.posix.relative(path.posix.dirname(titleHref), coverHref);
  const banner = `  <div class="title-banner">\n    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="100%" height="100%" viewBox="0 0 ${coverWidth} ${coverHeight}" preserveAspectRatio="xMidYMid">\n      <image width="${coverWidth}" height="${coverHeight}" xlink:href="${imageHref}" />\n    </svg>\n  </div>\n`;
  const inserted = titlePage.replace(
    /(<section\b[^>]*\bclass="titlepage"[^>]*>\s*)(<h1\b)/,
    `$1${banner}  $2`
  );
  if (inserted === titlePage) throw new Error('EPUB title page is missing its title heading');
  return inserted;
}

async function injectEpubTitleBanner(epubPath) {
  const stageDir = await mkdtemp(path.join(projectScratchDir('book'), 'epub-title-banner-'));
  try {
    await runCommand('unzip', ['-qq', epubPath, '-d', stageDir]);
    const epubDir = path.join(stageDir, 'EPUB');
    const opfPath = path.join(epubDir, 'content.opf');
    const opf = await readFile(opfPath, 'utf8');
    const titleHref = epubManifestHref(opf, 'title_page_xhtml');
    const coverHref = epubCoverHref(opf);
    const titlePagePath = path.join(epubDir, titleHref);
    const cover = await readFile(path.join(epubDir, coverHref));
    const { width, height } = pngDimensions(cover);
    const titlePage = await readFile(titlePagePath, 'utf8');
    await writeFile(
      titlePagePath,
      insertEpubTitleBanner({
        titlePage,
        titleHref,
        coverHref,
        coverWidth: width,
        coverHeight: height,
      })
    );

    const packagedEpub = path.join(stageDir, 'book.epub');
    await runCommand('zip', ['-X', '-q', '-0', packagedEpub, 'mimetype'], { cwd: stageDir });
    await runCommand('zip', ['-X', '-q', '-r', packagedEpub, 'META-INF', 'EPUB'], {
      cwd: stageDir,
    });
    await rename(packagedEpub, epubPath);
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

/**
 * `cwd` matters: image references embedded by `extractBookDiagrams` (Task 14)
 * are bare filenames like `![](03-slug-diagram-1.png)`, written alongside the
 * manuscript in `outDir`. Both pandoc and the xelatex engine `latexmk` drives
 * resolve relative image paths against the spawned process's working
 * directory, not against the manuscript file's directory — so without `cwd`
 * set to `outDir`, every diagram fails to resolve during pdf/epub/html
 * rendering. `manuscriptPath`/`texPath`/`outDir` are already absolute at every
 * call site in this file, so pointing `cwd` at `outDir` doesn't change how
 * those absolute paths resolve.
 */
export function runCommand(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    );
  });
}

/**
 * Pure: the ordered list of subprocess invocations `renderTarget` runs for a
 * given target, each with the `cwd: outDir` option described above. Kept
 * separate from `renderTarget` so the `cwd` wiring can be checked by a test
 * without spawning anything.
 *
 * @returns {Array<{command: string, args: string[], options: {cwd: string}}>}
 */
export function renderInvocations({ manuscriptPath, bookDir, outDir, target }) {
  if (target === 'manuscript') return [];
  const invocations = [
    {
      command: 'pandoc',
      args: pandocArgs({ manuscriptPath, bookDir, target, outDir }),
      options: { cwd: outDir },
    },
  ];
  if (target === 'pdf') {
    const texPath = path.join(outDir, 'book.tex');
    invocations.push({
      command: 'latexmk',
      args: latexmkArgs({ texPath, outDir }),
      options: { cwd: outDir },
    });
  }
  return invocations;
}

export async function renderTarget({ manuscriptPath, bookDir, outDir, target }) {
  for (const { command, args, options } of renderInvocations({
    manuscriptPath,
    bookDir,
    outDir,
    target,
  })) {
    await runCommand(command, args, options);
  }
  if (target === 'epub') await injectEpubTitleBanner(path.join(outDir, OUTPUT_NAME.epub));
}
