// Index hits.
//
// One entry per term per `##` section, never per match. Indexing every
// occurrence of "evidence gate" in a book about evidence gates produces an
// index entry per paragraph, which is the same as having no index.
//
// The same pass serves all targets: `\index{}` for LaTeX, an anchor for
// reflowable formats, nothing at all for the clean reviewable manuscript.

const FENCE_RE = /^```/;
const LINK_TARGET_RE = /\]\([^)]*\)/g;

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Longest phrase first, so "evidence gate" wins over a shorter overlapping
 * alias when both could match the same span.
 *
 * @param {Array<{term: string, aliases: string[]}>} terms
 */
export function buildMatcher(terms) {
  const entries = [];
  for (const term of terms) {
    for (const phrase of [term.term, ...term.aliases]) {
      entries.push({
        term: term.term,
        phrase,
        re: new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i'),
      });
    }
  }
  return entries.sort((a, b) => b.phrase.length - a.phrase.length);
}

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof buildMatcher>} matcher
 * @param {{target: 'pdf'|'anchor'|'none', location: {chapter: number, section: string}, hits: Map<string, Array<object>>, seen: Set<string>}} options
 * @returns {string[]}
 */
export function annotateLines(lines, matcher, { target, location, hits, seen }) {
  let inFence = false;
  return lines.map((line) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence || line.trim() === '' || line.startsWith('#')) return line;

    const searchable = line.replace(LINK_TARGET_RE, ']()');
    let annotated = line;
    for (const entry of matcher) {
      if (seen.has(entry.term)) continue;
      if (!entry.re.test(searchable)) continue;
      seen.add(entry.term);
      const list = hits.get(entry.term) ?? [];
      const anchor = `ix-${slugify(entry.term)}-${location.chapter}-${list.length + 1}`;
      // The anchor id travels with the hit so `renderLinkedIndex` can point at
      // it. Recomputing it there from an array position was how the anchors
      // ended up written but never linked.
      list.push(target === 'anchor' ? { ...location, anchor } : { ...location });
      hits.set(entry.term, list);
      if (target === 'pdf') {
        annotated += `\\index{${entry.term}}`;
      } else if (target === 'anchor') {
        annotated += `<a id="${anchor}"></a>`;
      }
    }
    return annotated;
  });
}

/**
 * Reflowable formats have no page numbers, so the index navigates by link
 * instead. A hit that carries an anchor renders as a link to it; one that does
 * not renders as plain text rather than as a link to nowhere.
 *
 * @param {Map<string, Array<{chapter: number, section: string, anchor?: string}>>} hits
 */
export function renderLinkedIndex(hits) {
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const label = (l) => `Chapter ${l.chapter} (${l.section})`;
  return [...hits.entries()]
    .sort((a, b) => collator.compare(a[0], b[0]))
    .map(
      ([term, locations]) =>
        `- **${term}** — ${locations
          .map((l) => (l.anchor ? `[${label(l)}](#${l.anchor})` : label(l)))
          .join(', ')}`
    );
}
