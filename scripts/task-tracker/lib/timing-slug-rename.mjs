// @story #520
// #520 — rewrite historical ⏱ Timing Log Event-column slugs to the #516
// uniform `<state>:<past-tense>` vocabulary, in place.
//
// #516 renamed the canonical `PHASE_EVENTS` table but deliberately left frozen
// GitHub timing-log comments untouched, so historical logs still carry the old
// vocabulary (`refine:start`, `test:done`, `approved`, `closed`, `pause`, …).
// This module is the pure core of the deferred one-shot heal: it relabels the
// Event cell of each existing row without inventing, dropping, or reordering
// rows. Every other cell — Timestamp, Active, Idle, Δ Words, Word Marker,
// Description, and the trailing `<!-- row-sec: a=N i=N -->` marker — is
// preserved byte-for-byte.
//
// Forbidden by construction: synthesizing a missing `review:approved` row.
// Fabricating timing rows is prohibited; we only rename rows that exist.

// Static 1:1 rename dictionary keyed on the lowercased old slug. The
// context-sensitive `approved` slug is NOT in this map — it is resolved by
// `renameTimingSlug` with the `isDoneEnterBorrow` discriminator (see below).
// New slugs (`refine:started`, `test:passed`, …) are absent from the key set,
// so a second pass over an already-migrated log is a no-op — the idempotency
// guarantee (AC4).
export const RENAME_MAP = Object.freeze({
  created: 'backlog:created',
  'refine:start': 'refine:started',
  'refine:done': 'refine:completed',
  'plan:start': 'plan:started',
  'plan:done': 'plan:completed',
  'develop:start': 'develop:started',
  'develop:done': 'develop:completed',
  'test:start': 'test:started',
  'test:done': 'test:passed',
  'review:waiting': 'review:started',
  closed: 'issue:closed',
  pause: 'paused',
});

// Terminal close slugs — both the old (`closed`) and already-renamed
// (`issue:closed`) forms, so the `approved` disambiguation scan is correct on a
// raw historical log AND on a partially-migrated one.
const TERMINAL_CLOSE = new Set(['closed', 'issue:closed']);

// AC2 — disambiguate a single Event slug. Deterministic 1:1 slugs come straight
// from `RENAME_MAP`. The lone ambiguous slug is `approved`: pre-#516 it was the
// `done.enter` borrow (review was enter-only, so its approval moment was
// borrowed by the done transition). When this `approved` opens the cleanup
// window that terminates in a close (`isDoneEnterBorrow === true`), it maps to
// `issue:wrap` (#475 AC4's wrap→close interval). Otherwise it is a genuine
// review approval → `review:approved`. Any slug not in the map and not
// `approved` passes through unchanged.
export function renameTimingSlug(event, { isDoneEnterBorrow = false } = {}) {
  const slug = String(event ?? '')
    .trim()
    .toLowerCase();
  if (slug === 'approved') {
    return isDoneEnterBorrow ? 'issue:wrap' : 'review:approved';
  }
  return Object.prototype.hasOwnProperty.call(RENAME_MAP, slug) ? RENAME_MAP[slug] : slug;
}

// Locate the Event column index (within the pipe-delimited data cells) from the
// timing-log table header. Mirrors `parseTimingRows` (timing-rollup.mjs): the
// header row is the line whose cells include a `Timestamp` cell. Returns -1 when
// no header is found.
function findEventColumn(lines) {
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    if (cells.some((c) => c.trim() === 'Timestamp')) {
      return cells.findIndex((c) => c.trim() === 'Event');
    }
  }
  return -1;
}

// True for table data rows (skips the header row and the `|---|` separator).
function isDataRow(line) {
  if (!line.startsWith('|')) return false;
  const cells = line.split('|').slice(1, -1);
  if (cells.some((c) => c.trim() === 'Timestamp')) return false;
  if (cells.length && cells.every((c) => /^[-: ]+$/.test(c.trim()))) return false;
  return true;
}

// Read the lowercased Event slug from a data row given the data-cell column
// index. `slice(1, -1)` drops the empty pre-first-pipe cell and the trailing
// post-last-pipe fragment (which carries the `<!-- row-sec -->` marker), so the
// marker never contaminates the read.
function readEventSlug(line, eventCol) {
  const cells = line.split('|').slice(1, -1);
  return (cells[eventCol] ?? '').trim().toLowerCase();
}

// Rewrite ONLY the Event cell (the data-cell at `eventCol`) of a row, preserving
// every other cell and the trailing marker byte-for-byte. The `\|([^|]*)` regex
// matches each `|…` segment starting at the row's leading pipe, so its match
// index lines up 1:1 with the `slice(1, -1)` data-cell index: match 0 is the
// Timestamp cell, match `eventCol` is the Event cell. The trailing
// `<!-- row-sec -->` marker lives after the final pipe and is never a `|…`
// segment, so it is left untouched.
function rewriteEventCell(line, eventCol, nextEvent) {
  let seen = -1;
  return line.replace(/\|([^|]*)/g, (match) => {
    seen += 1;
    return seen === eventCol ? `| ${nextEvent} ` : match;
  });
}

// AC1–AC4 — rewrite every historical Event slug in a timing-log comment body.
// Returns `{ body, rewrites, changed }`:
//   • body     — the rewritten comment (identical input bytes when nothing changed)
//   • rewrites — [{ line, from, to }] in row order, for dry-run reporting
//   • changed  — rewrites.length > 0
//
// The `approved` disambiguation runs in a forward pass over the data rows: an
// `approved` whose next terminal-close row arrives before any later `approved`
// is the done-enter borrow (→ `issue:wrap`); all others are genuine review
// approvals (→ `review:approved`).
export function renameTimingLogBody(commentBody) {
  const src = String(commentBody ?? '');
  const lines = src.split('\n');
  const eventCol = findEventColumn(lines);
  if (eventCol === -1) {
    return { body: src, rewrites: [], changed: false };
  }

  // Pass 1: collect data-row line indices and their current slugs.
  const dataRows = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isDataRow(lines[i])) continue;
    dataRows.push({ lineIdx: i, slug: readEventSlug(lines[i], eventCol) });
  }

  // Pass 2: resolve each row's target slug, applying the `approved` borrow rule.
  const rewrites = [];
  for (let r = 0; r < dataRows.length; r++) {
    const { lineIdx, slug } = dataRows[r];
    let next;
    if (slug === 'approved') {
      let isBorrow = false;
      for (let s = r + 1; s < dataRows.length; s++) {
        if (TERMINAL_CLOSE.has(dataRows[s].slug)) {
          isBorrow = true;
          break;
        }
        if (dataRows[s].slug === 'approved') break;
      }
      next = renameTimingSlug(slug, { isDoneEnterBorrow: isBorrow });
    } else {
      next = renameTimingSlug(slug);
    }
    if (next !== slug) {
      lines[lineIdx] = rewriteEventCell(lines[lineIdx], eventCol, next);
      rewrites.push({ line: lineIdx, from: slug, to: next });
    }
  }

  return {
    body: rewrites.length ? lines.join('\n') : src,
    rewrites,
    changed: rewrites.length > 0,
  };
}
