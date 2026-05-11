// Pure compute + comment builder for the review-stage delta.
//
// Review is retrospective: it records estimated-vs-actual without rewriting
// history. Nothing in this module touches `gh`, the project board, or the
// issue body. Callers in `verbClose` post the returned markdown verbatim.

export const DELTA_HEADER = '### 📊 Review delta';

export const DELTA_READ_ONLY_FOOTER =
  'This comment is read-only — Size and Estimate fields are not modified.';

export function computeReviewDelta({ estimate, actual } = {}) {
  const estNum = typeof estimate === 'number' && Number.isFinite(estimate) ? estimate : null;
  const actNum = typeof actual === 'number' && Number.isFinite(actual) ? actual : null;
  const hasActual = actNum !== null;
  const hasEstimate = estNum !== null;
  const deltaHours = hasActual && hasEstimate ? actNum - estNum : null;
  const deltaPct = hasActual && hasEstimate && estNum > 0
    ? (deltaHours / estNum) * 100
    : null;
  return {
    estimate: estNum,
    actual: actNum,
    deltaHours,
    deltaPct,
    hasActual,
    hasEstimate,
  };
}

function formatHours(h) {
  if (h === null || h === undefined) return '—';
  return Number.isInteger(h) ? String(h) : String(h);
}

function formatDelta(result) {
  if (!result.hasActual || !result.hasEstimate || result.deltaPct === null) return '—';
  const sign = result.deltaPct >= 0 ? '+' : '';
  return `${sign}${result.deltaPct.toFixed(1)}%`;
}

export function buildDeltaCommentBody(result, { drivers } = {}) {
  const estCell = formatHours(result.estimate);
  const actCell = result.hasActual ? formatHours(result.actual) : '—';
  const deltaCell = formatDelta(result);

  const tableLines = [
    '| Field | Estimated | Actual | Δ |',
    '|---|---|---|---|',
    `| Hours | ${estCell} | ${actCell} | ${deltaCell} |`,
  ];

  const driversLine = Array.isArray(drivers) && drivers.length > 0
    ? 'Drivers:\n' + drivers.map(d => `- ${d}`).join('\n')
    : 'Drivers: see review notes.';

  const lines = [DELTA_HEADER, '', ...tableLines, '', driversLine];

  if (!result.hasActual) {
    lines.push('');
    lines.push('_`Actual Session Time` was not set on the project board — delta unavailable._');
  }

  lines.push('');
  lines.push(DELTA_READ_ONLY_FOOTER);

  return lines.join('\n');
}
