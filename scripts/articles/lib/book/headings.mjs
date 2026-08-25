// Heading level algebra and chapter grouping.
//
// Default: one article is one chapter. Its H1 is the chapter title (lifted out
// by `parseArticle`), its `##` headings stay `##`.
//
// Under `book:merge-into-previous`: the article's title becomes a `##` inside
// the previous chapter and everything below it shifts one level down.

const HEADING_RE = /^(#{1,6}) (.*)$/;

/**
 * @param {string} line
 * @param {number} by levels to shift down
 * @returns {string}
 */
export function shiftHeading(line, by) {
  if (by === 0) return line;
  const match = line.match(HEADING_RE);
  if (!match) return line;
  const level = match[1].length + by;
  if (level > 6) {
    throw new RangeError(`heading shift would exceed level 6: ${line}`);
  }
  return `${'#'.repeat(level)} ${match[2]}`;
}

/**
 * @param {Array<{slug: string, title: string, chapterTitle: string|null, part: string|null, mergeIntoPrevious: boolean, sections: Array<object>}>} articles
 * @returns {Array<{number: number, title: string, part: string|null, members: Array<{article: object, shift: number}>}>}
 */
export function planChapters(articles) {
  const chapters = [];
  for (const article of articles) {
    if (article.mergeIntoPrevious) {
      chapters[chapters.length - 1].members.push({ article, shift: 1 });
      continue;
    }
    chapters.push({
      number: chapters.length + 1,
      title: article.chapterTitle ?? article.title,
      part: article.part,
      members: [{ article, shift: 0 }],
    });
  }
  return chapters;
}
