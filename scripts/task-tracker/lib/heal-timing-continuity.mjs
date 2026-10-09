// @story #1926
// Presence observations only: never reconstruct durations, words or departures.
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { getProvider } from '../../providers/index.mjs';
import { resolveTranscriptPath } from '../../providers/transcript-resolver.mjs';
import { fmtTs } from '../gh-timing-comment.mjs';
import { timingActorKey, timingActorMarker } from './timing-actor.mjs';
import { parseTimingRow, timingTimestampToMs } from './timing-row-reader.mjs';
import { deriveActorEngagement } from './timing-engagement.mjs';
import { extractDataRows } from './agent-review/validators/timing-log-sequence.mjs';
import { classifyTimingEvent, EVENT_CLASS } from './timing-events/index.mjs';
import { SUSPICIOUS_GAP_SEC } from './bind-event.mjs';
import { timingBodySha } from './heal-actor-opener-replays.mjs';
import { projectScratchDir } from './scratch-dir.mjs';

const refuse = (reason) => {
  throw new TypeError('timing-continuity:' + reason);
};
const departure = (row) => classifyTimingEvent(row.event) === EVENT_CLASS.DEPARTURE;
const OBSERVATION_GAP_MS = 15 * 60_000;
const CHECKPOINT_STEP_MS = SUSPICIOUS_GAP_SEC * 500;
const sha = (value) => timingBodySha(value);

export function readContinuityTranscript(sessionId) {
  const file = resolveTranscriptPath({
    adapter: getProvider('codex'),
    sid: sessionId,
    homedir: homedir(),
  });
  if (!file) refuse('transcript-unavailable');
  return { path: file, text: readFileSync(file, 'utf8') };
}

function transcriptEvidence(text, sessionId, gaps) {
  if (typeof text !== 'string' || !text) refuse('transcript-unavailable');
  const lastEnd = Math.max(...gaps.map((gap) => gap.end));
  const firstStart = Math.min(...gaps.map((gap) => gap.start));
  const entries = [];
  const metadata = [];
  let prefixEnd = null;
  let cursor = 0;
  let previous = -Infinity;
  let lineNumber = 0;
  for (const line of text.split('\n')) {
    lineNumber++;
    cursor += line.length + 1;
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      if (prefixEnd !== null && cursor >= text.length) break;
      refuse('malformed-transcript');
    }
    if (event.type === 'session_meta') metadata.push(event);
    const ms = typeof event.timestamp === 'string' ? Date.parse(event.timestamp) : NaN;
    if (!Number.isFinite(ms)) {
      if (prefixEnd === null) refuse('malformed-timestamp');
      continue;
    }
    if (prefixEnd === null && ms > lastEnd) prefixEnd = Math.min(cursor, text.length);
    if (ms >= firstStart && ms <= lastEnd) {
      if (ms < previous) refuse('non-monotonic-transcript');
      previous = ms;
      if (prefixEnd !== null) refuse('historical-record-after-window');
      entries.push({ event, ms, line: lineNumber });
    }
  }
  if (
    metadata.length !== 1 ||
    metadata[0].payload?.id !== sessionId ||
    typeof metadata[0].payload?.cwd !== 'string'
  )
    refuse('session-identity');
  if (prefixEnd === null) refuse('unclosed-transcript-window');
  const transcriptSha = sha(text.slice(0, prefixEnd));
  const observations = [];
  for (const gap of gaps) {
    const calls = [];
    const callIds = new Set();
    for (const item of entries.filter((item) => item.ms >= gap.start && item.ms <= gap.end)) {
      const p = item.event.payload;
      if (
        (item.event.type === 'event_msg' &&
          ['task_complete', 'turn_aborted', 'session_end', 'user_message'].includes(p?.type)) ||
        (item.event.type === 'response_item' &&
          p?.type === 'message' &&
          (p.role === 'user' || (p.role === 'assistant' && p.phase === 'final_answer')))
      )
        refuse('interrupted-session');
      if (
        item.event.type === 'response_item' &&
        ['function_call', 'custom_tool_call'].includes(p?.type)
      ) {
        if (typeof p.call_id !== 'string' || !p.call_id || typeof p.name !== 'string' || !p.name)
          refuse('ambiguous-observation');
        if (callIds.has(p.call_id)) refuse('duplicate-observation');
        callIds.add(p.call_id);
        calls.push(item);
      }
    }
    if (!calls.length) refuse('missing-observations');
    const points = [gap.start, ...calls.map((call) => call.ms), gap.end];
    if (points.some((point, index) => index > 0 && point - points[index - 1] > OBSERVATION_GAP_MS))
      refuse('unexplained-transcript-gap');
    let checkpoint = gap.start;
    while (gap.end - checkpoint > SUSPICIOUS_GAP_SEC * 1000) {
      const call = calls.find((call) => call.ms >= checkpoint + CHECKPOINT_STEP_MS);
      if (!call || call.ms >= gap.end) refuse('missing-checkpoint');
      const ms = Math.floor(call.ms / 1000) * 1000;
      if (ms <= checkpoint || ms - checkpoint > SUSPICIOUS_GAP_SEC * 1000)
        refuse('ambiguous-checkpoint');
      observations.push({ ms, callId: call.event.payload.call_id, line: call.line });
      checkpoint = ms;
    }
  }
  return { transcriptSha, prefixBytes: Buffer.byteLength(text.slice(0, prefixEnd)), observations };
}

