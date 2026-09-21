// @story #1667
// Review explanation collects authority but never persists normalization or runs a reviewer.
import { createHash } from 'node:crypto';
import { readLastKnownState } from '../../gh-timing-comment.mjs';
import { pexec } from '../../../gh/lib/gh-client.mjs';
import { statePath } from '../../paths.mjs';
import { loadState } from '../../state.mjs';
import { fetchAssignmentSnapshot } from '../assignment-snapshot.mjs';
import { projectFunctionalDod } from '../functional-dod-project.mjs';
import { runGuards } from '../guard-registry.mjs';
import { resolveProjectDir } from '../project-dir.mjs';
import { runReviewPreflight } from '../review-preflight.mjs';
import { readWorktreeIdentity } from '../worktree-binding-guard.mjs';
import { reviewAgentValidationAction } from '../resident-actions/review-agent-validation.mjs';
import { readResidentActionLedger } from '../resident-action-ledger-read.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { parseEntryMarkers } from '../stage-entry-markers.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import {
  createGithubWorkflowBoundaryRuntime,
  loadWorkflowBoundary,
} from '../workflow-policy/enforcement.mjs';
import { evaluateCompleteGuards } from './evaluate.mjs';
import { createObservationAttempt } from './observations.mjs';

const HEAD = /^[a-f0-9]{40,64}$/;
const REVIEW_EVIDENCE_REASONS = new Set([
  'directory-test-evidence-missing',
  'receipt-malformed',
  'head-unresolvable',
  'fingerprint-unresolvable',
  'test-started-sha-mismatch',
  'dod-verified-sha-mismatch',
  'stage-mismatch',
  'issue-mismatch',
  'sha-mismatch',
  'vc-set-mismatch',
  'node-major-mismatch',
  'platform-mismatch',
  'lockfile-mismatch',
  'config-mismatch',
  'sandbox-dirty',
  'command-identity-mismatch',
  'command-missing',
  'command-duplicate',
  'command-red',
]);
const authorityFailure = (source, issue, reason = 'invalid') => ({
  guardId: 'authority-collection',
  code: 'authority-read-failed',
  args: { source, reason, subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});
const drift = () => ({
  guardId: 'action-navigation',
  code: 'state-unavailable',
  args: { reason: 'conflicting' },
  noAutomaticRemediation: { reason: 'state-investigation-required' },
});
const fromGuard = (refusal) => ({
  guardId: refusal.guardId ?? refusal.id,
  code: refusal.code,
  args: refusal.args ?? {},
  ...(refusal.remediation
    ? { remediation: refusal.remediation }
    : {
        noAutomaticRemediation: refusal.noAutomaticRemediation ?? {
          reason: 'legacy-guard-requires-human-investigation',
        },
      }),
});

function preflightCategory(reason) {
  if (/tracked worktree changes/.test(reason)) return 'worktree-dirty';
  if (/canonical.*Commits|commit-attribution|no commit message references/.test(reason))
    return 'commit-trail';
  if (/lifecycle-source|test.evidence|receipt/.test(reason)) return 'test-evidence';
  if (/child|derived trail|citation/.test(reason)) return 'epic-child';
  if (/acceptance criterion|evidence command/.test(reason)) return 'acceptance-evidence';
  if (/deliverable-posted/.test(reason)) return 'deliverable';
  return null;
}

export async function readReviewLedgerComment({ repository, commentId, run = pexec } = {}) {
  if (!/^[1-9]\d*$/.test(String(commentId))) throw new TypeError('review-ledger:comment-id');
  const { stdout } = await run('gh', ['api', `repos/${repository}/issues/comments/${commentId}`]);
  const comment = JSON.parse(stdout);
  if (String(comment.id) !== String(commentId) || typeof comment.body !== 'string') {
    throw new TypeError('review-ledger:comment-identity');
  }
  return { id: String(comment.id), body: comment.body };
}

/** The complete Test→Review registry and workflow-policy evaluation used by explanation and both verbs. */
export function evaluateProjectedReviewGuards({ context, runGuards: run, loadPolicy } = {}) {
  return evaluateCompleteGuards({
    fromState: 'test',
    toState: 'review',
    context: { ...context, fromState: 'test', toState: 'review' },
    runGuards: run,
    loadPolicy,
  });
}

/** Production reader: each invocation creates a fresh command-boundary attempt. */
export async function evaluateReviewReadiness({
  issue,
  cfg,
  projectDir,
  deps = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('review-readiness:issue');
  if (!cfg?.repo || typeof projectDir !== 'string') throw new TypeError('review-readiness:config');
  const readBody =
    deps.readBody ??
    (async () =>
      (
        await pexec('gh', [
          'issue',
          'view',
          String(issue),
          '-R',
          cfg.repo,
          '--json',
          'body',
          '--jq',
          '.body',
        ])
      ).stdout);
  const readHead =
    deps.readHead ??
    (async () => (await pexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir })).stdout.trim());
  let body;
  let head;
  try {
    body = await readBody();
    head = await readHead();
  } catch {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure('issue-body', issue, 'unavailable')],
      observations: [],
    };
  }
  const fromState = readLastKnownState(body).state;
  if (!['test', 'review'].includes(fromState)) {
    return { status: 'indeterminate', blockers: [drift()], observations: [] };
  }
  const scope = computeScopeIdentity({ repository: cfg.repo, issue, body });
  const read = async (request) => {
    let value;
    switch (request.resource) {
      case 'issue-body':
        value = { number: issue, body: await readBody() };
        break;
      case 'project-board':
        value = await (deps.fetchBoard ?? fetchAssignmentSnapshot)({ issueNumber: issue, cfg });
        break;
      case 'worktree': {
        if (deps.readWorktree) {
          value = await deps.readWorktree();
        } else {
          const boundDir = (deps.resolveBoundDir ?? resolveProjectDir)({ issue, deps });
          value = {
            matches:
              readWorktreeIdentity({ projectDir }).worktreePath ===
              readWorktreeIdentity({ projectDir: boundDir }).worktreePath,
            headSha: await readHead(),
          };
        }
        break;
      }
      case 'session-state':
        value = await (deps.readSessionState ?? (() => loadState(statePath(projectDir))))();
        break;
      case 'delivery':
        if (request.identity === `evidence:${issue}:3`) {
          const visit = parseEntryMarkers(body)
            .filter(({ stage }) => stage === 'review')
            .at(-1);
          value = {
            ledger: await (deps.readResidentLedger ?? readResidentActionLedger)({
              body,
              stateVisitId: visit ? `review:${visit.visit}:${visit.ts}` : 'legacy:review:1',
              actionId: 'review-agent-validation',
              readComment:
                deps.readLedgerComment ??
                ((commentId) => readReviewLedgerComment({ repository: cfg.repo, commentId })),
              rereadBody: readBody,
            }),
          };
        } else {
          const resolveEvidence =
            deps.resolveReviewEvidence ??
            (await import('../../verbs/review.mjs')).resolveReviewVerificationEvidence;
          const reviewEvidence = await resolveEvidence({
            body,
            issueNumber: issue,
            repository: cfg.repo,
            projectDir,
            getHeadSha: async () => readHead(),
          });
          value = {
            preflight: await (deps.runPreflight ?? runReviewPreflight)({
              issueNumber: issue,
              repo: cfg.repo,
              projectDir,
              cfg,
            }),
            reviewEvidence: {
              ok: reviewEvidence?.ok,
              mode: reviewEvidence?.mode,
              reasons: reviewEvidence?.reasons,
              lifecycleEvidence: reviewEvidence?.lifecycleEvidence ?? null,
            },
          };
        }
        break;
      case 'workflow-policy': {
        const policy = await (deps.loadWorkflowBoundary ?? loadWorkflowBoundary)({
          repository: cfg.repo,
          issue,
          body,
          requirementIds: ['review.semantic-resident'],
          activity: 'semantic-review:resident',
          state: 'review',
          now: now(),
          runtime:
            deps.workflowPolicyRuntime ??
            createGithubWorkflowBoundaryRuntime({ repository: cfg.repo }),
        });
        value = {
          status: policy?.status ?? 'indeterminate',
          scopeIdentity: policy?.scopeIdentity ?? null,
          exceptionStatus: policy?.exceptionStatus ?? null,
          outcome: policy?.isWaived?.('review.semantic-resident')
            ? 'waived'
            : (policy?.decision?.('review.semantic-resident')?.outcome ?? 'missing'),
          authority: policy?.decision?.('review.semantic-resident')?.authority ?? null,
        };
        break;
      }
      default:
        throw new TypeError(`review-readiness:unsupported-source:${request.resource}`);
    }
    return { ...request, value };
  };
  const attempt = createObservationAttempt({
    repository: cfg.repo,
    issue,
    boundaryId: `action:review:${issue}`,
    now,
    read,
  });
  const verifyResident =
    deps.verifyResident ??
    (async ({ body: residentBody, head: residentHead }) => {
      const observation = await attempt.observe({
        resource: 'workflow-policy',
        identity: `evidence:${issue}:2`,
        scope,
      });
      if (observation.status !== 'observed' || observation.value.status === 'indeterminate') {
        return { status: 'paused', reason: 'review-policy-unavailable' };
      }
      const ledgerObservation = await attempt.observe({
        resource: 'delivery',
        identity: `evidence:${issue}:3`,
        scope,
      });
      const ledger =
        ledgerObservation.status === 'observed' ? ledgerObservation.value.ledger : null;
      if (ledger?.status !== 'clean' || !['empty', 'current'].includes(ledger.visitStatus)) {
        return { status: 'paused', reason: 'review-ledger-unavailable' };
      }
      return reviewAgentValidationAction.verify(
        {
          now,
          review: {
            repo: cfg.repo,
            loadWorkflowBoundary: deps.loadWorkflowBoundary ?? loadWorkflowBoundary,
            workflowPolicyRuntime: deps.workflowPolicyRuntime,
            readComments:
              deps.readReviewComments ??
              (async () => {
                const { stdout } = await pexec('gh', [
                  'api',
                  '--paginate',
                  '--slurp',
                  `repos/${cfg.repo}/issues/${issue}/comments`,
                ]);
                return JSON.parse(stdout)
                  .flat()
                  .map(({ id, body: commentBody }) => ({ id: String(id), body: commentBody }));
              }),
          },
        },
        {
          issue: { value: issue },
          body: { value: residentBody },
          headSha: { value: residentHead },
          actionLedger: ledger,
        }
      );
    });
  const result = await collectReviewReadiness({
    issue,
    fromState,
    body,
    head,
    attempt,
    ports: {
      scope,
      cfg,
      projectDir,
      evaluatedAt: now(),
      runGuards: deps.runGuards ?? runGuards,
      verifyResident,
      loadPolicy: async ({ requirementIds }) =>
        (deps.loadWorkflowBoundary ?? loadWorkflowBoundary)({
          repository: cfg.repo,
          issue,
          body,
          requirementIds,
          activity: 'workflow-transition:review',
          state: fromState,
          now: now(),
          runtime:
            deps.workflowPolicyRuntime ??
            createGithubWorkflowBoundaryRuntime({ repository: cfg.repo }),
        }),
    },
  });
  return {
    ...result,
    bundle: attempt.finish({
      normalizationInputs: (result.normalizations ?? []).map(({ normalizerId, inputDigest }) => ({
        normalizerId,
        inputDigest,
      })),
    }),
  };
}

