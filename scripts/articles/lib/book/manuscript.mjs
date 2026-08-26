// Assemble the whole book into one markdown file.
//
// Target matters here rather than in a post-processing pass, because Part
// dividers, index entries, the appendix switch, and chapter numbering all need
// different markup per target and rewriting LaTeX out of a string afterwards is
// guesswork.
//
// Chapter numbering is the sharpest of those. Under `--top-level-division=
// chapter` a `#` heading is a `\chapter`, and the introduction is a `#` too —
// so LaTeX numbered the introduction 1 and every "(Chapter N)" cross-reference
// in the prose pointed one chapter short. The fix is `\frontmatter` around the
// front matter and `\mainmatter` before the first chapter, which is what the
// `book` class provides for exactly this. EPUB and HTML have no such mechanism
// and pandoc's `--number-sections` would renumber the introduction all over
// again, so those targets carry the number in the heading text instead.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseArticle } from '../parse-article.mjs';
import { chapterOpenerFor } from './chapter-openers.mjs';
import { extractBookDiagrams } from './diagrams.mjs';
import { convertLine, parseBibliography } from './footnotes.mjs';
import { parseGlossary, renderGlossary } from './glossary.mjs';
import { planChapters, shiftHeading } from './headings.mjs';
import { annotateLines, buildMatcher, renderLinkedIndex } from './index-terms.mjs';
import { MarkerError, scanSections, validateArticle } from './markers.mjs';
import { listSpine } from './spine.mjs';
import { applyBookStrip } from './strip.mjs';
import { dedupeSources, renderSources } from './sources.mjs';