export function planTimingContinuityRepair(body, { sessionId, transcript, now }) {
  const actorKey = timingActorKey({ provider: 'codex', sid: sessionId });
  const data = extractDataRows(body);
  const actorRows = data.filter((row) => row.actorKey === actorKey);
  if (!actorRows.length) refuse('actor-not-found');
  const gaps = [];
  for (let i = 0; i < data.length; i++) {
    const ms = timingTimestampToMs(data[i].ts);
    if (!Number.isFinite(ms) || (i && ms < timingTimestampToMs(data[i - 1].ts)))
      refuse('ambiguous-timing-order');
  }
  for (let i = 1; i < actorRows.length; i++) {
    const prior = actorRows[i - 1];
    const current = actorRows[i];
    const start = timingTimestampToMs(prior.ts);
    const end = timingTimestampToMs(current.ts);
    if (end - start > SUSPICIOUS_GAP_SEC * 1000 && !departure(prior)) {
      if (
        data.some(
          (row) =>
            timingTimestampToMs(row.ts) > start &&
            timingTimestampToMs(row.ts) < end &&
            departure(row)
        )
      )
        refuse('interrupted-timing-window');
      if (prior.event !== 'update' || current.event !== 'update') refuse('ambiguous-actor-window');
      gaps.push({ start, end });
    }
  }
  if (!gaps.length) return { candidate: body, observations: [] };
  const evidence = transcriptEvidence(transcript, sessionId, gaps);
  const observations = evidence.observations.sort((a, b) => a.ms - b.ms);
  const lines = body.split('\n');
  const insertions = new Map();
  for (const observation of observations) {
    const following = data.find((row) => timingTimestampToMs(row.ts) > observation.ms);
    if (
      !following ||
      data.some(
        (row) => timingTimestampToMs(row.ts) === observation.ms && row.actorKey === actorKey
      )
    )
      refuse('ambiguous-insertion');
    const indexes = lines.flatMap((line, index) => (line.trim() === following.raw ? [index] : []));
    if (indexes.length !== 1) refuse('ambiguous-row-source');
    const prior = data.findLast((row) => timingTimestampToMs(row.ts) <= observation.ms);
    const parsed = parseTimingRow(prior?.raw);
    if (!parsed || parsed.cells.length !== 10) refuse('unsupported-row-schema');
    const checkpoint = `| ${fmtTs(observation.ms, { offsetMin: 0 })} | update | Unknown | Unknown |  | ${parsed.wordMarker} | observed continuous session; source ${evidence.transcriptSha}; observation ${observation.line} | ${parsed.fullWordMarker} |${timingActorMarker(actorKey)}`;
    parseTimingRow(checkpoint);
    const pending = insertions.get(indexes[0]) ?? [];
    pending.push(checkpoint);
    insertions.set(indexes[0], pending);
  }
  const candidate = lines
    .flatMap((line, index) => [...(insertions.get(index) ?? []), line])
    .join('\n');
  const readRows = (value) => extractDataRows(value).map((row) => parseTimingRow(row.raw));
  const before = deriveActorEngagement(readRows(body), now);
  const after = deriveActorEngagement(readRows(candidate), now);
  if (before.failures.length || JSON.stringify(before) !== JSON.stringify(after))
    refuse('accounting-changed');
  return { candidate, ...evidence, accounting: after };
}

export async function recoverTimingContinuity({
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
  readTranscript = readContinuityTranscript,
  now = Date.now,
}) {
  timingActorKey({ provider: 'codex', sid: sessionId });
  if (
    apply &&
    (!/^[a-f0-9]{64}$/.test(expectedSourceSha ?? '') ||
      !expectedCommentId?.trim() ||
      !/^[a-f0-9]{64}$/.test(expectedTranscriptSha ?? ''))
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
  const transcript = await readTranscript(sessionId);
  const plan = planTimingContinuityRepair(source.body, {
    sessionId,
    transcript: transcript?.text,
    now: now(),
  });
  const result = {
    sourceSha: sha(source.body),
    candidateSha: sha(plan.candidate),
    commentId: source.commentNodeId,
    sessionId,
    inserted: plan.observations.length,
    transcriptSha: plan.transcriptSha ?? null,
    prefixBytes: plan.prefixBytes ?? null,
    transcriptPath: transcript?.path,
    observations: plan.observations,
    accounting: plan.accounting,
  };
  if (!result.inserted) return { status: 'already-canonical', ...result };
  if (!apply) return { status: 'dry-run', ...result };
  if (
    result.sourceSha !== expectedSourceSha ||
    result.commentId !== expectedCommentId ||
    result.transcriptSha !== expectedTranscriptSha
  )
    refuse('dry-run-identity-mismatch');
  const evidenceDir = mkdtempSync(path.join(projectScratchDir('heal', projectDir), 'continuity-'));
  for (const [file, value] of [
    ['before.md', source.body],
    ['candidate.md', plan.candidate],
    [
      'manifest.json',
      JSON.stringify(
        {
          schema: 'aitm.timing-continuity-repair/v1',
          repository: repo,
          issue: Number(issueNumber),
          ...result,
        },
        null,
        2
      ) + '\n',
    ],
  ])
    writeFileSync(path.join(evidenceDir, file), value, { flag: 'wx' });
  const current = await observe();
  if (current.commentNodeId !== source.commentNodeId || current.body !== source.body)
    refuse('source-drift');
  const reread = await readTranscript(sessionId);
  const fresh = planTimingContinuityRepair(current.body, {
    sessionId,
    transcript: reread?.text,
    now: now(),
  });
  if (
    reread?.path !== transcript?.path ||
    fresh.transcriptSha !== plan.transcriptSha ||
    fresh.candidate !== plan.candidate
  )
    refuse('transcript-drift');
  await updateTimingComment(source.commentNodeId, repo, plan.candidate);
  const readback = await observe();
  if (readback.commentNodeId !== source.commentNodeId || readback.body !== plan.candidate)
    refuse('readback');
  return { status: 'healed', ...result, evidenceDir };
}
