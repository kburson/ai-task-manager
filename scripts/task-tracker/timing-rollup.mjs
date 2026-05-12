// Pure-function rollups over a parsed ⏱ Timing Log table.
//
// Used by scripts/gh/log-issue-time.mjs to compute board-field totals
// (engagedTime, sessionTime, reviewTime) from the timing comment of record.

const TS_PATTERN = /(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}) ([+-]\d{2}):(\d{2})/;

function parseTs(cell) {
  const m = TS_PATTERN.exec(cell.trim());
  if (!m) return null;
  const [, date, hh, mm, offH, offM] = m;
  return Date.parse(`${date}T${hh}:${mm}:00${offH}:${offM}`);
}

function parseNum(cell) {
  const s = cell.trim().replace(/,/g, '');
  if (s === '—' || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseTimingRows(body) {
  const lines = body.split('\n');
  const rows = [];
  let tsCol = -1;
  let eventCol = -1;
  let activeCol = -1;
  let wordMarkerCol = -1;

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    if (cells.some((c) => c.trim() === 'Timestamp')) {
      tsCol = cells.findIndex((c) => c.trim() === 'Timestamp');
      eventCol = cells.findIndex((c) => c.trim() === 'Event');
      activeCol = cells.findIndex((c) => ['Active', 'Active Min'].includes(c.trim()));
      wordMarkerCol = cells.findIndex((c) => c.trim() === 'Word Marker');
      continue;
    }
    if (cells.every((c) => /^[-: ]+$/.test(c.trim()))) continue;
    if (tsCol === -1 || eventCol === -1) continue;
    rows.push({
      tsMs: parseTs(cells[tsCol] ?? ''),
      event: (cells[eventCol] ?? '').trim().toLowerCase(),
      activeMin: parseNum(cells[activeCol] ?? ''),
      wordMarker: parseNum(cells[wordMarkerCol] ?? ''),
    });
  }
  return rows;
}

// Sum (delta_min) for each pause row whose next non-pause row arrives within
// `thresholdMin` (inclusive). Pauses with no following row, or whose follower
// arrives after the threshold, contribute zero.
export function computeReviewMin(rows, thresholdMin) {
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].event !== 'pause') continue;
    const pauseMs = rows[i].tsMs;
    if (pauseMs == null) continue;
    let next = null;
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].event === 'pause') continue;
      next = rows[j];
      break;
    }
    if (!next || next.tsMs == null) continue;
    const deltaMin = Math.round((next.tsMs - pauseMs) / 60000);
    if (deltaMin <= thresholdMin && deltaMin >= 0) total += deltaMin;
  }
  return total;
}

export function rollupTotals(rows, thresholdMin) {
  let totalActiveMin = 0;
  let lastWordMarker = null;
  for (const r of rows) {
    if (r.activeMin != null) totalActiveMin += r.activeMin;
    if (r.wordMarker != null) lastWordMarker = r.wordMarker;
  }
  const reviewMin = computeReviewMin(rows, thresholdMin);
  return {
    rowCount: rows.length,
    totalActiveMin,
    reviewMin,
    engagedMin: totalActiveMin + reviewMin,
    lastWordMarker,
  };
}
