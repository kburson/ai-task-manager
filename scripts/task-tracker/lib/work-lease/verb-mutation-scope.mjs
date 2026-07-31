import { assertGovernedEffectOperation } from './governed-effect.mjs';

function normalizeIssueId(issueId) {
  const normalized = String(issueId ?? '').replace(/^#/, '');
  if (!/^\d+$/.test(normalized)) {
    throw new TypeError('verb mutation scope requires a numeric issueId');
  }
  return normalized;
}

// Open one lease-authority boundary for a verb's remote mutation phase.
// `continue` lets nested governed writers reuse that exact boundary, but only
// for the same issue and operation. `effect` is for direct remote callbacks.
// Both paths reverify persisted authority immediately before continuing.
export async function withVerbMutationScope(
  { issueId, operation, withGovernedEffect, heartbeat = true } = {},
  callback
) {
  const expectedIssueId = normalizeIssueId(issueId);
  assertGovernedEffectOperation(operation);
  if (typeof withGovernedEffect !== 'function') {
    throw new TypeError('verb mutation scope requires withGovernedEffect');
  }
  if (typeof callback !== 'function') {
    throw new TypeError('verb mutation scope requires a callback');
  }

  return withGovernedEffect(
    { issueId: expectedIssueId, operation, heartbeat },
    async (authority) => {
      if (typeof authority?.reverify !== 'function') {
        throw new TypeError('verb mutation scope requires reverify authority');
      }

      const effect = async (remoteEffect) => {
        if (typeof remoteEffect !== 'function') {
          throw new TypeError('verb mutation scope effect requires a callback');
        }
        await authority.reverify();
        return remoteEffect(authority.leaseContext);
      };

      const continueGovernedEffect = async (options, nestedCallback) => {
        const continuedIssueId = normalizeIssueId(options?.issueId);
        if (continuedIssueId !== expectedIssueId || options?.operation !== operation) {
          throw new TypeError('verb mutation scope continuation does not match issue/operation');
        }
        if (typeof nestedCallback !== 'function') {
          throw new TypeError('verb mutation scope continuation requires a callback');
        }
        await authority.reverify();
        return nestedCallback(
          Object.freeze({
            allowed: true,
            lease: authority.lease,
            leaseContext: authority.leaseContext,
            reverify: authority.reverify,
          })
        );
      };

      return callback(
        Object.freeze({
          issueId: expectedIssueId,
          operation,
          leaseContext: authority.leaseContext,
          effect,
          continue: continueGovernedEffect,
        })
      );
    }
  );
}
