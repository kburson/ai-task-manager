// Durable epic child-graph authority for Plan -> Develop (#1216).

import { createHash } from 'node:crypto';

import { parseMarker, serializeMarker } from './marker-grammar.mjs';

export const EPIC_ORCHESTRATION_PLAN_RE = /<!--\s*aitm-epic-orchestration-plan\s+[^>]*?-->/i;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalChildren(children) {
  if (!Array.isArray(children)) throw new Error('epic-orchestration-plan: children unreadable');
  return children
    .map((child) => {
      const number = Number(child?.number);
      const rank = Number(child?.rank ?? child?.sequence);
      if (!Number.isSafeInteger(number) || number <= 0 || !Number.isFinite(rank)) {
        throw new Error('epic-orchestration-plan: child descriptor incomplete');
      }
      const blockedBy = Array.isArray(child?.blockedBy)
        ? [...new Set(child.blockedBy.map(Number))]
            .filter((value) => Number.isSafeInteger(value) && value > 0)
            .sort((a, b) => a - b)
        : null;
      if (blockedBy === null) throw new Error('epic-orchestration-plan: dependencies unreadable');
      return {
        number,
        rank,
        blockedBy,
        state: String(child?.state || '').toLowerCase(),
        disposition: String(child?.closeReason || '').toLowerCase() || null,
      };
    })
    .sort((a, b) => a.number - b.number);
}

function payloadFor({ children, trunkSha }) {
  if (!/^[0-9a-f]{40}$/i.test(String(trunkSha || ''))) {
    throw new Error('epic-orchestration-plan: trunk SHA unreadable');
  }
  return {
    schema: 1,
    trunkSha: String(trunkSha).toLowerCase(),
    execution: 'strict-sequential',
    acceptedTerminalDispositions: ['completed', 'not_planned'],
    authorizedParallelWaves: [],
    children: canonicalChildren(children),
  };
}

export function buildEpicOrchestrationPlanMarker({ children, trunkSha }) {
  const payload = payloadFor({ children, trunkSha });
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return serializeMarker('epic-orchestration-plan', {
    schema: '1',
    digest: sha256(encoded),
    payload: encoded,
  });
}

export function parseEpicOrchestrationPlan(body) {
  const match = String(body || '').match(EPIC_ORCHESTRATION_PLAN_RE)?.[0];
  const marker = match ? parseMarker(match) : null;
  if (!marker || marker.name !== 'epic-orchestration-plan') return null;
  const encoded = marker.props?.payload || '';
  if (marker.props?.schema !== '1' || marker.props?.digest !== sha256(encoded)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.schema !== 1) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyEpicOrchestrationPlan(body, { children, trunkSha }) {
  const stored = parseEpicOrchestrationPlan(body);
  if (!stored) return { ok: false, reason: 'epic orchestration plan missing or malformed' };
  let current;
  try {
    current = payloadFor({ children, trunkSha });
  } catch (error) {
    return { ok: false, reason: error.message };
  }
  if (JSON.stringify(stored) !== JSON.stringify(current)) {
    return { ok: false, reason: 'epic orchestration plan is stale' };
  }
  return { ok: true, plan: stored };
}

export function upsertEpicOrchestrationPlan(body, options) {
  const marker = buildEpicOrchestrationPlanMarker(options);
  const source = String(body || '');
  if (EPIC_ORCHESTRATION_PLAN_RE.test(source)) {
    return source.replace(EPIC_ORCHESTRATION_PLAN_RE, marker);
  }
  const fieldMarker = source.search(/<!--\s*aitm-fields:/i);
  if (fieldMarker >= 0) {
    return `${source.slice(0, fieldMarker).trimEnd()}\n\n${marker}\n\n${source.slice(fieldMarker)}`;
  }
  return `${source.trimEnd()}\n\n${marker}\n`;
}
