// Assemble the whole book into one markdown file.
//
// Target matters here rather than in a post-processing pass, because Part
// dividers, index entries, and the appendix switch all need different markup
// per target and rewriting LaTeX out of a string afterwards is guesswork.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseArticle } from '../parse-article.mjs';
import { convertLine, parseBibliography } from './footnotes.mjs';
import { parseGlossary, renderGlossary } from './glossary.mjs';
import { planChapters, shiftHeading } from './headings.mjs';
import { annotateLines, buildMatcher, renderLinkedIndex } from './index-terms.mjs';
import { MarkerError, scanSections, validateArticle } from './markers.mjs';
import { listSpine } from './spine.mjs';
import { applyBookStrip } from './strip.mjs';
import { dedupeSources, renderSources } from './sources.mjs';

const indexTargetFor = (target) =>
  target === 'pdf' ? 'pdf' : target === 'manuscript' ? 'none' : 'anchor';

async function loadArticle(entry, { isFirst }) {
  const parsed = parseArticle(entry.source, { keepComments: true });
  const scanned = scanSections(parsed.sections, entry.file);
  validateArticle(scanned, { file: entry.file, isFirst });

  const preamble = scanned[0]?.heading === null ? scanned[0].items : [];
  const markerOf = (verb) =>
    preamble.find((item) => item.kind === 'marker' && item.verb === verb) ?? null;

  const { sections, bibliographyLines } = applyBookStrip(scanned);

  return {
    slug: entry.slug,
    file: entry.file,
    title: parsed.title,
    chapterTitle: markerOf('chapter')?.attrs.title ?? null,
    part: markerOf('part')?.attrs.title ?? null,
    mergeIntoPrevious: markerOf('merge-into-previous') !== null,
    sections,
    bibliography: parseBibliography(bibliographyLines),
  };
}

async function resolveIncludes(items, { bookDir, file, indexTarget }) {
  const lines = [];
  let demote = 0;
  for (const item of items) {
    if (item.kind === 'text') {
      lines.push({ text: item.text, demote });
      continue;
    }
    if (item.verb === 'demote') {
      demote += Number(item.attrs.by);
      continue;
    }
    // `pagebreak` and `index` are LaTeX-only instructions. Emitting them
    // unconditionally would leak raw markup into EPUB, HTML, and the clean
    // reviewable manuscript, which is exactly what the target parameter exists
    // to prevent.
    if (item.verb === 'pagebreak') {
      if (indexTarget === 'pdf') lines.push({ text: '\\newpage', demote, raw: true });
      continue;
    }
    if (item.verb === 'index') {
      if (indexTarget === 'pdf') {
        lines.push({ text: `\\index{${item.attrs.term}}`, demote, raw: true });
      } else if (indexTarget === 'anchor') {
        lines.push({
          text: `<a id="ix-manual-${lines.length}"></a>`,
          demote,
          raw: true,
        });
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
      for (const text of fragment.replace(/\n+$/, '').split('\n')) {
        lines.push({ text, demote });
      }
      continue;
    }
  }
  return lines;
}

/**
 * @param {{articlesDir: string, bookDir: string, target: 'pdf'|'epub'|'html'|'manuscript'}} options
 * @returns {Promise<{markdown: string, chapters: number, footnotes: number, indexTerms: number}>}
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

  for (const chapter of chapters) {
    if (chapter.part) {
      body.push(isPdf ? `\\part{${chapter.part}}` : `# ${chapter.part}`, '');
    }
    body.push(`# ${chapter.title}`, '');

    for (const member of chapter.members) {
      const { article, shift } = member;
      const ctx = {
        bibByUrl: new Map(article.bibliography.map((e) => [e.url, e])),
        chapterBySlug,
        footnotes,
        idPrefix: `c${String(chapter.number).padStart(2, '0')}`,
        file: article.file,
      };

      if (shift > 0) body.push(`## ${article.title}`, '');

      for (const section of article.sections) {
        const sectionName = section.heading ?? chapter.title;
        if (section.heading) {
          body.push(shiftHeading(`## ${section.heading}`, shift), '');
        }
        const resolved = await resolveIncludes(section.items, {
          bookDir,
          file: article.file,
          indexTarget,
        });
        const converted = resolved.map((line) =>
          line.raw ? line.text : shiftHeading(convertLine(line.text, ctx), shift + line.demote)
        );
        const annotated = annotateLines(converted, matcher, {
          target: indexTarget,
          location: { chapter: chapter.number, section: sectionName },
          hits,
          seen: new Set(),
        });
        body.push(...annotated, '');
      }
    }
  }

  const introduction = await readFile(path.join(bookDir, 'introduction.md'), 'utf8');
  const sources = dedupeSources(articles.map((a) => a.bibliography));

  const out = [introduction.replace(/\n+$/, ''), ''];
  out.push(...body);
  if (footnotes.length > 0) {
    out.push(...footnotes.map((f) => `[^${f.id}]: ${f.text}`), '');
  }
  if (isPdf) out.push('\\appendix', '');
  out.push('# Glossary', '', ...renderGlossary(glossaryTerms));
  out.push('# Sources', '', ...renderSources(sources), '');
  out.push('# Index', '');
  out.push(...(isPdf ? ['\\printindex', ''] : [...renderLinkedIndex(hits), '']));

  return {
    markdown: `${out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()}\n`,
    chapters: chapters.length,
    footnotes: footnotes.length,
    indexTerms: hits.size,
  };
}
