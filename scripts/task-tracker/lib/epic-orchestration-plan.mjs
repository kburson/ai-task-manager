// Durable epic child-graph authority for Plan -> Develop (#1216).

import { createHash } from 'node:crypto';

import {
  freezeRankGraph,
  rankWaveDigest as sha256CanonicalGraph,
} from './epic-rank-wave-policy.mjs';
import { maskFencedCodeBlocksPreservingOffsets } from './markers.mjs';
import { exactRankWaveKeys } from './epic-rank-wave-authority.mjs';
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
  const matches = [
    ...maskFencedCodeBlocksPreservingOffsets(body).matchAll(
      new RegExp(EPIC_ORCHESTRATION_PLAN_RE.source, 'gi')
    ),
  ];
  if (matches.length !== 1) return null;
  const match = matches[0][0];
  const marker = match ? parseMarker(match) : null;
  if (!marker || marker.name !== 'epic-orchestration-plan') return null;
  const encoded = marker.props?.payload || '';
  if (!['1', '2'].includes(marker.props?.schema) || marker.props?.digest !== sha256(encoded))
    return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (String(payload.schema) !== marker.props.schema) return null;
    if (payload.schema === 2) {
      exactRankWaveKeys(payload, [
        'schema',
        'trunkSha',
        'execution',
        'graphDigest',
        'graph',
        'waves',
      ]);
      if (!/^[a-f0-9]{40}$/.test(payload.trunkSha)) return null;
      payload.waves.forEach((w) =>
        exactRankWaveKeys(w, ['rank', 'operationId', 'digest', 'commentNodeId'])
      );
      if (
        payload.execution !== 'rank-level' ||
        !Array.isArray(payload.waves) ||
        !payload.waves.length ||
        payload.graphDigest !== sha256CanonicalGraph(freezeRankGraph(payload.graph)) ||
        new Set(payload.waves.map((w) => w.rank)).size !== payload.waves.length ||
        payload.waves.some(
          (w) =>
            !Number.isFinite(w.rank) ||
            !w.operationId ||
            !w.commentNodeId ||
            !/^[a-f0-9]{64}$/.test(w.digest)
        )
      )
        return null;
    } else if (payload.schema !== 1) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyEpicOrchestrationPlan(body, { children, trunkSha }) {
  const stored = parseEpicOrchestrationPlan(body);
  if (!stored) return { ok: false, reason: 'epic orchestration plan missing or malformed' };
  if (stored.schema === 2) {
    try {
      return stored.trunkSha === String(trunkSha).toLowerCase() &&
        stored.graphDigest === sha256CanonicalGraph(freezeRankGraph(children))
        ? { ok: true, plan: stored }
        : { ok: false, reason: 'epic orchestration plan is stale' };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }
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

// #1872 — only the registered wave transaction reconciles this pointer.
export function reconcileRankWavePointer(body, { record, digest, commentNodeId }) {
  const current = parseEpicOrchestrationPlan(body);
  if (!current || !commentNodeId) throw new Error('rank-wave: parent contract unreadable');
  const graph = record.graph,
    graphDigest = sha256CanonicalGraph(graph);
  if (current.schema === 1) {
    const identities = current.children.map((c) => ({
      number: c.number,
      rank: c.rank,
      blockedBy: c.blockedBy,
    }));
    if (
      JSON.stringify(identities) !==
      JSON.stringify(graph.map((c) => ({ number: c.number, rank: c.rank, blockedBy: c.blockedBy })))
    ) {
      throw new Error('rank-wave: parent contract graph changed');
    }
  }
  const graphChanged = current.schema === 2 && current.graphDigest !== graphDigest;
  if (graphChanged && record.action !== 'authorize')
    throw new Error('rank-wave: parent graph drift');
  const waves = current.schema === 2 ? [...current.waves] : [];
  const existing = waves.find((w) => w.rank === record.rank);
  if (existing && existing.digest !== digest && existing.digest !== record.previousDigest)
    throw new Error('rank-wave: body pointer drift');
  const pointer = { rank: record.rank, operationId: record.id, digest, commentNodeId };
  const payload = {
    schema: 2,
    trunkSha: current.trunkSha,
    execution: 'rank-level',
    graphDigest,
    graph,
    waves: [...(graphChanged ? [] : waves.filter((w) => w.rank !== record.rank)), pointer].sort(
      (a, b) => a.rank - b.rank
    ),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const marker = serializeMarker('epic-orchestration-plan', {
    schema: '2',
    digest: sha256(encoded),
    payload: encoded,
  });
  const match = maskFencedCodeBlocksPreservingOffsets(body).match(EPIC_ORCHESTRATION_PLAN_RE);
  return body.slice(0, match.index) + marker + body.slice(match.index + match[0].length);
}
