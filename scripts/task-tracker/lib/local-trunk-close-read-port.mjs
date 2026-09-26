// @story #1825
import { pexec as closePexec } from '../../gh/lib/gh-client.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from './process-timeouts.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { isNoCommitKind } from './issue-kind.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';
import { resolveCurrentIssueWorktreeLocation } from './issue-worktree-location.mjs';
import { parseReviewApprovedMarker } from './markers.mjs';
import { collectLocalTrunkCloseProof } from './local-trunk-close-proof.mjs';
import { resolveLocalTrunkAcceptedSha } from '../verbs/workflow-exception.mjs';

/** Fresh proof port for the one-issue local-trunk lane. The grant is supplied by the journal consumer. */
export async function loadCloseLocalTrunkProof({
  gateInput,
  grant,
  cfg,
  projectDir,
  pexec = closePexec,
  fetchRemoteTip,
} = {}) {
  if (!gateInput || !cfg || !projectDir) throw new TypeError('local-trunk-proof:input');
  const remote = cfg.trunkRemote?.trim() || 'origin';
  const baseRef =
    String(cfg.trunkRef || 'trunk')
      .split('/')
      .at(-1) || 'trunk';
  const remoteRef = `${remote}/${baseRef}`;
  const location = resolveCurrentIssueWorktreeLocation(gateInput.body);
  let validatedSha = null;
  try {
    validatedSha = resolveLocalTrunkAcceptedSha({
      body: gateInput.body,
      issue: gateInput.issueNumber,
      projectDir,
    });
  } catch {
    /* The pure evaluator reports the missing exact Test evidence. */
  }
  const branchOut = await pexec('git', ['branch', '--show-current'], { cwd: projectDir });
  const branch = String(branchOut.stdout ?? '').trim();
  const runGit = async (args) => {
    const { stdout } = await pexec('git', args, { cwd: projectDir, timeout: GIT_TIMEOUT_MS });
    return String(stdout ?? '').trim();
  };
  const listPullRequestPages = async () => {
    const { stdout } = await pexec(
      'gh',
      ['api', '--paginate', '--slurp', `repos/${cfg.repo}/pulls?state=all&per_page=100`],
      { timeout: GH_API_TIMEOUT_MS }
    );
    return JSON.parse(String(stdout ?? ''));
  };
  const fetchTip =
    fetchRemoteTip === false
      ? undefined
      : (fetchRemoteTip ??
        (async ({ remote: name, branch: target }) => {
          await pexec(
            'git',
            ['fetch', '--no-tags', '--no-write-fetch-head', name, `refs/heads/${target}`],
            { cwd: projectDir, timeout: GIT_TIMEOUT_MS }
          );
        }));
  return collectLocalTrunkCloseProof({
    facts: {
      repository: cfg.repo,
      issue: gateInput.issueNumber,
      state: readLastKnownState(gateInput.body).state,
      topLevel: gateInput.lineage?.parentIssueNumber === null,
      commitBearing: !isNoCommitKind(gateInput.body),
      branchBound: location?.worktreeBranch === branch && gateInput.branch === branch,
      worktreeBound: location?.worktreePath === readWorktreeIdentity({ projectDir }).worktreePath,
      acceptedSha: gateInput.acceptedSha,
      testSha: validatedSha,
      reviewSha: parseReviewApprovedMarker(gateInput.body)?.approvedSha ?? null,
      localRef: baseRef,
      remoteRef,
      grant,
    },
    branch,
    remote,
    remoteBranch: baseRef,
    runGit,
    listPullRequestPages,
    fetchRemoteTip: fetchTip,
  });
}
