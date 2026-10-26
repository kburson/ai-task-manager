// @story #2026
// cspell:ignore BCLA
// One reviewed historical ambiguity, not a pattern-based timing reconstruction.
import { mkdtempSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pexec } from '../../gh/lib/gh-client.mjs';
import { buildReviewContext } from './agent-review/review-gate.mjs';
import {
  validate as validateSequence,
  extractDataRows,
} from './agent-review/validators/timing-log-sequence.mjs';
import { currentSessionId, aiAppName } from '../word-counter.mjs';
import { getActiveTask } from '../session-state.mjs';
import { timingBodySha } from './heal-actor-opener-replays.mjs';
import {
  parseTimingRow,
  isTableTimingTimestamp,
  timingTimestampToMs,
} from './timing-row-reader.mjs';
import { deriveActorEngagement } from './timing-engagement.mjs';
import { timingActorKey } from './timing-actor.mjs';
import { projectScratchDir } from './scratch-dir.mjs';

const PROFILE = Object.freeze({
  id: 'aivc-63-2026-10-17',
  repository: 'kburson/AIVC',
  issue: 63,
  commentId: 'IC_kwDOVGnu1M8AAAABc5SfIA',
  prefixBytes: 10180,
  prefixSha: 'e9c80b063fedd120f933b0fccda77b3cd338c9a6e460f502270fbacd56de7155',
});
// @story #2082 — immutable prefix ends at the genuine orphan opener.
const ORPHAN_PROFILE = Object.freeze({
  id: 'aitm-2055-2026-10-21',
  repository: 'kburson/ai-task-manager',
  issue: 2055,
  commentId: 'IC_kwDOSU6LgM8AAAABdrBCLA',
  prefixBytes: 3075,
  prefixSha: '45dc750a5be6f0044aeef28b4ad3bdec660714d15dfa158cb9a2c0b71d625499',
});
const orphanActor = 'v1:e9361861aa5dfcb8f1597712f0524b6f6732246461222762796690e45fd35bcd';
const selectedProfile = (id) =>
  id === PROFILE.id
    ? PROFILE
    : id === ORPHAN_PROFILE.id
      ? ORPHAN_PROFILE
      : refuse('profile-identity');
const RECOVERY =
  '| 2026-10-17 07:51:35 -05:00 | session-end-recovery | Unknown | Unknown | 0 | 10,977 | prior actor endpoint unavailable; original evidence retained; reviewed recovery AITM2026 | 374,099 | <!-- aitm-actor:v1 key=145e955d61862b8a64d1117f874ca2536480777b62d9ec2b1b3b06d01ad4fa17 -->';
const refuse = (reason) => {
  throw new TypeError('actor-evidence-recovery:' + reason);
};
const actor = 'v1:145e955d61862b8a64d1117f874ca2536480777b62d9ec2b1b3b06d01ad4fa17';

export function planActorEvidenceRecovery(body, { profile, repo, issueNumber, commentId, now }) {
  const selected = selectedProfile(profile);
  if (
    profile !== selected.id ||
    repo !== selected.repository ||
    Number(issueNumber) !== selected.issue ||
    commentId !== selected.commentId
  )
    refuse('profile-identity');
  if (typeof body !== 'string') refuse('source');
  if (selected === ORPHAN_PROFILE) return planOrphanRecovery(body, now);
  const lines = body.split('\n');
  const recovered = lines.filter((line) => line === RECOVERY);
  if (recovered.length > 1) refuse('duplicate-recovery');
  const original = lines.filter((line) => line !== RECOVERY).join('\n');
  const bytes = Buffer.from(original);
  if (timingBodySha(bytes.subarray(0, PROFILE.prefixBytes)) !== PROFILE.prefixSha)
    refuse('historical-source-mismatch');
  const suffix = bytes.subarray(PROFILE.prefixBytes).toString('utf8');
  if (suffix && !suffix.startsWith('\n')) refuse('historical-source-mismatch');
  for (const line of suffix.split('\n').filter((line) => line.trim())) {
    const row = parseTimingRow(line);
    if (!row || !isTableTimingTimestamp(row.ts)) refuse('unsupported-append');
  }
  const sourceLines = original.split('\n');
  const index = sourceLines.findIndex((line) => line.includes('07:51:35 -05:00 | resumed'));
  if (index < 0) refuse('historical-source-mismatch');
  sourceLines.splice(index, 0, RECOVERY);
  const candidate = sourceLines.join('\n');
  if (recovered.length && body !== candidate) refuse('recovery-placement');
  const rows = candidate
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row && isTableTimingTimestamp(row.ts));
  if (extractDataRows(candidate).length !== rows.length) refuse('invalid-candidate');
  let previous = -Infinity;
  const spans = new Map();
  for (const row of rows) {
    const ms = timingTimestampToMs(row.ts);
    if (ms < previous) refuse('out-of-order');
    previous = ms;
    if (!row.engagement || row.engagement.startMs === row.engagement.endMs) continue;
    const prior = spans.get(row.actorKey);
    if (prior && row.engagement.startMs < prior.endMs) refuse('conflicting-evidence');
    spans.set(row.actorKey, row.engagement);
  }
  const accounting = deriveActorEngagement(rows, now);
  if (accounting.failures.length || accounting.incompleteActors.length) refuse('invalid-candidate');
  if (
    !accounting.unknownRows ||
    accounting.complete ||
    !rows.some((row) => row.actorKey === actor && row.raw.includes(RECOVERY))
  )
    refuse('unknown-not-preserved');
  return { candidate, inserted: recovered.length ? 0 : 1, accounting };
}

