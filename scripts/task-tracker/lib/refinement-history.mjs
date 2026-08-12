// Immutable refinement history for Shelve (#1215).
//
// Each append-only marker carries a base64url JSON payload plus a digest over
// that payload. Readers reject malformed or edited records rather than using
// historical evidence that cannot be proven authentic.

import { createHash } from 'node:crypto';

import { parseMarker, serializeMarker } from './marker-grammar.mjs';
import { parseRefinementSnapshot } from './refinement-snapshot.mjs';

export const REFINEMENT_HISTORY_SCHEMA = 'aitm.refinement-history/v1';
export const REFINEMENT_HISTORY_MARKER_RE = /<!--\s*aitm-refinement-history\s+[^>]*?-->/g;

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
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

function dependencyEvidence(body) {
  return rootSection(body, 'Plan Metadata')
    .split('\n')
    .filter((line) =>
      /\*\*(?:Depends On|Blocked By|Execution Order|Local Execution Policy|External CI Dependency)\*\*/i.test(
        line
      )
    )
    .map((line) => line.trim())
    .join('\n');
}

function forecastProvenance(body, fallback) {
  const marker = String(body || '').match(
    /<!--\s*aitm-estimation-forecast(?:-ready)?\s+[^>]*?-->/i
  )?.[0];
  const parsed = marker ? parseMarker(marker) : null;
  return (
    parsed?.props?.['record-id'] ||
    parsed?.props?.id ||
    parsed?.props?.digest ||
    parsed?.props?.record ||
    fallback ||
    null
  );
}

function canonicalLabels(labels) {
  if (!Array.isArray(labels)) throw new Error('refinement-history: labels are unreadable');
  return [...new Set(labels.map((label) => String(label || '').trim()).filter(Boolean))].sort();
}

export function refinementBodyFingerprints(body) {
  const acceptanceCriteria = rootSection(body, 'Acceptance Criteria')
    .replace(/^(\s*- \[)[x ](\]\s+)/gm, '$1 $2')
    .replace(/<!--[^>]*-->/g, '')
    .replace(/[ \t]+$/gm, '')
    .trim();
  return {
    narrativeFingerprint: sha256(rootSection(body, 'User Story')),
    scopeFingerprint: sha256(rootSection(body, 'Scope')),
    acceptanceCriteriaFingerprint: sha256(acceptanceCriteria),
  };
}

function digestibleRecord(record) {
  const { digest: _digest, ...payload } = record;
  return payload;
}

function recordDigest(record) {
  return sha256(JSON.stringify(digestibleRecord(record)));
}

export function buildRefinementHistoryRecord({
  tx,
  issueNumber,
  title = '',
  body,
  fields,
  labels,
  reason,
  previousOwner = null,
  baseSha,
  createdAt,
} = {}) {
  const why = String(reason || '').trim();
  const snapshot = parseRefinementSnapshot(body);
  if (!tx || !Number.isInteger(Number(issueNumber)) || !why) {
    throw new Error('refinement-history: tx, issueNumber, and reason are required');
  }
  if (!snapshot) throw new Error('refinement-history: current refinement snapshot is missing');
  if (!/^[0-9a-f]{7,64}$/i.test(String(baseSha || ''))) {
    throw new Error('refinement-history: base SHA is missing or malformed');
  }
  const timestamp = String(createdAt || new Date().toISOString());
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error('refinement-history: createdAt is malformed');
  }
  const activeFields = {
    priority: fields?.priority ?? null,
    size: fields?.size ?? null,
    estimate: fields?.estimate ?? null,
    rank: fields?.rank ?? null,
  };
  if (Object.values(activeFields).some((value) => value === null || value === '')) {
    throw new Error('refinement-history: active refinement fields are incomplete');
  }
  const record = {
    schema: REFINEMENT_HISTORY_SCHEMA,
    tx: String(tx),
    issueNumber: Number(issueNumber),
    title: String(title || ''),
    labels: canonicalLabels(labels),
    fields: activeFields,
    dependencies: dependencyEvidence(body),
    forecastProvenance: forecastProvenance(body, snapshot.provenance),
    refinementTimestamp: snapshot.ts,
    baseSha: String(baseSha),
    ...refinementBodyFingerprints(body),
    reason: why,
    previousOwner: previousOwner ? String(previousOwner).toLowerCase() : null,
    refinementSnapshotDigest: snapshot.digest,
    createdAt: timestamp,
  };
  return { ...record, digest: recordDigest(record) };
}

function serializeRecord(record) {
  if (recordDigest(record) !== record.digest) {
    throw new Error('refinement-history: record digest does not match payload');
  }
  const payload = Buffer.from(JSON.stringify(record), 'utf8').toString('base64url');
  return serializeMarker('refinement-history', {
    schema: '1',
    tx: record.tx,
    digest: record.digest,
    payload,
  });
}

export function parseRefinementHistory(body) {
  const records = [];
  const seen = new Set();
  for (const match of String(body || '').matchAll(REFINEMENT_HISTORY_MARKER_RE)) {
    const marker = parseMarker(match[0]);
    if (marker?.name !== 'refinement-history' || marker.props?.schema !== '1') {
      throw new Error('refinement-history: malformed marker');
    }
    let record;
    try {
      record = JSON.parse(Buffer.from(marker.props.payload || '', 'base64url').toString('utf8'));
    } catch {
      throw new Error('refinement-history: malformed payload or digest');
    }
    if (
      record?.schema !== REFINEMENT_HISTORY_SCHEMA ||
      marker.props.tx !== record.tx ||
      marker.props.digest !== record.digest ||
      recordDigest(record) !== record.digest
    ) {
      throw new Error('refinement-history: digest verification failed');
    }
    if (seen.has(record.tx))
      throw new Error(`refinement-history: duplicate transaction ${record.tx}`);
    seen.add(record.tx);
    records.push(record);
  }
  return records;
}

export function appendRefinementHistory(body, record) {
  const records = parseRefinementHistory(body);
  const existing = records.find((candidate) => candidate.tx === record.tx);
  if (existing) {
    if (existing.digest !== record.digest) {
      throw new Error(`refinement-history: transaction ${record.tx} has different evidence`);
    }
    return String(body || '');
  }
  const source = String(body || '').trimEnd();
  return `${source}\n${serializeRecord(record)}\n`;
}
