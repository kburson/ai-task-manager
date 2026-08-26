// Target-specific chapter opener markup and validated image staging.

import { constants, accessSync } from 'node:fs';
import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const BOOK_BANNER_RE = /^assets\/article-headers\/[^/]+\.png$/;

const LATEX_ESCAPES = Object.freeze({
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '$': '\\$',
  '&': '\\&',
  '#': '\\#',
  '_': '\\_',
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
    return [
      `\\bookchapter{${imageName}}{${escapeLatex(chapter.title)}}{${escapeLatex(subtitle)}}`,
    ];
  }
  if (target === 'manuscript') {
    return [
      `![Chapter ${number} header](${imageName})`,
      '',
      `<div align="center">Chapter ${number}</div>`,
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
      `<div class="chapter-number">Chapter ${number}</div>`,
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
    throw new Error(`${label} escapes the article root`);
  }
}

export function planChapterImages({ articlesDir, chapters, outDir }) {
  const articleRoot = path.resolve(articlesDir);
  const outputRoot = path.resolve(outDir);
  const seenOutputs = new Set();
  const plan = chapters.map((chapter) => {
    const first = chapter.members?.[0]?.article;
    if (!first) throw new Error(`chapter ${chapter.number} has no first member banner`);
    if (!BOOK_BANNER_RE.test(first.bannerPath ?? '')) {
      throw new Error(`${first.slug ?? `chapter ${chapter.number}`} has an invalid book banner path`);
    }

    const sourcePath = path.resolve(articleRoot, first.bannerPath);
    assertContained(articleRoot, sourcePath, 'book banner');
    try {
      accessSync(sourcePath, constants.R_OK);
    } catch {
      throw new Error(`cannot read book banner: ${first.bannerPath}`);
    }

    const imageName = `chapter-${String(chapter.number).padStart(2, '0')}-header.png`;
    const outputPath = path.join(outputRoot, imageName);
    if (seenOutputs.has(outputPath)) {
      throw new Error(`duplicate chapter image output: ${imageName}`);
    }
    seenOutputs.add(outputPath);

    return Object.freeze({
      chapter: chapter.number,
      sourcePath,
      imageName,
      outputPath,
    });
  });
  return Object.freeze(plan);
}

export async function stageChapterImages(plan) {
  await Promise.all(plan.map(({ sourcePath }) => access(sourcePath, constants.R_OK)));
  await Promise.all(plan.map(({ outputPath }) => mkdir(path.dirname(outputPath), { recursive: true })));
  await Promise.all(plan.map(({ sourcePath, outputPath }) => copyFile(sourcePath, outputPath)));
}