// Recording time is not an assertion about the missing endpoint.
function orphanRecoveryRow(ms) {
  const iso = new Date(ms).toISOString();
  const ts = iso.slice(0, 10) + ' ' + iso.slice(11, 19) + ' +00:00';
  return (
    '| ' +
    ts +
    ' | session-end-recovery | Unknown | Unknown | 0 | 159 | prior actor endpoint unavailable; original evidence retained; reviewed recovery ' +
    ORPHAN_PROFILE.id +
    ' | 19,562 | <!-- aitm-actor:v1 key=' +
    orphanActor.slice(3) +
    ' -->'
  );
}
function planOrphanRecovery(body, now) {
  if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now).getTime()))
    refuse('recording-time');
  const bytes = Buffer.from(body);
  if (timingBodySha(bytes.subarray(0, ORPHAN_PROFILE.prefixBytes)) !== ORPHAN_PROFILE.prefixSha)
    refuse('historical-source-mismatch');
  const suffix = bytes.subarray(ORPHAN_PROFILE.prefixBytes).toString('utf8');
  if (!suffix.startsWith('\n')) refuse('historical-source-mismatch');
  const lines = suffix.split('\n').filter((line) => line.trim());
  let recovered = null;
  let previous = -Infinity;
  for (const line of lines) {
    const row = parseTimingRow(line);
    if (!row || !isTableTimingTimestamp(row.ts)) refuse('unsupported-append');
    const ms = timingTimestampToMs(row.ts);
    if (!Number.isFinite(ms) || ms < previous) refuse('out-of-order');
    previous = ms;
    if (row.actorKey !== orphanActor) continue;
    if (row.event !== 'session-end-recovery') refuse('conflicting-evidence');
    if (recovered) refuse('duplicate-recovery');
    if (line !== orphanRecoveryRow(ms)) refuse('conflicting-recovery');
    recovered = row;
  }
  if (now < previous || Math.floor(now / 1000) * 1000 < previous) refuse('recording-time');
  const candidate = recovered
    ? body
    : body + (body.endsWith('\n') ? '' : '\n') + orphanRecoveryRow(now) + '\n';
  const rows = candidate
    .split('\n')
    .map(parseTimingRow)
    .filter((row) => row && isTableTimingTimestamp(row.ts));
  if (extractDataRows(candidate).length !== rows.length) refuse('invalid-candidate');
  const spans = new Map();
  for (const row of rows) {
    if (!row.engagement || row.engagement.startMs === row.engagement.endMs) continue;
    const prior = spans.get(row.actorKey);
    if (prior && row.engagement.startMs < prior.endMs) refuse('conflicting-evidence');
    spans.set(row.actorKey, row.engagement);
  }
  const accounting = deriveActorEngagement(rows, now);
  if (accounting.failures.length || accounting.incompleteActors.length) refuse('invalid-candidate');
  if (!accounting.unknownRows || accounting.complete) refuse('unknown-not-preserved');
  return { candidate, inserted: recovered ? 0 : 1, accounting };
}

