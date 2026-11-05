// @story #2156
// A marker publication precondition is not a durable source-acceptance receipt.
import { execFileSync } from 'node:child_process';
import { pexec as defaultPexec } from '../../gh/lib/gh-client.mjs';
import { detectProvider } from '../../providers/index.mjs';
import { loadState } from '../state.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { assertGovernedMutationSession } from './issue-body.mjs';
import { captureArtifactOperator } from '../lib/artifact-execution.mjs';
import { timingActorKey } from '../lib/timing-actor.mjs';
import { fetchAssignmentSnapshot } from '../lib/assignment-snapshot.mjs';
import {
  captureIssueProofAuthority,
  assertIssueProofAuthority,
} from '../lib/issue-proof-authority.mjs';
import { assertScopedDecompositionEffect } from '../lib/decomposition-effect-admission.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { setDeliverablePosted } from '../lib/issue-kind.mjs';
import { parseBodyVersion } from '../lib/body-version.mjs';
import { stripBodyVersion } from '../lib/versioned-issue-write.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import {
  parseSpikeDeliverableArgs,
  validateSpikeDeliverableComment,
  spikeDeliverableCommentIdentity,
  spikeDeliverableCommentId,
  readSpikeDeliverableMarker,
  assertSpikeDeliverableKind,
  spikeDeliverableRefusal,
} from '../lib/spike-deliverable.mjs';

function readSource(projectDir) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  return {
    headSha: git('rev-parse', 'HEAD'),
    clean: !git('status', '--porcelain', '--untracked-files=no'),
  };
}

