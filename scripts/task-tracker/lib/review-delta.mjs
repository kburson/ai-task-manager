// Pure compute + comment builder for the review-stage delta.
//
// Review is retrospective: it records estimated-vs-actual without rewriting
// history. Nothing in this module touches `gh`, the project board, or the
// issue body. Callers in `verbClose` post the returned markdown verbatim.
//
// Units:
//   - `estimateHr` is whole-story estimate in HOURS (set at refine/plan).
//   - `actualSec` is agentic engaged time in SECONDS (second-precision).
//     Callers convert from the project-board `engagedTime` (minutes) by
//     multiplying by 60 until D3 ships second-precision board rollup.
//   - All math is in seconds; rendering is `H:MM:SS`.

export const DELTA_HEADER = '### 📊 Review delta';

export const DELTA_READ_ONLY_FOOTER =
  'This comment is read-only — Size and Estimate fields are not modified.';

const SEC_PER_HOUR = 3600;

// Render a non-negative integer second count as `H:MM:SS`.
// Negative inputs are clamped to 0 (Δ is rendered as a separate percent).
export function formatHMS(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  const n = Math.max(0, Math.floor(sec));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Compute the Review delta in second-precision.
//
// Inputs:
//   - estimateHr: number | null — whole-story estimate in hours.
//   - actualSec: number | null — engaged time in seconds.
//
// Returns:
//   {
//     estimateHr, estimateSec,    // null when input missing
//     actualSec,                  // null when input missing
//     deltaSec, deltaPct,         // null when either side missing or estimate=0
//     hasActual, hasEstimate,
//   }
export function computeReviewDelta({ estimateHr, actualSec, planMin } = {}) {
  const estHr = typeof estimateHr === 'number' && Number.isFinite(estimateHr) ? estimateHr : null;
  const actSec = typeof actualSec === 'number' && Number.isFinite(actualSec) ? actualSec : null;
  const planNum = typeof planMin === 'number' && Number.isFinite(planMin) ? planMin : null;
  const hasEstimate = estHr !== null;
  const hasActual = actSec !== null;
  const estimateSec = hasEstimate ? Math.round(estHr * SEC_PER_HOUR) : null;
  const deltaSec = hasActual && hasEstimate ? actSec - estimateSec : null;
  const deltaPct =
    hasActual && hasEstimate && estimateSec > 0 ? (deltaSec / estimateSec) * 100 : null;
  return {
    estimateHr: estHr,
    estimateSec,
    actualSec: actSec,
    planMin: planNum,
    deltaSec,
    deltaPct,
    hasActual,
    hasEstimate,
    hasPlanTime: planNum !== null,
  };
}

function formatDelta(result) {
  if (!result.hasActual || !result.hasEstimate || result.deltaPct === null) return '—';
  // ASCII minus for negative; explicit '+' for non-negative.
  const sign = result.deltaPct >= 0 ? '+' : '';
  return `${sign}${result.deltaPct.toFixed(1)}%`;
}

export function buildDeltaCommentBody(result, { drivers } = {}) {
  const estCell = result.hasEstimate ? formatHMS(result.estimateSec) : '—';
  const actCell = result.hasActual ? formatHMS(result.actualSec) : '—';
  const deltaCell = formatDelta(result);

  const tableLines = [
    '| Description | Estimated | Actual | Δ |',
    '|---|---|---|---|',
    `| Story effort | ${estCell} | ${actCell} | ${deltaCell} |`,
  ];

  if (result.hasPlanTime) {
    tableLines.push(`| Plan minutes | — | ${result.planMin} | — |`);
  }

  const noteLine =
    '_Estimate is whole-story hours (set at refine/plan). Actual is agentic engaged time, second-precision. Board fields are rounded to minutes._';

  const lines = [DELTA_HEADER, '', ...tableLines, '', noteLine];

  // Drivers section is conditional — omit entirely when empty so the comment
  // does not contain a dead-end "see review notes" placeholder. The D1
  // sub-issue wires up a real drivers source.
  if (Array.isArray(drivers) && drivers.length > 0) {
    lines.push('');
    lines.push('Drivers:');
    for (const d of drivers) lines.push(`- ${d}`);
  }

  if (!result.hasActual) {
    lines.push('');
    lines.push('_`Actual Session Time` was not set on the project board — delta unavailable._');
  }

  lines.push('');
  lines.push(DELTA_READ_ONLY_FOOTER);

  return lines.join('\n');
}
