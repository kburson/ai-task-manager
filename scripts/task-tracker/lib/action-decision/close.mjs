// @story #1669
// Advisory close collection: all I/O is confined to command-local observations.
import { readLastKnownState } from '../../gh-timing-comment.mjs';
import { pexec } from '../../../gh/lib/gh-client.mjs';
import { fetchAssignmentSnapshot } from '../assignment-snapshot.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import { projectFunctionalDod } from '../functional-dod-project.mjs';
import {
  requireDeliveryReceipt,
  requireEvidenceV2DeliveryReceipt,
} from '../close-delivery-receipt.mjs';
import { evaluateCompleteGuards, evaluateExactTrunkAttribution } from './evaluate.mjs';
import { createObservationAttempt } from './observations.mjs';

const SHA = /^[a-f0-9]{40,64}$/;
const unavailable = (issue, source, reason = 'incomplete') => ({
  guardId: 'authority-collection',
  code: 'authority-read-failed',
  args: { source, reason, subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});
const legacy = (guardId) => ({
  guardId,
  code: 'unclassified-refusal',
  args: {},
  noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
});
const typed = (refusal) => ({
  guardId: refusal.guardId ?? refusal.id,
  code: refusal.code,
  args: refusal.args ?? {},
  ...(refusal.remediation
    ? { remediation: refusal.remediation }
    : { noAutomaticRemediation: refusal.noAutomaticRemediation }),
});

/** All seven collector fields are present on every return, including missing authority. */
export async function collectCloseReadiness({ issue, attempt, ports = {} } = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('close-readiness:issue');
  if (typeof attempt?.observe !== 'function' || typeof ports.scope !== 'string')
    throw new TypeError('close-readiness:attempt');
  const observations = [];
  const blockers = [];
  let indeterminate = false;
  let warnings = [];
  let normalizations = [];
  let humanDecision = null;
  const fail = (source) => {
    indeterminate = true;
    blockers.push(unavailable(issue, source));
  };
  const read = async (resource, identity) => {
    try {
      const observation = await attempt.observe({ resource, identity, scope: ports.scope });
      observations.push(observation);
      if (observation.status !== 'observed') {
        indeterminate = true;
        blockers.push(observation.cause ?? unavailable(issue, resource));
        return null;
      }
      return observation.value;
    } catch {
      fail(resource);
      return null;
    }
  };
  const bodyValue = await read('issue-body', `issue:${issue}:1`);
  const board = await read('project-board', `issue:${issue}:2`);
  const worktree = await read('worktree', `worktree:${issue}`);
  const delivery = await read('delivery', `evidence:${issue}:1`);
  const attribution = await read('delivery', `evidence:${issue}:2`);
  const children = await read('delivery', `evidence:${issue}:3`);
  const body = bodyValue?.body;
  const head = worktree?.headSha;
  if (bodyValue && (bodyValue.number !== issue || typeof body !== 'string')) fail('issue-body');
  if (
    bodyValue &&
    board &&
    (readLastKnownState(body).state !== 'review' || board.state !== 'review')
  ) {
    indeterminate = true;
    blockers.push({
      guardId: 'action-navigation',
      code: 'state-unavailable',
      args: { reason: 'conflicting' },
      noAutomaticRemediation: { reason: 'state-investigation-required' },
    });
  }
  if (
    worktree &&
    (!SHA.test(head ?? '') || worktree.matches !== true || (ports.head && ports.head !== head))
  )
    fail('worktree');
  if (children && (children.complete !== true || !Array.isArray(children.children)))
    fail('delivery');
  if (attribution) {
    const tip = attribution.tip;
    const target = delivery?.gateInput?.lineage?.deliveryTarget;
    if (
      !['attributed', 'not-attributed'].includes(attribution.status) ||
      tip?.objectComplete !== true ||
      tip.shallow !== false ||
      !SHA.test(tip.sha ?? '') ||
      tip.ref !== `refs/heads/${target}` ||
      !(tip.authority === 'local' || typeof tip.remote === 'string')
    ) {
      indeterminate = true;
      blockers.push({
        guardId: 'authority-collection',
        code: 'attribution-authority-unavailable',
        args: {},
        noAutomaticRemediation: { reason: 'authority-investigation-required' },
      });
    } else if (attribution.status === 'not-attributed')
      blockers.push(legacy('review-exit-close-gates'));
  }
  if (delivery) {
    const input = delivery.gateInput;
    if (
      input?.issueNumber !== issue ||
      input.repository !== ports.cfg?.repo ||
      input.body !== body ||
      !SHA.test(input.acceptedSha ?? '')
    )
      fail('delivery');
    else {
      try {
        if (delivery.mode === 'evidence-v2')
          requireEvidenceV2DeliveryReceipt(delivery.receiptInput);
        else if (delivery.mode === 'ordinary' || delivery.mode === 'no-commit')
          requireDeliveryReceipt(input);
        else fail('delivery'); // Incorporated close has separate human authorization; never infer it.
      } catch (error) {
        if (
          error?.name === 'CloseDeliveryReceiptError' &&
          !['input', 'malformed'].includes(error.category)
        )
          blockers.push(legacy('verb:close'));
        else fail('delivery');
      }
    }
  }
  if (typeof body === 'string' && SHA.test(head ?? '')) {
    const projection = projectFunctionalDod({
      body,
      head,
      evaluatedAt: ports.evaluatedAt ?? new Date().toISOString(),
    });
    normalizations = projection.normalization ? [projection.normalization] : [];
    if (typeof ports.runGuards !== 'function') fail('local-config');
    else {
      const { guardResult } = await evaluateCompleteGuards({
        fromState: 'review',
        toState: 'done',
        context: {
          issueNumber: issue,
          repo: ports.cfg?.repo,
          cfg: ports.cfg,
          projectDir: ports.projectDir,
          body: projection.body,
          fromState: 'review',
          toState: 'done',
          readOnly: true,
          headSha: head,
          delivery,
          attribution,
          children: children?.children,
          lifecycleEvidence: delivery?.lifecycleEvidence ?? null,
          deps: ports.deps ?? {},
        },
        runGuards: ports.runGuards,
        loadPolicy: ports.loadPolicy,
      });
      indeterminate ||= guardResult.status === 'indeterminate';
      blockers.push(...guardResult.refusals.map(typed));
      warnings = (guardResult.warns ?? []).map(({ code, args }) => ({ code, args }));
      humanDecision = guardResult.humanDecision;
    }
  }
  return {
    status: indeterminate ? 'indeterminate' : blockers.length ? 'blocked' : 'ready',
    blockers,
    warnings,
    normalizations,
    humanDecision,
    selectedAction: 'close',
    observations,
  };
}

/**
 * Fresh production boundary. Required injectable readers are deliberately explicit:
 * readWorktree(), readDelivery({issue,body,head}), readChildren({issue,body}),
 * and runReadOnlyGuards(from,to,context). Existing effectful close defaults are
 * never substituted. readDelivery supplies the exact receipt/lineage input;
 * attribution is evaluated here against its declared current target.
 */
export async function evaluateCloseReadiness({
  issue,
  cfg,
  projectDir,
  deps = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!cfg?.repo || typeof projectDir !== 'string')
    throw new TypeError('close-readiness:configuration');
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
  let scope = `close:${issue}`;
  let initialError;
  try {
    body = await readBody();
    head = await readHead();
    scope = computeScopeIdentity({ repository: cfg.repo, issue, body });
  } catch (error) {
    initialError = error;
  }
  let delivery;
  const requireReader = (name) => {
    if (typeof deps[name] !== 'function')
      throw new TypeError(`close-readiness:missing-reader:${name}`);
    return deps[name];
  };
  const attempt = createObservationAttempt({
    repository: cfg.repo,
    issue,
    boundaryId: `action:close:${issue}`,
    now,
    read: async (request) => {
      if (initialError) throw initialError;
      let value;
      if (request.resource === 'issue-body') {
        body = await readBody();
        value = { number: issue, body };
      } else if (request.resource === 'project-board')
        value = await (deps.fetchBoard ?? fetchAssignmentSnapshot)({ issueNumber: issue, cfg });
      else if (request.resource === 'worktree')
        value = await requireReader('readWorktree')({ issue, projectDir });
      else if (request.identity === `evidence:${issue}:1`) {
        delivery = await requireReader('readDelivery')({ issue, body, head, cfg, projectDir });
        value = delivery;
      } else if (request.identity === `evidence:${issue}:2`) {
        const target = delivery?.gateInput?.lineage?.deliveryTarget;
        if (typeof target !== 'string') throw new TypeError('close-readiness:target');
        value = await evaluateExactTrunkAttribution({
          issue,
          cwd: projectDir,
          ...(delivery.authority?.localRef
            ? { localRef: delivery.authority.localRef }
            : { remote: delivery.authority?.remote ?? 'origin', ref: `refs/heads/${target}` }),
          execGit: deps.execGit ?? ((args, options) => pexec('git', args, options)),
          ...(deps.hasAttributingCommit ? { hasAttributingCommit: deps.hasAttributingCommit } : {}),
        });
      } else if (request.identity === `evidence:${issue}:3`)
        value = await requireReader('readChildren')({ issue, body, cfg });
      else throw new TypeError('close-readiness:source');
      return { ...request, value };
    },
  });
  const result = await collectCloseReadiness({
    issue,
    attempt,
    ports: {
      scope,
      cfg,
      head,
      projectDir,
      evaluatedAt: now(),
      runGuards: deps.runReadOnlyGuards,
      loadPolicy: deps.loadPolicy,
      deps: deps.guardDeps,
    },
  });
  return {
    ...result,
    bundle: attempt.finish({
      normalizationInputs: result.normalizations.map(({ normalizerId, inputDigest }) => ({
        normalizerId,
        inputDigest,
      })),
    }),
  };
}
