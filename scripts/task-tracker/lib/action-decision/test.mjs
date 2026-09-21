// @story #1666
// Read-only Test-entry observations. An explanation is never an execution grant.
import { readLastKnownState } from '../../gh-timing-comment.mjs';
import { pexec } from '../../../gh/lib/gh-client.mjs';
import { gql } from '../../../gh/lib/github-projects.mjs';
import { statePath } from '../../paths.mjs';
import { loadState } from '../../state.mjs';
import { fetchAssignmentSnapshot } from '../assignment-snapshot.mjs';
import { resolveProjectDir } from '../project-dir.mjs';
import { readWorktreeIdentity } from '../worktree-binding-guard.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import { createObservationAttempt } from './observations.mjs';
import { runGuards } from '../guard-registry.mjs';
import { parseVerificationCommands } from '../verification-commands.mjs';
import {
  isPolicyShapeVerificationRejection,
  validateVerificationCommand,
} from '../verification-allowlist.mjs';
import { hasMalformedVerificationReceiptClaim } from '../verification-receipt.mjs';
import { resolveVerificationProvider } from '../verification-provider-registry.mjs';
import { sessionNetworkSkipped } from '../verb-preflight.mjs';
import { locateAuthoritySource } from '../github-records/authority-locator.mjs';
import { hasAcceptedTestEvidence } from '../github-records/lifecycle-gate-source.mjs';
import { resolveLifecycleGateEvidence } from '../github-records/lifecycle-gate-source.mjs';
import {
  createGithubWorkflowBoundaryRuntime,
  loadWorkflowBoundary,
} from '../workflow-policy/enforcement.mjs';
import { evaluateCompleteGuards } from './evaluate.mjs';

