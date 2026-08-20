// Orchestration: article Markdown in, ready-to-paste publish folder out.
//
// Layout under `.tmp/published/`:
//
//   _diagrams/                       every assets/diagrams/*.mmd, rendered
//   <article-slug>/
//     article.html                   the copy-and-paste article body
//     companion-post.txt             the feed announcement
//     article-0N-header.png          the cover image to upload
//     <slug>-diagram-N.png           the in-body diagrams, in document order
//
// Publishing one article means opening exactly one folder.
//
// This module never writes inside docs/articles/ — the source tree is read-only
// to the publisher.

import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildCompanionPost } from './companion-post.mjs';
import { extractMermaidFences, renderMermaidSource, runPool } from './diagrams.mjs';
import { buildHtmlDocument } from './html-document.mjs';
import { sectionsToHtml } from './markdown-to-html.mjs';
import { parseArticle } from './parse-article.mjs';
import { applyStripRules } from './strip-rules.mjs';

export const ARTICLE_FILE_RE = /^(\d{2})-[a-z0-9-]+\.md$/;
export const DIAGRAM_LIBRARY_DIR = '_diagrams';
export const ARTICLE_HTML = 'article.html';
export const COMPANION_POST = 'companion-post.txt';
export const DRIFT_REPORT = 'diagram-drift-report.txt';

function hasLeadingDraftMarker(source) {
  let remaining = source;
  while (true) {
    const comment = remaining.match(/^\s*(<!--[\s\S]*?-->)/);
    if (!comment) return false;
    if (comment[1].startsWith('<!-- DRAFT:')) return true;
    remaining = remaining.slice(comment[0].length);
  }
}

/** Every publishable article file in `docs/articles/`, in series order. */
export async function listArticles(articlesDir) {
  const names = (await readdir(articlesDir)).filter((name) => ARTICLE_FILE_RE.test(name)).sort();
  const candidates = await Promise.all(
    names.map(async (name) => ({
      name,
      source: await readFile(path.join(articlesDir, name), 'utf8'),
    }))
  );
  return candidates
    .filter((candidate) => !hasLeadingDraftMarker(candidate.source))
    .map(({ name }) => ({
      file: name,
      slug: name.replace(/\.md$/, ''),
      number: name.slice(0, 2),
      path: path.join(articlesDir, name),
    }));
}

/**
 * Pure transform: Markdown source -> the text artifacts for one article.
 * No filesystem writes, no rendering — this is what the unit lane exercises.
 */
export function convertArticle({ source, slug }) {
  const parsed = parseArticle(source);
  const { sections, shape } = applyStripRules(parsed);
  const extracted = extractMermaidFences(sections, slug);
  const blocks = sectionsToHtml(extracted.sections);
  return {
    title: parsed.title,
    bannerPath: parsed.bannerPath,
    diagrams: extracted.diagrams,
    html: buildHtmlDocument({ title: parsed.title, blocks }),
    companionPost: buildCompanionPost({ title: parsed.title, shapeLines: shape.lines }),
  };
}

function normalizeMermaid(code) {
  return code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}

/** Render every `.mmd` under assets/diagrams/ into the shared library folder. */
export async function renderDiagramLibrary({ diagramsDir, outDir, skipDiagrams }) {
  const names = (await readdir(diagramsDir)).filter((name) => name.endsWith('.mmd')).sort();
  await mkdir(outDir, { recursive: true });
  const sources = await Promise.all(
    names.map(async (name) => ({
      name,
      code: await readFile(path.join(diagramsDir, name), 'utf8'),
    }))
  );
  if (!skipDiagrams) {
    await runPool(
      sources.map(
        (entry) => () =>
          renderMermaidSource(entry.code, path.join(outDir, entry.name.replace(/\.mmd$/, '.png')))
      )
    );
  }
  return sources;
}

/**
 * Write one article's publish folder. Returns the drift findings for its
 * in-body fences: a fence with no exact match in the `.mmd` library means the
 * two copies of that diagram have diverged, which is worth reporting but is
 * never a reason to block a publish — the article body is what readers see.
 */
export async function publishArticle({ article, outRoot, librarySources, skipDiagrams }) {
  const source = await readFile(article.path, 'utf8');
  const converted = convertArticle({ source, slug: article.slug });
  const outDir = path.join(outRoot, article.slug);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, ARTICLE_HTML), converted.html, 'utf8');
  await writeFile(path.join(outDir, COMPANION_POST), converted.companionPost, 'utf8');

  if (converted.bannerPath) {
    const from = path.resolve(path.dirname(article.path), converted.bannerPath);
    await copyFile(from, path.join(outDir, path.basename(converted.bannerPath)));
  }

  if (!skipDiagrams) {
    await runPool(
      converted.diagrams.map(
        (diagram) => () => renderMermaidSource(diagram.code, path.join(outDir, diagram.imageName))
      )
    );
  }

  const known = new Set(librarySources.map((entry) => normalizeMermaid(entry.code)));
  const drift = converted.diagrams
    .filter((diagram) => !known.has(normalizeMermaid(diagram.code)))
    .map(
      (diagram) => `${article.file}: ${diagram.imageName} has no exact match under assets/diagrams/`
    );

  return { outDir, diagramCount: converted.diagrams.length, drift };
}

/**
 * Full publish pass.
 *
 * @param {{articlesDir: string, outRoot: string, only?: string|null, skipDiagrams?: boolean}} options
 */
export async function publishAll({ articlesDir, outRoot, only = null, skipDiagrams = false }) {
  const all = await listArticles(articlesDir);
  const selected = only
    ? all.filter((article) => article.slug === only || article.number === only)
    : all;
  if (selected.length === 0) {
    throw new Error(`no article matched "${only}" in ${articlesDir}`);
  }

  await mkdir(outRoot, { recursive: true });
  // The shared `.mmd` library is a whole-corpus artifact, so a single-article
  // run reads it (drift detection needs the sources) but does not spend ~18
  // headless-Chromium renders re-producing images it did not change.
  const librarySources = await renderDiagramLibrary({
    diagramsDir: path.join(articlesDir, 'assets', 'diagrams'),
    outDir: path.join(outRoot, DIAGRAM_LIBRARY_DIR),
    skipDiagrams: skipDiagrams || Boolean(only),
  });

  const results = [];
  for (const article of selected) {
    results.push(await publishArticle({ article, outRoot, librarySources, skipDiagrams }));
  }

  const drift = results.flatMap((result) => result.drift);
  // Only a whole-corpus pass may write the drift report; a single-article run
  // would otherwise overwrite a complete report with one article's findings.
  if (!only) {
    await writeFile(
      path.join(outRoot, DRIFT_REPORT),
      drift.length === 0
        ? 'No drift: every in-body Mermaid fence matches a file under assets/diagrams/.\n'
        : `${drift.length} in-body fence(s) have drifted from assets/diagrams/:\n\n${drift.join('\n')}\n`,
      'utf8'
    );
  }

  return { results, drift, libraryCount: librarySources.length };
}
