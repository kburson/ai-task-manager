// @story #1825
import { pexec as closePexec } from '../../gh/lib/gh-client.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from './process-timeouts.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { isNoCommitKind } from './issue-kind.mjs';
import { readWorktreeIdentity } from './worktree-binding-guard.mjs';
import { resolveCurrentIssueWorktreeLocation } from './issue-worktree-location.mjs';
import { parseReviewApprovedMarker } from './markers.mjs';
import { collectLocalTrunkCloseProof } from './local-trunk-close-proof.mjs';
import { parseAitmRecord } from './github-records/record-envelope.mjs';
import { buildDeliveryScope } from './workflow-policy/delivery-scope.mjs';
import { resolveDeliveryExceptionChain } from './workflow-policy/exception-record.mjs';
import { computeScopeIdentity } from './workflow-policy/scope-identity.mjs';
import { resolveLocalTrunkAcceptedSha } from '../verbs/workflow-exception.mjs';

/** Fresh proof port for the one-issue local-trunk lane. The grant is supplied by the journal consumer. */
export async function loadCloseLocalTrunkProof({
  gateInput,
  grant,
  cfg,
  projectDir,
  pexec = closePexec,
  fetchRemoteTip,
  deliveryOperationId = null,
  waiverScopeDigest = null,
  listGrantRecords = null,
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
  const scopeIdentity = computeScopeIdentity({
    repository: cfg.repo,
    issue: gateInput.issueNumber,
    body: gateInput.body,
  });
  let selectedGrant = grant;
  if (selectedGrant === undefined) {
    const pages = listGrantRecords
      ? await listGrantRecords()
      : JSON.parse(
          String(
            (
              await pexec(
                'gh',
                [
                  'api',
                  '--paginate',
                  '--slurp',
                  `repos/${cfg.repo}/issues/${gateInput.issueNumber}/comments?per_page=100`,
                ],
                { timeout: GH_API_TIMEOUT_MS }
              )
            ).stdout ?? ''
          )
        );
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page)))
      throw new TypeError('local-trunk-proof:grant-pages');
    const records = pages
      .flat()
      .filter((item) => typeof item?.body === 'string' && item.body.includes('aitm-record'))
      .map((item) =>
        parseAitmRecord({
          commentNodeId: String(item.node_id ?? item.id),
          body: item.body,
          expectedRepository: cfg.repo,
          expectedIssue: gateInput.issueNumber,
        })
      );
    const localRecords = records.filter(
      ({ envelope }) =>
        envelope?.recordType === 'workflow-exception' &&
        envelope.payload?.deliveryScope?.exceptionKind ===
          'delivery.local-trunk-close-authorization'
    );
    const partitions = new Set(
      localRecords.map(
        ({ envelope }) => buildDeliveryScope(envelope.payload.deliveryScope).partitionKey
      )
    );
    if (partitions.size > 1) throw new TypeError('local-trunk-proof:grant-ambiguous');
    const chain =
      partitions.size === 1
        ? resolveDeliveryExceptionChain({
            records,
            partitionKey: [...partitions][0],
            repository: cfg.repo,
            issue: gateInput.issueNumber,
            scopeIdentity,
          })
        : null;
    if (chain?.status === 'invalid') throw new TypeError('local-trunk-proof:grant-ambiguous');
    selectedGrant = chain?.active
      ? {
          active: true,
          scope: chain.active.deliveryScope,
          scopeIdentity: chain.active.scopeIdentity,
          deliveryOperationId: chain.active.deliveryScope.deliveryOperationId,
          waiverScopeDigest: chain.active.waiverScopeDigest,
          recordId: chain.active.recordId,
          revision: chain.active.revision,
        }
      : null;
  }
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
      grant: selectedGrant,
      scopeIdentity,
      deliveryOperationId: deliveryOperationId ?? selectedGrant?.deliveryOperationId,
      waiverScopeDigest: waiverScopeDigest ?? selectedGrant?.waiverScopeDigest,
    },
    branch,
    remote,
    remoteBranch: baseRef,
    runGit,
    listPullRequestPages,
    fetchRemoteTip: fetchTip,
  });
}

/** Locked Close must consume a fresh proof but cannot finish until #1826 publishes its receipt. */
export async function requireCloseReceiptOrLocalTrunkProof({
  gateInput,
  requireReceipt,
  readProof,
}) {
  try {
    return requireReceipt(gateInput);
  } catch (error) {
    if (
      error?.category !== 'ambiguous-pr' ||
      gateInput.lineage?.parentIssueNumber !== null ||
      !Array.isArray(gateInput.pullRequests) ||
      gateInput.pullRequests.length !== 0 ||
      isNoCommitKind(gateInput.body)
    )
      throw error;
    const proof = await readProof();
    if (proof.outcome !== 'authorized-local-trunk-close')
      throw new Error(`local-trunk-close-proof:${proof.reasonId}`);
    throw new Error('local-trunk-close-receipt-pending');
  }
}
