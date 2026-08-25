// Book-side default strip rules — the mirror image of the LinkedIn publisher's
// `strip-rules.mjs`. Where that one keeps the series scaffolding and drops the
// outline, this one drops all of the scaffolding: a book has no "next article".
//
// The banner image is already gone: `parseArticle` lifts it into a field.
//
// `book:exclude` spans are article-scoped, not section-scoped, matching the
// balance check in `markers.mjs`. An author who opens a span before a `##` and
// closes it after plainly means to drop the heading too; scoping the two
// differently let validation call such a span balanced while the stripper
// dropped nothing at all.

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
  let excluding = 0;

  for (const section of scanned) {
    const isBibliography = section.heading === 'Bibliography';
    const isStripped = BOOK_STRIP_HEADINGS.has(section.heading);

    const items = [];
    for (const item of section.items) {
      // Span markers are honoured even inside a stripped section, so a span
      // that opens before one and closes after it stays balanced.
      if (item.kind === 'marker' && item.verb === 'exclude') {
        excluding += 1;
        continue;
      }
      if (item.kind === 'marker' && item.verb === 'end') {
        excluding -= 1;
        continue;
      }
      if (excluding > 0) continue;
      if (isBibliography) {
        // Blank lines are kept: they are what tells a wrapped citation apart
        // from a fresh paragraph when the bibliography is parsed.
        if (item.kind === 'text') bibliographyLines.push(item.text);
        continue;
      }
      if (isStripped) continue;
      if (item.kind === 'text' && PART_CAPTION_RE.test(item.text.trim())) continue;
      items.push(item);
    }

    if (isStripped) continue;
    const meaningful = items.some((item) => item.kind !== 'text' || item.text.trim() !== '');
    if (!meaningful) continue;
    sections.push({ heading: section.heading, items });
  }

  return { sections, bibliographyLines };
}
