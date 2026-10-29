// @story #2014
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeRootFixture } from './runtime-root-fixture.mjs';
import { runEpicWave } from '../../task-tracker/verbs/epic-wave.mjs';
import { sealRankWaveRecord } from '../../task-tracker/lib/epic-rank-wave-authority.mjs';
import { rankWaveDigest } from '../../task-tracker/lib/epic-rank-wave-policy.mjs';
import {
  discoverRankWavePhysical,
  rankWaveGitEnv,
} from '../../task-tracker/lib/epic-rank-wave-bindings.mjs';
import { withEpicAdmissionLock } from '../../task-tracker/lib/epic-admission-lock.mjs';
import { serializeIssueWorktreeLocationMarker } from '../../task-tracker/lib/issue-worktree-location.mjs';

export function retainedRecoveryFixture() {
  const root = createRuntimeRootFixture('retained-restore-');
  const git = (args) =>
    String(
      execFileSync('git', args, { cwd: root, env: rankWaveGitEnv(), encoding: 'utf8' })
    ).trim();
  git(['config', 'user.name', 'Fixture']);
  git(['config', 'user.email', 'fixture@example.test']);
  git(['symbolic-ref', 'HEAD', 'refs/heads/parent']);
  writeFileSync(path.join(root, 'tracked.txt'), 'retained content\n');
  git(['add', 'tracked.txt']);
  git(['commit', '-qm', 'fixture']);
  const head = git(['rev-parse', 'HEAD']);
  git(['branch', 'child']);
  const parent = {
    issue: 107,
    ...discoverRankWavePhysical(root),
    provider: 'codex',
    sessionId: 'current-parent',
    generation: 'current-generation',
  };
  const binding = {
    ...parent,
    issue: 140,
    worktree: path.join(root, 'retained-child'),
    branch: 'child',
    sessionId: 'original-child',
    generation: 'original-generation',
  };
  const child = {
    number: 140,
    rank: 2,
    boardState: 'done',
    issueState: 'closed',
    closeReason: 'completed',
    recoveryPhase: null,
    blockedBy: [],
    refinementDigest: 'a'.repeat(64),
    body: serializeIssueWorktreeLocationMarker({
      worktreePath: binding.worktree,
      worktreeBranch: binding.branch,
      sessionId: binding.sessionId,
      ts: '2026-10-04T01:00:00.000Z',
    }),
  };
  const historicalParent = {
    ...parent,
    sessionId: 'historical-parent',
    generation: 'historical-generation',
  };
  const graph = [{ number: 140, rank: 2, blockedBy: [], refinementDigest: 'a'.repeat(64) }];
  const proposal = {
    schema: 'aitm.rank-wave-proposal/v1',
    operationId: 'retained-wave',
    repository: 'o/r',
    epic: 107,
    rank: 2,
    members: [140],
    graph,
    bindings: [binding],
    parent: historicalParent,
    expiresAt: null,
  };
  const wave = sealRankWaveRecord({
    schema: 'aitm.epic-rank-wave/v1',
    id: proposal.operationId,
    revision: 1,
    action: 'authorize',
    previousDigest: null,
    repository: 'o/r',
    epic: 107,
    rank: 2,
    members: [140],
    graph,
    bindings: [binding],
    parent: historicalParent,
    proposalDigest: rankWaveDigest(proposal),
    source: {
      schema: 'aitm.rank-wave-source/v1',
      sessionId: 'historical-human',
      messages: [{ messageId: 'm1', statementHash: 'sha256:' + 'b'.repeat(64) }],
    },
    recordingActor: 'codex/session:historical-parent',
    createdAt: '2026-10-04T01:00:00.000Z',
    expiresAt: null,
    continuation: null,
  });
  const comments = [{ commentNodeId: 'C1', wave }];
  const sourceCalls = [];
  const runtime = {
    projectDir: root,
    withLock: (fn) => withEpicAdmissionLock({ projectDir: root, epic: 107 }, fn),
    assertRecoveryParent: async () => structuredClone(parent),
    readSnapshot: async () => ({ body: '', children: [structuredClone(child)] }),
    listRecords: async () => structuredClone(comments),
    verifySource: async (args) => {
      sourceCalls.push(args);
      return { status: 'verified' };
    },
    verifyRetainedNative: async () => ({ verified: true, sessionId: binding.sessionId }),
    readRecoveryClaims: async () => ({}),
    addRestoredWorktree: (b) => git(['worktree', 'add', '--', b.worktree, b.branch]),
  };
  const input = {
    schema: 'aitm.epic-wave-restore-worktree/v1',
    rank: 2,
    child: 140,
    retainedDigest: wave.digest,
    expectedHead: head,
  };
  const restore = () =>
    runEpicWave(
      { rest: ['restore-worktree', '107', '--input-file', 'selector.json'], cfg: { repo: 'o/r' } },
      { runtime, now: () => '2026-10-14T14:00:00.000Z', readFile: () => JSON.stringify(input) }
    );
  return {
    root,
    git,
    head,
    parent,
    binding,
    child,
    wave,
    comments,
    input,
    runtime,
    sourceCalls,
    restore,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
