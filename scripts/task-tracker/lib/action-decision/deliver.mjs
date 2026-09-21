// @story #1668
// Delivery explanation observes authority but never performs provider or ledger effects.
import {
  DeliveryPreflightError,
  validateDeliveryPreflight,
  validateMergedDeliveryPreflight,
  validateNoCommitDeliveryPreflight,
} from '../delivery-preflight.mjs';
import { isIssueResidentDeliveryKind } from '../issue-kind.mjs';

const authorityFailure = (issue) => ({
  guardId: 'authority-collection',
  code: 'authority-read-failed',
  args: { source: 'delivery', reason: 'incomplete', subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});

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
      blockers: [body.cause ?? delivery.cause ?? authorityFailure(issue)],
      observations: [body, delivery],
    };
  }
  const value = delivery.value;
  const input = value?.preflightInput;
  const selected = input?.pullRequests?.length === 1 ? input.pullRequests[0] : null;
  const merged = selected?.merged === true || selected?.state === 'MERGED';
  const noCommit =
    input?.pullRequests?.length === 0 && isIssueResidentDeliveryKind(input?.issue?.body);
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
      validateNoCommitDeliveryPreflight(input);
      return { status: 'ready', blockers: [], observations: [body, delivery] };
    }
    const preflight = merged
      ? validateMergedDeliveryPreflight(input)
      : validateDeliveryPreflight(input);
    if (preflight.expectedHeadSha !== value.preflightInput.localHeadSha) {
      throw new TypeError('delivery-readiness:head');
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
  return { status: 'ready', blockers: [], observations: [body, delivery] };
}
