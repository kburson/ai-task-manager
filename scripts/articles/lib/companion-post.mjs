// Assemble the companion feed announcement from an article's
// `## LinkedIn Article Shape` section.
//
// That section is not article prose — the publishing guide is explicit that it
// is the outline for the short native LinkedIn post that announces the article
// and links to it. It is stripped from the body and lands in its own file so it
// can be copied without dragging any article body text along.
//
// Output is plain text on purpose: LinkedIn feed posts have no rich-text
// editor, so anything but plain text would paste as literal markup.

import { toPlainText } from './markdown-to-html.mjs';

export const URL_PLACEHOLDER = '<PASTE THE PUBLISHED ARTICLE URL HERE>';

/**
 * Pull the hook quote, the middle bullets, and the closing quote out of a
 * `LinkedIn Article Shape` section's line stream.
 *
 * @param {string[]} lines
 * @returns {{hook: string, middle: string[], close: string}}
 */
export function parseShapeSection(lines) {
  const quotes = [];
  const middle = [];
  let quoteRun = null;

  for (const line of lines) {
    if (/^> ?/.test(line)) {
      const text = toPlainText(line.replace(/^> ?/, ''));
      quoteRun = quoteRun === null ? text : `${quoteRun} ${text}`;
      continue;
    }
    if (quoteRun !== null) {
      quotes.push(quoteRun.trim());
      quoteRun = null;
    }
    if (/^- /.test(line)) middle.push(toPlainText(line.slice(2)));
  }
  if (quoteRun !== null) quotes.push(quoteRun.trim());

  if (quotes.length < 2) {
    throw new Error(
      `LinkedIn Article Shape needs an opening and a closing quote, found ${quotes.length}`
    );
  }
  if (middle.length === 0) {
    throw new Error('LinkedIn Article Shape has no middle bullets');
  }

  return { hook: quotes[0], middle, close: quotes[quotes.length - 1] };
}

/**
 * Build the ready-to-paste feed post.
 *
 * The middle bullets stay as bullets rather than being fused into prose: the
 * guide asks for "two or three short sentences of context", and choosing which
 * points survive that compression is an authoring decision, not a mechanical
 * one. Emitting the outline verbatim keeps the decision with the human.
 */
export function buildCompanionPost({ title, shapeLines }) {
  const { hook, middle, close } = parseShapeSection(shapeLines);
  return [
    hook,
    '',
    ...middle.map((point) => `- ${point}`),
    '',
    close,
    '',
    `Read "${title}": ${URL_PLACEHOLDER}`,
    '',
  ].join('\n');
}
