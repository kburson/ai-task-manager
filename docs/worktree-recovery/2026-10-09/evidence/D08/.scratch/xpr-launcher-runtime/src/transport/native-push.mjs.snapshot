import { renderCommand } from '../cli/help-data.mjs';
import { AprError } from '../errors.mjs';
import { validateResidentLease } from './resident.mjs';

const OFFICIAL = Object.freeze({
  'codex-app': Object.freeze({ host: 'codex' }),
});

function unavailable(message, details = {}) {
  throw new AprError('APR_TRANSPORT_UNAVAILABLE', message, {
    recovery: 'Use manual transport or a documented official native-push adapter.',
    details,
  });
}

function pending(invitation, platform) {
  return Object.freeze({
    schema: 'ai-peer-review.delivery/v1',
    status: 'delivery-pending',
    transport: 'native-push',
    reason: 'native-push-failed',
    manual: Object.freeze({
      available: true,
      command: renderCommand(['peer-review', 'join', invitation], { platform }),
    }),
  });
}

function wakeDispatchInput(validated, input) {
  return {
    opaque_handle: validated.opaque_handle,
    operation_id: input.operation_id,
    capsule_text: input.capsule_text,
    capsule_digest: input.capsule_digest,
    expected_revision: input.expected_revision,
    target_role: input.target_role,
    target_session_fingerprint: input.target_session_fingerprint,
  };
}

function wakeReconcileInput(validated, input) {
  return {
    opaque_handle: validated.opaque_handle,
    operation_id: input.operation_id,
    capsule_digest: input.capsule_digest,
    expected_revision: input.expected_revision,
    target_role: input.target_role,
    target_session_fingerprint: input.target_session_fingerprint,
  };
}

export function createNativePushTransport({
  adapter,
  lease,
  dispatch,
  reconcile,
  now = Date.now(),
} = {}) {
  const official = OFFICIAL[adapter];
  if (!official || typeof dispatch !== 'function') {
    unavailable('Native-push adapter is not a documented official integration.', {
      adapter: adapter ?? null,
    });
  }
  let validated;
  try {
    validated = validateResidentLease(lease, now);
  } catch (cause) {
    unavailable('Native-push resident lease is invalid.', {
      adapter,
      reason: cause?.details?.reason ?? 'invalid-lease',
    });
  }
  if (validated.host !== official.host || validated.opaque_handle === null) {
    unavailable('Native-push requires its official host opaque handle.', {
      adapter,
      host: validated.host,
    });
  }
  return Object.freeze({
    name: `${adapter}-native-push`,
    host: official.host,
    capability: 'native-push',
    adapter_version: validated.adapter_version,
    lease: validated,
    async deliver(input = {}) {
      const { invitation, capsule_text: capsuleText, platform = process.platform } = input;
      try {
        const result = await dispatch(
          capsuleText === undefined
            ? { opaque_handle: validated.opaque_handle, invitation }
            : wakeDispatchInput(validated, input)
        );
        if (result?.acknowledged !== true) {
          return capsuleText === undefined
            ? pending(invitation, platform)
            : Object.freeze({ status: 'outcome-unknown', reason: 'native-push-unacknowledged' });
        }
        return Object.freeze({
          schema: 'ai-peer-review.delivery/v1',
          status: 'delivered',
          transport: 'native-push',
        });
      } catch {
        return capsuleText === undefined
          ? pending(invitation, platform)
          : Object.freeze({ status: 'outcome-unknown', reason: 'native-push-failed' });
      }
    },
    async reconcile(input) {
      if (typeof reconcile !== 'function') {
        return Object.freeze({
          status: 'outcome-unknown',
          reason: 'native-push-reconciliation-unavailable',
        });
      }
      try {
        return await reconcile(wakeReconcileInput(validated, input));
      } catch {
        return Object.freeze({
          status: 'outcome-unknown',
          reason: 'native-push-reconciliation-failed',
        });
      }
    },
  });
}
