// @story #1668
// Delivery explanation observes authority but never performs provider or ledger effects.
import {
  DeliveryPreflightError,
  resolveLiveDeliveryReviewAuthority,
  validateDeliveryPreflight,
  validateMergedDeliveryPreflight,
  validateNoCommitDeliveryPreflight,
} from '../delivery-preflight.mjs';
import { isIssueResidentDeliveryKind, parseIssueKind } from '../issue-kind.mjs';
import { evaluateManualCodeReview } from '../manual-code-review.mjs';
import { selectEvidenceProtocol } from '../evidence-v2/protocol.mjs';
import {
  authorizedIntentBytes,
  buildDeliveryIntent,
  buildDeliveryReceipt,
  parseDeliveryCommentForPullRequest,
  projectDeliveryRecords,
} from '../delivery-records.mjs';
import {
  parseNoCommitDeliveryComment,
  projectNoCommitDeliveryRecords,
  sameNoCommitDeliveryAuthority,
} from '../no-commit-delivery-record.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import {
  verifyDeliveredPullRequest,
  verifyExternalDeliveredPullRequest,
  DeliveryVerificationError,
} from '../delivery-verification.mjs';
import { createObservationAttempt } from './observations.mjs';
import { mergedSourceCommitSubjects, openSourceCommitSubjects } from '../../verbs/deliver.mjs';

