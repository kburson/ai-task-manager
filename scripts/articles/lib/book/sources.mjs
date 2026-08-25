// The Sources appendix: every chapter's bibliography, merged.
//
// Dedupe is by URL where there is one, because the same report is cited by
// several articles and a book that lists it four times looks careless. Entries
// with no URL — the author-date and book-citation forms — dedupe on their
// normalized raw text instead, so they neither collide with each other under a
// shared `null` key nor repeat verbatim.
//
// Footnote markers still repeat freely on each citation — that is normal.

import { footnoteText } from './footnotes.mjs';

const normalize = (raw) =>
  raw
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/, '')
    .trim();

const leadingToken = (raw) => raw.split(/\s+/)[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Publisher when the shape gave us one, else the raw entry's first word. */
export const sortKey = (entry) => entry.publisher ?? leadingToken(entry.raw);

/**
 * @param {Array<Array<{publisher: string|null, title: string|null, url: string|null, raw: string}>>} entryLists
 * @returns {Array<object>}
 */
export function dedupeSources(entryLists) {
  const byKey = new Map();
  for (const list of entryLists) {
    for (const entry of list) {
      const key = entry.url ? `url:${entry.url}` : `raw:${normalize(entry.raw)}`;
      if (!byKey.has(key)) byKey.set(key, entry);
    }
  }
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  return [...byKey.values()].sort(
    (a, b) =>
      collator.compare(sortKey(a), sortKey(b)) ||
      collator.compare(a.title ?? a.raw, b.title ?? b.raw)
  );
}

/**
 * Structured entries render in a consistent house style; unstructured ones
 * render as the author wrote them. Reformatting a citation we did not fully
 * understand would be inventing bibliographic detail.
 *
 * @param {Array<{publisher: string|null, title: string|null, url: string|null, suffix?: string, raw: string}>} entries
 */
export function renderSources(entries) {
  return entries.map((entry) => {
    if (!entry.publisher || !entry.title) return `- ${entry.raw}`;
    const suffix = entry.suffix ? ` ${entry.suffix}` : '';
    return `- ${footnoteText(entry)}${suffix}`;
  });
}
