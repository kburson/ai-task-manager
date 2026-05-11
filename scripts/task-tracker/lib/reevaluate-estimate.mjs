// Heuristic re-evaluation of Size and Estimate from a Deep-Dive Analysis section.
//
// Pure function. No I/O. Constants exported so tests can pin bucket boundaries
// and so future tuning is a single-file edit.

export const SIZE_TIERS = ['XS', 'S', 'M', 'L', 'XL'];

// Bucket upper bounds (inclusive) on the score below.
export const SIZE_BUCKETS = [
  { size: 'XS', max: 3 },
  { size: 'S',  max: 6 },
  { size: 'M',  max: 12 },
  { size: 'L',  max: 20 },
  { size: 'XL', max: Infinity },
];

// Median hours per size tier — aligned with project-fields.json size descriptions:
// XS=1-2h, S=3-4h, M=6-10h, L=12-20h, XL=24+h.
export const ESTIMATE_HOURS = { XS: 1.5, S: 3.5, M: 8, L: 16, XL: 24 };

export function sizeIndex(size) {
  return SIZE_TIERS.indexOf(size);
}

function extractSection(body, headingRe) {
  const lines = body.split('\n');
  let start = -1;
  let depth = 2;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i])) {
      start = i + 1;
      const m = lines[i].match(/^(#{2,6})\s/);
      depth = m ? m[1].length : 2;
      break;
    }
  }
  if (start === -1) return null;
  // Terminate at the next heading of equal-or-shallower depth.
  const stopRe = new RegExp(String.raw`^#{2,${depth}}\s+`);
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (stopRe.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function countBullets(section) {
  if (!section) return 0;
  return section.split('\n').filter(l => /^\s*-\s+\S/.test(l)).length;
}

function countNumberedSteps(section) {
  if (!section) return 0;
  return section.split('\n').filter(l => /^\s*\d+\.\s+\S/.test(l)).length;
}

function countDependencies(section) {
  if (!section) return 0;
  const m = section.match(/depends on:\s*(.+)/i);
  if (!m) return 0;
  const tail = m[1].trim();
  if (/^none\b/i.test(tail)) return 0;
  return (tail.match(/#\d+/g) || []).length;
}

export function parseDeepDiveSignals(body) {
  if (typeof body !== 'string' || body.length === 0) {
    return { files: 0, steps: 0, risks: 0, deps: 0 };
  }
  const dd = extractSection(body, /^##\s+Deep[- ]Dive Analysis\b/i);
  const files = countBullets(extractSection(dd ?? body, /^###\s+Files to edit\b/i));
  const stepsSection = extractSection(dd ?? body, /^###\s+Step-by-step (?:implementation )?plan\b/i);
  const steps = countNumberedSteps(stepsSection);
  const risks = countBullets(extractSection(dd ?? body, /^###\s+Identified risks\b/i));
  const depMap = extractSection(body, /^##\s+Dependency Map\b/i);
  const deps = countDependencies(depMap);
  return { files, steps, risks, deps };
}

export function scoreSignals(signals) {
  const { files = 0, steps = 0, risks = 0, deps = 0 } = signals;
  return steps + 1.5 * files + risks + 0.5 * deps;
}

export function bucketSize(score) {
  for (const b of SIZE_BUCKETS) {
    if (score <= b.max) return b.size;
  }
  return 'XL';
}

export function reevaluateEstimate(body, current = {}) {
  const signals = parseDeepDiveSignals(body);
  const score = scoreSignals(signals);
  const size = bucketSize(score);
  const estimate = ESTIMATE_HOURS[size];

  const currentSize = current.size && SIZE_TIERS.includes(current.size) ? current.size : null;
  const currentEstimate = typeof current.estimate === 'number' ? current.estimate : null;

  const sizeChanged = currentSize !== size;
  const estimateChanged = currentEstimate === null
    ? true
    : Math.abs(currentEstimate - estimate) > 0.01;
  const changed = sizeChanged || estimateChanged;

  const tierJump = currentSize ? Math.abs(sizeIndex(size) - sizeIndex(currentSize)) : 0;
  const requiresHuman = tierJump >= 2;

  return {
    signals,
    score,
    size,
    estimate,
    current: { size: currentSize, estimate: currentEstimate },
    changed,
    sizeChanged,
    estimateChanged,
    tierJump,
    requiresHuman,
  };
}

export function buildRationale(result) {
  const { signals, score, size, current, requiresHuman } = result;
  const sigText = `${signals.files} file(s) to edit, ${signals.steps}-step plan, ${signals.risks} risk(s), ${signals.deps} dependency(ies) (score ${score})`;
  const fromTo = current.size
    ? `${current.size}→${size}`
    : `→${size}`;
  const human = requiresHuman ? ' ⚠ ≥2-tier jump — human review required before applying.' : '';
  return `Deep dive surfaced ${sigText}; bucket ${fromTo}.${human}`;
}

export const AUDIT_HEADER = '### 🔁 Analysis re-estimate';

export function buildAuditCommentBody(result) {
  const beforeSize = result.current?.size ?? '—';
  const beforeEst = result.current?.estimate ?? '—';
  const tableLines = [
    '| Field | Before | After |',
    '|---|---|---|',
    `| Size | ${beforeSize} | ${result.size} |`,
    `| Estimate (h) | ${beforeEst} | ${result.estimate} |`,
  ];
  const rationale = buildRationale(result);
  if (result.requiresHuman) {
    return [
      AUDIT_HEADER,
      '',
      '⚠ **HUMAN ATTENTION** — proposed change spans ≥2 size tiers; not auto-applied.',
      '',
      ...tableLines,
      '',
      rationale,
    ].join('\n');
  }
  return [AUDIT_HEADER, '', ...tableLines, '', rationale].join('\n');
}
