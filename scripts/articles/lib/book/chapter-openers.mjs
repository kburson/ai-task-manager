// Target-specific chapter opener markup and validated image staging.

import { constants, accessSync } from 'node:fs';
import { access, copyFile, mkdir, open } from 'node:fs/promises';
import path from 'node:path';

const BOOK_BANNER_RE = /^assets\/article-headers\/[^/]+\.png$/;
const TITLE_IMAGE_NAME = 'title-page.png';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const LATEX_ESCAPES = Object.freeze({
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
});

export function escapeLatex(value) {
  return String(value).replace(/[\\{}$&#_%~^]/g, (character) => LATEX_ESCAPES[character]);
}

export function chapterOpenerFor({ target, chapter, imageName, subtitle }) {
  const number = chapter.number;
  if (target === 'pdf') {
    return [`\\bookchapter{${imageName}}{${escapeLatex(chapter.title)}}{${escapeLatex(subtitle)}}`];
  }
  if (target === 'manuscript') {
    return [
      `![Chapter ${number} header](${imageName})`,
      '',
      `# ${chapter.title}`,
      '',
      `<div align="center">${subtitle}</div>`,
      '',
    ];
  }
  if (target === 'html' || target === 'epub') {
    return [
      '::: {.chapter-opener}',
      `# ${chapter.title} {.chapter-title}`,
      '::: {.chapter-image}',
      `![Chapter ${number} header](${imageName})`,
      ':::',
      `<div class="chapter-subtitle">${subtitle}</div>`,
      ':::',
      '',
    ];
  }
  throw new Error(`unsupported chapter opener target: ${target}`);
}

function assertContained(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the approved root`);
  }
}

export function planChapterImages({ articlesDir, chapters, outDir }) {
  const articleRoot = path.resolve(articlesDir);
  const outputRoot = path.resolve(outDir);
  const seenOutputs = new Set();
  const plan = chapters.map((chapter) => {
    const first = chapter.members?.[0]?.article ?? chapter;
    const chapterNumber = chapter.number ?? chapter.chapter;
    if (!first || !chapterNumber) throw new Error('chapter image has no chapter number or banner');
    if (!BOOK_BANNER_RE.test(first.bannerPath ?? '')) {
      throw new Error(
        `${first.slug ?? `chapter ${chapterNumber}`} has an invalid book banner path`
      );
    }

    const sourcePath = path.resolve(articleRoot, first.bannerPath);
    assertContained(articleRoot, sourcePath, 'book banner');
    try {
      accessSync(sourcePath, constants.R_OK);
    } catch {
      throw new Error(`cannot read book banner: ${first.bannerPath}`);
    }

    const imageName = `chapter-${String(chapterNumber).padStart(2, '0')}-header.png`;
    const outputPath = path.join(outputRoot, imageName);
    if (seenOutputs.has(outputPath)) {
      throw new Error(`duplicate chapter image output: ${imageName}`);
    }
    seenOutputs.add(outputPath);

    return Object.freeze({
      chapter: chapterNumber,
      sourcePath,
      imageName,
      outputPath,
    });
  });
  return Object.freeze(plan);
}

export async function stageChapterImages(plan) {
  await Promise.all(plan.map(({ sourcePath }) => access(sourcePath, constants.R_OK)));
  await Promise.all(
    plan.map(({ outputPath }) => mkdir(path.dirname(outputPath), { recursive: true }))
  );
  await Promise.all(plan.map(({ sourcePath, outputPath }) => copyFile(sourcePath, outputPath)));
}

export function planTitleImage({ bookDir, outDir }) {
  const bookRoot = path.resolve(bookDir);
  const sourcePath = path.resolve(bookRoot, TITLE_IMAGE_NAME);
  assertContained(bookRoot, sourcePath, 'title image');
  try {
    accessSync(sourcePath, constants.R_OK);
  } catch {
    throw new Error(`cannot read title image: ${TITLE_IMAGE_NAME}`);
  }
  return Object.freeze({
    sourcePath,
    imageName: TITLE_IMAGE_NAME,
    outputPath: path.join(path.resolve(outDir), TITLE_IMAGE_NAME),
  });
}

async function assertPngSignature(sourcePath) {
  const handle = await open(sourcePath, 'r');
  try {
    const signature = Buffer.alloc(PNG_SIGNATURE.length);
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
    if (bytesRead !== PNG_SIGNATURE.length || !signature.equals(PNG_SIGNATURE)) {
      throw new Error('title image has an invalid PNG signature');
    }
  } finally {
    await handle.close();
  }
}

export async function stageTitleImage({ sourcePath, outputPath }) {
  await access(sourcePath, constants.R_OK);
  await assertPngSignature(sourcePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
}
