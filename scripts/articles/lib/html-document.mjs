// The self-contained HTML wrapper around a converted article body.
//
// "Self-contained" is the point: the publish flow is open the file in a
// browser, select all, copy, paste into LinkedIn's rich-text editor. Any
// external stylesheet, font, or script would either fail to load or fail to
// survive the clipboard round-trip, so everything is inline and the document
// references nothing outside itself.

import { escapeHtml } from './markdown-to-html.mjs';

const STYLE = [
  'body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem;',
  "  font-family: Georgia, 'Times New Roman', serif; font-size: 18px; line-height: 1.6; }",
  'h1 { font-size: 1.9em; line-height: 1.25; }',
  'h2 { font-size: 1.35em; margin-top: 2em; }',
  'blockquote { margin: 1.5em 0; padding-left: 1em; border-left: 4px solid #999;',
  '  font-style: italic; }',
  'code { font-family: ui-monospace, Menlo, monospace; font-size: 0.9em; }',
  '.diagram-placeholder { margin: 1.5em 0; padding: 0.75em 1em; border: 2px dashed #b45309;',
  '  background: #fff7ed; color: #7c2d12; font-family: ui-monospace, Menlo, monospace;',
  '  font-size: 0.85em; }',
].join('\n');

/**
 * @param {{title: string, blocks: string[]}} input
 * @returns {string} a complete HTML document
 */
export function buildHtmlDocument({ title, blocks }) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    STYLE,
    '</style>',
    '</head>',
    '<body>',
    `<h1>${escapeHtml(title)}</h1>`,
    ...blocks,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