export async function recoverActorEvidence({
  issueNumber,
  repo,
  profile,
  apply,
  expectedSourceSha,
  expectedCommentId,
  readCanonicalTimingSource,
  updateTimingComment,
  projectDir,
  deps = {},
}) {
  const selected = selectedProfile(profile);
  let operatorActor = null;
  const authenticate = () => {
    const sid = (deps.currentSessionId ?? currentSessionId)();
    const binding = (deps.getActiveTask ?? getActiveTask)(sid, projectDir);
    if (
      (deps.aiAppName ?? aiAppName)() !== 'codex' ||
      String(binding?.issue).replace('#', '') !== String(issueNumber) ||
      typeof binding?.entryStartTs !== 'string' ||
      !Number.isFinite(Date.parse(binding.entryStartTs)) ||
      binding.closedAt ||
      !binding.worktreePath ||
      realpathSync(binding.worktreePath) !== realpathSync(projectDir)
    )
      refuse('current-owner-binding');
    operatorActor = timingActorKey({ provider: 'codex', sid });
  };
  if (apply) authenticate();
  const observe = async () => {
    const result = await readCanonicalTimingSource({ issueNumber, repo });
    const source = result?.source;
    if (
      result?.status !== 'found' ||
      source?.repository !== repo ||
      source?.issue !== Number(issueNumber) ||
      typeof source?.body !== 'string' ||
      source?.commentNodeId !== selected.commentId
    )
      refuse('canonical-source');
    return source;
  };
  const readIssue = async () => {
    const issue = await (
      deps.readRecoveryIssue ??
      (async () => {
        const { stdout } = await pexec('gh', ['api', `repos/${repo}/issues/${issueNumber}`]);
        return JSON.parse(stdout);
      })
    )();
    if (
      issue?.number !== selected.issue ||
      issue.repository_url !== 'https://api.github.com/repos/' + selected.repository ||
      typeof issue.body !== 'string'
    )
      refuse('canonical-issue');
    return issue.body;
  };
  const source = await observe();
  const sourceSha = timingBodySha(source.body);
  const plan = planActorEvidenceRecovery(source.body, {
    profile,
    repo,
    issueNumber,
    commentId: source.commentNodeId,
    now: (deps.now ?? Date.now)(),
  });
  const issueBody = await readIssue();
  const validateCandidate = (body) => {
    const result = validateSequence(
      buildReviewContext({ body, repo, issueNumber, comments: [{ body: plan.candidate }] })
    );
    if (!result.pass) refuse('invalid-candidate');
  };
  validateCandidate(issueBody);
  const result = {
    issueBodySha: timingBodySha(issueBody),
    profile,
    sourceSha,
    candidateSha: timingBodySha(plan.candidate),
    commentId: source.commentNodeId,
    inserted: plan.inserted,
    accounting: plan.accounting,
    operatorActor,
  };
  if (!plan.inserted) return { status: 'already-canonical', ...result };
  if (!apply) return { status: 'dry-run', ...result };
  if (sourceSha !== expectedSourceSha || source.commentNodeId !== expectedCommentId)
    refuse('dry-run-identity-mismatch');
  const evidenceDir = mkdtempSync(
    path.join(projectScratchDir('heal', projectDir), 'actor-evidence-')
  );
  for (const [name, value] of Object.entries({
    'before.md': source.body,
    'candidate.md': plan.candidate,
    'manifest.json':
      JSON.stringify(
        {
          schema: 'aitm.historical-actor-evidence-recovery/v1',
          repository: repo,
          issue: Number(issueNumber),
          ...result,
        },
        null,
        2
      ) + '\n',
  }))
    writeFileSync(path.join(evidenceDir, name), value, { flag: 'wx', mode: 0o600 });
  const fresh = await observe();
  if (fresh.commentNodeId !== source.commentNodeId || fresh.body !== source.body)
    refuse('source-drift');
  validateCandidate(await readIssue());
  authenticate();
  let ambiguous = false;
  try {
    await updateTimingComment(source.commentNodeId, repo, plan.candidate);
  } catch {
    ambiguous = true;
  }
  const readback = await observe();
  if (readback.body !== plan.candidate) refuse('readback');
  return { status: ambiguous ? 'healed-after-ambiguous-write' : 'healed', ...result, evidenceDir };
}
