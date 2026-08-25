// Book-side default strip rules — the mirror image of the LinkedIn publisher's
// `strip-rules.mjs`. Where that one keeps the series scaffolding and drops the
// outline, this one drops all of the scaffolding: a book has no "next article".
//
// The banner image is already gone: `parseArticle` lifts it into a field.

export const BOOK_STRIP_HEADINGS = new Set([
  'Series Link',
  'Series Roadmap',
  'LinkedIn Article Shape',
  'Bibliography',
]);

const PART_CAPTION_RE = /^_Part \d+ of a series.*_$/;

/**
 * @param {Array<{heading: string|null, items: Array<object>}>} scanned
 * @returns {{sections: Array<{heading: string|null, items: Array<object>}>, bibliographyLines: string[]}}
 */
export function applyBookStrip(scanned) {
  const sections = [];
  const bibliographyLines = [];

  for (const section of scanned) {
    if (section.heading === 'Bibliography') {
      for (const item of section.items) {
        if (item.kind === 'text' && item.text.trim() !== '') bibliographyLines.push(item.text);
      }
      continue;
    }
    if (BOOK_STRIP_HEADINGS.has(section.heading)) continue;

    const items = [];
    let excluding = 0;
    for (const item of section.items) {
      if (item.kind === 'marker' && item.verb === 'exclude') {
        excluding += 1;
        continue;
      }
      if (item.kind === 'marker' && item.verb === 'end') {
        excluding -= 1;
        continue;
      }
      if (excluding > 0) continue;
      if (item.kind === 'text' && PART_CAPTION_RE.test(item.text.trim())) continue;
      items.push(item);
    }

    const meaningful = items.some((item) => item.kind !== 'text' || item.text.trim() !== '');
    if (!meaningful) continue;
    sections.push({ heading: section.heading, items });
  }

  return { sections, bibliographyLines };
}
