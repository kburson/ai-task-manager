// The Sources appendix: every chapter's bibliography, merged.
//
// Dedupe is by URL, because the same report is cited by several articles and a
// book that lists it four times looks careless. Footnote markers still repeat
// freely on each citation — that is normal.

/**
 * @param {Array<Array<{publisher: string, title: string, url: string}>>} entryLists
 * @returns {Array<{publisher: string, title: string, url: string}>}
 */
export function dedupeSources(entryLists) {
  const byUrl = new Map();
  for (const list of entryLists) {
    for (const entry of list) {
      if (!byUrl.has(entry.url)) byUrl.set(entry.url, entry);
    }
  }
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  return [...byUrl.values()].sort(
    (a, b) => collator.compare(a.publisher, b.publisher) || collator.compare(a.title, b.title)
  );
}

/** @param {Array<{publisher: string, title: string, url: string}>} entries */
export function renderSources(entries) {
  return entries.map((entry) => `- ${entry.publisher}. "${entry.title}." <${entry.url}>`);
}
