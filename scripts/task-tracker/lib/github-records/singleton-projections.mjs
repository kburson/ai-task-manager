import { isDeepStrictEqual } from 'node:util';

import { renderTimingSingletonMarkdown } from '../../gh-timing-comment.mjs';
import { createAitmRecordEnvelope, renderAitmRecord } from './record-envelope.mjs';

const PROJECTION_KIND_ORDER = Object.freeze(['coordination', 'evidence-projection', 'timing']);
const PROJECTION_SCHEMAS = Object.freeze({
  // Distinct from the narrow `aitm.coordination-projection/v1` authority
  // pointer consumed by coordination-authority.mjs. This singleton is a
  // broader human/tool read model and must never masquerade as that grant
  // authorization input.
  coordination: 'aitm.coordination-singleton/v1',
  'evidence-projection': 'aitm.evidence-projection/v1',
  timing: 'aitm.timing-projection/v1',
});
const RECORD_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

function projectionError(category) {
  return new TypeError(`singleton-projections:${category}`);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, expected, category) {
  if (!isPlainObject(value)) throw projectionError(category);
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    throw projectionError(category);
  }
}

function opaque(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function recordId(value) {
  return typeof value === 'string' && RECORD_ID_RE.test(value);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function canonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(instant).toISOString() === value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizedGrant(grant) {
  exactKeys(grant, ['actor', 'epoch', 'grantId', 'scopeRootIssue'], 'grant');
  if (
    !recordId(grant.grantId) ||
    !positiveInteger(grant.epoch) ||
    !opaque(grant.actor) ||
    !positiveInteger(grant.scopeRootIssue)
  ) {
    throw projectionError('grant');
  }
  return { ...grant };
}

function normalizedAssignment(assignment) {
  exactKeys(assignment, ['branch', 'issue', 'recordId', 'state'], 'assignment');
  if (
    !recordId(assignment.recordId) ||
    !positiveInteger(assignment.issue) ||
    !opaque(assignment.branch) ||
    !opaque(assignment.state)
  ) {
    throw projectionError('assignment');
  }
  return { ...assignment };
}

function normalizedHeads(chainHeads) {
  if (!isPlainObject(chainHeads) || Object.keys(chainHeads).length === 0) {
    throw projectionError('chain-heads');
  }
  const entries = Object.entries(chainHeads).sort(([left], [right]) => left.localeCompare(right));
  if (entries.some(([kind, id]) => !opaque(kind) || !recordId(id))) {
    throw projectionError('chain-heads');
  }
  return Object.fromEntries(entries);
}

export function buildCoordinationProjection({ revision, grant, assignments, chainHeads } = {}) {
  if (!positiveInteger(revision) || !Array.isArray(assignments)) {
    throw projectionError('coordination');
  }
  const normalizedAssignments = assignments.map(normalizedAssignment);
  if (new Set(normalizedAssignments.map(({ recordId: id }) => id)).size !== assignments.length) {
    throw projectionError('assignment-duplicate');
  }
  normalizedAssignments.sort((left, right) => left.recordId.localeCompare(right.recordId));
  return deepFreeze({
    schema: PROJECTION_SCHEMAS.coordination,
    revision,
    grant: normalizedGrant(grant),
    assignments: normalizedAssignments,
    chainHeads: normalizedHeads(chainHeads),
  });
}

function normalizedEvidence(record) {
  exactKeys(record, ['createdAt', 'logicalId', 'recordId', 'recordType'], 'evidence');
  if (
    !recordId(record.recordId) ||
    !opaque(record.recordType) ||
    !canonicalInstant(record.createdAt) ||
    !opaque(record.logicalId)
  ) {
    throw projectionError('evidence');
  }
  return { ...record };
}

export function buildEvidenceProjection({ revision, contractEpoch, acceptedRecords } = {}) {
  if (
    !positiveInteger(revision) ||
    !positiveInteger(contractEpoch) ||
    !Array.isArray(acceptedRecords)
  ) {
    throw projectionError('evidence-projection');
  }
  const records = acceptedRecords.map(normalizedEvidence);
  if (new Set(records.map(({ recordId: id }) => id)).size !== records.length) {
    throw projectionError('evidence-duplicate');
  }
  records.sort((left, right) => left.recordId.localeCompare(right.recordId));
  return deepFreeze({
    schema: PROJECTION_SCHEMAS['evidence-projection'],
    revision,
    contractEpoch,
    acceptedRecords: records,
  });
}

function validateProjection(kind, projection) {
  if (!PROJECTION_KIND_ORDER.includes(kind) || !isPlainObject(projection)) {
    throw projectionError('projection');
  }
  if (projection.schema !== PROJECTION_SCHEMAS[kind] || !positiveInteger(projection.revision)) {
    throw projectionError('projection');
  }
  return projection;
}

function coordinationMarkdown(projection) {
  const assignmentLines = projection.assignments.length
    ? projection.assignments.map(
        (assignment) =>
          `- #${assignment.issue} \`${assignment.branch}\` — ${assignment.state} (\`${assignment.recordId}\`)`
      )
    : ['- None'];
  const headLines = Object.entries(projection.chainHeads).map(
    ([kind, id]) => `- ${kind}: \`${id}\``
  );
  return [
    '## Coordination Projection',
    '',
    `Active grant: \`${projection.grant.grantId}\` at epoch ${projection.grant.epoch}`,
    '',
    '### Assignments',
    '',
    ...assignmentLines,
    '',
    '### Record-chain heads',
    '',
    ...headLines,
    '',
  ].join('\n');
}

function evidenceMarkdown(projection) {
  const records = projection.acceptedRecords.length
    ? projection.acceptedRecords.map(
        (record) =>
          `- ${record.recordType} \`${record.logicalId}\` — \`${record.recordId}\` (${record.createdAt})`
      )
    : ['- None'];
  return [
    '## Evidence Projection',
    '',
    `Contract epoch: ${projection.contractEpoch}`,
    '',
    '### Accepted records',
    '',
    ...records,
    '',
  ].join('\n');
}

function timingMarkdown(projection) {
  return [
    '## Timing Projection',
    '',
    `Rows: ${projection.totals.rowCount}`,
    `Active seconds: ${projection.totals.totalActiveSec}`,
    `Idle seconds: ${projection.totals.totalIdleSec}`,
    `Engaged seconds: ${projection.totals.engagedSec}`,
    '',
  ].join('\n');
}

export function renderSingletonProjectionRecord({
  repository,
  issue,
  kind,
  projection,
  actor,
  grantId,
  epoch,
  recordId: envelopeRecordId,
  createdAt,
} = {}) {
  validateProjection(kind, projection);
  const envelope = createAitmRecordEnvelope({
    repository,
    issue,
    recordType: 'singleton-projection',
    payload: projection,
    actor,
    grantId,
    epoch,
    recordId: envelopeRecordId,
    createdAt,
  });
  const visibleMarkdown =
    kind === 'coordination'
      ? coordinationMarkdown(projection)
      : kind === 'evidence-projection'
        ? evidenceMarkdown(projection)
        : timingMarkdown(projection);
  return renderAitmRecord({ envelope, visibleMarkdown });
}

function normalizeDesired(desired) {
  if (!Array.isArray(desired) || desired.length === 0) throw projectionError('desired');
  const normalized = desired.map((entry) => {
    exactKeys(entry, ['body', 'commentNodeId', 'kind'], 'desired');
    if (
      !PROJECTION_KIND_ORDER.includes(entry.kind) ||
      !opaque(entry.commentNodeId) ||
      typeof entry.body !== 'string' ||
      entry.body.length === 0
    ) {
      throw projectionError('desired');
    }
    return { ...entry };
  });
  if (
    new Set(normalized.map(({ kind }) => kind)).size !== normalized.length ||
    new Set(normalized.map(({ commentNodeId }) => commentNodeId)).size !== normalized.length
  ) {
    throw projectionError('desired-duplicate');
  }
  normalized.sort(
    (left, right) =>
      PROJECTION_KIND_ORDER.indexOf(left.kind) - PROJECTION_KIND_ORDER.indexOf(right.kind)
  );
  return normalized;
}

function validateDeps(deps) {
  if (
    !isPlainObject(deps) ||
    typeof deps.readProjection !== 'function' ||
    typeof deps.updateProjection !== 'function'
  ) {
    throw projectionError('deps');
  }
}

async function crash(crashAt, phase, kind) {
  if (typeof crashAt === 'function') await crashAt({ phase, kind });
}

export async function convergeSingletonProjections({ desired, deps, crashAt } = {}) {
  const projections = normalizeDesired(desired);
  validateDeps(deps);
  const snapshots = [];
  for (const intended of projections) {
    const current = await deps.readProjection({
      kind: intended.kind,
      commentNodeId: intended.commentNodeId,
    });
    if (
      !isPlainObject(current) ||
      current.commentNodeId !== intended.commentNodeId ||
      typeof current.body !== 'string'
    ) {
      throw projectionError('read');
    }
    snapshots.push({ intended, current });
  }

  const updatedKinds = [];
  const unchangedKinds = [];
  for (const { intended, current } of snapshots) {
    if (current.body === intended.body) {
      unchangedKinds.push(intended.kind);
      continue;
    }
    await crash(crashAt, 'before-update', intended.kind);
    await deps.updateProjection({
      kind: intended.kind,
      commentNodeId: intended.commentNodeId,
      expectedBody: current.body,
      body: intended.body,
    });
    await crash(crashAt, 'after-update', intended.kind);
    const readBack = await deps.readProjection({
      kind: intended.kind,
      commentNodeId: intended.commentNodeId,
    });
    if (
      !isPlainObject(readBack) ||
      readBack.commentNodeId !== intended.commentNodeId ||
      !isDeepStrictEqual(readBack.body, intended.body)
    ) {
      throw projectionError('readback');
    }
    await crash(crashAt, 'after-readback', intended.kind);
    updatedKinds.push(intended.kind);
  }
  return deepFreeze({ updatedKinds, unchangedKinds });
}

export { renderTimingSingletonMarkdown };
