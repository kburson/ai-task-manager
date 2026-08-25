// `book:` markers — the composition hints the author leaves inside articles.
//
// They are HTML comments, so `parse-article.mjs` strips them for the LinkedIn
// path without anyone doing anything. The book path parses them instead.
//
// Every failure here is loud. A typo'd verb that silently did nothing would
// drop a section out of the book with no signal at all.

const MARKER_LINE_RE = /^<!--\s*book:([a-z][a-z-]*)\s*(.*?)\s*-->$/;
const MARKER_ANYWHERE_RE = /<!--\s*book:/;
const ATTR_RE = /([a-z][a-z-]*)=(?:"([^"]*)"|(\S+))/g;
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
  let consumed = 0;
  for (const attr of rest.matchAll(ATTR_RE)) {
    attrs[attr[1]] = attr[2] ?? attr[3];
    consumed += attr[0].length;
  }
  if (rest.replace(/\s+/g, '').length > 0 && consumed === 0) {
    throw new MarkerError(`malformed marker attributes: ${trimmed}`, file);
  }
  return { verb, attrs };
}

/**
 * Turn `parseArticle` sections into ordered item streams where markers are
 * first-class rather than lines of text. Fenced code is left alone; a marker
 * inside a fence is prose about markers, not a marker.
 */
export function scanSections(sections, file) {
  return sections.map((section) => {
    const items = [];
    let inFence = false;
    for (const text of section.lines) {
      if (FENCE_RE.test(text)) {
        inFence = !inFence;
        items.push({ kind: 'text', text });
        continue;
      }
      const marker = inFence ? null : parseMarkerLine(text, file);
      items.push(marker ? { kind: 'marker', ...marker } : { kind: 'text', text });
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
