// @story #1872
import { normalizeStateId } from './lifecycle-policy/index.mjs';
import { reconcileRankWaveRefinement } from './epic-rank-wave-refinement.mjs';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { pexec as run } from '../../gh/lib/gh-client.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { getProvider } from '../../providers/index.mjs';
import { resolveTranscriptPath } from '../../providers/transcript-resolver.mjs';
import { gql } from '../../gh/lib/github-projects.mjs';
import { aiAppName, currentSessionId } from '../word-counter.mjs';
import { getActiveTask } from '../session-state.mjs';
import { getProjectDir } from '../paths.mjs';
import { fetchEpicChildren, enrichChildrenWithBlockedBy } from './epic-children-gate.mjs';
import { readOccupancy } from './occupancy.mjs';
import { occupancyPath } from '../paths.mjs';
import { findMainWorktreePath } from '../fleet-registry.mjs';
import { resolveCurrentIssueWorktreeLocation } from './issue-worktree-location.mjs';
import {
  discoverRankWavePhysical,
  observeRankWaveBinding,
  observeRankWaveDischarge,
  verifyRankWaveBindings,
  rankWaveGitEnv,
} from './epic-rank-wave-bindings.mjs';
import { createRankWaveSourceLoader, verifyRankWaveSource } from './epic-rank-wave-source.mjs';
import {
  withEpicAdmissionLock,
  inspectEpicAdmissionLock,
  releaseEpicAdmissionLock,
} from './epic-admission-lock.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';
import {
  createAitmRecordEnvelope,
  renderAitmRecord,
  createRecordId,
} from './github-records/record-envelope.mjs';
import {
  createIssueComment,
  listIssueCommentsSince,
} from './github-records/github-comment-store.mjs';
import { assertGovernedMutationSession } from '../verbs/issue-body.mjs';
import { loadState } from '../state.mjs';

