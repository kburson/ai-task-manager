// In-body Mermaid fences, turned into images for print.
//
// The body fence is authoritative, not the matching file under
// assets/diagrams/ — those two have drifted, and the body is what a reader
// actually sees. That is the same call `lib/diagrams.mjs` makes for LinkedIn.
//
// Today the book renders at the same scale as the LinkedIn path (`PRINT_SCALE`
// matches `renderMermaidSource`'s own default). The `scale` option exists so
// the two can diverge later — e.g. if print resolution turns out to need more
// than the screen path does — without duplicating the `mmdc` spawn. Nobody has
// measured what print scale this book actually needs yet.

import path from 'node:path';

import { renderMermaidSource, runPool } from '../diagrams.mjs';

export const PRINT_SCALE = 3;

/**
 * @param {Array<{heading: string|null, items: Array<object>}>} sections
 * @param {string} slug
 * @returns {{sections: Array<{heading: string|null, items: Array<object>}>, diagrams: Array<{code: string, imageName: string}>}}
 */
export function extractBookDiagrams(sections, slug) {
  const diagrams = [];

  const out = sections.map((section) => {
    const items = [];
    let i = 0;
    while (i < section.items.length) {
      const item = section.items[i];
      const isFence = item.kind === 'text' && item.text.trim().replace(/\s+$/, '') === '```mermaid';
      if (!isFence) {
        items.push(item);
        i += 1;
        continue;
      }
      const code = [];
      let j = i + 1;
      while (j < section.items.length) {
        const line = section.items[j];
        if (line.kind === 'text' && line.text.trim() === '```') break;
        code.push(line.kind === 'text' ? line.text : '');
        j += 1;
      }
      if (j >= section.items.length) {
        throw new Error(`${slug}: unterminated \`\`\`mermaid fence`);
      }
      const imageName = `${slug}-diagram-${diagrams.length + 1}.png`;
      diagrams.push({ code: code.join('\n'), imageName });
      items.push({ kind: 'text', text: `![](${imageName})` });
      i = j + 1;
    }
    return { heading: section.heading, items };
  });

  return { sections: out, diagrams };
}

/**
 * @param {Array<{code: string, imageName: string}>} diagrams
 * @param {string} outDir
 */
export async function renderBookDiagrams(diagrams, outDir) {
  await runPool(
    diagrams.map(
      (diagram) => () =>
        renderMermaidSource(diagram.code, path.join(outDir, diagram.imageName), {
          scale: PRINT_SCALE,
        })
    )
  );
}
