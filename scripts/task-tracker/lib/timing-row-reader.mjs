// Dependency-light lexical reader for AITM Timing Log Markdown rows (#1038).
//
// This module knows only the repository's row storage grammar: pipe-delimited
// cells, accepted timestamp spellings, and the optional trailing row-sec
// marker. It deliberately does not classify events, calculate elapsed time,
// pair interruptions, validate lifecycle walks, or decide healing policy.

const TABLE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+[+-]\d{2}:\d{2}$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const SEPARATOR_ROW_RE = /^\|\s*:?-{3,}/;
const TRAILING_ROW_SEC_RE = /(\s*<!--\s*row-sec:\s*a=-?\d+\s+i=-?\d+\s*-->)(\s*)$/;

export function isTableTimingTimestamp(value) {
  return typeof value === 'string' && TABLE_TIMESTAMP_RE.test(value.trim());
}

export function isTimingRowTimestamp(value) {
  if (typeof value !== 'string') return false;
  const timestamp = value.trim();
  return isTableTimingTimestamp(timestamp) || ISO_TIMESTAMP_RE.test(timestamp);
}

export function timingTimestampToMs(value) {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const timestamp = value.trim();
  const tableMatch = timestamp.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([+-]\d{2}):(\d{2})$/
  );
  if (tableMatch) {
    const [, date, hh, mm, ss, offsetHour, offsetMinute] = tableMatch;
    return Date.parse(`${date}T${hh}:${mm}:${ss ?? '00'}${offsetHour}:${offsetMinute}`);
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function splitTimingRowMarker(line) {
  const source = String(line ?? '');
  const match = source.match(TRAILING_ROW_SEC_RE);
  if (!match) return { core: source, marker: '' };
  return {
    core: source.slice(0, match.index),
    marker: match[1] + match[2],
  };
}

export function parseTimingRow(line) {
  if (typeof line !== 'string' || !line.trimStart().startsWith('|')) return null;
  const raw = line.trim();
  if (SEPARATOR_ROW_RE.test(raw)) return null;
  const { core, marker } = splitTimingRowMarker(raw);
  const cells = core.split('|').map((cell) => cell.trim());
  if (cells.length < 3) return null;
  return {
    raw,
    core,
    marker,
    cells,
    ts: cells[1] ?? '',
    event: (cells[2] ?? '').toLowerCase(),
    wordMarker: cells[6] ?? '',
    description: cells[7] ?? '',
  };
}

export function replaceTimingRowCells(line, replacements) {
  const source = String(line ?? '');
  const { core, marker } = splitTimingRowMarker(source);
  const cells = core.split('|');
  for (const [rawIndex, replacement] of Object.entries(replacements || {})) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= cells.length) continue;
    cells[index] = String(replacement);
  }
  return cells.join('|') + marker;
}

export function replaceTimingRowCell(line, index, replacement) {
  return replaceTimingRowCells(line, { [index]: replacement });
}
