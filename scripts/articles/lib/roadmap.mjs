// Convert the `## Series Roadmap` Markdown table into the plain bullet list the
// publishing guide prescribes.
//
// LinkedIn does not render Markdown tables — pasting one produces a wall of pipe
// characters. The bullet list is derived from the table rather than hard-coded
// so the published navigation cannot drift from the source of truth.

/** Strip `**bold**` wrappers and `[text](url)` link syntax down to plain text. */
export function cellToPlainTitle(cell) {
  let text = cell.trim();
  while (/^\*\*[\s\S]+\*\*$/.test(text)) text = text.slice(2, -2).trim();
  const link = text.match(/^\[([^\]]+)\]\([^)]*\)$/);
  if (link) text = link[1].trim();
  return text;
}

function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

/**
 * @param {string[]} lines the body lines of the `## Series Roadmap` section
 * @returns {Array<{current: boolean, title: string}>}
 */
export function parseRoadmapTable(lines) {
  const rows = [];
  let sawHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length < 3) continue;
    if (isSeparatorRow(cells)) continue;
    if (!sawHeader) {
      sawHeader = true;
      continue;
    }
    rows.push({
      current: /current/i.test(cells[0]),
      title: cellToPlainTitle(cells[2]),
    });
  }

  if (rows.length === 0) throw new Error('Series Roadmap section contains no table rows');
  const currentCount = rows.filter((row) => row.current).length;
  if (currentCount !== 1) {
    throw new Error(`Series Roadmap must mark exactly one Current row, found ${currentCount}`);
  }
  return rows;
}

/**
 * Render the roadmap rows as the Markdown bullet list that replaces the table.
 * The current article's entry is bolded in place of the table's Current marker.
 *
 * @returns {string[]} Markdown lines
 */
export function roadmapToBullets(lines) {
  const rows = parseRoadmapTable(lines);
  const position = rows.findIndex((row) => row.current) + 1;
  const out = [`This is article ${position} of ${rows.length} in the series:`, ''];
  for (const row of rows) {
    out.push(row.current ? `- **${row.title}**` : `- ${row.title}`);
  }
  return out;
}
