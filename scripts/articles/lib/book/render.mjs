// Rendering. Pandoc for every target; latexmk on top of it for PDF, because a
// table of contents and a makeindex index both need multiple passes and pandoc
// runs the engine exactly once.

import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function pngDimensions(png) {
  if (
    png.length < PNG_SIGNATURE.length ||
    !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new Error('EPUB cover image is not a PNG');
  }
  if (png.length < 33 || png.readUInt32BE(8) !== 13 || png.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('EPUB cover image has an invalid IHDR chunk');
  }
  if (crc32(png.subarray(12, 29)) !== png.readUInt32BE(29)) {
    throw new Error('EPUB cover image has an invalid IHDR CRC');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width === 0 || height === 0) throw new Error('EPUB cover image has invalid dimensions');
  return { width, height };
}

function assertSafeEpubPathPart(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    throw new Error(`unsafe EPUB path: ${value}`);
  }
  const segments = value.split('/');
  if (
    segments.some(
      (segment, index) =>
        segment === '.' || segment === '..' || (segment === '' && index !== segments.length - 1)
    )
  ) {
    throw new Error(`unsafe EPUB path: ${value}`);
  }
}

export function resolveEpubPath(root, href) {
  assertSafeEpubPathPart(href);
  const resolved = path.resolve(root, ...href.split('/'));
  const relative = path.relative(path.resolve(root), resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`unsafe EPUB path: ${href}`);
  }
  return resolved;
}

export function assertSafeArchiveEntry(root, entryName) {
  resolveEpubPath(root, entryName);
  return true;
}

export function validateZipEntries(root, entryNames, modes) {
  if (!Array.isArray(entryNames) || !Array.isArray(modes) || entryNames.length !== modes.length) {
    throw new Error('EPUB ZIP metadata does not match its entry list');
  }
  entryNames.forEach((entryName, index) => {
    assertSafeArchiveEntry(root, entryName);
    if (!['-', 'd'].includes(modes[index])) {
      throw new Error(`unsafe EPUB entry type: ${entryName}`);
    }
  });
}

export async function assertExtractedEpubTreeSafe(root) {
  const entry = await lstat(root);
  if (!entry.isDirectory()) throw new Error(`unsafe EPUB extracted entry: ${root}`);
  for (const name of await readdir(root)) {
    const child = path.join(root, name);
    const childStat = await lstat(child);
    if (childStat.isSymbolicLink() || (!childStat.isFile() && !childStat.isDirectory())) {
      throw new Error(`unsafe EPUB extracted entry: ${child}`);
    }
    if (childStat.isDirectory()) await assertExtractedEpubTreeSafe(child);
  }
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

function readCommand(command, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited ${code}: ${stderr}`));
    });
  });
}

async function listZipEntries(epubPath) {
  const [namesOutput, modesOutput] = await Promise.all([
    readCommand('unzip', ['-Z1', epubPath]),
    readCommand('unzip', ['-Z', '-l', epubPath]),
  ]);
  return {
    names: namesOutput.split('\n').filter(Boolean),
    modes: modesOutput
      .split('\n')
      .filter((line) => /^[-dlcbps?]/.test(line))
      .map((line) => line[0]),
  };
}

export async function injectEpubTitleBanner(
  epubPath,
  { run = runCommand, listEntries = listZipEntries } = {}
) {
  const targetPath = path.resolve(epubPath);
  const targetDir = path.dirname(targetPath);
  const { names, modes } = await listEntries(targetPath);
  const validationRoot = path.join(targetDir, '.epub-entry-validation');
  validateZipEntries(validationRoot, names, modes);
  const stageDir = await mkdtemp(
    path.join(targetDir, `.${path.basename(targetPath)}-title-banner-`)
  );
  try {
    await run('unzip', ['-qq', targetPath, '-d', stageDir]);
    await assertExtractedEpubTreeSafe(stageDir);
    const epubDir = resolveEpubPath(stageDir, 'EPUB');
    const opfPath = resolveEpubPath(epubDir, 'content.opf');
    const opf = await readFile(opfPath, 'utf8');
    const titleHref = epubManifestHref(opf, 'title_page_xhtml');
    const coverHref = epubCoverHref(opf);
    const titlePagePath = resolveEpubPath(epubDir, titleHref);
    const cover = await readFile(resolveEpubPath(epubDir, coverHref));
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

    const packagedEpub = path.join(stageDir, `${path.basename(targetPath)}.replacement`);
    await run('zip', ['-X', '-q', '-0', packagedEpub, 'mimetype'], { cwd: stageDir });
    await run('zip', ['-X', '-q', '-r', packagedEpub, 'META-INF', 'EPUB'], {
      cwd: stageDir,
    });
    await rename(packagedEpub, targetPath);
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