const FENCE_RE = /^```/;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * Book-only prose (the introduction, `book:include` fragments) is spliced in
 * raw, so its authoring notes would reach the reader — pandoc passes raw HTML
 * straight through into `book.html`. Article comments are already dropped by
 * `scanSections`; this is the same rule for the files that never pass through
 * it.
 */
const stripComments = (source) => source.replace(HTML_COMMENT_RE, '');

const indexTargetFor = (target) =>
  target === 'pdf' ? 'pdf' : target === 'manuscript' ? 'none' : 'anchor';

async function loadArticle(entry, { isFirst }) {
  const parsed = parseArticle(entry.source, { keepComments: true });
  if (!parsed.subtitle) throw new Error(`${entry.file}: article has no preamble subtitle`);
  if (!parsed.bannerPath) throw new Error(`${entry.file}: article has no banner image`);
  const scanned = scanSections(parsed.sections, entry.file);
  validateArticle(scanned, { file: entry.file, isFirst });

  const preamble = scanned[0]?.heading === null ? scanned[0].items : [];
  const markerOf = (verb) =>
    preamble.find((item) => item.kind === 'marker' && item.verb === verb) ?? null;

  const stripped = applyBookStrip(scanned);
  const subtitleLine = `**${parsed.subtitle}**`;
  let subtitleRemoved = false;
  stripped.sections = stripped.sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (
        !subtitleRemoved &&
        section.heading === null &&
        item.kind === 'text' &&
        item.text === subtitleLine
      ) {
        subtitleRemoved = true;
        return false;
      }
      return true;
    }),
  }));
  if (!subtitleRemoved) throw new Error(`${entry.file}: could not remove captured subtitle`);
  const { sections, diagrams } = extractBookDiagrams(stripped.sections, entry.slug);
  const bibliographyLines = stripped.bibliographyLines;

  return {
    slug: entry.slug,
    file: entry.file,
    title: parsed.title,
    subtitle: parsed.subtitle,
    bannerPath: parsed.bannerPath,
    chapterTitle: markerOf('chapter')?.attrs.title ?? null,
    part: markerOf('part')?.attrs.title ?? null,
    mergeIntoPrevious: markerOf('merge-into-previous') !== null,
    sections,
    diagrams,
    bibliography: parseBibliography(bibliographyLines, entry.file),
  };
}

/**
 * `demote` is deliberately not local to this call: the spec says the shift
 * applies "for the remainder of the article", so the counter belongs to the
 * article and is threaded through as `state`.
 *
 * `book:index` records a real index hit as well as emitting its anchor —
 * without that the manual marker produced an anchor no index page ever pointed
 * at, which is the entire point of the marker. The anchor id comes from a
 * book-wide counter because a per-section one collided across sections and
 * duplicate ids are invalid HTML and fail EPUB validation.
 */
async function resolveIncludes(items, { bookDir, file, indexTarget, state, location, hits }) {
  const lines = [];
  for (const item of items) {
    if (item.kind === 'text') {
      lines.push({ text: item.text, demote: state.demote });
      continue;
    }
    if (item.verb === 'demote') {
      state.demote += Number(item.attrs.by);
      continue;
    }
    // `pagebreak` is a LaTeX-only instruction. Emitting it unconditionally
    // would leak raw markup into EPUB, HTML, and the clean reviewable
    // manuscript, which is exactly what the target parameter exists to prevent.
    if (item.verb === 'pagebreak') {
      if (indexTarget === 'pdf') lines.push({ text: '\\newpage', demote: state.demote, raw: true });
      continue;
    }
    if (item.verb === 'index') {
      const term = item.attrs.term;
      const list = hits.get(term) ?? [];
      if (indexTarget === 'pdf') {
        list.push({ ...location });
        hits.set(term, list);
        lines.push({ text: `\\index{${term}}`, demote: state.demote, raw: true });
      } else if (indexTarget === 'anchor') {
        state.manualIndex += 1;
        const anchor = `ix-manual-${state.manualIndex}`;
        list.push({ ...location, anchor });
        hits.set(term, list);
        lines.push({ text: `<a id="${anchor}"></a>`, demote: state.demote, raw: true });
      }
      continue;
    }
    if (item.verb === 'include') {
      const target = path.join(bookDir, item.attrs.path);
      let fragment;
      try {
        fragment = await readFile(target, 'utf8');
      } catch {
        throw new MarkerError(`book:include cannot read ${item.attrs.path}`, file);
      }
      for (const text of stripComments(fragment).replace(/\n+$/, '').split('\n')) {
        lines.push({ text, demote: state.demote });
      }
      continue;
    }
  }
  return lines;
}

/**
 * Citation conversion and heading shifts must not run over fenced code. A
 * sample containing `[click here](https://example.com)` would otherwise be
 * silently rewritten into a footnote reference, and one containing
 * `[a](b.txt)` would fail the build outright.
 */
function convertOutsideFences(resolved, { ctx, shift }) {
  let inFence = false;
  return resolved.map((line) => {
    if (line.raw) return line.text;
    if (FENCE_RE.test(line.text)) {
      inFence = !inFence;
      return line.text;
    }
    if (inFence) return line.text;
    return shiftHeading(convertLine(line.text, ctx), shift + line.demote);
  });
}

/**
 * A copyright page for the PDF. `book.json`'s `rights` is EPUB metadata and
 * pandoc's LaTeX template ignores it entirely, so the page has to be emitted
 * into the manuscript itself.
 */
function copyrightPage(metadata) {
  const rights = metadata.rights;
  if (!rights) return [];
  return [
    '\\thispagestyle{plain}',
    '',
    '\\vspace*{\\fill}',
    '',
    `\\noindent ${rights}`,
    '',
    '\\vspace*{\\fill}',
    '',
    '\\clearpage',
    '',
  ];
}

/**
 * @param {{articlesDir: string, bookDir: string, target: 'pdf'|'epub'|'html'|'manuscript'}} options
 * @returns {Promise<{markdown: string, chapters: number, footnotes: number, indexTerms: number, sources: number, diagrams: Array<{code: string, imageName: string}>, chapterImages: Array<{chapter: number, slug: string, title: string, subtitle: string, bannerPath: string}>}>}
 */
export async function buildManuscript({ articlesDir, bookDir, target }) {
  const spine = await listSpine(articlesDir);
  const articles = [];
  for (const [i, entry] of spine.entries()) {
    articles.push(await loadArticle(entry, { isFirst: i === 0 }));
  }

  const chapters = planChapters(articles);
  const chapterBySlug = new Map();
  for (const chapter of chapters) {
    for (const member of chapter.members) chapterBySlug.set(member.article.slug, chapter.number);
  }

  const glossaryTerms = parseGlossary(await readFile(path.join(bookDir, 'glossary.md'), 'utf8'));
  const matcher = buildMatcher(glossaryTerms);
  const indexTarget = indexTargetFor(target);
  const isPdf = target === 'pdf';

  const hits = new Map();
  const footnotes = [];
  const body = [];
  const state = { demote: 0, manualIndex: 0 };

  for (const chapter of chapters) {
    if (chapter.part) {
      body.push(isPdf ? `\\part{${chapter.part}}` : `# ${chapter.part}`, '');
    }
    const firstArticle = chapter.members[0].article;
    const imageName = `chapter-${String(chapter.number).padStart(2, '0')}-header.png`;
    body.push(
      ...chapterOpenerFor({
        target,
        chapter,
        imageName,
        subtitle: firstArticle.subtitle,
      })
    );

    for (const member of chapter.members) {
      const { article, shift } = member;
      state.demote = 0;
      const ctx = {
        bibByUrl: new Map(article.bibliography.filter((e) => e.url).map((e) => [e.url, e])),
        chapterBySlug,
        footnotes,
        idPrefix: `c${String(chapter.number).padStart(2, '0')}`,
        file: article.file,
      };

      if (shift > 0) body.push(`## ${article.title}`, '');

      for (const section of article.sections) {
        const sectionName = section.heading ?? chapter.title;
        const location = { chapter: chapter.number, section: sectionName };
        if (section.heading) {
          body.push(shiftHeading(`## ${section.heading}`, shift), '');
        }
        const resolved = await resolveIncludes(section.items, {
          bookDir,
          file: article.file,
          indexTarget,
          state,
          location,
          hits,
        });
        const converted = convertOutsideFences(resolved, { ctx, shift });
        const annotated = annotateLines(converted, matcher, {
          target: indexTarget,
          location,
          hits,
          seen: new Set(),
        });
        body.push(...annotated, '');
      }
    }
  }

  const introduction = stripComments(await readFile(path.join(bookDir, 'introduction.md'), 'utf8'));
  const metadata = JSON.parse(await readFile(path.join(bookDir, 'book.json'), 'utf8'));
  const sources = dedupeSources(articles.map((a) => a.bibliography));

  const out = [];
  if (isPdf) {
    out.push('\\frontmatter', '', ...copyrightPage(metadata));
  }
  out.push(introduction.replace(/\n+$/, ''), '');
  if (isPdf) out.push('\\mainmatter', '');
  out.push(...body);
  if (footnotes.length > 0) {
    out.push(...footnotes.map((f) => `[^${f.id}]: ${f.text}`), '');
  }
  if (isPdf) out.push('\\appendix', '');
  out.push('# Glossary', '', ...renderGlossary(glossaryTerms));
  out.push('# Sources', '', ...renderSources(sources), '');
  // The index is not an appendix. `\printindex` emits its own `\chapter*{Index}`
  // heading, so a `# Index` above it produced "Appendix C — Index" wrapped
  // around a second Index heading.
  if (isPdf) {
    out.push('\\printindex', '');
  } else {
    out.push('# Index', '', ...renderLinkedIndex(hits), '');
  }

  return {
    markdown: `${out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()}\n`,
    chapters: chapters.length,
    footnotes: footnotes.length,
    indexTerms: hits.size,
    sources: sources.length,
    diagrams: articles.flatMap((a) => a.diagrams),
    chapterImages: chapters.map((chapter) => {
      const article = chapter.members[0].article;
      return {
        chapter: chapter.number,
        slug: article.slug,
        title: chapter.title,
        subtitle: article.subtitle,
        bannerPath: article.bannerPath,
      };
    }),
  };
}
