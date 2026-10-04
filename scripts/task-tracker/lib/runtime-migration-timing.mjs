// @story #1857
// Reconcile protected process intervals against canonical ordinary actor spans.
// Never append historical rows or add an interval already covered by its actor.
import { createHash } from 'node:crypto';
import { readCanonicalTimingSource } from '../gh-timing-comment.mjs';
import { timingActorKey } from './timing-actor.mjs';
import { deriveActorEngagement, reconcileActorCoverage } from './timing-engagement.mjs';
import { readOutcomeTimingRows } from './estimation/outcome-record.mjs';

export async function reconcileRuntimeMigrationTiming({
  plan,
  intervals,
  repository,
  transactionId,
  idempotencyKey,
  publication,
  readTimingSource = readCanonicalTimingSource,
}) {
  const coverage = [];
  if (publication?.repository && publication.repository !== repository)
    return {
      status: 'pending',
      reason: 'migration-repository-changed',
      repository: publication.repository,
      coverage,
    };
  const pending = (reason) => ({ status: 'pending', reason, repository, coverage });
  if (
    !Array.isArray(intervals) ||
    !intervals.length ||
    idempotencyKey !== transactionId + ':engagement' ||
    !new RegExp('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$').test(repository || '')
  )
    return pending('migration-attribution-unavailable');
  for (const interval of intervals) {
    const startMs = Date.parse(interval.startedAt);
    const endMs = Date.parse(interval.endedAt);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs < startMs ||
      interval.durationMs !== endMs - startMs ||
      interval.completeness ||
      interval.basis !== 'process-engagement'
    )
      return pending('migration-interval-incomplete');
    let actorKey;
    try {
      actorKey = timingActorKey(interval.owner);
    } catch {
      return pending('migration-attribution-unavailable');
    }
    // Only the hashed approved source census may attribute this historical
    // process interval. A recovery actor absent from that census stays unknown.
    const claims =
      plan?.writerObservation?.complete === true
        ? (plan.writerObservation.claims || []).filter(
            (claim) =>
              claim.provider === interval.owner.provider &&
              claim.sid === interval.owner.sid &&
              ['session-binding', 'actor-engagement'].includes(claim.reason) &&
              Number.isFinite(Date.parse(claim.entryStartTs)) &&
              Date.parse(claim.entryStartTs) <= startMs
          )
        : [];
    const issues = [...new Set(claims.map((claim) => Number(claim.issue)))];
    if (issues.length !== 1 || !Number.isSafeInteger(issues[0]) || issues[0] <= 0)
      return pending('migration-attribution-unavailable');
    const issue = issues[0];
    let observed;
    try {
      observed = await readTimingSource({ issueNumber: issue, repo: repository });
    } catch {
      return pending('canonical-timing-unavailable');
    }
    const source = observed?.source;
    if (
      observed?.status !== 'found' ||
      source?.repository !== repository ||
      source.issue !== issue ||
      !/^IC_[A-Za-z0-9_-]+$/.test(source.commentNodeId || '') ||
      typeof source.body !== 'string'
    )
      return pending('canonical-timing-unavailable');
    let engagement;
    try {
      const rows = readOutcomeTimingRows(source.body);
      if (!rows.length) return pending('canonical-timing-invalid');
      engagement = deriveActorEngagement(rows, rows.at(-1).ts);
      if (engagement.failures.length) return pending('canonical-timing-invalid');
    } catch {
      return pending('canonical-timing-invalid');
    }
    const observedCoverage = reconcileActorCoverage(engagement.intervals, {
      actorKey,
      startMs,
      endMs,
    });
    if (observedCoverage.status !== 'known' || observedCoverage.uncoveredMs !== 0)
      return pending('ordinary-engagement-not-yet-covered');
    coverage.push({
      actorKey,
      issue,
      startMs,
      endMs,
      coveredMs: observedCoverage.coveredMs,
      addedMs: 0,
      repository,
      commentNodeId: source.commentNodeId,
      sourceDigest: 'sha256:' + createHash('sha256').update(source.body).digest('hex'),
    });
  }
  return { status: 'confirmed', repository, basis: 'canonical-ordinary-actor-coverage', coverage };
}
