// @story #2070
// Measured native intervals and lifecycle completion are separate evidence.
import { mergeTimingEvents } from './timing-events.mjs';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
import {
  validateHistoricalCompletionReceipt,
  readNativeTimingHistory,
} from './completion-receipt.mjs';
import { validateManifest } from './manifest.mjs';
import {
  parseTransitionCommitComment,
  renderTransitionCommitComment,
} from '../move-state/transition-commit.mjs';
import { parseEntryMarker, parseEntryMarkers } from '../stage-entry-grammar.mjs';
import { isEntryHistoryEdge } from '../lifecycle-policy/index.mjs';
import { parseNativeContentTimestamp } from './native-observation.mjs';
import { maskFencedCodeBlocksPreservingOffsets as maskExamples } from '../markers.mjs';
const byteLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength'
).get;
function copyBufferBytes(value) {
  const result = Buffer.alloc(Reflect.apply(byteLength, value, []));
  Reflect.apply(Uint8Array.prototype.set, result, [value]);
  return result;
}

function dataFields(value, names) {
  if (
    !value ||
    types.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== names.length
  )
    throw new Error('completion-evidence-shape');
  return Object.fromEntries(
    names.map((name) => {
      const field = Object.getOwnPropertyDescriptor(value, name);
      if (!field?.enumerable || !Object.hasOwn(field, 'value'))
        throw new Error('completion-evidence-accessor');
      return [name, field.value];
    })
  );
}
function evidenceList(value) {
  if (
    types.isProxy(value) ||
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  )
    throw new Error('completion-evidence-list');
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (Reflect.ownKeys(value).length !== length + 1) throw new Error('completion-evidence-list');
  const result = [];
  for (let index = 0; index < length; index++) {
    const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field?.enumerable || !Object.hasOwn(field, 'value'))
      throw new Error('completion-evidence-list-accessor');
    result.push(field.value);
  }
  return result;
}
function detachedRecord(input) {
  const source = dataFields(input, ['manifest', 'generation', 'payloads']);
  if (
    types.isProxy(source.payloads) ||
    Object.getPrototypeOf(source.payloads) !== Map.prototype ||
    Reflect.ownKeys(source.payloads).length
  )
    throw new Error('completion-payload-map');
  const payloads = new Map();
  for (const [key, value] of Map.prototype.entries.call(source.payloads)) {
    if (
      typeof key !== 'string' ||
      types.isProxy(value) ||
      !(typeof value === 'string' || Buffer.isBuffer(value))
    )
      throw new Error('completion-payload-bytes');
    Map.prototype.set.call(
      payloads,
      key,
      typeof value === 'string' ? value : copyBufferBytes(value)
    );
  }
  return {
    manifest: JSON.parse(json(source.manifest)),
    generation: JSON.parse(json(source.generation)),
    payloads,
  };
}
function detachedEvidence(input, legacy) {
  const fields = dataFields(
    input,
    legacy ? ['generation', 'commentKey'] : ['receipt', 'confirmedEffects', 'generation']
  );
  const generation = detachedRecord(fields.generation);
  if (legacy && typeof fields.commentKey !== 'string') throw new Error('completion-comment-key');
  return legacy
    ? { generation, commentKey: fields.commentKey }
    : {
        generation,
        receipt: JSON.parse(json(fields.receipt)),
        confirmedEffects: JSON.parse(json(fields.confirmedEffects)),
      };
}

function activeEntryLines(body) {
  return maskExamples(body)
    .split('\n')
    .filter((line) => /^ {0,3}<!--/.test(line) && parseEntryMarker(line.trim()));
}
export function readActiveEntryHistory(body) {
  return parseEntryMarkers(activeEntryLines(body).join('\n'));
}

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
  const body = maskExamples(read(ref));
  const lines = body.split('\n');
  const markers = lines.filter((line) =>
    /^ {0,3}<!--\s*aitm-transition-commit\b.*-->[ \t]*$/.test(line)
  );
  if (markers.length !== 1) throw new Error('legacy-count');
  const proof = parseTransitionCommitComment(markers[0]);
  const canonical = renderTransitionCommitComment(proof).split('\n');
  if (
    !lines.some((line, index) =>
      canonical.every((expected, offset) => lines[index + offset] === expected)
    )
  )
    throw new Error('legacy-format');
  const active = lines.filter(
    (line) => line.trim() && !line.includes('`') && !line.trimStart().startsWith('>')
  );
  if (active.join('\n') !== canonical.join('\n')) throw new Error('legacy-format');
  const issueBody = activeEntryLines(read(resources['issue:' + identity.issueNodeId])).join('\n');
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
    legacyEntry: { timestamp: entry.ts, latest: parseEntryMarkers(issueBody).at(-1) },
  };
}

