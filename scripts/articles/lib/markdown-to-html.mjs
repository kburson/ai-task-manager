// Markdown -> HTML for exactly the element set this article corpus uses.
//
// Why hand-rolled: this repo carries one runtime dependency on purpose, and the
// corpus is nine files we author ourselves. The element set is bounded and
// known — ATX headings, paragraphs, bold, italic, inline code, links, bullet
// lists, numbered lists, blockquotes. Tables never reach here (the roadmap is
// converted upstream) and neither do code fences (Mermaid is extracted
// upstream). Anything outside that set THROWS rather than passing through as
// literal Markdown text, which is the exact failure mode this publisher exists
// to prevent.

import { DIAGRAM_TOKEN_RE } from './diagrams.mjs';

// U+0000 cannot appear in article prose, so it is a safe placeholder delimiter.
const SENTINEL = String.fromCharCode(0);

export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(url);
}

/**
 * Inline markup. Code spans, links, and autolinked bare URLs are swapped for
 * sentinel tokens before the emphasis passes run, so emphasis regexes can never
 * chew through a URL or a code span's contents.
 *
 * Relative links (`06-context-durability.md`, `../introduction/...`) render as
 * plain text: they do not resolve on LinkedIn, and an article's real URL does
 * not exist until it is published.
 */
export function renderInline(text) {
  const tokens = [];
  const hold = (html) => {
    tokens.push(html);
    return `${SENTINEL}${tokens.length - 1}${SENTINEL}`;
  };

  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_m, code) => hold(`<code>${code}</code>`));
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) =>
    isAbsoluteUrl(url) ? hold(`<a href="${url}">${label}</a>`) : hold(label)
  );
  out = out.replace(/https?:\/\/[^\s<>"]+[^\s<>".,;:)]/g, (url) =>
    hold(`<a href="${url}">${url}</a>`)
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '<em>$1</em>');
  out = out.replace(
    new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, 'g'),
    (_m, index) => tokens[Number(index)]
  );

  const leftovers = out.match(/\*\*|\]\(|!\[/);
  if (leftovers) {
    throw new Error(`unconverted Markdown syntax "${leftovers[0]}" in: ${text.slice(0, 80)}`);
  }
  return out;
}

/** Plain-text rendering of an inline Markdown string (companion feed post). */
export function toPlainText(text) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '$1')
    .trim();
}

function diagramPlaceholder(imageName) {
  return (
    `<p class="diagram-placeholder">INSERT IMAGE HERE: ` +
    `<code>${escapeHtml(imageName)}</code></p>`
  );
}

function assertNoTable(line) {
  if (line.trim().startsWith('|')) {
    throw new Error('Markdown table reached the HTML renderer — LinkedIn cannot render tables');
  }
}

/**
 * Block-level conversion of one section's line stream.
 *
 * @param {string[]} lines
 * @returns {string[]} HTML block elements
 */
export function markdownToHtml(lines) {
  const html = [];
  let i = 0;

  const take = (predicate) => {
    const run = [];
    while (i < lines.length && predicate(lines[i])) {
      run.push(lines[i]);
      i += 1;
    }
    return run;
  };

  while (i < lines.length) {
    const line = lines[i];
    assertNoTable(line);

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const token = line.match(DIAGRAM_TOKEN_RE);
    if (token) {
      html.push(diagramPlaceholder(token[1]));
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6}) (.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^- /.test(line)) {
      const items = take((l) => /^- /.test(l)).map((l) => `  <li>${renderInline(l.slice(2))}</li>`);
      html.push(['<ul>', ...items, '</ul>'].join('\n'));
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items = take((l) => /^\d+\. /.test(l)).map(
        (l) => `  <li>${renderInline(l.replace(/^\d+\. /, ''))}</li>`
      );
      html.push(['<ol>', ...items, '</ol>'].join('\n'));
      continue;
    }

    if (/^> /.test(line)) {
      const quoted = take((l) => /^>( |$)/.test(l)).map((l) => l.replace(/^> ?/, ''));
      html.push(`<blockquote><p>${renderInline(quoted.join(' ').trim())}</p></blockquote>`);
      continue;
    }

    const paragraph = take((l) => {
      if (l.trim() === '') return false;
      assertNoTable(l);
      return !/^(#{1,6} |- |\d+\. |> |```)/.test(l) && !DIAGRAM_TOKEN_RE.test(l);
    });
    html.push(`<p>${renderInline(paragraph.join(' ').trim())}</p>`);
  }

  return html;
}

/** Convert stripped sections into the article body's HTML blocks. */
export function sectionsToHtml(sections) {
  const blocks = [];
  for (const section of sections) {
    if (section.heading) blocks.push(`<h2>${renderInline(section.heading)}</h2>`);
    blocks.push(...markdownToHtml(section.lines));
  }
  return blocks;
}
