// @story #1838
import { validateInventoryRow } from './records.mjs';
import { counts } from './report-statistics.mjs';
const key = (r) => JSON.stringify([r.worktreeId, r.sessionId]);
const unknownAttribution = (r) =>
  r.worktreeId === null ||
  r.sessionId === null ||
  r.enrollmentId === null ||
  r.operation === null ||
  r.kind === 'unknown' ||
  (r.issueNumber === null && r.draftId === null) ||
  r.lifecycleState === 'unknown' ||
  r.repository === null;
export const participantKey = key;
const failures = new Set([
  'collection-disabled',
  'storage-failure',
  'unsupported-context',
  'dropped-observation',
  'enrollment-denied',
  'invalid-inherited-context',
  'shared-root-out-of-sandbox-scope',
  'shared-root-access-denied',
  'git-root-resolution-failed',
  'unknown',
]);
export function buildCoverage(data, rows, root, start, end) {
  const participants = data.participants.filter((r) => r.commonRootId === root);
  const diagnostics = data.diagnostics.filter(
    (r) =>
      (r.commonRootId === null || r.commonRootId === root) &&
      Date.parse(r.occurredAt) >= start &&
      Date.parse(r.occurredAt) < end
  );
  const storageGaps = data.controls.filter(
    (r) => r.startedAt === null || (Date.parse(r.startedAt) < end && Date.parse(r.endedAt) >= start)
  );
  const denied = participants.filter((r) => r.outcome === 'denied');
  const denialClasses = Object.create(null);
  for (const r of denied)
    denialClasses[r.reasonCode ?? 'unknown'] = (denialClasses[r.reasonCode ?? 'unknown'] ?? 0) + 1;
  const versions = [...new Set(rows.map((r) => r.collectorVersion))].sort();
  const attributionUnknown = rows.filter(unknownAttribution).length;
  return {
    rootMismatchObservations: data.observations.filter((r) => r.commonRootId !== root).length,
    outOfRootParticipants: data.participants.length - participants.length,
    deniedParticipants: denied.length,
    unknownEnrollmentParticipants: participants.filter((r) => r.outcome === 'unknown').length,
    denialClasses,
    observedWorktrees: new Set(rows.map((r) => r.worktreeId).filter((x) => x !== null)).size,
    observedSessions: new Set(rows.map((r) => r.sessionId).filter((x) => x !== null)).size,
    collectorVersions: versions,
    mixedCollectorVersions: versions.length > 1,
    unknownAttributionObservations: attributionUnknown,
    malformedLines: data.malformedLineCount ?? 0,
    unreadableFiles: data.unreadableFileCount ?? 0,
    unsupportedVersions: data.unsupportedVersionCount ?? 0,
    partialLines: data.partialLineCount ?? 0,
    identicalDuplicates: data.duplicateCount ?? 0,
    conflictingDuplicates: data.conflictCount ?? 0,
    activeOrUncleanWriters: data.unclosedWriterCount ?? 0,
    storageGaps,
    diagnostics,
    fleetCompleteness: 'lower-bound',
    fleetFinding:
      'Observed activity is a lower bound; enrollment rows alone do not prove intended fleet size or enabled duration.',
  };
}
export function validateDeclaration(d, { commonRootId, startedAt, endedAt }) {
  const fail = () => {
    throw new TypeError('invalid predeclared comparison declaration');
  };
  const strings = (v) =>
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((x) => typeof x === 'string' && x.length > 0) &&
    new Set(v).size === v.length;
  if (
    !d ||
    d.schema !== 'aitm.graphql-usage.comparison/v1' ||
    d.commonRootId !== commonRootId ||
    d.startedAt !== startedAt ||
    d.endedAt !== endedAt ||
    !Number.isFinite(Date.parse(d.declaredAt)) ||
    new Date(d.declaredAt).toISOString() !== d.declaredAt ||
    Date.parse(d.declaredAt) > Date.parse(startedAt) ||
    !Array.isArray(d.participants) ||
    !d.participants.length ||
    !Array.isArray(d.groups) ||
    !d.groups.length ||
    !Array.isArray(d.inventory)
  )
    fail();
  if (
    d.participants.some(
      (r) =>
        !r ||
        typeof r.worktreeId !== 'string' ||
        !r.worktreeId ||
        typeof r.sessionId !== 'string' ||
        !r.sessionId
    ) ||
    new Set(d.participants.map(key)).size !== d.participants.length
  )
    fail();
  const ids = new Set(),
    operations = new Set();
  for (const g of d.groups) {
    if (
      !g ||
      typeof g.id !== 'string' ||
      !g.id ||
      ids.has(g.id) ||
      !strings(g.operations) ||
      !strings(g.sites) ||
      !['http-attempt', 'opaque-cli-invocation'].includes(g.observationKind) ||
      !['point-cost', 'http-attempt-volume', 'opaque-invocation-volume'].includes(g.signal) ||
      (g.signal === 'http-attempt-volume' && g.observationKind !== 'http-attempt') ||
      (g.signal === 'opaque-invocation-volume' && g.observationKind !== 'opaque-cli-invocation')
    )
      fail();
    ids.add(g.id);
    for (const op of g.operations) {
      if (operations.has(op)) fail();
      operations.add(op);
    }
  }
  try {
    d.inventory.forEach(validateInventoryRow);
  } catch {
    fail();
  }
  return d;
}
export function comparisons(d, data, rows, coverage) {
  if (!d) return [];
  const sample = new Set(d.participants.map(key));
  const relevant = (r) => r.worktreeId === null || r.sessionId === null || sample.has(key(r));
  const participants = data.participants.filter(
    (r) => r.commonRootId === d.commonRootId && sample.has(key(r))
  );
  const manifestBad =
    d.participants.some(
      (p) =>
        !participants.some(
          (r) => key(r) === key(p) && r.outcome === 'enrolled' && r.recordedAt <= d.startedAt
        )
    ) || participants.some((r) => r.outcome !== 'enrolled');
  const storageBad =
    coverage.storageGaps.length > 0 ||
    coverage.diagnostics.some((r) => failures.has(r.code) && relevant(r));
  const writersBad = data.unclosedWriters
    ? data.unclosedWriters.some(relevant)
    : coverage.activeOrUncleanWriters > 0;
  const globalBad =
    manifestBad ||
    storageBad ||
    writersBad ||
    coverage.malformedLines > 0 ||
    coverage.unreadableFiles > 0 ||
    coverage.unsupportedVersions > 0 ||
    coverage.partialLines > 0 ||
    coverage.conflictingDuplicates > 0 ||
    coverage.rootMismatchObservations > 0 ||
    coverage.mixedCollectorVersions ||
    rows.some((r) => relevant(r) && unknownAttribution(r));
  return d.groups.map((g) => {
    const candidates = rows.filter((r) => g.operations.includes(r.operation) && sample.has(key(r)));
    const unknownCandidates = rows.some(
      (r) => g.operations.includes(r.operation) && relevant(r) && !sample.has(key(r))
    );
    const inventoryBad = g.sites.some(
      (site) =>
        !d.inventory.some(
          (r) =>
            `${r.source}:${r.line}` === site &&
            (r.coverage === 'covered' ||
              (g.observationKind === 'opaque-cli-invocation' && r.coverage === 'opaque'))
        )
    );
    const missingOperations = g.operations.filter(
      (op) => !candidates.some((r) => r.operation === op)
    );
    const kindBad = candidates.some(
      (r) =>
        r.observationKind !== g.observationKind ||
        (r.observationKind === 'http-attempt' && r.dispatchStatus !== 'sent')
    );
    const volumeSufficient =
      !globalBad &&
      !unknownCandidates &&
      !inventoryBad &&
      !kindBad &&
      missingOperations.length === 0 &&
      candidates.length > 0;
    const pointSufficient =
      volumeSufficient &&
      g.observationKind === 'http-attempt' &&
      candidates.every(
        (r) =>
          r.kind === 'query' &&
          r.pointCost !== null &&
          r.costCoverage === 'complete-observation' &&
          r.hiddenRequestCount === 0
      );
    const status =
      g.signal === 'point-cost' && pointSufficient
        ? 'complete-point-ranking'
        : g.signal !== 'point-cost' && volumeSufficient
          ? 'volume-ranking'
          : 'preliminary';
    const reasons = [
      ...(globalBad
        ? ['enrollment, attribution, version or collection evidence is incomplete']
        : []),
      ...(unknownCandidates ? ['candidate attribution is unknown'] : []),
      ...(inventoryBad ? ['relevant inventory coverage is absent or inadequate'] : []),
      ...(kindBad ? ['observation kinds or dispatch outcomes are not comparable'] : []),
      ...missingOperations.map((op) => `no observations for ${op}`),
      ...(candidates.length === 0 ? ['empty candidate sample'] : []),
    ];
    return {
      id: g.id,
      signal: g.signal,
      scope: 'predeclared-participant-sample',
      operations: g.operations,
      denominator: candidates.length,
      status,
      pointSufficient,
      volumeSufficient,
      pointFinding: pointSufficient
        ? 'complete known costs within this predeclared group and participant sample'
        : 'total-point prioritization insufficient',
      reasons,
      ranking:
        status === 'preliminary'
          ? []
          : g.operations
              .map((operation) => ({
                operation,
                ...counts(candidates.filter((r) => r.operation === operation)),
              }))
              .sort(
                (a, b) =>
                  (g.signal === 'point-cost'
                    ? b.knownPointSubtotal - a.knownPointSubtotal
                    : g.signal === 'http-attempt-volume'
                      ? b.httpAttempts - a.httpAttempts
                      : b.opaqueInvocations - a.opaqueInvocations) ||
                  a.operation.localeCompare(b.operation)
              ),
    };
  });
}