const authorityFailure = (issue, source = 'delivery') => ({
  guardId: 'authority-collection',
  code: 'authority-read-failed',
  args: { source, reason: 'incomplete', subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});

async function readOnlyMergedProof({ issue, preflightInput, comments, deps }) {
  const selected = preflightInput.pullRequests.length === 1 ? preflightInput.pullRequests[0] : null;
  if (
    !selected ||
    typeof deps.fetchRemoteTrunkHeadSha !== 'function' ||
    typeof deps.resolveLocalTrunkHeadSha !== 'function'
  ) {
    return { status: 'unavailable' };
  }
  try {
    const projection = projectDeliveryRecords(
      comments
        .map((comment) =>
          parseDeliveryCommentForPullRequest(comment, {
            repository: preflightInput.config.repo,
            issueNumber: issue,
            prNumber: selected.number,
          })
        )
        .filter(Boolean)
    );
    const live = projection.liveIntent;
    const preflight = validateMergedDeliveryPreflight(preflightInput);
    const branch = preflight.pr.baseRefName;
    const [remoteSha, localSha] = await Promise.all([
      deps.fetchRemoteTrunkHeadSha({ branch }),
      deps.resolveLocalTrunkHeadSha({ branch }),
    ]);
    if (!/^[0-9a-f]{40}$/.test(remoteSha) || remoteSha !== localSha) {
      return { status: 'unavailable' };
    }
    const common = {
      acceptedSha: preflight.expectedHeadSha,
      pullRequest: selected,
      localHeadSha: preflightInput.localHeadSha,
      testReceiptSha: preflightInput.testReceiptSha,
      acceptedReviewSha: preflightInput.acceptedReviewSha,
      fetchOriginTrunk: async ({ remote, branch: requestedBranch }) => {
        if (remote !== 'origin' || requestedBranch !== branch) {
          throw new TypeError('delivery-readiness:trunk-ref');
        }
      },
      isAncestor: deps.isAncestor,
      inspectMergeCommit: deps.inspectMergeCommit,
      attributingCommits: deps.attributingCommits,
    };
    const verification = live
      ? await verifyDeliveredPullRequest({
          ...common,
          intent: live.record,
          intentCreatedAt: live.createdAt,
          recovery: live.record.provider === 'external',
        })
      : await verifyExternalDeliveredPullRequest({
          ...common,
          intentInput: {
            intentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
            supersedesIntentId: null,
            issueNumber: issue,
            repository: preflightInput.config.repo,
            prNumber: preflight.pr.number,
            baseRef: preflight.pr.baseRefName,
            headRef: preflight.pr.headRefName,
            expectedHeadSha: preflight.expectedHeadSha,
            mergeMethod: preflight.mergeMethod,
            attributionTokens: preflight.commitText.attributionTokens,
            provider: 'external',
            sessionId: 'read-only-delivery-probe',
            clientCreatedAt: selected.mergedAt,
          },
        });
    const metadataWarnings = [
      ...new Set([
        ...(preflight.metadataWarnings ?? []),
        ...(verification.receiptInput.metadataWarnings ?? []),
      ]),
    ].sort();
    const receipt = buildDeliveryReceipt({
      ...verification.receiptInput,
      ...(metadataWarnings.length ? { metadataWarnings } : {}),
    });
    if (
      projection.matchingReceipt &&
      canonicalRecordJson(projection.matchingReceipt.record) !== canonicalRecordJson(receipt)
    ) {
      return { status: 'refused', category: 'receipt-divergence' };
    }
    return {
      status: 'verified',
      expectedHeadSha: preflight.expectedHeadSha,
      mergeCommitSha: verification.receiptInput.mergeCommitSha,
      trunkHeadSha: remoteSha,
      metadataWarnings,
    };
  } catch (error) {
    if (error instanceof DeliveryVerificationError || error instanceof DeliveryPreflightError) {
      return { status: 'refused', category: error.category };
    }
    return { status: 'unavailable' };
  }
}

export async function collectDeliveryReadiness({ issue, attempt, ports = {} } = {}) {
  const scope = ports.scope;
  const body = await attempt.observe({
    resource: 'issue-body',
    identity: `issue:${issue}`,
    scope,
  });
  const delivery = await attempt.observe({
    resource: 'delivery',
    identity: `evidence:${issue}:1`,
    scope,
  });
  if (body.status !== 'observed' || delivery.status !== 'observed') {
    return {
      status: 'indeterminate',
      blockers: [body, delivery]
        .filter(({ status }) => status !== 'observed')
        .map(({ cause }) => cause ?? authorityFailure(issue)),
      observations: [body, delivery],
    };
  }
  const value = delivery.value;
  const input = value?.preflightInput;
  if (body.value?.number !== issue || input?.issue?.body !== body.value.body) {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure(issue, 'issue-body')],
      observations: [body, delivery],
    };
  }
  if (ports.head !== input?.localHeadSha) {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure(issue, 'worktree')],
      observations: [body, delivery],
    };
  }
  let protocol;
  let projection = null;
  try {
    protocol = selectEvidenceProtocol({ body: body.value.body, context: value.executionContext });
  } catch {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure(issue)],
      observations: [body, delivery],
    };
  }
  if (protocol.protocol === 'v2') {
    return {
      status: 'indeterminate',
      blockers: [
        {
          guardId: 'action-navigation',
          code: 'action-not-explain-ready',
          args: {},
          noAutomaticRemediation: { reason: 'action-not-explain-ready' },
        },
      ],
      observations: [body, delivery],
    };
  }
  if (!Array.isArray(value.comments)) {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure(issue)],
      observations: [body, delivery],
    };
  }
  const selected = input?.pullRequests?.length === 1 ? input.pullRequests[0] : null;
  const merged = selected?.merged === true || selected?.state === 'MERGED';
  const noCommit =
    input?.pullRequests?.length === 0 && isIssueResidentDeliveryKind(input?.issue?.body);
  if (
    merged &&
    input.localHeadSha !== input.acceptedReviewSha &&
    selected.headRefOid === input.acceptedReviewSha &&
    input.testReceiptSha === input.acceptedReviewSha
  ) {
    return {
      status: 'indeterminate',
      blockers: [
        {
          guardId: 'action-navigation',
          code: 'action-not-explain-ready',
          args: {},
          noAutomaticRemediation: { reason: 'action-not-explain-ready' },
        },
      ],
      observations: [body, delivery],
    };
  }
  let noCommitProjection = null;
  try {
    if (noCommit) {
      noCommitProjection = projectNoCommitDeliveryRecords(
        value.comments.map(parseNoCommitDeliveryComment).filter(Boolean)
      );
    } else if (selected) {
      projection = projectDeliveryRecords(
        value.comments
          .map((comment) =>
            parseDeliveryCommentForPullRequest(comment, {
              repository: input.config.repo,
              issueNumber: issue,
              prNumber: selected.number,
            })
          )
          .filter(Boolean)
      );
    }
  } catch {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure(issue)],
      observations: [body, delivery],
    };
  }
  if (merged) {
    const proof = value.mergedProof;
    if (proof?.status !== 'verified') {
      return proof?.status === 'refused'
        ? {
            status: 'blocked',
            blockers: [
              {
                guardId: 'authority-collection',
                code: 'delivery-merged-verification-refused',
                args: { category: proof.category },
                noAutomaticRemediation: { reason: 'authority-investigation-required' },
              },
            ],
            observations: [body, delivery],
          }
        : {
            status: 'indeterminate',
            blockers: [
              {
                guardId: 'action-navigation',
                code: 'action-not-explain-ready',
                args: {},
                noAutomaticRemediation: { reason: 'action-not-explain-ready' },
              },
            ],
            observations: [body, delivery],
          };
    }
    if (
      proof.expectedHeadSha !== input.acceptedReviewSha ||
      proof.mergeCommitSha !== (selected.mergeCommitSha ?? selected.mergeCommit?.oid) ||
      !/^[0-9a-f]{40}$/.test(proof.trunkHeadSha)
    ) {
      return {
        status: 'indeterminate',
        blockers: [authorityFailure(issue)],
        observations: [body, delivery],
      };
    }
  }
  if (!merged && !noCommit && value?.providerActionAvailable === false) {
    return {
      status: 'blocked',
      blockers: [
        {
          guardId: 'authority-collection',
          code: 'delivery-provider-unavailable',
          args: {},
          noAutomaticRemediation: { reason: 'action-not-explain-ready' },
        },
      ],
      observations: [body, delivery],
    };
  }
  if (!merged && !noCommit && value?.providerActionAvailable !== true) {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure(issue)],
      observations: [body, delivery],
    };
  }
  try {
    if (noCommit) {
      const preflight = validateNoCommitDeliveryPreflight(input);
      const existing = noCommitProjection?.record?.record;
      if (
        existing &&
        !sameNoCommitDeliveryAuthority(existing, {
          repository: input.config.repo,
          issueNumber: issue,
          issueKind: parseIssueKind(input.issue.body),
          deliverableUrl: preflight.deliverable.url,
          acceptedSha: preflight.acceptedSha,
        })
      ) {
        return {
          status: 'blocked',
          blockers: [
            {
              guardId: 'authority-collection',
              code: 'delivery-record-conflict',
              args: {},
              noAutomaticRemediation: { reason: 'authority-investigation-required' },
            },
          ],
          observations: [body, delivery],
        };
      }
      return { status: 'ready', blockers: [], observations: [body, delivery] };
    }
    const preflight = merged
      ? validateMergedDeliveryPreflight(input)
      : validateDeliveryPreflight(input);
    if (!merged && projection?.matchingReceipt) {
      return {
        status: 'blocked',
        blockers: [
          {
            guardId: 'authority-collection',
            code: 'delivery-record-conflict',
            args: {},
            noAutomaticRemediation: { reason: 'authority-investigation-required' },
          },
        ],
        observations: [body, delivery],
      };
    }
    if (preflight.expectedHeadSha !== value.preflightInput.localHeadSha) {
      throw new TypeError('delivery-readiness:head');
    }
    const live = projection?.liveIntent?.record;
    if (live && live.expectedHeadSha === preflight.expectedHeadSha) {
      const expected = buildDeliveryIntent({
        intentId: live.intentId,
        supersedesIntentId: live.supersedesIntentId,
        issueNumber: issue,
        repository: input.config.repo,
        prNumber: preflight.pr.number,
        baseRef: preflight.pr.baseRefName,
        headRef: preflight.pr.headRefName,
        expectedHeadSha: preflight.expectedHeadSha,
        mergeMethod: preflight.mergeMethod,
        attributionTokens: preflight.commitText.attributionTokens,
        commitTitle:
          merged && live.provider === 'external'
            ? live.commitTitle
            : preflight.commitText.commitTitle,
        commitMessage:
          merged && live.provider === 'external'
            ? live.commitMessage
            : preflight.commitText.commitMessage,
        provider: live.provider,
        sessionId: live.sessionId,
        clientCreatedAt: live.clientCreatedAt,
      });
      if (authorizedIntentBytes(expected) !== authorizedIntentBytes(live)) {
        return {
          status: 'blocked',
          blockers: [
            {
              guardId: 'authority-collection',
              code: 'delivery-intent-divergence',
              args: {},
              noAutomaticRemediation: { reason: 'authority-investigation-required' },
            },
          ],
          observations: [body, delivery],
        };
      }
    }
    const manual = value.manualReviewDecision;
    if (manual?.status === 'refused') {
      return {
        status: 'blocked',
        blockers: [
          {
            guardId: 'authority-collection',
            code: 'delivery-manual-review-refused',
            args: { reason: manual.reason },
            noAutomaticRemediation: { reason: 'authority-investigation-required' },
          },
        ],
        observations: [body, delivery],
      };
    }
    if (manual?.status === 'request-review' || manual?.status === 'awaiting-review') {
      return {
        status: 'blocked',
        blockers: [
          {
            guardId: 'authority-collection',
            code: 'delivery-manual-review-required',
            args: { head: preflight.expectedHeadSha, prNumber: preflight.pr.number },
            noAutomaticRemediation: { reason: 'action-not-explain-ready' },
          },
        ],
        observations: [body, delivery],
      };
    }
    if (manual?.status !== 'authorized') {
      return {
        status: 'indeterminate',
        blockers: [authorityFailure(issue)],
        observations: [body, delivery],
      };
    }
  } catch (error) {
    if (error instanceof DeliveryPreflightError && error.category !== 'input') {
      return {
        status: 'blocked',
        blockers: [
          {
            guardId: 'authority-collection',
            code: 'delivery-preflight-refused',
            args: { category: error.category },
            noAutomaticRemediation: { reason: 'authority-investigation-required' },
          },
        ],
        observations: [body, delivery],
      };
    }
    return {
      status: 'indeterminate',
      blockers: [authorityFailure(issue)],
      observations: [body, delivery],
    };
  }
  return {
    status: 'ready',
    blockers: [],
    warnings: (value.mergedProof?.metadataWarnings ?? []).map((reason) => ({
      code: 'delivery-metadata-warning',
      args: { reason },
    })),
    observations: [body, delivery],
  };
}