const HEAD = /^[a-f0-9]{40,64}$/;
const failure = (source, issue, reason = 'invalid') => ({
  guardId: 'authority-collection',
  code: 'authority-read-failed',
  args: { source, reason, subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});
const blocked = (code, args = {}) => ({
  guardId: 'authority-collection',
  code,
  args,
  noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
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

/** The same declaration parsing and command-policy predicates Test execution uses. */
export function inspectTestDeclarations(body, { projectDir = process.cwd() } = {}) {
  const commands = parseVerificationCommands(body);
  const blockers = [];
  const commandAuthority = [];
  if (commands.length === 0) blockers.push(blocked('test-verification-commands-missing'));
  for (const { command } of commands) {
    const validation = validateVerificationCommand(command, { projectDir });
    const accepted = validation.ok || isPolicyShapeVerificationRejection(validation.reason);
    commandAuthority.push({
      command,
      accepted,
      reason: accepted ? null : String(validation.reason || 'invalid'),
    });
    if (!accepted) {
      blockers.push(
        blocked('test-verification-command-invalid', {
          command,
          reason: String(validation.reason || 'invalid'),
        })
      );
    }
  }
  return { commands, commandAuthority, blockers };
}

/** Production read adapter. Each call builds a fresh command-boundary attempt. */
export async function evaluateTestReadiness({
  issue,
  cfg,
  projectDir,
  body,
  head,
  deps = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('test-readiness:issue');
  if (!cfg?.repo || typeof projectDir !== 'string') throw new TypeError('test-readiness:config');
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
  const initialBody = body ?? (await readBody());
  const initialHead = head ?? (await readHead());
  const fromState = readLastKnownState(initialBody).state;
  if (!['develop', 'test'].includes(fromState)) {
    return { status: 'indeterminate', blockers: [drift()], observations: [] };
  }
  const scope = computeScopeIdentity({ repository: cfg.repo, issue, body: initialBody });
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
        const boundDir = (deps.resolveBoundDir ?? resolveProjectDir)({ issue, deps });
        const identity = deps.readWorktreeIdentity ?? readWorktreeIdentity;
        value = {
          matches:
            identity({ projectDir }).worktreePath ===
            identity({ projectDir: boundDir }).worktreePath,
          headSha: await readHead(),
        };
        break;
      }
      case 'session-state':
        value = await (deps.readSessionState ?? (() => loadState(statePath(projectDir))))();
        break;
      case 'delivery':
        value = await (deps.resolveLifecycleEvidence ?? resolveLifecycleGateEvidence)({
          repository: cfg.repo,
          issue,
          // The collector already compared its observed issue body with this
          // snapshot. Resolve directory records against that same body.
          issueBody: initialBody,
          expectedSha: initialHead,
          graphql:
            deps.lifecycleEvidenceDeps?.graphql ??
            (({ query, variables }) => gql(query, variables).then((data) => ({ data }))),
          ...(deps.lifecycleEvidenceDeps ?? {}),
        });
        break;
      default:
        throw new TypeError(`test-readiness:unsupported-source:${request.resource}`);
    }
    return { ...request, value };
  };
  const attempt = createObservationAttempt({
    repository: cfg.repo,
    issue,
    boundaryId: `action:test:${issue}`,
    now,
    read,
  });
  const result = await collectTestReadiness({
    issue,
    fromState,
    body: initialBody,
    head: initialHead,
    attempt,
    ports: {
      scope,
      cfg,
      projectDir,
      deps: deps.guardDeps,
      runGuards: deps.runGuards,
      resolveProvider: deps.resolveProvider,
      verificationProviderDeps: deps.verificationProviderDeps,
      loadPolicy: async ({ requirementIds }) =>
        (deps.loadWorkflowBoundary ?? loadWorkflowBoundary)({
          repository: cfg.repo,
          issue,
          body: initialBody,
          requirementIds,
          activity: 'workflow-transition:test',
          state: fromState,
          now: now(),
          runtime:
            deps.workflowPolicyRuntime ??
            createGithubWorkflowBoundaryRuntime({ repository: cfg.repo }),
        }),
    },
  });
  return { ...result, bundle: attempt.finish() };
}

export async function collectTestReadiness({
  issue,
  fromState,
  body,
  head,
  attempt,
  ports = {},
} = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('test-readiness:issue');
  if (!['develop', 'test', 'review'].includes(fromState))
    throw new TypeError('test-readiness:state');
  if (!attempt || typeof attempt.observe !== 'function')
    throw new TypeError('test-readiness:attempt');
  if (typeof ports.scope !== 'string' || !ports.scope) throw new TypeError('test-readiness:scope');

  let projectDir = ports.projectDir;
  if (projectDir === undefined) {
    try {
      projectDir = (ports.resolveProjectDir ?? resolveProjectDir)({
        issue,
        deps: ports.deps ?? {},
      });
    } catch {
      projectDir = null;
    }
  }
  const projectDirValid = typeof projectDir === 'string' && projectDir.startsWith('/');

  const observations = [];
  const blockers = [];
  if (!projectDirValid) blockers.push(failure('local-config', issue, 'incomplete'));
  if (ports.skipNetwork || sessionNetworkSkipped()) {
    const local = await attempt.observe({
      resource: 'worktree',
      identity: `worktree:${issue}`,
      scope: ports.scope,
    });
    observations.push(local);
    if (local.status !== 'observed') blockers.push(local.cause ?? failure('worktree', issue));
    for (const source of ['issue-body', 'project-board']) {
      blockers.push({
        guardId: 'authority-collection',
        code: 'authority-read-skipped',
        args: { source, subject: { issue } },
        noAutomaticRemediation: { reason: 'authority-investigation-required' },
      });
    }
    return { status: 'indeterminate', blockers, observations };
  }

  for (const [resource, identity] of [
    ['issue-body', `issue:${issue}:1`],
    ['project-board', `issue:${issue}:2`],
    ['worktree', `worktree:${issue}`],
    ['session-state', `session-state:${issue}`],
  ]) {
    const observation = await attempt.observe({ resource, identity, scope: ports.scope });
    observations.push(observation);
    if (observation.status !== 'observed')
      blockers.push(observation.cause ?? failure(resource, issue));
  }
  if (blockers.length > 0) return { status: 'indeterminate', blockers, observations };
  const [issueBody, board, worktree, session] = observations.map(({ value }) => value);
  if (
    issueBody?.number !== issue ||
    issueBody.body !== body ||
    readLastKnownState(body).state !== fromState ||
    board?.state !== fromState
  ) {
    return { status: 'indeterminate', blockers: [drift()], observations };
  }
  if (worktree?.matches !== true) blockers.push(blocked('worktree-mismatch'));
  if (String(session?.active ?? '').replace(/^#/, '') !== String(issue)) {
    blockers.push(blocked('session-bind-mismatch'));
  }
  if (!HEAD.test(head ?? '') || !HEAD.test(worktree?.headSha ?? '')) {
    blockers.push(failure('worktree', issue, 'invalid'));
  } else if (worktree.headSha !== head) {
    blockers.push(blocked('test-head-mismatch', { expected: head, actual: worktree.headSha }));
  }
  let authoritySource;
  try {
    authoritySource = locateAuthoritySource({ issueBody: body });
  } catch {
    blockers.push(blocked('test-directory-evidence-invalid'));
  }
  if (authoritySource?.kind === 'github-records/v1') {
    const evidenceObservation = await attempt.observe({
      resource: 'delivery',
      identity: `evidence:${issue}:1`,
      scope: ports.scope,
    });
    observations.push(evidenceObservation);
    if (evidenceObservation.status !== 'observed') {
      blockers.push(evidenceObservation.cause ?? failure('delivery', issue));
    } else if (
      !hasAcceptedTestEvidence(evidenceObservation.value) ||
      evidenceObservation.value.expectedSha !== head
    ) {
      blockers.push(blocked('test-directory-evidence-invalid'));
    }
    return {
      status: blockers.some(({ code }) => code === 'authority-read-failed')
        ? 'indeterminate'
        : blockers.length
          ? 'blocked'
          : 'ready',
      blockers,
      observations,
    };
  }
  const declarations = inspectTestDeclarations(body, { projectDir });
  blockers.push(...declarations.blockers);
  if (hasMalformedVerificationReceiptClaim(body)) blockers.push(blocked('test-receipt-malformed'));
  if (!ports.cfg || typeof ports.cfg.repo !== 'string') {
    blockers.push(failure('local-config', issue, 'incomplete'));
  } else {
    try {
      (ports.resolveProvider ?? resolveVerificationProvider)({
        config: ports.cfg.verificationProvider,
        projectDir,
        legacyDevelopVerification: ports.cfg.developVerification,
        deps: ports.verificationProviderDeps,
      }).planDevelopFinal();
    } catch (error) {
      blockers.push(blocked('test-provider-invalid', { reason: String(error?.message || error) }));
    }
  }
  if (fromState !== 'develop' || blockers.some(({ code }) => code === 'authority-read-failed'))
    return {
      status: blockers.some(({ code }) => code === 'authority-read-failed')
        ? 'indeterminate'
        : blockers.length
          ? 'blocked'
          : 'ready',
      blockers,
      observations,
    };

  // Test self-runs do not cross the Develop exit again. First entry does, and
  // a missing Develop receipt is runnable resident work rather than proof.
  if (fromState === 'develop') {
    const context = {
      issueNumber: issue,
      repo: ports.cfg.repo,
      fromState,
      toState: 'test',
      cfg: ports.cfg,
      body,
      projectDir,
      headSha: head,
      readOnly: true,
      deps: {
        ...(ports.deps ?? {}),
        reconcileDependencyDisposition: async () => {},
      },
    };
    const { guardResult } = await evaluateCompleteGuards({
      fromState,
      toState: 'test',
      context,
      runGuards: ports.runGuards ?? runGuards,
      loadPolicy:
        ports.loadPolicy ??
        (async ({ requirementIds }) => {
          const policyObservation = await attempt.observe({
            resource: 'workflow-policy',
            identity: `evidence:${issue}:1`,
            scope: ports.scope,
          });
          if (policyObservation.status !== 'observed') {
            return { status: 'indeterminate', cause: policyObservation.cause };
          }
          const policy = policyObservation.value;
          const requested = new Set(requirementIds);
          if (
            policy?.schema !== 'aitm.workflow-boundary-policy/v1' ||
            !['policy-compatible', 'blocked'].includes(policy.status) ||
            policy.repository !== ports.cfg.repo ||
            policy.issue !== issue ||
            policy.scopeIdentity !== ports.scope ||
            !Array.isArray(policy.decisions) ||
            policy.decisions.length !== requested.size ||
            policy.decisions.some(
              (item) =>
                !requested.has(item?.id) ||
                !['satisfied', 'waived', 'missing', 'not-applicable'].includes(item?.outcome)
            ) ||
            new Set(policy.decisions.map(({ id }) => id)).size !== requested.size
          ) {
            return { status: 'indeterminate', cause: failure('workflow-policy', issue) };
          }
          return {
            ...policy,
            decision: (id) => policy.decisions.find((item) => item.id === id) ?? null,
            isWaived: (id) => policy.decisions.find((item) => item.id === id)?.outcome === 'waived',
          };
        }),
    });
    const guardBlockers = guardResult.refusals
      .filter((refusal) => refusal.id !== 'develop-exit-receipt')
      .map(fromGuard);
    const warnings = (guardResult.warns ?? []).map(({ code, args }) => ({ code, args }));
    if (
      !hasMalformedVerificationReceiptClaim(body) &&
      guardResult.refusals.some(({ id }) => id === 'develop-exit-receipt')
    ) {
      warnings.push({ code: 'test-develop-finalization-pending', args: {} });
    }
    if (guardBlockers.length > 0 || blockers.length > 0) {
      const allBlockers = [...blockers, ...guardBlockers];
      return {
        status: allBlockers.some(({ code }) =>
          ['authority-read-failed', 'guard-error', 'guard-result-invalid'].includes(code)
        )
          ? 'indeterminate'
          : 'blocked',
        blockers: allBlockers,
        warnings,
        observations,
      };
    }
    return { status: 'ready', blockers: [], warnings, observations };
  }
  return { status: 'ready', blockers: [], observations };
}
