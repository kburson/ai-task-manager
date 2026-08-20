// Canonical Refine completion snapshot (#1213).
//
// Ready for Planning is durable parking only for refinement inputs that are
// still current. This marker binds the visible Scope and Acceptance Criteria,
// the persisted refinement fields, dependency evidence, issue labels, and the
// refinement rationale into one deterministic digest.

import { createHash } from 'node:crypto';

import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { parseBlockedByStrict } from './blocked-marker.mjs';
import { parseMarker, serializeMarker } from './marker-grammar.mjs';

export const REFINEMENT_SNAPSHOT_SCHEMA = '2';
const LEGACY_REFINEMENT_SNAPSHOT_SCHEMA = '1';
export const REFINEMENT_SNAPSHOT_MARKER_RE = /<!--\s*aitm-refinement-snapshot\s+[^>]*?-->/gi;

const REQUIRED_FIELDS = Object.freeze(['priority', 'size', 'estimate', 'rank']);

function fail(category) {
  throw new Error(`refinement-snapshot:${category}`);
}

function normalizedText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function rootSection(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = `${normalizedText(body)}\n## __AITM_SECTION_END__\n`;
  const match = source.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+)`, 'im'));
  return normalizedText(match?.[1]);
}

function normalizedLabels(labels) {
  if (!Array.isArray(labels)) fail('labels');
  const values = [...new Set(labels.map((label) => String(label || '').trim()).filter(Boolean))]
    .map((label) => label.toLowerCase())
    .sort();
  if (values.length === 0) fail('labels');
  return values;
}

function requiredFieldValues(body, { includeBlockedBy = false } = {}) {
  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok) fail(`fields-${parsed.reason}`);
  const values = {};
  for (const key of REQUIRED_FIELDS) {
    const value = parsed.values[key];
    if (value === null || value === undefined || value === '') fail(`field-${key}`);
    values[key] = value;
  }
  if (includeBlockedBy) values.blockedBy = parsed.values.blockedBy ?? null;
  return values;
}

function canonicalBlockedBy(body) {
  const refs = parseBlockedByStrict(body);
  return refs.length ? refs.map((number) => `#${number}`).join(',') : null;
}

function snapshotBlockedByRefs(value) {
  if (value === null || value === undefined || value === '') return [];
  return parseBlockedByStrict(serializeMarker('blocked-by', { refs: value }));
}

function legacyRefinementInputs(body, labels, { durableProvenance, durableFields } = {}) {
  const withoutMarker = String(body || '').replace(REFINEMENT_SNAPSHOT_MARKER_RE, '');
  const scope = rootSection(withoutMarker, 'Scope');
  if (scope.length < 12) fail('scope');
  const acceptanceCriteria = rootSection(withoutMarker, 'Acceptance Criteria');
  if (!/^- \[[ x]\]\s+\S+/m.test(acceptanceCriteria)) fail('acceptance-criteria');
  const planMetadata = rootSection(withoutMarker, 'Plan Metadata');
  const fieldValues =
    durableFields || requiredFieldValues(withoutMarker, { includeBlockedBy: true });
  const dependencies =
    planMetadata
      .split('\n')
      .filter((line) => /\*\*(?:Depends On|Blocked By)\*\*/i.test(line))
      .map((line) => line.trim())
      .join('\n') || `blockedBy=${JSON.stringify(fieldValues.blockedBy)}`;
  return {
    scope,
    acceptanceCriteria,
    fields: fieldValues,
    dependencies,
    labels: normalizedLabels(labels),
    provenance: provenanceDigest(withoutMarker, durableProvenance),
  };
}

function provenanceDigest(body, fallback) {
  const rationale = String(body || '').match(
    /<!--\s*aitm-refinement-rationale:\s*(\{[^>]+\})\s*-->/i
  )?.[1];
  if (!rationale) {
    if (/^[0-9a-f]{64}$/.test(fallback || '')) return fallback;
    fail('provenance');
  }
  let parsed;
  try {
    parsed = JSON.parse(rationale);
  } catch {
    fail('provenance');
  }
  return createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
}

function refinementInputs(body, labels, { durableProvenance, durableFields } = {}) {
  const withoutMarker = String(body || '').replace(REFINEMENT_SNAPSHOT_MARKER_RE, '');
  const scope = rootSection(withoutMarker, 'Scope');
  if (scope.length < 12) fail('scope');
  const acceptanceCriteria = rootSection(withoutMarker, 'Acceptance Criteria');
  if (!/^- \[[ x]\]\s+\S+/m.test(acceptanceCriteria)) fail('acceptance-criteria');
  const fieldValues = {
    ...(durableFields || requiredFieldValues(withoutMarker)),
    blockedBy: canonicalBlockedBy(withoutMarker),
  };
  const dependencies = `blockedBy=${JSON.stringify(fieldValues.blockedBy)}`;
  return {
    scope,
    acceptanceCriteria,
    fields: fieldValues,
    dependencies,
    labels: normalizedLabels(labels),
    provenance: provenanceDigest(withoutMarker, durableProvenance),
  };
}

function digestInputs(inputs) {
  return createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}

export function buildRefinementSnapshotMarker(body, { labels, ts } = {}) {
  const timestamp = String(ts || new Date().toISOString());
  if (!Number.isFinite(Date.parse(timestamp))) fail('timestamp');
  const inputs = refinementInputs(body, labels);
  const digest = digestInputs(inputs);
  const fields = inputs.fields;
  return serializeMarker('refinement-snapshot', {
    schema: REFINEMENT_SNAPSHOT_SCHEMA,
    digest,
    provenance: inputs.provenance,
    priority: fields.priority,
    size: fields.size,
    estimate: fields.estimate,
    rank: fields.rank,
    'blocked-by': fields.blockedBy ?? '',
    ts: timestamp,
  });
}

