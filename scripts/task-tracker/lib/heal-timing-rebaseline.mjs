// @story #2022 #2068
// Historical repair of one native suppressed relocation boundary, never time reconstruction.
import { mkdtempSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { currentSessionId, aiAppName } from '../word-counter.mjs';
import { getActiveTask } from '../session-state.mjs';
import { fmtTs } from '../gh-timing-comment.mjs';
import { timingActorKey, timingActorMarker, timingEngagementMarker } from './timing-actor.mjs';
import { parseTimingRow, timingTimestampToMs } from './timing-row-reader.mjs';
import { classifyTimingEvent, EVENT_CLASS } from './timing-events/index.mjs';
import { deriveActorEngagement, isUnknownActorRecovery } from './timing-engagement.mjs';
import { timingBodySha } from './heal-actor-opener-replays.mjs';
import { readContinuityTranscript } from './heal-timing-continuity.mjs';
import { projectScratchDir } from './scratch-dir.mjs';
import { readRebaselineProof, refuseRebaseline as refuse } from './timing-rebaseline-proof.mjs';
import { extractDataRows } from './agent-review/validators/timing-log-sequence.mjs';

function rows(body) {
  let result;
  try {
    result = extractDataRows(body).map((r) => parseTimingRow(r.raw));
  } catch {
    refuse('malformed-timing');
  }
  if (!result.length) refuse('missing-timing');
  let last = -Infinity;
  for (const row of result) {
    const ms = timingTimestampToMs(row?.ts);
    if (!Number.isFinite(ms) || ms < last) refuse('malformed-timing');
    last = ms;
  }
  return result;
}
const number = (value) =>
  /^\d[\d,]*$/.test(value ?? '') ? Number(value.replaceAll(',', '')) : null;

function targetBoundary(body, actorKey) {
  let open;
  let prior;
  for (const row of rows(body)) {
    if (row.actorKey !== actorKey) continue;
    const ms = timingTimestampToMs(row.ts);
    if (isUnknownActorRecovery(row)) open = undefined;
    else if (row.engagement) {
      const e = row.engagement;
      if (open !== undefined && (e.startMs < open || e.startMs >= open + 1000)) {
        const supportedBoundary =
          (row.event === 'pause:other' && prior?.event === 'resumed') ||
          (row.event === 'update' && prior?.event === 'start');
        if (
          !supportedBoundary ||
          row.cells[3] !== 'Unknown' ||
          row.cells[4] !== 'Unknown' ||
          e.activeEstimateSec !== null ||
          prior.engagement ||
          e.startMs <= open ||
          e.startMs >= e.endMs ||
          e.endMs < ms ||
          e.endMs >= ms + 1000 ||
          !Number.isSafeInteger(e.wordStart) ||
          !Number.isSafeInteger(e.fullWordStart) ||
          number(prior.cells[6]) === null ||
          number(prior.cells[8]) === null ||
          e.wordStart < number(prior.cells[6]) ||
          e.fullWordStart < number(prior.cells[8])
        )
          refuse('unsupported-baseline');
        return { row, prior, baseline: e.startMs, end: e.endMs };
      }
      open = undefined;
    } else if (classifyTimingEvent(row.event) === EVENT_CLASS.REENGAGEMENT) {
      if (open !== undefined) refuse('ambiguous-opener');
      open = ms;
    } else if (classifyTimingEvent(row.event) === EVENT_CLASS.DEPARTURE) open = undefined;
    prior = row;
  }
  return null;
}

export function planTimingRebaselineRepair(
  body,
  { sessionId, issueNumber, transcript, projectDir, now }
) {
  const actorKey = timingActorKey({ provider: 'codex', sid: sessionId });
  const actorRows = rows(body).filter((row) => row.actorKey === actorKey);
  if (!actorRows.length) refuse('actor-not-found');
  const intervals = actorRows
    .map((row) => row.engagement)
    .filter((e) => e && e.startMs !== e.endMs)
    .sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].startMs < intervals[i - 1].endMs) refuse('overlapping-actor-evidence');
  }
  const target = targetBoundary(body, actorKey);
  if (!target) return { candidate: body, inserted: 0 };
  const proof = readRebaselineProof(transcript, {
    sessionId,
    issueNumber,
    projectDir,
    baseline: target.baseline,
    end: target.end,
  });
  const { row, prior, baseline } = target;
  const e = row.engagement;
  const stamp = fmtTs(baseline, { offsetMin: 0 });
  const description = `relocation recovery; prior endpoint unavailable; source ${timingBodySha(body)}; transcript ${proof.transcriptSha}`;
  const recovery = `| ${stamp} | session-end-recovery | Unknown | Unknown | 0 | ${prior.cells[6]} | ${description} | ${prior.cells[8]} |${timingActorMarker(actorKey)}`;
  const observed = `| ${stamp} | session-start | Unknown | Unknown | ${e.wordStart - number(prior.cells[6])} | ${e.wordStart} | observed native relocation baseline | ${e.fullWordStart} |${timingActorMarker(actorKey)}${timingEngagementMarker({ startMs: baseline, endMs: baseline, activeEstimateSec: null, wordStart: e.wordStart, wordEnd: e.wordStart, fullWordStart: e.fullWordStart, fullWordEnd: e.fullWordStart })}`;
  const lines = body.split('\n');
  const indexes = lines.flatMap((line, index) => {
    const parsed = parseTimingRow(line);
    return parsed && timingTimestampToMs(parsed.ts) >= baseline ? [index] : [];
  });
  const at = indexes[0];
  if (at === undefined || lines.filter((line) => line.trim() === row.raw).length !== 1)
    refuse('ambiguous-row-source');
  lines.splice(at, 0, recovery, observed);
  const candidate = lines.join('\n');
  const before = deriveActorEngagement(rows(body), now);
  const after = deriveActorEngagement(rows(candidate), now);
  if (
    after.failures.length ||
    before.failures.some(
      (s) => s !== 'actor-evidence-start-conflict' && s !== 'duplicate-actor-start:' + actorKey
    )
  )
    refuse('ambiguous-accounting');
  if (
    !after.unknownRows ||
    !after.intervals.some(
      (span) => span.actorKey === actorKey && span.startMs === baseline && span.endMs === e.endMs
    )
  )
    refuse('unknown-not-preserved');
  return { candidate, inserted: 2, ...proof, baseline, accounting: after };
}

