// The publishing guide's strip-before-publish rules, applied to a parsed
// article. See docs/articles/linkedin-publishing-guide.md.
//
// The banner image line and every HTML comment are already gone by the time an
// article reaches here — `parseArticle` removes them. What remains is section
// surgery:
//
//   - `## LinkedIn Article Shape` is lifted out of the body entirely. It is the
//     outline for the companion feed post, not article prose.
//   - `## Series Link` keeps its sentence but loses its heading; readers do not
//     need a heading called "Series Link".
//   - `## Series Roadmap` keeps its heading but its table becomes a bullet list.

import { roadmapToBullets } from './roadmap.mjs';

export const SHAPE_HEADING = 'LinkedIn Article Shape';
export const ROADMAP_HEADING = 'Series Roadmap';
export const SERIES_LINK_HEADING = 'Series Link';

/**
 * @param {{sections: Array<{heading: string|null, lines: string[]}>}} article
 * @returns {{sections: Array<{heading: string|null, lines: string[]}>, shape: {heading: string, lines: string[]}}}
 */
export function applyStripRules(article) {
  const sections = [];
  let shape = null;

  for (const section of article.sections) {
    if (section.heading === SHAPE_HEADING) {
      shape = section;
      continue;
    }
    if (section.heading === SERIES_LINK_HEADING) {
      sections.push({ heading: null, lines: section.lines });
      continue;
    }
    if (section.heading === ROADMAP_HEADING) {
      sections.push({ heading: section.heading, lines: roadmapToBullets(section.lines) });
      continue;
    }
    sections.push(section);
  }

  if (shape === null) {
    throw new Error(`article has no \`## ${SHAPE_HEADING}\` section`);
  }
  return { sections, shape };
}
