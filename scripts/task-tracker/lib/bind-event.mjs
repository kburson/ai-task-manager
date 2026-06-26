// #482 — first-timing-row event resolution for a `/task start <N>` /
// `/task resume <N>` bind.
//
// The `#N` path of `verbResume` handles BOTH a fresh first-ever bind and a
// genuine resume (returning to an issue that already has timing history, or a
// no-arg resume after `/task pause`). Historically it unconditionally emitted
// `resumed`, so the first-ever row on a never-bound issue read `resumed` — a
// contradiction (you cannot resume without a prior start/pause), observed on
// #480.
//
// The canonical first-row slug is `start` — the same slug `verbSwitch` emits
// for a newcomer and the only slug `firstStartTimestamp` recognizes. A genuine
// resume keeps `resumed`. The discriminator is whether the issue already has
// timing-log history (or is mid-pause).

// A timing-log data row: a table line whose first cell is a parseable
// timestamp. Excludes the header row (`| Timestamp | … |`) and the
// `|---|` separator. Tolerant of both the space- and `T`-delimited ISO forms
// the log has used.
const ROW_TS_RE = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

export function timingCommentHasRows(body) {
  if (!body) return false;
  for (const line of String(body).split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((s) => s.trim());
    if (cells.length < 3) continue;
    if (ROW_TS_RE.test(cells[1])) return true;
  }
  return false;
}

// #534 — extract the (lower-cased) Event-cell slug from a timing-log data row.
// Returns null for the header, the `|---|` separator, and any non-data line.
function rowEventSlug(line) {
  if (!line.startsWith('|')) return null;
  const cells = line.split('|').map((s) => s.trim());
  // cells[0] is the empty pre-pipe cell; cells[1] is Timestamp, cells[2] Event.
  if (cells.length < 4) return null;
  if (!ROW_TS_RE.test(cells[1])) return null;
  return cells[2].toLowerCase();
}

// #534 — classify a row event slug as an interruption *opener*, a re-engagement
// *closer*, or neither. Openers mark work stopping (`pause`/`paused`/`pause:*`,
// `switch-out`/`switch-out:*`, `idle`). Closers mark work resuming
// (`resume`/`resumed`/`resume:*`, `switch-in`/`switch-in:*`, `start`).
function classifyEvent(slug) {
  if (!slug) return null;
  if (slug === 'pause' || slug === 'paused' || slug.startsWith('pause:')) {
    return {
      role: 'open',
      kind: 'pause',
      reason: slug.startsWith('pause:') ? slug.slice(6) : null,
    };
  }
  if (slug === 'switch-out' || slug.startsWith('switch-out:')) {
    return {
      role: 'open',
      kind: 'switch-out',
      peer: slug.startsWith('switch-out:') ? slug.slice('switch-out:'.length) : null,
    };
  }
  if (slug === 'idle') return { role: 'open', kind: 'idle' };
  if (slug === 'resume' || slug === 'resumed' || slug.startsWith('resume:')) {
    return { role: 'close' };
  }
  if (slug === 'switch-in' || slug.startsWith('switch-in:')) return { role: 'close' };
  if (slug === 'start') return { role: 'close' };
  return null; // neutral (move:*, end, etc.) — neither opens nor closes
}

// #534 — scan the timing body top-to-bottom and return the last interruption
// that remains *open* (an opener with no later closer). A closer clears the
// currently-open interruption. Returns one of:
//   { kind: 'pause', reason }   reason = canonical slug after `pause:` or null
//   { kind: 'switch-out', peer } peer  = `#N` (or bare value) after `switch-out:` or null
//   { kind: 'idle' }
// or null when no interruption is currently open.
export function lastOpenInterruption(body) {
  if (!body) return null;
  let open = null;
  for (const line of String(body).split('\n')) {
    const slug = rowEventSlug(line);
    if (slug == null) continue;
    const c = classifyEvent(slug);
    if (!c) continue;
    if (c.role === 'open') {
      open =
        c.kind === 'pause'
          ? { kind: 'pause', reason: c.reason }
          : c.kind === 'switch-out'
            ? { kind: 'switch-out', peer: c.peer }
            : { kind: 'idle' };
    } else if (c.role === 'close') {
      open = null;
    }
  }
  return open;
}

// #534 — true when the body contains at least one `start` row (a root opener
// that an otherwise-unpaired re-engagement legitimately pairs against).
function hasStartRow(body) {
  if (!body) return false;
  for (const line of String(body).split('\n')) {
    if (rowEventSlug(line) === 'start') return true;
  }
  return false;
}

// #534 — orphan-pairing guard. A re-engagement event (`resume*` / `switch-in*`)
// is a violation only when the body carries NO open interruption to pair
// against AND no prior `start` row (the benign root opener). Returns
// `{ ok: true }` or `{ ok: false, reason }`. Non-re-engagement events always ok.
export function assertPairedReengagement(body, proposedEvent) {
  const slug = String(proposedEvent ?? '').toLowerCase();
  const isReengage =
    slug === 'resume' ||
    slug === 'resumed' ||
    slug.startsWith('resume:') ||
    slug === 'switch-in' ||
    slug.startsWith('switch-in:');
  if (!isReengage) return { ok: true };
  if (lastOpenInterruption(body)) return { ok: true };
  if (hasStartRow(body)) return { ok: true };
  return {
    ok: false,
    reason: `re-engagement "${proposedEvent}" has no open interruption and no prior start row to pair against`,
  };
}

// Resolve the Event-cell slug for a bind.
//
// #568 — `resumed` is the SOLE return verb for every re-engagement-with-history.
// The departure row (`switch-out:#N` / `pause:<r>`) already records why and
// where work stopped; the return never re-encodes that as `switch-in:#N` or
// `resume:<r>`. `classifyEvent('resumed')` closes an open `switch-out`, `pause`,
// OR `idle` interruption alike, so one canonical closer suffices. (Supersedes
// the #534 paired-taxonomy that emitted `switch-in`/`resume:<r>`.)
//
// #568 — fail CLOSED. `readStatus: 'error'` means the timing comment was
// unreadable, so the empty `timingBody` it produced is UNKNOWN, not confirmed
// empty: never emit `start` (which would risk a duplicate). `start` is emitted
// ONLY on positive confirmation the log is empty (a successful read of zero
// rows, or the no-`timingBody` legacy path with `hasTimingHistory: false`).
//
// Back-compat: with no `timingBody` and no `readStatus`, the original two-flag
// behavior holds — `'start'` only for a fresh first-ever bind (no history, not
// mid-pause), otherwise `'resumed'`.
export function resolveBindEvent({
  hasTimingHistory = false,
  paused = false,
  timingBody = null,
  readStatus = null,
} = {}) {
  // Unreadable comment → fail closed to the paired closer; never a 2nd `start`.
  if (readStatus === 'error') return 'resumed';

  if (timingBody != null) {
    if (lastOpenInterruption(timingBody)) return 'resumed';
    if (paused) return 'resumed';
    return timingCommentHasRows(timingBody) || hasTimingHistory ? 'resumed' : 'start';
  }
  if (paused) return 'resumed';
  return hasTimingHistory ? 'resumed' : 'start';
}
