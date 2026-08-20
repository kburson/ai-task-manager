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
export const LEGACY_BLOCKER_REFRESH_MIGRATION = 'legacy-blocker-refresh';
const SHELVE_JOURNAL_MARKER_RE = /<!--\s*aitm-shelve-transaction\s+[^>]*?-->/g;
const BODY_VERSION_MARKER_RE = /<!--\s*aitm-body-version(?::\s*\d+|\s+version="\d+")\s*-->/g;

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

function migrationEvidence({ migration, liveBlockedBy } = {}) {
  if (migration === undefined && liveBlockedBy === undefined) return {};
  if (migration !== LEGACY_BLOCKER_REFRESH_MIGRATION) {
    throw new Error(
      'refinement-history: migration evidence has an unknown or missing discriminator'
    );
  }
  if (!Array.isArray(liveBlockedBy) || liveBlockedBy.length === 0) {
    throw new Error('refinement-history: migration evidence requires non-empty liveBlockedBy refs');
  }
  for (let index = 0; index < liveBlockedBy.length; index += 1) {
    const ref = liveBlockedBy[index];
    if (!Number.isSafeInteger(ref) || ref <= 0) {
      throw new Error(
        'refinement-history: migration evidence requires positive numeric liveBlockedBy refs'
      );
    }
    if (index > 0 && liveBlockedBy[index - 1] >= ref) {
      throw new Error(
        'refinement-history: migration evidence requires canonical unique liveBlockedBy refs'
      );
    }
  }
  return { migration, liveBlockedBy: [...liveBlockedBy] };
}

function recordMigrationEvidence(record) {
  const hasMigration = Object.hasOwn(record || {}, 'migration');
  const hasLiveBlockedBy = Object.hasOwn(record || {}, 'liveBlockedBy');
  if (!hasMigration && !hasLiveBlockedBy) return {};
  return migrationEvidence(record);
}

export function refinementBodyFingerprints(body) {
  const durableSectionFingerprint = (heading) =>
    sha256(
      rootSection(body, heading)
        .replace(/^(\s*- \[)[x ](\]\s+)/gm, '$1 $2')
        .replace(/<!--[^>]*-->/g, '')
        .replace(/[ \t]+$/gm, '')
        .trim()
    );
  const acceptanceCriteria = rootSection(body, 'Acceptance Criteria')
    .replace(/^(\s*- \[)[x ](\]\s+)/gm, '$1 $2')
    .replace(/<!--[^>]*-->/g, '')
    .replace(/[ \t]+$/gm, '')
    .trim();
  return {
    narrativeFingerprint: sha256(rootSection(body, 'User Story')),
    scopeFingerprint: sha256(rootSection(body, 'Scope')),
    acceptanceCriteriaFingerprint: sha256(acceptanceCriteria),
    storyOriginFingerprint: sha256(rootSection(body, 'Story Origin')),
    discussionFingerprint: sha256(rootSection(body, 'Discussion')),
    planMetadataFingerprint: sha256(rootSection(body, 'Plan Metadata')),
    verificationCommandsFingerprint: durableSectionFingerprint('Verification Commands'),
    testingFingerprint: durableSectionFingerprint('Testing'),
    definitionOfDoneFingerprint: durableSectionFingerprint('Definition of Done'),
  };
}

function refinementSourceBodyFingerprint(body) {
  const source = String(body || '')
    .replace(REFINEMENT_HISTORY_MARKER_RE, '')
    .replace(SHELVE_JOURNAL_MARKER_RE, '')
    .replace(BODY_VERSION_MARKER_RE, '')
    .replace(/\n{3,}/g, '\n\n');
  return sha256(normalizedText(source));
}

function sourceEvidence({
  title = '',
  body,
  fields,
  labels,
  previousOwner,
  sourceState,
  migration,
  liveBlockedBy,
} = {}) {
  const snapshot = parseRefinementSnapshot(body);
  if (!snapshot) throw new Error('refinement-history: current refinement snapshot is missing');
  const activeFields = {
    priority: fields?.priority ?? null,
    size: fields?.size ?? null,
    estimate: fields?.estimate ?? null,
    rank: fields?.rank ?? null,
  };
  if (Object.values(activeFields).some((value) => value === null || value === '')) {
    throw new Error('refinement-history: active refinement fields are incomplete');
  }
  return {
    sourceState: sourceState ? String(sourceState).trim().toLowerCase() : null,
    title: String(title || ''),
    labels: canonicalLabels(labels),
    fields: activeFields,
    dependencies: dependencyEvidence(body),
    forecastProvenance: forecastProvenance(body, snapshot.provenance),
    refinementTimestamp: snapshot.ts,
    ...refinementBodyFingerprints(body),
    previousOwner: previousOwner ? String(previousOwner).toLowerCase() : null,
    refinementSnapshotDigest: snapshot.digest,
    refinementSnapshotProvenance: snapshot.provenance,
    refinementSnapshotFields: snapshot.fields,
    sourceBodyFingerprint: refinementSourceBodyFingerprint(body),
    ...migrationEvidence({ migration, liveBlockedBy }),
  };
}

function sourceDigest(issueNumber, evidence) {
  return sha256(JSON.stringify({ issueNumber: Number(issueNumber), ...evidence }));
}

export function refinementHistoryMatchesSource(record, source = {}) {
  try {
    const migration = recordMigrationEvidence(record);
    const evidence = sourceEvidence({
      ...source,
      migration: migration.migration,
      liveBlockedBy: migration.migration ? source.liveBlockedBy : undefined,
    });
    const liveBlockersMatch =
      !migration.migration ||
      (migration.liveBlockedBy.length === evidence.liveBlockedBy.length &&
        migration.liveBlockedBy.every((ref, index) => ref === evidence.liveBlockedBy[index]));
    return (
      liveBlockersMatch && record?.sourceDigest === sourceDigest(record?.issueNumber, evidence)
    );
  } catch {
    return false;
  }
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
  sourceState = null,
  baseSha,
  createdAt,
  migration,
  liveBlockedBy,
} = {}) {
  const why = String(reason || '').trim();
  if (!tx || !Number.isInteger(Number(issueNumber)) || !why) {
    throw new Error('refinement-history: tx, issueNumber, and reason are required');
  }
  if (!/^[0-9a-f]{7,64}$/i.test(String(baseSha || ''))) {
    throw new Error('refinement-history: base SHA is missing or malformed');
  }
  const timestamp = String(createdAt || new Date().toISOString());
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error('refinement-history: createdAt is malformed');
  }
  const evidence = sourceEvidence({
    title,
    body,
    fields,
    labels,
    previousOwner,
    sourceState,
    migration,
    liveBlockedBy,
  });
  const record = {
    schema: REFINEMENT_HISTORY_SCHEMA,
    tx: String(tx),
    issueNumber: Number(issueNumber),
    ...evidence,
    sourceDigest: sourceDigest(issueNumber, evidence),
    baseSha: String(baseSha),
    reason: why,
    createdAt: timestamp,
  };
  return { ...record, digest: recordDigest(record) };
}

function serializeRecord(record) {
  recordMigrationEvidence(record);
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
    recordMigrationEvidence(record);
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
