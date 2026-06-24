// #535 — heal an issue's ⏱ Timing Log so it carries exactly ONE `start` row.
//
// The canonical shape is one `start` (the first-ever bind) followed by verb /
// pause / resume transitions. A duplicate-start defect (observed on #526) leaves
// secondary `start` rows where a `resumed` belongs. `healTimingStarts` is the
// pure repair: it rewrites every `start` row AFTER the first into `resumed`,
// preserving the first `start` and every non-start row verbatim.
//
// Idempotent: a healed log has exactly one `start`, so a second pass is a no-op
// and reproduces identical bytes (so a marker-safe writer short-circuits).
//
// Pairs with the going-forward fix in `verbSwitch`/`verbResume`, which prevents
// new duplicate starts via `resolveBindEvent` (`lib/bind-event.mjs`).

// A timing-log data row is a table line whose first cell is a parseable
// timestamp. Mirrors `ROW_TS_RE` in `bind-event.mjs`. Excludes the header row
// (`| Timestamp | … |`) and the `|---|` separator.
const ROW_TS_RE = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

// Split a markdown table line into its `|`-delimited fields. Index 0 is the
// empty string before the leading pipe, 1 is the Timestamp cell, 2 the Event
// cell, etc. Surrounding whitespace is left intact so a rewrite can preserve
// the row's original column padding.
function isDataRow(line) {
  if (!line.startsWith('|')) return false;
  const cells = line.split('|');
  if (cells.length < 4) return false;
  return ROW_TS_RE.test(cells[1].trim());
}

function eventCellIsStart(line) {
  const cells = line.split('|');
  return cells.length >= 4 && cells[2].trim() === 'start';
}

// Count the number of `start` data rows in a timing-log body.
export function countStartRows(body) {
  if (!body) return 0;
  let n = 0;
  for (const line of String(body).split('\n')) {
    if (isDataRow(line) && eventCellIsStart(line)) n++;
  }
  return n;
}

// Rewrite every `start` row after the first into `resumed`. Preserves the first
// `start`, all non-start rows, and each rewritten row's column padding (only the
// Event cell's `start` token is swapped for `resumed`).
export function healTimingStarts(body) {
  if (!body) return body === '' ? '' : body;
  const lines = String(body).split('\n');
  let seenFirstStart = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isDataRow(line) || !eventCellIsStart(line)) continue;
    if (!seenFirstStart) {
      seenFirstStart = true;
      continue;
    }
    // Rewrite ONLY the Event cell (index 2), preserving its surrounding spaces
    // and every other field byte-for-byte.
    const cells = line.split('|');
    cells[2] = cells[2].replace('start', 'resumed');
    lines[i] = cells.join('|');
  }
  return lines.join('\n');
}
