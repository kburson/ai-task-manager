// @story #1876
// A constrained repair of redundant publication, never an interval reconstruction.
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from './scratch-dir.mjs';
import { deriveActorEngagement } from './timing-engagement.mjs';
import { classifyTimingEvent, EVENT_CLASS } from './timing-events/index.mjs';
import {
  parseTimingRow,
  isTableTimingTimestamp,
  replaceTimingRowCell,
} from './timing-row-reader.mjs';

export const timingBodySha = (body) => createHash('sha256').update(body).digest('hex');
const refuse = (reason) => {
  throw new TypeError('actor-replay:' + reason);
};
const rows = (body) =>
  body
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row && isTableTimingTimestamp(row.ts));
const accounting = ({ failures: _failures, complete: _complete, ...value }) => value;

export function planActorOpenerReplayRepair(body, nowTs) {
  const lines = body.split('\n');
  const retained = new Map();
  const removals = [];
  const candidate = lines
    .filter((line, index) => {
      const row = parseTimingRow(line);
      if (!row?.actorKey || classifyTimingEvent(row.event) !== EVENT_CLASS.REENGAGEMENT)
        return true;
      if (!isTableTimingTimestamp(row.ts) || row.engagement) refuse('ambiguous-opener');
      const identity = JSON.stringify([row.actorKey, row.ts, row.event]);
      const first = retained.get(identity);
      if (!first) {
        retained.set(identity, { line, index });
        return true;
      }
      if (replaceTimingRowCell(first.line, 5, '') !== replaceTimingRowCell(line, 5, ''))
        refuse('conflicting-opener');
      if (!['', '0', '—'].includes(row.cells[5])) refuse('contributing-replay');
      removals.push({
        actorKey: row.actorKey,
        timestamp: row.ts,
        event: row.event,
        retainedLine: first.index + 1,
        removedLine: index + 1,
        retainedRow: first.line,
        removedRow: line,
      });
      return false;
    })
    .join('\n');
  const before = deriveActorEngagement(rows(body), nowTs);
  const after = deriveActorEngagement(rows(candidate), nowTs);
  if (
    before.failures.some((failure) => !failure.startsWith('duplicate-actor-start:')) ||
    after.failures.length
  )
    refuse('ambiguous-accounting');
  if (JSON.stringify(accounting(before)) !== JSON.stringify(accounting(after)))
    refuse('accounting-changed');
  return { candidate, removals, accounting: accounting(after) };
}

export async function recoverActorOpenerReplays({
  issueNumber,
  repo,
  apply,
  expectedSourceSha,
  expectedCommentId,
  readCanonicalTimingSource,
  updateTimingComment,
  projectDir,
  now = Date.now,
}) {
  if (
    apply &&
    (!/^[a-f0-9]{64}$/.test(expectedSourceSha ?? '') ||
      typeof expectedCommentId !== 'string' ||
      !expectedCommentId.trim())
  )
    refuse('apply-requires-dry-run-identity');
  async function observe() {
    const result = await readCanonicalTimingSource({ issueNumber, repo });
    const source = result?.source;
    if (
      result?.status !== 'found' ||
      source?.repository !== repo ||
      source?.issue !== Number(issueNumber) ||
      typeof source?.body !== 'string' ||
      typeof source?.commentNodeId !== 'string' ||
      !source.commentNodeId
    )
      refuse('canonical-source');
    return source;
  }
  const source = await observe();
  const sourceSha = timingBodySha(source.body);
  if (apply && (expectedSourceSha !== sourceSha || expectedCommentId !== source.commentNodeId))
    refuse('dry-run-identity-mismatch');
  const observedAt = now();
  const plan = planActorOpenerReplayRepair(source.body, observedAt);
  const candidateSha = timingBodySha(plan.candidate);
  const result = {
    sourceSha,
    candidateSha,
    commentId: source.commentNodeId,
    removed: plan.removals.length,
    removals: plan.removals,
    accounting: plan.accounting,
  };
  if (!plan.removals.length) return { status: 'already-canonical', ...result };
  if (!apply) return { status: 'dry-run', ...result };
  const evidenceDir = mkdtempSync(
    path.join(projectScratchDir('heal', projectDir), 'actor-replay-')
  );
  writeFileSync(path.join(evidenceDir, 'before.md'), source.body, { flag: 'wx' });
  writeFileSync(path.join(evidenceDir, 'candidate.md'), plan.candidate, { flag: 'wx' });
  writeFileSync(
    path.join(evidenceDir, 'manifest.json'),
    JSON.stringify(
      {
        schema: 'aitm.actor-opener-replay-repair/v1',
        repository: repo,
        issue: Number(issueNumber),
        observedAt: new Date(observedAt).toISOString(),
        ...result,
      },
      null,
      2
    ) + '\n',
    { flag: 'wx' }
  );
  const current = await observe();
  if (current.commentNodeId !== source.commentNodeId || current.body !== source.body)
    refuse('source-drift');
  await updateTimingComment(source.commentNodeId, repo, plan.candidate);
  const readback = await observe();
  if (readback.commentNodeId !== source.commentNodeId || readback.body !== plan.candidate)
    refuse('readback');
  return { status: 'healed', ...result, evidenceDir };
}
