// Citations, converted for print.
//
// On LinkedIn each article is standalone and carries its own `## Bibliography`.
// In the book the inline links become footnotes and the bibliographies are
// hoisted into one deduped appendix.
//
// Sibling-article links are the interesting case: `[Label](05-slug.md)` is a
// real relative path on LinkedIn, rewritten to a live URL during the backfill
// pass. In the book it must become "Label (Chapter 5)" — a path would be a dead
// link on paper.

const LINK_RE = /(!?)\[([^\]]+)\]\(([^)\s]+)\)/g;
const BIB_LINE_RE = /^-\s+(.+?)\.\s+"(.+?)\."\s+(\S+)\s*$/;
const ARTICLE_TARGET_RE = /^(\d{2}-.+)\.md$/;

export class CitationError extends Error {
  constructor(message, file) {
    super(`${file}: ${message}`);
    this.name = 'CitationError';
    this.file = file;
  }
}

/**
 * @param {string[]} lines the `## Bibliography` section's lines
 * @returns {Array<{publisher: string, title: string, url: string, raw: string}>}
 */
export function parseBibliography(lines) {
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const match = trimmed.match(BIB_LINE_RE);
    if (!match) continue;
    entries.push({ publisher: match[1], title: match[2], url: match[3], raw: trimmed });
  }
  return entries;
}

/**
 * @param {string} line
 * @param {{bibByUrl: Map<string, object>, chapterBySlug: Map<string, number>, footnotes: Array<{id: string, text: string}>, idPrefix: string, file: string}} ctx
 * @returns {string}
 */
export function convertLine(line, ctx) {
  return line.replace(LINK_RE, (whole, bang, label, target) => {
    if (bang === '!') return whole;

    if (/^https?:\/\//.test(target)) {
      const entry = ctx.bibByUrl.get(target);
      const text = entry
        ? `${entry.publisher}. "${entry.title}." <${entry.url}>`
        : `${label}. <${target}>`;
      const id = `${ctx.idPrefix}-${ctx.footnotes.length + 1}`;
      ctx.footnotes.push({ id, text });
      return `${label}[^${id}]`;
    }

    const article = target.match(ARTICLE_TARGET_RE);
    if (article) {
      const chapter = ctx.chapterBySlug.get(article[1]);
      if (chapter === undefined) {
        throw new CitationError(`link to "${target}" which is not on the book spine`, ctx.file);
      }
      return `${label} (Chapter ${chapter})`;
    }

    throw new CitationError(
      `link target "${target}" is neither an absolute URL nor a spine article`,
      ctx.file
    );
  });
}
