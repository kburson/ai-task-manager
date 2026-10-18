// @story #1908 #1986 — Bounded, non-executable issue-body record codec; no I/O.
import { DECOMPOSITION_THRESHOLDS } from './decomposition-policy.mjs';
import { parseMarker, serializeMarker } from './marker-grammar.mjs';
import { markdownViews, openingFenceFor, isClosingFence } from './plan-markdown-views.mjs';
import {
  canonicalDecompositionJson,
  decompositionError,
  exactDecompositionKeys,
  validateDecompositionAssessment,
  validateDecompositionPublication,
  deriveDecompositionCapabilities,
} from './decomposition-assessment.mjs';

export { validateDecompositionPublication } from './decomposition-assessment.mjs';
export const DECOMPOSITION_RECORD_BYTE_LIMIT = 8192;
export const DECOMPOSITION_BODY_BYTE_LIMIT = 65536;
const MARKER_RE = /<!--\s*aitm-decomposition-(assessment|publication)\b[\s\S]*?(?:-->|$)/g;
const SECTION_RE = /^##\s+Decomposition Assessment\s*$/i;
const PROGRESS_RE = /^##\s+(?:AITM\s+)?Progress Markers\s*$/i;
const ATTR_RE = /([a-zA-Z0-9_-]+)="[^"]*"/g;

