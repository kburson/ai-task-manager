// @story #2049
// Pure existing native Plan marker codec and canonical fence scanner; no I/O or grants.
import { parseMarker, serializeMarker } from './marker-grammar.mjs';
function sourceLines(body) {
  const src = String(body || '');
  const lines = [];
  let start = 0;
  while (start < src.length) {
    const newline = src.indexOf('\n', start);
    const end = newline === -1 ? src.length : newline + 1;
    let textEnd = newline === -1 ? end : newline;
    if (textEnd > start && src[textEnd - 1] === '\r') textEnd -= 1;
    lines.push({ start, end, text: src.slice(start, textEnd) });
    start = end;
  }
  return { src, lines };
}

function fencedCodeBlockRanges(body) {
  const { src, lines } = sourceLines(body);
  const ranges = [];
  for (let i = 0; i < lines.length; i += 1) {
    const opener = lines[i].text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opener) continue;
    const fenceChar = opener[1][0];
    if (fenceChar === '`' && opener[2].includes('`')) continue;
    const openerLength = opener[1].length;
    let end = src.length;
    let closingLine = lines.length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const closer = lines[j].text.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (closer && closer[1][0] === fenceChar && closer[1].length >= openerLength) {
        end = lines[j].end;
        closingLine = j;
        break;
      }
    }
    ranges.push({ start: lines[i].start, end });
    i = closingLine;
  }
  return { src, ranges };
}

function transformFencedCodeBlocks(body, transform) {
  const { src, ranges } = fencedCodeBlockRanges(body);
  if (ranges.length === 0) return src;
  let cursor = 0;
  let result = '';
  for (const range of ranges) {
    result += src.slice(cursor, range.start);
    result += transform(src.slice(range.start, range.end));
    cursor = range.end;
  }
  return result + src.slice(cursor);
}

export function stripFencedCodeBlocks(body) {
  return transformFencedCodeBlocks(body, () => '');
}

export function maskFencedCodeBlocksPreservingOffsets(body) {
  return transformFencedCodeBlocks(body, (block) => block.replace(/[^\r\n]/g, ' '));
}

// ---------------------------------------------------------------------------
// plan-approved (plan → develop human gate)
// ---------------------------------------------------------------------------

// Reader widened (#375) to accept BOTH the legacy colon grammar
// (`aitm-plan-approved: <iso>`) and the consolidated property grammar
// (`aitm-plan-approved ts="<iso>"`). The legacy branch stays until #369's
// corpus sweep reports zero residual legacy markers.
export const PLAN_APPROVED_RE =
  /<!--\s*aitm-plan-approved(?::\s*[^>]*?|\s+ts="[^"]*"[^>]*?)\s*-->/i;

export const PLAN_APPROVAL_MODES = Object.freeze({
  HUMAN: 'human',
  FULL_AUTO: 'full-auto',
  UNKNOWN: 'unknown',
});
const STORY_INTENT_SOURCES = ['deep-dive', 'linked-plan', 'linked-plan-task'];
const STORY_BINDING_FIELDS = {
  storyDigest: 'story-digest',
  storyIntentDigest: 'story-intent-digest',
  storyIntentSource: 'story-intent-source',
};
function validStoryBindingValue(key, value) {
  return key === 'storyIntentSource'
    ? STORY_INTENT_SOURCES.includes(value)
    : typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function buildPlanApprovedMarker(
  ts,
  {
    forecastRecordId = null,
    mode = null,
    repairRecordId = null,
    trunkSha = null,
    storyDigest = null,
    storyIntentDigest = null,
    storyIntentSource = null,
  } = {}
) {
  const properties = { ts };
  const binding = { storyDigest, storyIntentDigest, storyIntentSource };
  for (const [key, attribute] of Object.entries(STORY_BINDING_FIELDS)) {
    if (binding[key] === null) continue;
    if (!validStoryBindingValue(key, binding[key]))
      throw new TypeError(`buildPlanApprovedMarker: invalid ${key}`);
    properties[attribute] = binding[key];
  }
  if (forecastRecordId !== null) properties['forecast-record-id'] = forecastRecordId;
  if (repairRecordId !== null) {
    if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(String(repairRecordId))) {
      throw new TypeError('buildPlanApprovedMarker: repairRecordId must be a ULID');
    }
    properties['repair-record-id'] = String(repairRecordId);
  }
  if (trunkSha !== null) {
    if (!/^[0-9a-f]{40}$/i.test(String(trunkSha))) {
      throw new TypeError('buildPlanApprovedMarker: trunkSha must be a 40-character SHA');
    }
    properties['trunk-sha'] = String(trunkSha).toLowerCase();
  }
  if (mode !== null) {
    if (mode !== PLAN_APPROVAL_MODES.HUMAN && mode !== PLAN_APPROVAL_MODES.FULL_AUTO) {
      throw new TypeError(
        `buildPlanApprovedMarker: unsupported approval mode ${JSON.stringify(mode)}`
      );
    }
    properties.mode = mode;
  }
  return serializeMarker('plan-approved', properties);
}

