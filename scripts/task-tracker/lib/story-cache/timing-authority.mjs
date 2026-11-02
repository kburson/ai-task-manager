// @story #2070
// Measured native intervals and lifecycle completion are separate evidence.
import { mergeTimingEvents } from './timing-events.mjs';
import { createHash } from 'node:crypto';
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
import { validateHistoricalCompletionReceipt } from './completion-receipt.mjs';
import { validateManifest } from './manifest.mjs';
import { parseTransitionCommitComment } from '../move-state/transition-commit.mjs';
import { parseEntryMarker, parseEntryMarkers } from '../stage-entry-grammar.mjs';
import { isEntryHistoryEdge } from '../lifecycle-policy/index.mjs';
import { parseNativeContentTimestamp } from './native-observation.mjs';

function legacyVisit({ generation: record, commentKey }) {
  const identity = record.generation.identity;
  const verified = validateManifest(record.manifest, { identity, payloads: record.payloads });
  if (json(verified.generation) !== json(record.generation))
    throw new Error('legacy-generation-drift');
  const resources = verified.generation.baseSnapshot.resources;
  const ref = resources[commentKey];
  if (!ref || ref.kind !== 'comment' || !commentKey.startsWith('comment:'))
    throw new Error('legacy-source');
  const read = (resource) =>
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      Buffer.from(record.payloads.get(resource.payloadPath))
    );
  const body = read(ref);
  if ([...body.matchAll(/<!--\s*aitm-transition-commit\b/g)].length !== 1)
    throw new Error('legacy-count');
  const proof = parseTransitionCommitComment(body);
  const issueBody = read(resources['issue:' + identity.issueNodeId]);
  const entry = parseEntryMarker(proof.visitMarker);
  if (
    proof.repository !== identity.repository ||
    proof.issue !== identity.issueNumber ||
    !entry ||
    !Number.isSafeInteger(entry.visit) ||
    entry.visit < 1 ||
    parseNativeContentTimestamp(entry.ts) === null ||
    entry.move !== proof.transitionId ||
    entry.state !== proof.target ||
    !isEntryHistoryEdge(proof.source, proof.target) ||
    !issueBody.includes(proof.visitMarker) ||
    parseEntryMarkers(issueBody).filter(
      (row) => row.state === entry.state && row.visit === entry.visit
    ).length !== 1
  )
    throw new Error('legacy-visit-identity');
  return {
    id: proof.transitionId,
    from: proof.source,
    to: proof.target,
    visit: entry.visit,
    actorId: null,
    legacyActor: proof.actor,
  };
}

function inPublishedBody(receipt, record) {
  const { identity, baseSnapshot } = record.generation;
  const ref = baseSnapshot.resources['issue:' + identity.issueNodeId];
  const body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    Buffer.from(record.payloads.get(ref.payloadPath))
  );
  const starts = [...body.matchAll(/<!--\s*aitm-transition-completion\b/g)];
  const matches = [...body.matchAll(/^<!-- aitm-transition-completion (.+) -->$/gm)];
  if (starts.length !== matches.length) throw new Error('completion-receipt-format');
  const published = matches.map((match) => {
    const value = JSON.parse(match[1]);
    if (json(value) !== match[1] || typeof value?.transition?.id !== 'string')
      throw new Error('completion-receipt-format');
    return value;
  });
  if (new Set(published.map((value) => value.transition.id)).size !== published.length)
    throw new Error('completion-receipt-count');
  if (!published.some((value) => json(value) === json(receipt)))
    throw new Error('completion-receipt-not-published');
}

/**
 * Pure historical accounting over explicitly supplied native evidence.
 * receipts: [{receipt, confirmedEffects, generation: {manifest,generation,payloads}}].
 * legacyEvidence: [{commentKey, generation: {manifest,generation,payloads}}].
 * Both proof paths read baseSnapshot content, never working content. Callers own
 * current observation/freshness; this function grants no write or guard authority.
 * A legacy login is retained separately and never substituted for a native actorId.
 * Known subtotals remain usable when a separate Unknown flag or proof failure exists.
 */
export function timingAuthority({ events = [], receipts = [], legacyEvidence = [] } = {}) {
  const rows = mergeTimingEvents(events, []);
  if (!Array.isArray(receipts)) throw new TypeError('timing-authority:receipts');
  if (!Array.isArray(legacyEvidence)) throw new TypeError('timing-authority:legacy-evidence');
  const completedVisits = [];
  const completionFailures = [];
  const counts = new Map();
  for (const evidence of receipts) {
    const id = evidence?.receipt?.transition?.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const legacy = [];
  for (const evidence of legacyEvidence) {
    try {
      const visit = legacyVisit(evidence);
      legacy.push(visit);
      counts.set(visit.id, (counts.get(visit.id) ?? 0) + 1);
    } catch (error) {
      completionFailures.push(Object.freeze({ transitionId: null, reason: error.message }));
    }
  }
  for (const evidence of receipts) {
    const id = evidence?.receipt?.transition?.id ?? null;
    try {
      if (counts.get(id) !== 1) throw new Error('completion-receipt-count');
      const receipt = validateHistoricalCompletionReceipt(evidence.receipt, {
        transition: evidence.receipt.transition,
        confirmedEffects: evidence.confirmedEffects,
        generation: evidence.generation,
      });
      inPublishedBody(receipt, evidence.generation);
      const ids = new Set(receipt.timing.eventIds);
      const subset = rows.filter((row) => ids.has(row.eventId));
      if (
        subset.length !== ids.size ||
        createHash('sha256').update(json(subset)).digest('hex') !== receipt.timing.eventsDigest
      )
        throw new Error('completion-event-subset');
      completedVisits.push(receipt.transition);
    } catch (error) {
      completionFailures.push(Object.freeze({ transitionId: id, reason: error.message }));
    }
  }
  for (const visit of legacy) {
    if (counts.get(visit.id) === 1) completedVisits.push(Object.freeze(visit));
    else
      completionFailures.push(
        Object.freeze({ transitionId: visit.id, reason: 'completion-receipt-count' })
      );
  }
  const order = new Map();
  for (const [index, row] of rows.entries()) {
    if (!order.has(row.transitionId)) order.set(row.transitionId, index);
  }
  completedVisits.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  return Object.freeze({
    events: rows,
    completedVisits: Object.freeze(completedVisits),
    completionFailures: Object.freeze(completionFailures),
    measuredActiveSeconds: rows.reduce((sum, row) => sum + (row.activeSeconds ?? 0), 0),
    unknownActive: rows.some((row) => row.activeSeconds === null),
    measuredIdleSeconds: rows.reduce((sum, row) => sum + (row.idleSeconds ?? 0), 0),
    unknownIdle: rows.some((row) => row.idleSeconds === null),
  });
}
