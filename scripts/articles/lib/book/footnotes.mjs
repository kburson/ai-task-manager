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
//
// Bibliography parsing never drops an entry. The corpus uses at least three
// citation shapes — `Publisher. "Title." url`, `Publisher, ["Title"](url),
// context.`, and an author-date form with no URL at all — plus line-wrapped
// entries. A parser that recognized one shape and skipped the rest lost a third
// of the sources silently, which is the worst possible failure for a
// bibliography. So: every list item becomes an entry carrying its `raw` text,
// and `publisher`/`title`/`url` are a bonus extracted when the shape allows.

const LINK_RE = /(!?)\[([^\]]+)\]\(([^)\s]+)\)/g;
const ARTICLE_TARGET_RE = /^(\d{2}-.+)\.md(?:#.+)?$/;

const BIB_ITEM_RE = /^[-*+]\s+(.*)$/;
// `Publisher, ["Title"](url), trailing context.`
const BIB_MD_LINK_RE = /^(.+?),\s*\[["“]?(.+?)["”]?\]\((\S+?)\)\s*,?\s*(.*)$/;
// `Publisher. "Title." url` / `Publisher. "Title?"` / `Publisher. "Title." _Journal_.`
const BIB_QUOTED_RE = /^(.+?)\.\s+["“]([^"”]+)["”]\.?\s*(.*)$/;
const URL_RE = /https?:\/\/\S+/;

export class CitationError extends Error {
  constructor(message, file) {
    super(`${file}: ${message}`);
    this.name = 'CitationError';
    this.file = file;
  }
}

const cleanUrl = (value) => value.replace(/[).,;]+$/, '');

const stripTrailingPeriod = (value) => value.replace(/\.$/, '').trim();

// A trailing `.` after the citation's closing paren is sentence punctuation,
// not trailing context; keeping it rendered as a stray " ." in the appendix.
const cleanSuffix = (value) => value.trim().replace(/^[.,;]+$/, '');

/**
 * Structured fields, when the raw text happens to carry a recognisable shape.
 * Anything unrecognized keeps `raw` and gets nulls, which every consumer knows
 * how to handle.
 *
 * @param {string} raw
 */
function structure(raw) {
  const mdLink = raw.match(BIB_MD_LINK_RE);
  if (mdLink) {
    return {
      publisher: mdLink[1].trim(),
      title: stripTrailingPeriod(mdLink[2]),
      url: cleanUrl(mdLink[3]),
      suffix: cleanSuffix(mdLink[4]),
    };
  }
  const quoted = raw.match(BIB_QUOTED_RE);
  if (quoted) {
    const rest = quoted[3].trim();
    const url = rest.match(URL_RE);
    return {
      publisher: quoted[1].trim(),
      title: stripTrailingPeriod(quoted[2]),
      url: url ? cleanUrl(url[0]) : null,
      suffix: cleanSuffix(url ? rest.replace(url[0], '') : rest),
    };
  }
  const bare = raw.match(URL_RE);
  return { publisher: null, title: null, url: bare ? cleanUrl(bare[0]) : null, suffix: '' };
}

/**
 * Every list item under `## Bibliography` becomes an entry. Indented lines
 * continue the preceding item. Blank-separated, URL-free prose is a note
 * rather than a source and is ignored. Any unindented adjacent line or
 * isolated URL-bearing prose is an authoring mistake and is reported.
 *
 * @param {string[]} lines the `## Bibliography` section's lines, blanks included
 * @param {string} [file] for the error message
 * @returns {Array<{publisher: string|null, title: string|null, url: string|null, suffix: string, raw: string}>}
 */
export function parseBibliography(lines, file = '<bibliography>') {
  /** @type {string[]} */
  const raws = [];
  let adjacentToItem = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      adjacentToItem = false;
      continue;
    }
    const item = trimmed.match(BIB_ITEM_RE);
    if (item) {
      raws.push(item[1].trim());
      adjacentToItem = true;
      continue;
    }
    if (adjacentToItem && /^\s+/.test(line)) {
      raws[raws.length - 1] = `${raws[raws.length - 1]} ${trimmed}`;
      continue;
    }
    if (!adjacentToItem && !URL_RE.test(trimmed)) continue;
    throw new CitationError(`bibliography line is not a list item: ${trimmed}`, file);
  }

  return raws.map((raw) => {
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    return { ...structure(cleaned), raw: cleaned };
  });
}

/**
 * The footnote body for a citation. Structured when the shape allowed it, the
 * raw entry text when it did not — never a silent blank.
 *
 * @param {{publisher: string|null, title: string|null, url: string|null, raw: string}} entry
 */
export function footnoteText(entry) {
  if (entry.publisher && entry.title) {
    const title = /[?!]$/.test(entry.title) ? entry.title : `${entry.title}.`;
    return entry.url
      ? `${entry.publisher}. "${title}" <${entry.url}>`
      : `${entry.publisher}. "${title}"`;
  }
  // Unstructured entries already read as a sentence and already carry their URL
  // inline when they have one, so the raw text is the honest footnote.
  return entry.raw;
}

/**
 * @param {string} line
 * @param {{bibByUrl: Map<string, object>, chapterBySlug: Map<string, number>, footnotes: Array<{id: string, text: string}>, idPrefix: string, file: string}} ctx
 * @returns {string}
 */
export function convertLine(line, ctx) {
  return line.replace(LINK_RE, (whole, bang, label, target) => {
    if (bang === '!') return whole;

    // A same-document anchor (e.g. a heading cross-reference within the
    // article) stays a live link in the manuscript — the heading it points
    // to is still in the same chapter. Nothing to convert to a footnote.
    if (target.startsWith('#')) return whole;

    if (/^https?:\/\//.test(target)) {
      const entry = ctx.bibByUrl.get(target);
      const text = entry ? footnoteText(entry) : `${label}. <${target}>`;
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