function layout(body) {
  const { originalLines, structuralLines } = markdownViews(body);
  const sections = [];
  const fences = [];
  let offset = 0;
  let fence = null;
  let fenceStart = null;
  for (let i = 0; i < originalLines.length; i += 1) {
    const raw = originalLines[i];
    if (fence) {
      if (isClosingFence(raw, fence)) {
        fences.push([fenceStart, offset + raw.length]);
        fence = null;
      }
    } else {
      fence = openingFenceFor(raw);
      if (fence) fenceStart = offset;
    }
    const line = structuralLines[i];
    if (/^##\s+/.test(line)) {
      if (sections.length) sections.at(-1).end = offset;
      sections.push({
        start: offset,
        end: body.length,
        heading: line,
        contentStart: offset + raw.length,
      });
    }
    offset += raw.length + 1;
  }
  if (fence) fences.push([fenceStart, body.length]);
  const assessments = sections.filter((section) => SECTION_RE.test(section.heading));
  const progress = sections.filter((section) => PROGRESS_RE.test(section.heading));
  if (assessments.length > 1 || progress.length > 1) decompositionError('duplicate-sections');
  return { assessment: assessments[0] ?? null, progress: progress[0] ?? null, fences };
}
function decode(raw, name) {
  // parseMarker collapses duplicates, so reject those from the raw bytes first.
  const attrs = [...raw.matchAll(ATTR_RE)].map((match) => match[1]);
  if (new Set(attrs).size !== attrs.length) decompositionError('duplicate-attributes');
  const parsed = parseMarker(raw);
  if (parsed?.name !== `decomposition-${name}`) decompositionError('malformed-marker');
  exactDecompositionKeys(parsed.props, ['schema', 'payload'], 'marker-attributes');
  if (parsed.props.schema !== '1') decompositionError('marker-schema');
  const encoded = parsed.props.payload;
  if (encoded.length > Math.ceil((DECOMPOSITION_RECORD_BYTE_LIMIT * 4) / 3))
    decompositionError('record-limit');
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) decompositionError('payload-encoding');
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.length > DECOMPOSITION_RECORD_BYTE_LIMIT) decompositionError('record-limit');
  if (bytes.toString('base64url') !== encoded) decompositionError('payload-canonical');
  let json;
  let value;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(json);
  } catch {
    decompositionError('payload-json-utf8');
  }
  // This also rejects duplicate JSON keys rather than accepting the last one.
  if (canonicalDecompositionJson(value) !== json) decompositionError('payload-canonical-json');
  if (name === 'assessment') validateDecompositionAssessment(value);
  else validateDecompositionPublication(value);
  return value;
}
function validatePair({ assessment, publication }) {
  if (assessment !== null) validateDecompositionAssessment(assessment);
  if (publication !== null) validateDecompositionPublication(publication);
  if (
    assessment !== null &&
    publication !== null &&
    canonicalDecompositionJson(assessment.subject) !==
      canonicalDecompositionJson(publication.subject)
  )
    decompositionError('mixed-subjects');
}
export function readDecompositionRecords(body) {
  if (typeof body !== 'string') decompositionError('body-type');
  if (Buffer.byteLength(body, 'utf8') > DECOMPOSITION_BODY_BYTE_LIMIT)
    decompositionError('body-limit');
  const positions = layout(body);
  const records = { assessment: null, publication: null };
  for (const match of body.matchAll(MARKER_RE)) {
    const name = match[1];
    if (records[name] !== null) decompositionError('duplicate-records');
    if (
      !positions.progress ||
      match.index < positions.progress.contentStart ||
      match.index + match[0].length > positions.progress.end ||
      positions.fences.some(([start, end]) => match.index >= start && match.index < end)
    )
      decompositionError('marker-placement');
    records[name] = decode(match[0], name);
  }
  if ((records.assessment !== null || records.publication !== null) && !positions.assessment)
    decompositionError('assessment-section-missing');
  validatePair(records);
  return records;
}
function encode(name, value) {
  const json = canonicalDecompositionJson(value);
  if (Buffer.byteLength(json, 'utf8') > DECOMPOSITION_RECORD_BYTE_LIMIT)
    decompositionError('record-limit');
  return serializeMarker(`decomposition-${name}`, {
    schema: '1',
    payload: Buffer.from(json, 'utf8').toString('base64url'),
  });
}
function visibleSection(assessment, publication) {
  const thresholds = DECOMPOSITION_THRESHOLDS;
  const status =
    publication?.status === 'pending' ? 'pending' : (assessment?.status ?? 'indeterminate');
  const allowed = assessment
    ? deriveDecompositionCapabilities(assessment, publication)
    : ['inspect', 'checkpoint'];
  const lines = [
    '## Decomposition Assessment',
    '',
    `- Status: ${status}`,
    `- Thresholds: estimate review ${thresholds.reviewEstimateHours}h, mandatory ${thresholds.splitEstimateHours}h; task review ${thresholds.reviewTaskCount}, mandatory ${thresholds.splitTaskCount}; verifier groups review ${thresholds.reviewVerificationGroups}, XL mandatory groups ${thresholds.splitXlVerificationGroups}`,
    `- Allowed actions: ${allowed.join(', ')}`,
  ];
  if (assessment) {
    lines.push(
      `- Kind: ${assessment.kind}`,
      `- Estimate: ${assessment.estimate.basis}${assessment.estimate.hours === null ? '' : ` ${assessment.estimate.hours}h`}`
    );
    for (const signal of assessment.signals)
      lines.push(`- Signal: ${signal.code} ${signal.value} (${signal.level})`);
    for (const blocker of assessment.blockers) lines.push(`- Blocker: ${blocker.code}`);
  } else lines.push('- Assessment: unavailable');
  if (publication?.status === 'pending') {
    const intended = publication.proposal;
    lines.push(
      '- Pending intended estimate: ' +
        (intended.estimate.hours === null ? 'unset' : 'proposed ' + intended.estimate.hours + 'h')
    );
    lines.push('- Pending intended size: ' + (intended.size ?? 'unset'));
  }
  if (publication) lines.push(`- Publication: ${publication.status} (${publication.operationId})`);
  return `${lines.join('\n')}\n\n`;
}
export function replaceDecompositionRecords(body, records) {
  exactDecompositionKeys(records, ['assessment', 'publication'], 'records-keys');
  readDecompositionRecords(body); // Malformed authority is refused, never silently overwritten.
  validatePair(records);
  const markers = Object.entries(records)
    .filter(([, value]) => value !== null)
    .map(([name, value]) => encode(name, value));
  let next = body.replace(MARKER_RE, '');
  const old = layout(next).assessment;
  if (old) next = next.slice(0, old.start) + next.slice(old.end);
  if (!markers.length) return next;
  let progress = layout(next).progress;
  if (!progress) {
    const separator = !next || next.endsWith('\n\n') ? '' : next.endsWith('\n') ? '\n' : '\n\n';
    next = `${next}${separator}## AITM Progress Markers\n`;
    progress = layout(next).progress;
  }
  next =
    next.slice(0, progress.start) +
    visibleSection(records.assessment, records.publication) +
    next.slice(progress.start);
  progress = layout(next).progress;
  const before = next.slice(0, progress.end).replace(/\s+$/, '');
  const after = next.slice(progress.end);
  next = `${before}\n\n${markers.join('\n')}\n${after ? `\n${after}` : ''}`;
  if (Buffer.byteLength(next, 'utf8') > DECOMPOSITION_BODY_BYTE_LIMIT)
    decompositionError('body-limit');
  readDecompositionRecords(next);
  return next;
}
