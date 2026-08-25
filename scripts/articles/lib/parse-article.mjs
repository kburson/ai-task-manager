// Parse a series article (`docs/articles/NN-*.md`) into the structure the
// publisher needs: title, banner image, and the `## `-delimited sections.
//
// HTML comments are removed here rather than downstream because the publishing
// guide treats them as strip-before-publish for every article — LinkedIn's
// rich-text editor pastes them as visible text.

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const BANNER_RE = /^!\[[^\]]*\]\((assets\/article-headers\/[^)]+)\)$/;
const FENCE_RE = /^```/;

function trimBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

/**
 * @param {string} source raw Markdown of one article file
 * @param {{keepComments?: boolean}} [options] the book composer needs the
 *   `book:` marker comments preserved; the LinkedIn publisher never does.
 * @returns {{title: string, bannerPath: string|null, sections: Array<{heading: string|null, lines: string[]}>}}
 */
export function parseArticle(source, { keepComments = false } = {}) {
  const lines = (keepComments ? source : source.replace(HTML_COMMENT_RE, '')).split('\n');
  const sections = [{ heading: null, lines: [] }];
  let title = null;
  let bannerPath = null;
  let inFence = false;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      sections[sections.length - 1].lines.push(line);
      continue;
    }
    if (!inFence) {
      const heading1 = line.match(/^# (.+)$/);
      if (heading1) {
        if (title !== null) throw new Error('article has more than one `# ` title');
        title = heading1[1].trim();
        continue;
      }
      const banner = line.match(BANNER_RE);
      if (banner) {
        if (bannerPath !== null) throw new Error('article has more than one banner image line');
        bannerPath = banner[1];
        continue;
      }
      const heading2 = line.match(/^## (.+)$/);
      if (heading2) {
        sections.push({ heading: heading2[1].trim(), lines: [] });
        continue;
      }
    }
    sections[sections.length - 1].lines.push(line);
  }

  if (inFence) throw new Error('article ends inside an unterminated code fence');
  if (title === null) throw new Error('article has no `# ` title line');

  return {
    title,
    bannerPath,
    sections: sections
      .map((section) => ({ heading: section.heading, lines: trimBlankEdges(section.lines) }))
      .filter((section) => section.heading !== null || section.lines.length > 0),
  };
}

/**
 * Find one section by its exact `## ` heading text.
 */
export function findSection(sections, heading) {
  return sections.find((section) => section.heading === heading) ?? null;
}