/** Production entry: build one fresh, read-only delivery observation from existing dependency ports. */
export async function evaluateDeliveryReadiness({
  issue,
  cfg,
  projectDir,
  state,
  deps,
  now = () => new Date().toISOString(),
} = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('delivery-readiness:issue');
  if (!cfg?.repo || typeof projectDir !== 'string' || !deps) {
    throw new TypeError('delivery-readiness:configuration');
  }
  let observedIssue;
  let body = '';
  let initialFailure = null;
  try {
    observedIssue = await deps.fetchIssue({ issueNumber: issue, repository: cfg.repo });
    body = observedIssue?.body;
    computeScopeIdentity({ repository: cfg.repo, issue, body });
  } catch (error) {
    initialFailure = error;
  }
  let head;
  try {
    head = await deps.getLocalHeadSha();
  } catch (error) {
    initialFailure ??= error;
    head = '0'.repeat(40);
  }
  const read = async (request) => {
    if (initialFailure) throw initialFailure;
    if (request.resource === 'issue-body') {
      observedIssue = await deps.fetchIssue({ issueNumber: issue, repository: cfg.repo });
      return { ...request, value: { number: issue, body: observedIssue.body } };
    }
    if (request.resource !== 'delivery') {
      throw new TypeError(`delivery-readiness:source:${request.resource}`);
    }
    const lineage = await deps.resolveLineage({
      issueNumber: issue,
      repository: cfg.repo,
      issue: observedIssue,
    });
    const branch = await deps.getCurrentBranch();
    const references = await deps.listPullRequests({ repository: cfg.repo, headRef: branch });
    const pullRequests = await Promise.all(
      references.map(({ number }) =>
        deps.fetchPullRequest({ repository: cfg.repo, prNumber: Number(number) })
      )
    );
    const localHeadSha = await deps.getLocalHeadSha();
    const testReceiptSha = await deps.resolveTestReceiptSha({
      issue: observedIssue,
      issueNumber: issue,
    });
    const reviewAuthority = await resolveLiveDeliveryReviewAuthority({
      deps,
      cfg,
      issue: observedIssue,
      issueNumber: issue,
      testReceiptSha,
    });
    const acceptedReviewSha = reviewAuthority.acceptedSha;
    const selected = pullRequests.length === 1 ? pullRequests[0] : null;
    const noCommit = pullRequests.length === 0 && isIssueResidentDeliveryKind(observedIssue.body);
    const [repositoryMergeMethods, dirtyPaths] = noCommit
      ? [[], []]
      : await Promise.all([
          deps.fetchRepositoryMergeMethods({ repository: cfg.repo }),
          deps.listDirtyPaths({ issueNumber: issue }),
        ]);
    const reviewAuthorization = await deps.resolveReviewAuthorization({
      issue: observedIssue,
      issueNumber: issue,
      expectedHeadSha: acceptedReviewSha,
      acceptedReviewSha,
    });
    const assignee =
      typeof cfg.assignee === 'string' && cfg.assignee !== '@me' && cfg.assignee.length > 0
        ? cfg.assignee
        : await deps.getAuthenticatedLogin();
    const checks = selected
      ? await deps.fetchRequiredChecks({
          repository: cfg.repo,
          prNumber: selected.number,
          expectedHeadSha: acceptedReviewSha,
        })
      : { readable: false, required: [] };
    const commitSubjects = noCommit
      ? []
      : selected?.state === 'MERGED' || selected?.merged === true
        ? await mergedSourceCommitSubjects(selected, deps.inspectSourceCommit)
        : await openSourceCommitSubjects(
            await deps.listCommitSubjects({ range: 'origin/trunk..HEAD' }),
            selected,
            deps.inspectSourceCommit
          );
    const comments = await deps.listIssueComments({ issueNumber: issue, repository: cfg.repo });
    let manualReviewDecision = { status: 'authorized' };
    if (selected && (await deps.resolvePullRequestReviewGate()) === true) {
      const reviewerLogin = await deps.resolveManualCodeReviewer({
        configuredReviewer: cfg.manualCodeReviewer,
      });
      const evidence = await deps.fetchManualCodeReviewEvidence({
        repository: cfg.repo,
        prNumber: selected.number,
        expectedHeadSha: acceptedReviewSha,
      });
      manualReviewDecision = evaluateManualCodeReview({
        gateEnabled: true,
        expectedHeadSha: acceptedReviewSha,
        reviewerLogin,
        pullRequest: evidence,
      });
    }
    const preflightInput = {
      issue: {
        ...observedIssue,
        agentReviewPassed: reviewAuthority.outcome === 'passed',
        reviewAuthority,
        reviewAuthorization,
      },
      binding: {
        issueNumber: Number(String(state?.active || '').replace(/^#/, '')),
        branch,
        timerState: state?.entryStartTs ? 'running' : 'paused',
      },
      lineage,
      pullRequests,
      localHeadSha,
      testReceiptSha,
      acceptedReviewSha,
      checks,
      dirtyPaths,
      config: { ...cfg, assignee, repositoryMergeMethods },
      commitSubjects,
    };
    const merged = selected?.state === 'MERGED' || selected?.merged === true;
    const mergedProof =
      merged && Array.isArray(comments)
        ? await readOnlyMergedProof({ issue, preflightInput, comments, deps })
        : null;
    return {
      ...request,
      value: {
        preflightInput,
        providerActionAvailable: deps.providerActionAvailable,
        manualReviewDecision,
        comments,
        mergedProof,
        ...(deps.executionContext ? { executionContext: deps.executionContext } : {}),
      },
    };
  };
  const attempt = createObservationAttempt({
    repository: cfg.repo,
    issue,
    boundaryId: `action:deliver:${issue}`,
    now,
    read,
  });
  const { evaluateAction } = await import('./evaluate.mjs');
  return evaluateAction({
    actionId: 'deliver',
    repository: cfg.repo,
    issue,
    inputs: { state: 'review', head, body, config: cfg },
    attempt,
    deps: { effectAttempts: () => [] },
  });
}
