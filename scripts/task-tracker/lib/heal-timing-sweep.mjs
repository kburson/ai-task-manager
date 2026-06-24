// #539 — Backlog-wide duplicate-`start` timing-log sweep. Extends the proven
// single-issue heal (#535) into an audit + apply driver over many issues.
//
// Two pure entry points, both with all I/O injected so the sweep runs offline:
//   - auditBacklog({issues, readTimingBody}): READ-ONLY. Counts `start` rows per
//     issue, flags any log with >1 start as corrupted, returns per-issue rows
//     plus rollup counts. Zero writes.
//   - healBacklog({issues, healOne}): audits, then calls the injected per-issue
//     healer once for every corrupted issue. The healer (runHeal apply:true in
//     production) owns the per-issue timing lock, so this stays idempotent and
//     restart-safe — re-running over already-healed issues finds 0 corrupted.
//
// The `start`-counting transform is NOT re-implemented here: `countStartRows`
// (and `healTimingStarts`) are imported from the #535 core, so there is exactly
// one canonical definition of "duplicate start" in the codebase.
import { countStartRows, healTimingStarts } from './heal-timing-starts.mjs';

// Re-export the core transforms so callers (and the audit) share one source.
export { countStartRows, healTimingStarts };

// Read-only audit. `readTimingBody(issueNumber)` returns the issue's ⏱ Timing
// Log comment body (or '' / null when none exists). Never writes.
//
// Returns:
//   rows:            [{ issue, starts, corrupted, extraStarts }]  (every issue)
//   corrupted:       [{ issue, starts, extraStarts }]             (starts > 1)
//   totalIssues:     number of issues inspected
//   totalCorrupted:  number of issues with >1 start row
//   totalExtraStarts: sum of (starts - 1) across corrupted issues
export async function auditBacklog({ issues, readTimingBody } = {}) {
  if (!Array.isArray(issues)) throw new Error('auditBacklog: issues[] is required');
  if (typeof readTimingBody !== 'function')
    throw new Error('auditBacklog: readTimingBody fn is required');

  const rows = [];
  for (const issue of issues) {
    const body = await readTimingBody(issue);
    const starts = countStartRows(body || '');
    const corrupted = starts > 1;
    rows.push({
      issue,
      starts,
      corrupted,
      extraStarts: corrupted ? starts - 1 : 0,
    });
  }

  const corrupted = rows
    .filter((r) => r.corrupted)
    .map(({ issue, starts, extraStarts }) => ({ issue, starts, extraStarts }));

  return {
    rows,
    corrupted,
    totalIssues: rows.length,
    totalCorrupted: corrupted.length,
    totalExtraStarts: corrupted.reduce((sum, r) => sum + r.extraStarts, 0),
  };
}

// Apply driver. Audits first, then calls `healOne(issueNumber)` once per
// corrupted issue. `healOne` returns the per-issue heal result (e.g. runHeal's
// { status, startsBefore, startsAfter }); whatever it returns is recorded under
// `result`. A throwing `healOne` is captured per-issue (recorded under `error`)
// so one bad issue never aborts the sweep.
//
// Returns the audit fields plus:
//   healed:   [{ issue, result }]            (healOne resolved)
//   failed:   [{ issue, error }]             (healOne threw)
//   totalHealed: number of issues healOne resolved for
export async function healBacklog({ issues, readTimingBody, healOne } = {}) {
  if (typeof healOne !== 'function') throw new Error('healBacklog: healOne fn is required');
  const audit = await auditBacklog({ issues, readTimingBody });

  const healed = [];
  const failed = [];
  for (const { issue } of audit.corrupted) {
    try {
      const result = await healOne(issue);
      healed.push({ issue, result });
    } catch (err) {
      failed.push({ issue, error: err?.message ?? String(err) });
    }
  }

  return {
    ...audit,
    healed,
    failed,
    totalHealed: healed.length,
  };
}
