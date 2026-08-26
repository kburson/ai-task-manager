// `book:` markers — the composition hints the author leaves inside articles.
//
// They are HTML comments, so `parse-article.mjs` strips them for the LinkedIn
// path without anyone doing anything. The book path parses them instead.
//
// Every failure here is loud. A typo'd verb that silently did nothing would
// drop a section out of the book with no signal at all.

const MARKER_LINE_RE = /^<!--\s*book:([a-z][a-z-]*)\s*(.*?)\s*-->$/;
const MARKER_ANYWHERE_RE = /<!--\s*book:/;
const ATTR_RE = /([a-z][a-z-]*)=(?:"([^"]*)"|(\S+))/y;
const FENCE_RE = /^```/;

export const VERBS = new Set([
  'part',
  'chapter',
  'merge-into-previous',
  'demote',
  'exclude',
  'end',
  'include',
  'pagebreak',
  'index',
]);

const ATTRS_BY_VERB = new Map([
  ['part', new Set(['title'])],
  ['chapter', new Set(['title'])],
  ['merge-into-previous', new Set()],
  ['demote', new Set(['by'])],
  ['exclude', new Set()],
  ['end', new Set()],
  ['include', new Set(['path'])],
  ['pagebreak', new Set()],
  ['index', new Set(['term'])],
]);
const KNOWN_ATTRS = new Set([...ATTRS_BY_VERB.values()].flatMap((attrs) => [...attrs]));

export class MarkerError extends Error {
  constructor(message, file) {
    super(`${file}: ${message}`);
    this.name = 'MarkerError';
    this.file = file;
  }
}

/**
 * @returns {{verb: string, attrs: Record<string, string>}|null} null when the
 *   line is not a `book:` marker at all.
 */
export function parseMarkerLine(line, file) {
  const trimmed = line.trim();
  const match = trimmed.match(MARKER_LINE_RE);
  if (!match) {
    if (MARKER_ANYWHERE_RE.test(trimmed)) {
      throw new MarkerError(`marker must be alone on its line: ${trimmed}`, file);
    }
    return null;
  }
  const [, verb, rest] = match;
  if (!VERBS.has(verb)) {
    throw new MarkerError(`unknown marker verb "book:${verb}": ${trimmed}`, file);
  }
  const attrs = {};
  let cursor = 0;
  while (cursor < rest.length) {
    while (/\s/.test(rest[cursor] ?? '')) cursor += 1;
    if (cursor === rest.length) break;
    ATTR_RE.lastIndex = cursor;
    const attr = ATTR_RE.exec(rest);
    if (attr === null) {
      throw new MarkerError(`malformed marker attributes: ${trimmed}`, file);
    }
    const key = attr[1];
    if (Object.hasOwn(attrs, key)) {
      throw new MarkerError(`duplicate marker attribute "${key}": ${trimmed}`, file);
    }
    if (!KNOWN_ATTRS.has(key)) {
      throw new MarkerError(`unknown marker attribute "${key}": ${trimmed}`, file);
    }
    if (!ATTRS_BY_VERB.get(verb).has(key)) {
      throw new MarkerError(`book:${verb} does not accept attribute "${key}": ${trimmed}`, file);
    }
    attrs[key] = attr[2] ?? attr[3];
    cursor = ATTR_RE.lastIndex;
  }
  return { verb, attrs };
}

function stripCommentSpans(text, inComment, { rejectBookMarkers = false, file } = {}) {
  let cursor = 0;
  let clean = '';
  let removed = inComment;
  while (cursor < text.length) {
    if (inComment) {
      const close = text.indexOf('-->', cursor);
      removed = true;
      if (close === -1) return { text: clean, inComment: true, removed };
      cursor = close + 3;
      inComment = false;
      continue;
    }
    const open = text.indexOf('<!--', cursor);
    if (open === -1) {
      clean += text.slice(cursor);
      break;
    }
    if (rejectBookMarkers && /^<!--\s*book:/.test(text.slice(open))) {
      throw new MarkerError(`marker must be alone on its line: ${text.trim()}`, file);
    }
    clean += text.slice(cursor, open);
    cursor = open + 4;
    inComment = true;
    removed = true;
  }
  return { text: clean, inComment, removed };
}

/**
 * Strip HTML comments without changing fenced examples. Article callers may
 * preserve standalone book markers for the marker scanner; inline markers
 * still fail through parseMarkerLine.
 */
export function stripHtmlCommentsOutsideFences(
  source,
  { preserveBookMarkers = false, file = '<book source>' } = {}
) {
  let inFence = false;
  let inComment = false;
  return source
    .split('\n')
    .map((text) => {
      if (!inComment && FENCE_RE.test(text)) {
        inFence = !inFence;
        return text;
      }
      if (inFence) return text;
      if (!inComment && preserveBookMarkers && parseMarkerLine(text, file) !== null) return text;
      const stripped = stripCommentSpans(text, inComment, {
        rejectBookMarkers: preserveBookMarkers,
        file,
      });
      inComment = stripped.inComment;
      return stripped.text;
    })
    .join('\n');
}

/**
 * Turn `parseArticle` sections into ordered item streams where markers are
 * first-class rather than lines of text. Fenced code is left alone; a marker
 * inside a fence is prose about markers, not a marker.
 *
 * Every other HTML comment is dropped here, once marker scanning has had its
 * look. The book path asks `parseArticle` to keep comments so the `book:`
 * markers survive, but that also preserves `markdownlint-disable` pragmas and
 * the author's private editorial notes — and pandoc passes raw HTML straight
 * through into the distributed `book.html`. Nothing that is not a marker has
 * any business in the manuscript.
 */
export function scanSections(sections, file) {
  return sections.map((section) => {
    const items = [];
    let inFence = false;
    let inComment = false;
    for (const text of section.lines) {
      if (!inComment && FENCE_RE.test(text)) {
        inFence = !inFence;
        items.push({ kind: 'text', text });
        continue;
      }
      if (inFence) {
        items.push({ kind: 'text', text });
        continue;
      }
      if (!inComment) {
        const marker = parseMarkerLine(text, file);
        if (marker) {
          items.push({ kind: 'marker', ...marker });
          continue;
        }
      }
      const stripped = stripCommentSpans(text, inComment, { rejectBookMarkers: true, file });
      inComment = stripped.inComment;
      if (!stripped.removed || stripped.text.trim() !== '') {
        items.push({ kind: 'text', text: stripped.text });
      }
    }
    return { heading: section.heading, items };
  });
}

export function validateArticle(scanned, { file, isFirst }) {
  let open = 0;
  scanned.forEach((section, sectionIndex) => {
    for (const item of section.items) {
      if (item.kind !== 'marker') continue;
      const { verb, attrs } = item;

      if ((verb === 'part' || verb === 'chapter') && sectionIndex !== 0) {
        throw new MarkerError(`book:${verb} must appear in the article preamble`, file);
      }
      if (verb === 'chapter' && !attrs.title) {
        throw new MarkerError('book:chapter requires title="..."', file);
      }
      if (verb === 'part' && !attrs.title) {
        throw new MarkerError('book:part requires title="..."', file);
      }
      if (verb === 'merge-into-previous' && isFirst) {
        throw new MarkerError('book:merge-into-previous cannot be on the first article', file);
      }
      if (verb === 'demote' && !/^\d+$/.test(attrs.by ?? '')) {
        throw new MarkerError('book:demote requires by=<integer>', file);
      }
      if (verb === 'include' && !attrs.path) {
        throw new MarkerError('book:include requires path=<fragment path>', file);
      }
      if (verb === 'index' && !attrs.term) {
        throw new MarkerError('book:index requires term="..."', file);
      }
      if (verb === 'exclude') open += 1;
      if (verb === 'end') {
        open -= 1;
        if (open < 0) throw new MarkerError('book:end without a matching book:exclude', file);
      }
    }
  });
  if (open > 0) throw new MarkerError('unclosed book:exclude span', file);
}
