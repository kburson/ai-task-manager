// @story #757
// Pure output formatters for the atomic-move saga (Design §9 success readout,
// §12 failure error). Both functions take the enriched `moveState` result plus
// the from/to slugs and issue number and return a ready-to-print string. They
// NEVER re-probe GitHub — every fact they render comes from the result object
// the saga core already verified-as-stored — which is what lets the unit test
// drive them fully offline.
//
// Enriched result fields consumed here (additive to the #755/#756 shape):
//   exit            null on success, numeric on failure
//   phase           'complete' | 'status' | 'sentinel' | 'guard' | <other>
//   sentinelPresent boolean — was aitm-move-complete confirmed stored?
//   boardMoved      boolean — did the authoritative Status write land?
//   alreadyComplete boolean — idempotent replay short-circuit
//   tail            { failures: [{ name, error }], total }

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Render the §9 tail summary line body: `N/M best-effort steps ok` when clean,
 * or `X/M ok, K deferred — name, name` when some best-effort steps failed.
 */
function formatTailSummary(tail = {}) {
  const failures = Array.isArray(tail.failures) ? tail.failures : [];
  const total = Number.isFinite(tail.total) ? tail.total : failures.length;
  const ok = Math.max(0, total - failures.length);
  if (failures.length === 0) {
    return `${ok}/${total} best-effort steps ok`;
  }
  const names = failures
    .map((f) => f.name)
    .filter(Boolean)
    .join(', ');
  return `${ok}/${total} ok, ${failures.length} deferred — ${names}`;
}

/**
 * §9 success readout. Every element line asserts the element was verified as
 * stored (re-read by the saga core), then the sentinel and tail summary.
 */
export function formatMoveReadout({ result, issue, from, to }) {
  const header = result?.alreadyComplete
    ? `✓ move #${issue} ${from}→${to} already complete (idempotent replay)`
    : `✓ move #${issue} ${from}→${to} complete`;
  const pad = (label) => label.padEnd(12);
  const lines = [
    header,
    `  ${pad('exit flush')}: ${from} row closed (verified)`,
    `  ${pad('entry stamp')}: aitm-entered-${to} present (verified)`,
    `  ${pad('entry row')}: ${to} row opened (verified)`,
    `  ${pad('status')}: Status == ${capitalize(to)} (verified)`,
    `  ${pad('sentinel')}: aitm-move-complete state=${to} (written last)`,
    `  ${pad('tail')}: ${formatTailSummary(result?.tail)}`,
  ];
  return lines.join('\n');
}

/**
 * Map the failure `phase` to its §12 element / position / sentinel-consequence /
 * one-line recommendation. Only the enriched result fields are consulted — no
 * network. An unclassifiable phase defaults to "file a bug" so an unknown state
 * never masquerades as a routine re-run.
 */
function classifyFailure(result) {
  const boardMoved = Boolean(result?.boardMoved);
  const position = boardMoved ? 'after the Status write' : 'before the Status write';

  // A sentinel that IS present on a reported failure means the move actually
  // completed after all — treat as complete / reconcile, never re-run blindly.
  if (result?.sentinelPresent) {
    return {
      element: 'sentinel (aitm-move-complete)',
      position,
      sentinel: 'present',
      consequence: 'sentinel present ⇒ move is actually COMPLETE — treat as success / reconcile',
      recommendation: 're-run to reconcile (safe — the sentinel confirms completion)',
    };
  }

  switch (result?.phase) {
    case 'status':
      return {
        element: 'Status write (unconfirmed, #711 fail-closed)',
        position: 'before the Status write',
        sentinel: 'absent',
        consequence:
          'sentinel absent ⇒ incomplete, board not moved — safe to re-run to roll forward',
        recommendation: 're-run with `--repair` or corrected params',
      };
    case 'sentinel':
      return {
        element: 'sentinel (aitm-move-complete)',
        position: 'after the Status write',
        sentinel: 'absent',
        consequence:
          'sentinel absent ⇒ board moved, completion not yet stamped — re-run to converge',
        recommendation: 're-run to converge (`--repair`)',
      };
    case 'guard':
      return {
        element: 'transition guard (blocked move)',
        position: 'before the Status write',
        sentinel: 'absent',
        consequence: 'sentinel absent ⇒ board untouched — the blocker is printed above',
        recommendation: 'demote to fix code (resolve the printed blocker, then re-run)',
      };
    default:
      return {
        element: `unclassified failure (exit ${result?.exit})`,
        position,
        sentinel: 'absent',
        consequence: 'unrecognized failure class — do not assume the board state',
        recommendation: 'file a bug (attach this readout)',
      };
  }
}

/**
 * §12 failure error. Names the failed element, whether it failed before/after
 * the Status write, whether the sentinel is present or absent (and what that
 * implies), and carries a one-line next-action recommendation.
 */
export function formatMoveError({ result, issue, from, to }) {
  const c = classifyFailure(result);
  const pad = (label) => label.padEnd(14);
  const lines = [
    `⛔ move #${issue} ${from}→${to} FAILED`,
    `  ${pad('failed element')}: ${c.element} (${c.position})`,
    `  ${pad('sentinel')}: ${c.sentinel} — ${c.consequence}`,
    `  ${pad('recommendation')}: ${c.recommendation}`,
  ];
  return lines.join('\n');
}