export async function recoverTimingRebaseline({
  issueNumber,
  repo,
  sessionId,
  apply,
  expectedSourceSha,
  expectedCommentId,
  expectedTranscriptSha,
  readCanonicalTimingSource,
  updateTimingComment,
  projectDir,
  deps = {},
}) {
  const caller = (deps.currentSessionId ?? currentSessionId)();
  const binding = (deps.getActiveTask ?? getActiveTask)(caller, projectDir);
  // The current operator authenticates through its own binding. Historical
  // actor identity comes from the native transcript, never an env override.
  if (
    (deps.aiAppName ?? aiAppName)() !== 'codex' ||
    String(binding?.issue).replace('#', '') !== String(issueNumber) ||
    !binding?.worktreePath ||
    realpathSync(binding.worktreePath) !== realpathSync(projectDir)
  )
    refuse('current-owner-binding');
  const operatorActor = timingActorKey({ provider: 'codex', sid: caller });
  const observe = async () => {
    const result = await readCanonicalTimingSource({ issueNumber, repo });
    const source = result?.source;
    if (
      result?.status !== 'found' ||
      source?.repository !== repo ||
      source?.issue !== Number(issueNumber) ||
      typeof source.body !== 'string' ||
      typeof source.commentNodeId !== 'string' ||
      !source.commentNodeId
    )
      refuse('canonical-source');
    return source;
  };
  const source = await observe();
  const transcript = await (deps.readContinuityTranscript ?? readContinuityTranscript)(sessionId);
  const plan = planTimingRebaselineRepair(source.body, {
    sessionId,
    issueNumber,
    transcript: transcript.text,
    projectDir,
    now: (deps.now ?? Date.now)(),
  });
  const sourceSha = timingBodySha(source.body);
  if (!plan.inserted)
    return { status: 'already-canonical', sourceSha, commentId: source.commentNodeId, inserted: 0 };
  const { candidate, ...details } = plan;
  const result = {
    sourceSha,
    candidateSha: timingBodySha(candidate),
    commentId: source.commentNodeId,
    operatorActor,
    ...details,
  };
  if (!apply) return { status: 'dry-run', ...result };
  if (
    sourceSha !== expectedSourceSha ||
    source.commentNodeId !== expectedCommentId ||
    plan.transcriptSha !== expectedTranscriptSha
  )
    refuse('dry-run-identity-mismatch');
  const evidenceDir = mkdtempSync(
    path.join(projectScratchDir('heal', projectDir), 'relocation-rebaseline-')
  );
  for (const [name, value] of Object.entries({
    'before.md': source.body,
    'candidate.md': candidate,
    'manifest.json':
      JSON.stringify(
        {
          schema: 'aitm.relocation-rebaseline-repair/v1',
          repository: repo,
          issue: issueNumber,
          ...result,
        },
        null,
        2
      ) + '\n',
  }))
    writeFileSync(path.join(evidenceDir, name), value, { flag: 'wx' });
  const current = await observe();
  if (current.commentNodeId !== source.commentNodeId || current.body !== source.body)
    refuse('source-drift');
  let failed = false;
  try {
    await updateTimingComment(source.commentNodeId, repo, candidate);
  } catch {
    failed = true;
  }
  const readback = await observe();
  if (readback.commentNodeId !== source.commentNodeId || readback.body !== candidate)
    refuse('readback');
  return { status: failed ? 'healed-after-ambiguous-write' : 'healed', ...result, evidenceDir };
}