export function stampRefinementSnapshot(body, options = {}) {
  const stripped = String(body || '')
    .replace(REFINEMENT_SNAPSHOT_MARKER_RE, '')
    .trimEnd();
  return `${stripped}\n${buildRefinementSnapshotMarker(stripped, options)}\n`;
}

export function parseRefinementSnapshot(body) {
  const markers = [...String(body || '').matchAll(REFINEMENT_SNAPSHOT_MARKER_RE)];
  if (markers.length !== 1) return null;
  const parsed = parseMarker(markers[0][0]);
  if (!parsed || parsed.name !== 'refinement-snapshot') return null;
  const { schema, digest, provenance, priority, size, estimate, rank, ts } = parsed.props || {};
  if (
    ![LEGACY_REFINEMENT_SNAPSHOT_SCHEMA, REFINEMENT_SNAPSHOT_SCHEMA].includes(schema) ||
    !/^[0-9a-f]{64}$/.test(digest || '') ||
    !/^[0-9a-f]{64}$/.test(provenance || '') ||
    !Number.isFinite(Date.parse(ts || '')) ||
    !priority ||
    !size ||
    !Number.isFinite(Number(estimate)) ||
    !Number.isFinite(Number(rank))
  )
    return null;
  return {
    schema,
    digest,
    provenance,
    ts,
    fields: {
      priority,
      size,
      estimate: Number(estimate),
      rank: Number(rank),
      blockedBy: parsed.props['blocked-by'] || null,
    },
  };
}

export function verifyRefinementSnapshot(body, { labels, allowPlanProjection = false } = {}) {
  const snapshot = parseRefinementSnapshot(body);
  if (!snapshot) return { ok: false, reason: 'missing or malformed refinement snapshot' };
  try {
    const legacy = snapshot.schema === LEGACY_REFINEMENT_SNAPSHOT_SCHEMA;
    const durableFields = allowPlanProjection
      ? {
          ...requiredFieldValues(body, { includeBlockedBy: legacy }),
          size: snapshot.fields.size,
          estimate: snapshot.fields.estimate,
          ...(legacy ? { blockedBy: snapshot.fields.blockedBy } : {}),
        }
      : undefined;
    const inputBuilder = legacy ? legacyRefinementInputs : refinementInputs;
    const digest = digestInputs(
      inputBuilder(body, labels, {
        durableProvenance: snapshot.provenance,
        ...(durableFields ? { durableFields } : {}),
      })
    );
    if (digest !== snapshot.digest) {
      return { ok: false, reason: 'stale refinement snapshot', snapshot };
    }
    const liveBlockers = parseBlockedByStrict(body);
    const snapshotBlockers = snapshotBlockedByRefs(snapshot.fields.blockedBy);
    if (JSON.stringify(liveBlockers) !== JSON.stringify(snapshotBlockers)) {
      return { ok: false, reason: 'stale refinement snapshot', snapshot };
    }
    return { ok: true, snapshot };
  } catch (error) {
    return { ok: false, reason: error.message, snapshot };
  }
}

// Migration-only verifier for #1341. It intentionally leaves ordinary snapshot
// verification unchanged: a later governed blocker must remain stale to every
// ordinary caller. The `BLOCKED` label is excluded only here because its
// governed addition is part of the same blocker evidence being refreshed.
export function verifyLegacyRefinementSnapshotForBlockerRefresh(body, { labels } = {}) {
  const snapshot = parseRefinementSnapshot(body);
  let legacyCoreValid = false;
  const refused = (reason, extra = {}) => ({
    ok: false,
    reason,
    snapshot,
    legacyCoreValid,
    blockerOnlyMismatch: false,
    ...extra,
  });
  if (!snapshot) return refused('missing or malformed refinement snapshot');
  if (snapshot.schema !== LEGACY_REFINEMENT_SNAPSHOT_SCHEMA) {
    return refused('legacy blocker refresh requires a schema-1 refinement snapshot');
  }

  try {
    const historicalLabels = Array.isArray(labels)
      ? labels.filter((label) => String(label || '').trim().toLowerCase() !== 'blocked')
      : labels;
    const inputs = legacyRefinementInputs(body, historicalLabels, {
      durableProvenance: snapshot.provenance,
    });
    const snapshotFieldsMatch = REQUIRED_FIELDS.every(
      (field) => snapshot.fields[field] === inputs.fields[field]
    );
    if (
      inputs.provenance !== snapshot.provenance ||
      digestInputs(inputs) !== snapshot.digest ||
      !snapshotFieldsMatch
    ) {
      return refused('stale refinement snapshot');
    }
    legacyCoreValid = true;

    const liveBlockers = parseBlockedByStrict(body);
    const snapshotBlockers = snapshotBlockedByRefs(snapshot.fields.blockedBy);
    const current = {
      legacyCoreValid,
      blockerOnlyMismatch: false,
      liveBlockers,
      snapshotBlockers,
    };
    if (liveBlockers.length === 0) {
      return refused('legacy blocker refresh requires a non-empty live blocker set', current);
    }
    if (snapshotBlockers.length !== 0) {
      return refused('legacy blocker refresh requires an unblocked schema-1 snapshot', current);
    }
    return {
      ok: true,
      snapshot,
      legacyCoreValid,
      blockerOnlyMismatch: true,
      liveBlockers,
      snapshotBlockers,
    };
  } catch (error) {
    return refused(error.message);
  }
}