/** Shared, command-local Review collection for direct Review and Test-state Promote. */
export async function collectReviewReadiness({
  issue,
  fromState,
  body,
  head,
  attempt,
  ports = {},
} = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('review-readiness:issue');
  if (!['test', 'review'].includes(fromState)) throw new TypeError('review-readiness:state');
  if (typeof ports.scope !== 'string' || !ports.scope)
    throw new TypeError('review-readiness:scope');
  if (typeof attempt?.observe !== 'function') throw new TypeError('review-readiness:attempt');

  const observations = [];
  const blockers = [];
  for (const [resource, identity] of [
    ['issue-body', `issue:${issue}:1`],
    ['project-board', `issue:${issue}:2`],
    ['worktree', `worktree:${issue}`],
    ['session-state', `session-state:${issue}`],
    ['delivery', `evidence:${issue}:1`],
  ]) {
    const observation = await attempt.observe({ resource, identity, scope: ports.scope });
    observations.push(observation);
    if (observation.status !== 'observed') {
      blockers.push(observation.cause ?? authorityFailure(resource, issue));
    }
  }
  if (blockers.length > 0) return { status: 'indeterminate', blockers, observations };
  const [issueBody, board, worktree, session, delivery] = observations.map(({ value }) => value);
  if (
    issueBody?.number !== issue ||
    issueBody.body !== body ||
    readLastKnownState(body).state !== fromState ||
    board?.state !== fromState
  ) {
    return { status: 'indeterminate', blockers: [drift()], observations };
  }
  if (!HEAD.test(head ?? '') || worktree?.headSha !== head || worktree?.matches !== true) {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure('worktree', issue)],
      observations,
    };
  }
  if (String(session?.active ?? '').replace(/^#/, '') !== String(issue)) {
    return {
      status: 'blocked',
      blockers: [
        {
          guardId: 'authority-collection',
          code: 'session-bind-mismatch',
          args: {},
          noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
        },
      ],
      observations,
    };
  }
  const preflight = delivery?.preflight;
  const reviewEvidence = delivery?.reviewEvidence;
  if (
    typeof preflight?.ok !== 'boolean' ||
    !Array.isArray(preflight?.reasons) ||
    preflight.reasons.some((reason) => typeof reason !== 'string' || !reason) ||
    (preflight.ok && preflight.reasons.length > 0) ||
    preflight.headSha !== head ||
    preflight.bodyDigest !== `sha256:${createHash('sha256').update(body).digest('hex')}`
  ) {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure('delivery', issue)],
      observations,
    };
  }
  let preflightBlockers = [];
  let preflightIndeterminate = false;
  if (!preflight.ok) {
    const categories = preflight.reasons.map(preflightCategory);
    if (categories.length > 0 && categories.every(Boolean)) {
      preflightBlockers = categories.map((category) => ({
        guardId: 'authority-collection',
        code: 'review-preflight-refused',
        args: { category },
        noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
      }));
    } else {
      preflightBlockers = [authorityFailure('delivery', issue, 'incomplete')];
      preflightIndeterminate = true;
    }
  }

  if (fromState === 'test') {
    if (
      typeof reviewEvidence?.ok !== 'boolean' ||
      !Array.isArray(reviewEvidence.reasons) ||
      !['receipt-v1', 'legacy-marker', 'github-records-v1'].includes(reviewEvidence.mode) ||
      (reviewEvidence.ok && reviewEvidence.reasons.length > 0)
    ) {
      return {
        status: 'indeterminate',
        blockers: [authorityFailure('delivery', issue, 'incomplete')],
        observations,
      };
    }
    if (!reviewEvidence.ok) {
      if (
        reviewEvidence.reasons.length === 0 ||
        reviewEvidence.reasons.some(({ code }) => !REVIEW_EVIDENCE_REASONS.has(code))
      ) {
        return {
          status: 'indeterminate',
          blockers: [authorityFailure('delivery', issue, 'incomplete')],
          observations,
        };
      }
      preflightBlockers.push(
        ...reviewEvidence.reasons.map(({ code }) => ({
          guardId: 'authority-collection',
          code: 'review-test-evidence-refused',
          args: { reason: code },
          noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
        }))
      );
    }
    if (
      reviewEvidence.mode === 'github-records-v1' &&
      canonicalRecordJson(reviewEvidence.lifecycleEvidence ?? null) !==
        canonicalRecordJson(preflight.lifecycleEvidence ?? null)
    ) {
      return {
        status: 'indeterminate',
        blockers: [authorityFailure('delivery', issue, 'invalid')],
        observations,
      };
    }
  }

  if (fromState === 'review') {
    if (preflightBlockers.length > 0) {
      return {
        status: preflightIndeterminate ? 'indeterminate' : 'blocked',
        blockers: preflightBlockers,
        observations,
      };
    }
    if (typeof ports.verifyResident !== 'function') {
      return {
        status: 'indeterminate',
        blockers: [authorityFailure('delivery', issue, 'incomplete')],
        observations,
      };
    }
    let resident;
    try {
      resident = await ports.verifyResident({ issue, body, head, delivery });
    } catch {
      resident = { status: 'paused', reason: 'review-resident-unavailable' };
    }
    if (resident?.status === 'incomplete') {
      return {
        status: 'ready',
        blockers: [],
        observations,
        normalizations: [],
        selectedAction: 'review',
      };
    }
    if (resident?.status === 'complete' || resident?.status === 'waived') {
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
        observations,
        selectedAction: 'close',
      };
    }
    return {
      status: 'indeterminate',
      blockers: [
        authorityFailure(
          resident?.reason?.startsWith('review-policy-') ? 'workflow-policy' : 'delivery',
          issue,
          'incomplete'
        ),
      ],
      observations,
    };
  }

  if (typeof ports.runGuards !== 'function') {
    return {
      status: 'indeterminate',
      blockers: [authorityFailure('local-config', issue, 'incomplete')],
      observations,
    };
  }
  const projection = projectFunctionalDod({
    body,
    head,
    evaluatedAt: ports.evaluatedAt ?? '1970-01-01T00:00:00.000Z',
  });
  const { guardResult } = await evaluateProjectedReviewGuards({
    context: {
      issueNumber: issue,
      repo: ports.cfg?.repo,
      projectDir: ports.projectDir,
      body: projection.body,
      lifecycleEvidence: reviewEvidence.lifecycleEvidence ?? preflight.lifecycleEvidence ?? null,
      toState: 'review',
    },
    runGuards: ports.runGuards,
    loadPolicy: ports.loadPolicy,
  });
  return {
    status:
      preflightIndeterminate || guardResult.status === 'indeterminate'
        ? 'indeterminate'
        : preflightBlockers.length > 0 || guardResult.status === 'blocked'
          ? 'blocked'
          : 'ready',
    blockers: [...preflightBlockers, ...guardResult.refusals.map(fromGuard)],
    warnings: (guardResult.warns ?? []).map(({ code, args }) => ({ code, args })),
    normalizations: projection.normalization ? [projection.normalization] : [],
    humanDecision: guardResult.humanDecision,
    observations,
  };
}