function inPublishedBody(receipt, record) {
  const { identity, baseSnapshot } = record.generation;
  const ref = baseSnapshot.resources['issue:' + identity.issueNodeId];
  const body = maskExamples(
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      Buffer.from(record.payloads.get(ref.payloadPath))
    )
  );
  const starts = [...body.matchAll(/^ {0,3}<!--\s*aitm-transition-completion\b/gm)];
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

export function historicalTimingBody(timingEvidence, body = '') {
  return readNativeTimingHistory(
    body || timingEvidence.timingBody || '',
    timingEvidence.events ?? []
  );
}

/**
 * Pure historical accounting over explicitly supplied native evidence.
 * receipts: [{receipt, confirmedEffects, generation: {manifest,generation,payloads}}].
 * legacyEvidence: [{commentKey, generation: {manifest,generation,payloads}}].
 * Both proof paths read baseSnapshot content, never working content. Callers own
 * current observation/freshness; this function grants no write or guard authority.
 * A legacy login is retained separately and never substituted for a native actorId.
 * Known subtotals remain usable when a separate Unknown flag or proof failure exists.
 * completedEventIds names only authenticated lifecycle pair members, not ordinary
 * measured events published in the same receipt's full timing subset.
 */
export function timingAuthority({ events = [], receipts = [], legacyEvidence = [] } = {}) {
  const rows = mergeTimingEvents(events, []);
  if (!Array.isArray(receipts)) throw new TypeError('timing-authority:receipts');
  if (!Array.isArray(legacyEvidence)) throw new TypeError('timing-authority:legacy-evidence');
  const completedVisits = [];
  const completedEventIds = [];
  const legacyVisitEntries = [];
  const completionFailures = [];
  const safeReceipts = [];
  const safeLegacy = [];
  for (const [container, legacy, target] of [
    [receipts, false, safeReceipts],
    [legacyEvidence, true, safeLegacy],
  ]) {
    try {
      for (const input of evidenceList(container)) {
        try {
          target.push(detachedEvidence(input, legacy));
        } catch (error) {
          completionFailures.push(Object.freeze({ transitionId: null, reason: error.message }));
        }
      }
    } catch (error) {
      completionFailures.push(Object.freeze({ transitionId: null, reason: error.message }));
    }
  }
  const counts = new Map();
  for (const evidence of safeReceipts) {
    const id = evidence?.receipt?.transition?.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const legacy = [];
  for (const evidence of safeLegacy) {
    try {
      const visit = legacyVisit(evidence);
      legacy.push(visit);
      counts.set(visit.id, (counts.get(visit.id) ?? 0) + 1);
    } catch (error) {
      completionFailures.push(Object.freeze({ transitionId: null, reason: error.message }));
    }
  }
  for (const evidence of safeReceipts) {
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
      completedEventIds.push(
        ...subset
          .filter(
            (event) =>
              event.transitionId === receipt.transition.id &&
              event.actorId === receipt.transition.actorId
          )
          .map((event) => event.eventId)
      );
    } catch (error) {
      completionFailures.push(Object.freeze({ transitionId: id, reason: error.message }));
    }
  }
  for (const visit of legacy) {
    if (counts.get(visit.id) === 1) {
      const { legacyEntry, ...completed } = visit;
      completedVisits.push(Object.freeze(completed));
      legacyVisitEntries.push(Object.freeze({ transitionId: visit.id, ...legacyEntry }));
    } else
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
    completedEventIds: Object.freeze(completedEventIds),
    legacyVisitEntries: Object.freeze(legacyVisitEntries),
    completionFailures: Object.freeze(completionFailures),
    measuredActiveSeconds: rows.reduce((sum, row) => sum + (row.activeSeconds ?? 0), 0),
    unknownActive: rows.some((row) => row.activeSeconds === null),
    measuredIdleSeconds: rows.reduce((sum, row) => sum + (row.idleSeconds ?? 0), 0),
    unknownIdle: rows.some((row) => row.idleSeconds === null),
  });
}
