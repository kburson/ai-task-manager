import { createHash } from 'node:crypto';

export const TIMING_QUEUE_PROJECTION_SCHEMA = 'aitm.timing-queue-projection/v1';

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function normalizedIssue(issue) {
  const value = String(issue ?? '')
    .replace(/^#/, '')
    .trim();
  if (value === '') throw new TypeError('timing queue issue must be non-empty');
  return value;
}

export function canonicalTimingQueueProjection(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || event.kind !== 'timing') {
    throw new TypeError('timing queue entry must have kind timing');
  }
  const issue = normalizedIssue(event.issue);
  const row = requiredString(event.row, 'timing queue row');
  const hasProjectionId = event.projectionId !== undefined;
  const hasSubOperationId = event.subOperationId !== undefined;
  if (hasProjectionId !== hasSubOperationId) {
    throw new TypeError('timing queue projection identity is incomplete');
  }
  if (hasProjectionId) {
    return Object.freeze({
      projectionId: requiredString(event.projectionId, 'timing projectionId'),
      subOperationId: requiredString(event.subOperationId, 'timing subOperationId'),
    });
  }
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        schema: TIMING_QUEUE_PROJECTION_SCHEMA,
        kind: 'timing',
        issue,
        row,
      })
    )
    .digest('hex');
  const projectionId = `timing-queue:v1:${digest}`;
  return Object.freeze({
    projectionId,
    subOperationId: `${projectionId}:row`,
  });
}

export function resolveTimingQueueJournalProjection({
  entry,
  entryIndex,
  switchProjectionId,
  journalProjectionId,
  journalSubOperationId,
} = {}) {
  const canonical = canonicalTimingQueueProjection(entry);
  const stableSwitchProjectionId = requiredString(switchProjectionId, 'timing switch projectionId');
  const stableJournalProjectionId = requiredString(
    journalProjectionId,
    'timing journal projectionId'
  );
  const stableJournalSubOperationId = requiredString(
    journalSubOperationId,
    'timing journal subOperationId'
  );
  if (!Number.isSafeInteger(entryIndex) || entryIndex < 0) {
    throw new TypeError('timing queue journal entryIndex must be a non-negative integer');
  }
  if (
    stableJournalProjectionId === canonical.projectionId &&
    stableJournalSubOperationId === canonical.subOperationId
  ) {
    return Object.freeze({
      mode: 'canonical',
      journalProjectionId: stableJournalProjectionId,
      journalSubOperationId: stableJournalSubOperationId,
      deliveryProjectionId: canonical.projectionId,
      deliverySubOperationId: canonical.subOperationId,
    });
  }
  const entryHasDurableIdentity =
    entry.projectionId !== undefined || entry.subOperationId !== undefined;
  const legacyDigest = createHash('sha256')
    .update(JSON.stringify(entry))
    .digest('hex')
    .slice(0, 16);
  const expectedLegacySubOperationId = `${stableSwitchProjectionId}:queued-source:${entryIndex}:${legacyDigest}`;
  if (
    entryHasDurableIdentity ||
    stableJournalProjectionId !== stableSwitchProjectionId ||
    stableJournalSubOperationId !== expectedLegacySubOperationId
  ) {
    throw new TypeError('timing queue journal projection identity does not match');
  }
  return Object.freeze({
    mode: 'legacy-switch-alias',
    journalProjectionId: stableJournalProjectionId,
    journalSubOperationId: stableJournalSubOperationId,
    deliveryProjectionId: canonical.projectionId,
    deliverySubOperationId: canonical.subOperationId,
  });
}

export async function deliverTimingQueueProjection(
  event,
  { repo, timeoutMs, post, read, withGovernedEffect } = {}
) {
  if (event?.kind !== 'timing') return undefined;
  if (typeof post !== 'function' || typeof read !== 'function') {
    throw new TypeError('queued timing delivery and read-back functions are required');
  }
  if (typeof withGovernedEffect !== 'function') {
    throw new TypeError('queued timing governed-effect adapter is required');
  }
  const projection = canonicalTimingQueueProjection(event);
  const result = await withGovernedEffect(
    {
      issueId: normalizedIssue(event.issue),
      operation: 'evidence-mutation',
      heartbeat: true,
    },
    () =>
      post({
        issueNumber: event.issue,
        repo,
        row: event.row,
        ...projection,
        timeoutMs,
      })
  );
  const proof = await read({
    issueNumber: event.issue,
    repo,
    projectionId: projection.projectionId,
    subOperationIds: [projection.subOperationId],
    expectedRows: { [projection.subOperationId]: event.row },
    timeoutMs,
  });
  if (proof?.reconciled !== true || proof.projectionId !== projection.projectionId) {
    throw new Error('queued timing projection remote read-back does not match');
  }
  return result;
}