const comparableBody = (body) => stripBodyVersion(body).trimEnd();
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export async function runSpikeDeliverable(ctx, deps = {}) {
  try {
    const { issueNumber, commentReference } = parseSpikeDeliverableArgs(ctx.rest);
    const projectDir = ctx.projectDir ?? process.cwd();
    const cfg = ctx.cfg;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cfg?.repo ?? '') || !cfg?.projectId)
      throw spikeDeliverableRefusal('repository');
    if (ctx.artifactSubject) throw spikeDeliverableRefusal('source-selection');
    const pexec = deps.pexec ?? ctx.pexec ?? defaultPexec;
    const capture =
      deps.captureOperator ?? (() => captureArtifactOperator({ projectDir, issueNumber }));
    const observeSource = deps.readSource ?? (() => readSource(projectDir));
    const stateReader = deps.loadState ?? loadState;
    function localFrame() {
      const state = stateReader(ctx.statePath);
      assertGovernedMutationSession(state, issueNumber);
      const operator = capture();
      timingActorKey({ provider: detectProvider().name, sid: operator.sessionId });
      if (
        operator.boundIssue !== issueNumber ||
        !operator.bindingGenerationId ||
        state.bindingGenerationId !== operator.bindingGenerationId ||
        state.worktreePath !== operator.worktreePath ||
        state.worktreeBranch !== operator.branch
      )
        throw spikeDeliverableRefusal('native-binding');
      const source = observeSource();
      if (source.clean !== true || source.headSha !== operator.headSha)
        throw spikeDeliverableRefusal('source-dirty');
      return { operator, entryStartTs: state.entryStartTs };
    }
    const initialFrame = localFrame();
    function assertLocal() {
      if (!same(localFrame(), initialFrame)) throw spikeDeliverableRefusal('native-drift');
    }
    async function authority() {
      const { stdout } = await pexec('gh', ['api', 'user', '--jq', '.login'], {
        timeout: GH_API_TIMEOUT_MS,
      });
      const currentUser = String(stdout ?? '').trim();
      const snapshot = await fetchAssignmentSnapshot({
        issueNumber,
        cfg,
        includeLocation: true,
        deps: deps.gql ? { gql: deps.gql } : {},
      });
      if (
        !currentUser ||
        snapshot.currentUser !== currentUser.toLowerCase() ||
        snapshot.assignees.length !== 1 ||
        snapshot.assignees[0] !== currentUser.toLowerCase()
      )
        throw spikeDeliverableRefusal('ownership');
      if (
        snapshot.issueState !== 'OPEN' ||
        snapshot.state !== 'develop' ||
        readLastKnownState(snapshot.body).state !== 'develop'
      )
        throw spikeDeliverableRefusal('state');
      assertSpikeDeliverableKind(snapshot.body);
      return { ...snapshot, currentUser };
    }
    const initialAuthority = await authority();
    const proof = captureIssueProofAuthority(initialAuthority.body);
    const initialMarker = readSpikeDeliverableMarker(initialAuthority.body);
    const commentId = spikeDeliverableCommentId(commentReference);
    async function report(currentUser) {
      const { stdout } = await pexec(
        'gh',
        ['api', `repos/${cfg.repo}/issues/comments/${commentId}`],
        { timeout: GH_API_TIMEOUT_MS }
      );
      const observation = validateSpikeDeliverableComment({
        repository: cfg.repo,
        issueNumber,
        commentId,
        currentUser,
        comment: JSON.parse(stdout),
      });
      if (commentReference.startsWith('https:') && observation.url !== commentReference)
        throw spikeDeliverableRefusal('comment-reference');
      return observation;
    }
    const observation = await report(initialAuthority.currentUser);
    const identity = spikeDeliverableCommentIdentity(observation);
    const stamp = (deps.now ?? (() => new Date().toISOString()))();
    let expectedReadBack = null;
    function inspectBody(body) {
      assertIssueProofAuthority(body, proof);
      assertSpikeDeliverableKind(body);
      const marker = readSpikeDeliverableMarker(body);
      if (
        marker &&
        (marker.url !== observation.url || (initialMarker && !same(marker, initialMarker)))
      )
        throw spikeDeliverableRefusal('marker-conflict');
      return marker;
    }
    async function fresh(base) {
      assertLocal();
      const current = await authority();
      if (current.currentUser !== initialAuthority.currentUser)
        throw spikeDeliverableRefusal('ownership-drift');
      inspectBody(current.body);
      inspectBody(base);
      if (spikeDeliverableCommentIdentity(await report(current.currentUser)) !== identity)
        throw spikeDeliverableRefusal('comment-drift');
      assertLocal();
      await (deps.admitEffect ?? assertScopedDecompositionEffect)({
        issue: issueNumber,
        cfg,
        projectDir,
        activity: 'scoped-deliverable',
        expectedBody: base,
        deps,
      });
      assertLocal();
    }
    function candidate(base, next) {
      assertLocal();
      inspectBody(base);
      const intended = setDeliverablePosted(base, { url: observation.url, ts: stamp });
      if (typeof next !== 'string' || comparableBody(next) !== comparableBody(intended))
        throw spikeDeliverableRefusal('mutation-delta');
      const marker = readSpikeDeliverableMarker(next);
      if (!marker || marker.url !== observation.url)
        throw spikeDeliverableRefusal('marker-readback');
      expectedReadBack = next;
    }
    const result = await (deps.mutateIssueBody ?? mutateIssueBody)({
      issueNumber,
      repo: cfg.repo,
      deps: { pexec, ...deps.writeDeps },
      mutate: async (base) => {
        await fresh(base);
        return setDeliverablePosted(base, { url: observation.url, ts: stamp });
      },
      validateFreshBase: candidate,
      validateFreshBaseAsync: async (base, next) => {
        await fresh(base);
        candidate(base, next);
      },
    });
    if (
      !result ||
      !['ok', 'no-op'].includes(result.status) ||
      typeof result.body !== 'string' ||
      !Number.isInteger(result.version) ||
      parseBodyVersion(result.body) !== result.version ||
      expectedReadBack === null ||
      comparableBody(result.body) !== comparableBody(expectedReadBack)
    )
      throw spikeDeliverableRefusal('body-readback');
    const persistedMarker = readSpikeDeliverableMarker(result.body);
    await fresh(result.body);
    const finalAuthority = await authority();
    const finalMarker = inspectBody(finalAuthority.body);
    if (!persistedMarker || !same(finalMarker, persistedMarker))
      throw spikeDeliverableRefusal('marker-readback');
    if (spikeDeliverableCommentIdentity(await report(finalAuthority.currentUser)) !== identity)
      throw spikeDeliverableRefusal('comment-drift');
    assertLocal();
    return {
      status: result.status === 'no-op' ? 'no-op' : 'recorded',
      issueNumber,
      url: observation.url,
      sourceSha: initialFrame.operator.headSha,
    };
  } catch (error) {
    if (String(error?.message).startsWith('spike-deliverable:')) throw error;
    const refusal = spikeDeliverableRefusal('authority');
    refusal.cause = error;
    throw refusal;
  }
}

export async function verbSpikeDeliverable(ctx) {
  try {
    parseSpikeDeliverableArgs(ctx.rest);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  try {
    const result = await runSpikeDeliverable(ctx, ctx.deps);
    console.log(`spike-deliverable: ${result.status} #${result.issueNumber} ${result.url}`);
  } catch (error) {
    console.error(error.message, error.cause?.message ?? '');
    process.exitCode = 1;
  }
}