export async function rankWaveRepositoryAt(projectDir) {
  const { stdout } = await run('git', ['remote', 'get-url', 'origin'], {
    cwd: projectDir,
    env: rankWaveGitEnv(),
    timeout: 10000,
  });
  const match = String(stdout)
    .trim()
    .match(/(?:github\.com[:/])([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!match) throw new Error('rank-wave: repository linkage unavailable');
  return match[1];
}
function bindingFor(issue, location, occupancy) {
  if (!location || occupancy?.issue !== issue)
    throw new Error(`rank-wave: child #${issue} must have genuine occupancy`);
  const physical = discoverRankWavePhysical(location.worktreePath);
  if (
    physical.worktree !== location.worktreePath ||
    physical.branch !== location.worktreeBranch ||
    occupancy.worktreePath !== physical.worktree
  )
    throw new Error('rank-wave: location or physical lineage mismatch');
  return {
    issue,
    ...physical,
    provider: occupancy.provider,
    sessionId: occupancy.sid,
    generation: occupancy.bindingGenerationId,
  };
}
export function createRankWaveRuntime(ctx, { admissionLockContext = null, ports = {} } = {}) {
  const repository = ctx.cfg.repo,
    projectDir = ctx.projectDir ?? getProjectDir();
  const sid = currentSessionId(),
    provider = aiAppName();
  const transport = ports.run ?? run;
  const graphql =
    ports.graphql ?? (({ query, variables }) => gql(query, variables).then((data) => ({ data })));
  const rowsAt =
    ports.rows ?? (() => readOccupancy(occupancyPath(findMainWorktreePath(projectDir))));
  const loadContext = createRankWaveSourceLoader({
    resolveTranscriptPath: async (id) =>
      resolveTranscriptPath({
        adapter: getProvider('codex'),
        sid: id,
        homedir: homedir(),
        cwd: projectDir,
        projectKey: projectDir.replace(/[\\/:]/g, '-'),
      }),
    resolveRepository: rankWaveRepositoryAt,
  });
  async function fetchBody(issue) {
    const { stdout } = await transport('gh', [
      'issue',
      'view',
      String(issue),
      '-R',
      repository,
      '--json',
      'body',
      '--jq',
      '.body',
    ]);
    return stdout.trimEnd();
  }
  async function listRecords(epic) {
    const records = await listIssueCommentsSince({
      repository,
      issue: epic,
      since: '1970-01-01T00:00:00.000Z',
      graphql,
    });
    return records
      .filter((r) => r.envelope.recordType === 'epic-rank-wave')
      .map((r) => {
        if (
          !r.authorLogin ||
          r.createdAt !== r.updatedAt ||
          r.envelope.payload.record.recordingActor !== r.envelope.authority.actor
        ) {
          throw new Error('rank-wave: immutable comment provenance invalid');
        }
        return { commentNodeId: r.commentNodeId, wave: r.envelope.payload, body: r.body };
      });
  }
  async function readSnapshot(epic, rank, { includeBindings = true } = {}) {
    const body = await fetchBody(epic);
    let children = await (
      ports.children ??
      (async (epic) =>
        enrichChildrenWithBlockedBy({
          children: await fetchEpicChildren({
            cfg: ctx.cfg,
            parentEpicNumber: epic,
            deps: { waveAdmission: { allowPlanProjection: includeBindings } },
          }),
          cfg: ctx.cfg,
        }))
    )(epic);
    const comments = await listRecords(epic);
    const retained = comments.map((c) => c.wave.record).sort((a, b) => b.revision - a.revision);
    children = reconcileRankWaveRefinement(children, retained);
    if (!includeBindings) return { body, children };
    const rows = rowsAt();
    const memberNumbers = children
      .filter((c) => c.rank === rank)
      .map((c) => c.number)
      .sort((a, b) => a - b);
    const bindings = memberNumbers
      .map((number) => {
        const child = children.find((c) => c.number === number),
          row = rows[String(number)];
        const old = retained.flatMap((r) => r.bindings).find((b) => b.issue === number);
        const oldParent = retained.find((r) => r.bindings.some((b) => b.issue === number))?.parent;
        if (
          old &&
          ['test', 'review', 'done'].includes(normalizeStateId(child.boardState)) &&
          (!row || (row.sid === oldParent?.sessionId && row.provider === oldParent?.provider))
        )
          return old;
        if (row) return bindingFor(number, resolveCurrentIssueWorktreeLocation(child.body), row);
        if (old) return old;
        return null;
      })
      .filter(Boolean);
    const own = rows[String(epic)],
      active = own ? getActiveTask(own.sid, own.worktreePath) : null;
    const oldParent = retained.find((r) => r.rank === rank)?.parent;
    const parent =
      own && active?.issue === `#${epic}`
        ? bindingFor(
            epic,
            { worktreePath: active.worktreePath, worktreeBranch: active.worktreeBranch },
            own
          )
        : oldParent;
    return { body, children, bindings, parent };
  }
  return {
    recordingActor: `${provider}/session:${sid}`,
    async assertParent(epic) {
      assertGovernedMutationSession(loadState(ctx.statePath), epic);
      const rows = rowsAt();
      const active = getActiveTask(sid, projectDir),
        claim = rows[String(epic)];
      if (
        active?.issue !== `#${epic}` ||
        claim?.sid !== sid ||
        claim.provider !== provider ||
        claim.bindingGenerationId !== active.bindingGenerationId
      ) {
        throw new Error('rank-wave: genuine parent binding required');
      }
      const binding = bindingFor(
        epic,
        { worktreePath: active.worktreePath, worktreeBranch: active.worktreeBranch },
        claim
      );
      const observation = await observeRankWaveBinding(binding);
      if (!observation.native.verified)
        throw new Error('rank-wave: parent native identity unavailable');
    },
    inspectLock: () => inspectEpicAdmissionLock({ projectDir, epic: ctx.waveEpic }),
    releaseLock: (observation) =>
      releaseEpicAdmissionLock({ projectDir, epic: ctx.waveEpic, observation }),
    readSnapshot,
    listRecords,
    verifySource: (args) => verifyRankWaveSource({ ...args, loadContext }),
    verifyBindings: verifyRankWaveBindings,
    withLock: (fn) =>
      withEpicAdmissionLock({ projectDir, epic: ctx.waveEpic, context: admissionLockContext }, fn),
    async reserveOperation(id, wave) {
      if (!/^[\w-]{1,80}$/.test(id)) throw new Error('rank-wave: operation identity');
      const directory = path.join(
        discoverRankWavePhysical(projectDir).commonDir,
        'aitm-admission',
        'operations'
      );
      mkdirSync(directory, { recursive: true });
      const file = path.join(directory, `${id}.json`);
      try {
        writeFileSync(file, JSON.stringify(wave), { flag: 'wx' });
        return true;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const prior = JSON.parse(readFileSync(file, 'utf8'));
        const stable = (record) =>
          Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'createdAt'));
        if (canonicalRecordJson(stable(prior.record)) !== canonicalRecordJson(stable(wave.record)))
          throw new Error('rank-wave: operation conflict');
        return false;
      }
    },
    async createRecord(wave, epic) {
      const envelope = createAitmRecordEnvelope({
        recordType: 'epic-rank-wave',
        repository,
        issue: epic,
        payload: wave,
        actor: wave.record.recordingActor,
        recordId: createRecordId(),
        createdAt: wave.record.createdAt,
        predecessor: null,
      });
      const body = renderAitmRecord({
        envelope,
        visibleMarkdown: `### Rank-wave ${wave.record.action} — epic #${epic}, rank ${wave.record.rank}\n\nMembers: ${wave.record.members.map((n) => `#${n}`).join(', ')}. Operation: ${wave.record.id}.\n`,
      });
      const result = await createIssueComment({
        repository,
        issue: epic,
        body,
        graphql,
        rest: {
          async createIssueComment({ repository, issue, body }) {
            const { stdout } = await transport('gh', [
              'api',
              `repos/${repository}/issues/${issue}/comments`,
              '--method',
              'POST',
              '-f',
              `body=${body}`,
            ]);
            return JSON.parse(stdout);
          },
        },
      });
      return {
        commentNodeId: result.commentNodeId,
        wave: result.envelope.payload,
        body: result.body,
      };
    },
    mutateBody: (mutate, epic) => mutateIssueBody({ issueNumber: epic, repo: repository, mutate }),
    observeDischarge: observeRankWaveDischarge,
  };
}