export function hasPlanApprovedMarker(body) {
  return PLAN_APPROVED_RE.test(stripFencedCodeBlocks(body));
}

// Decode a plan-approved marker without fabricating provenance for historical
// shapes. Legacy colon markers and property markers written before #1109 have
// no `mode`, so both remain valid approvals but report `unknown`.
export function parsePlanApprovedMarker(body) {
  const match = stripFencedCodeBlocks(body).match(PLAN_APPROVED_RE)?.[0];
  if (!match) return null;

  const legacy = match.match(/<!--\s*aitm-plan-approved:\s*([^>]*?)\s*-->/i);
  if (legacy) {
    return {
      ts: legacy[1].trim(),
      forecastRecordId: null,
      mode: PLAN_APPROVAL_MODES.UNKNOWN,
      repairRecordId: null,
      trunkSha: null,
      storyDigest: null,
      storyIntentDigest: null,
      storyIntentSource: null,
    };
  }

  const parsed = parseMarker(match);
  if (!parsed || parsed.name !== 'plan-approved') return null;
  const props = parsed.props || {};
  const mode =
    props.mode === PLAN_APPROVAL_MODES.HUMAN || props.mode === PLAN_APPROVAL_MODES.FULL_AUTO
      ? props.mode
      : PLAN_APPROVAL_MODES.UNKNOWN;
  const forecastRecordId = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(props['forecast-record-id'] || '')
    ? props['forecast-record-id']
    : null;
  const repairRecordId = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(props['repair-record-id'] || '')
    ? props['repair-record-id']
    : null;
  const trunkSha = /^[0-9a-f]{40}$/i.test(props['trunk-sha'] || '')
    ? props['trunk-sha'].toLowerCase()
    : null;
  const binding = Object.fromEntries(
    Object.entries(STORY_BINDING_FIELDS).map(([key, attribute]) => [
      key,
      validStoryBindingValue(key, props[attribute]) ? props[attribute] : null,
    ])
  );
  return { ts: props.ts || '', forecastRecordId, mode, repairRecordId, trunkSha, ...binding };
}

export function readPlanApprovedMode(body) {
  return parsePlanApprovedMarker(body)?.mode ?? PLAN_APPROVAL_MODES.UNKNOWN;
}

export function readPlanApprovedForecastRecordId(body) {
  return parsePlanApprovedMarker(body)?.forecastRecordId ?? null;
}

function candidateApprovalClaim(body) {
  const claims = [
    ...maskFencedCodeBlocksPreservingOffsets(String(body)).matchAll(
      /<!--\s*aitm-plan-approved\b[^>]*-->/gi
    ),
  ];
  if (claims.length !== 1) throw new Error('plan-candidate:approval-marker-count');
  return claims[0];
}
export function readCandidatePlanApprovalMarker(body) {
  return candidateApprovalClaim(body)[0];
}
export function removeCandidatePlanApprovalMarker(body) {
  const claim = candidateApprovalClaim(body);
  return body.slice(0, claim.index) + body.slice(claim.index + claim[0].length);
}

// @story #2069 — candidate authority admits one standalone, unfenced marker.
export function readCandidateForecastReady(body) {
  const text = stripFencedCodeBlocks(String(body));
  const occurrences = [...text.matchAll(/<!--\s*aitm-estimation-forecast-ready\b/gi)];
  if (occurrences.length === 0) return null;
  const markers = [
    ...text.matchAll(
      /^[ \t]*<!--\s*aitm-estimation-forecast-ready\s+record-id="([0-7][0-9A-HJKMNP-TV-Z]{25})"\s*-->[ \t]*$/gim
    ),
  ];
  if (occurrences.length !== 1 || markers.length !== 1)
    throw new Error('plan-candidate:forecast-ready-ambiguous');
  return markers[0][1];
}
