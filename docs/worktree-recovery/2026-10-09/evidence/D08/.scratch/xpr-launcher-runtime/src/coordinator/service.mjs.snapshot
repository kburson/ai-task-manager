import { lstatSync, mkdirSync, readFileSync, watch as watchFilesystem } from 'node:fs';
import path from 'node:path';

import { resolveContainedPath } from '../collateral/paths.mjs';
import { AprError } from '../errors.mjs';
import { canonicalProjection, inspectReviewAuthority } from '../protocol/service.mjs';
import { decideWake, wakeOperationKey } from './decision.mjs';
import { acquireCoordinatorLease, inspectCoordinatorLeaseOptional } from './lease.mjs';
import {
  appendWakeOutcome,
  latestWakeOperation,
  reserveWakeOperation,
  wakeOperationExists,
} from './ledger.mjs';

const TERMINAL_OPERATION = new Set(['acknowledged', 'outcome-unknown', 'refused', 'superseded']);

function fail(code, message, recovery, details = {}) {
  throw new AprError(code, message, { recovery, details });
}

function verifiedDelivery(workspace, authority) {
  const role = authority.state.protocol.current_actor;
  if (!['author', 'reviewer'].includes(role)) return null;
  const event = [...authority.events]
    .reverse()
    .find(
      (candidate) =>
        candidate.type === 'delivery-written' &&
        candidate.payload?.delivery?.recipient === role &&
        candidate.revision === authority.state.protocol.revision
    );
  if (!event) {
    fail(
      'APR_DELIVERY_CONFLICT',
      'Current participant role has no matching durable delivery event.',
      'Preserve the review workspace and reconcile its event authority.'
    );
  }
  const delivery = event.payload.delivery;
  let file;
  try {
    file = resolveContainedPath(
      workspace,
      path.join(workspace, 'deliveries', `${delivery.delivery_id}.json`),
      'wake delivery receipt'
    ).absolute;
    const metadata = lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('not a regular file');
  } catch (cause) {
    fail(
      'APR_DELIVERY_CONFLICT',
      'Wake delivery receipt is missing or unsafe.',
      'Preserve the review workspace and restore its exact delivery receipt.',
      { delivery_id: delivery.delivery_id, cause: cause?.code ?? cause?.message ?? 'unknown' }
    );
  }
  const expected = Buffer.from(canonicalProjection(delivery), 'utf8');
  if (!readFileSync(file).equals(expected)) {
    fail(
      'APR_DELIVERY_CONFLICT',
      'Wake delivery receipt conflicts with event authority.',
      'Preserve the review workspace and restore the exact canonical receipt.',
      { delivery_id: delivery.delivery_id }
    );
  }
  return Object.freeze({
    ...delivery,
    sequence: event.sequence,
    revision: event.revision,
    receipt_verified: true,
  });
}

function outcome(value, fallback = 'outcome-unknown') {
  const status = value?.status === 'delivered' ? 'acknowledged' : value?.status;
  if (!['acknowledged', 'not-submitted', 'outcome-unknown', 'refused'].includes(status)) {
    return { status: fallback, reason: 'adapter-result-invalid' };
  }
  return {
    status,
    reason:
      typeof value.reason === 'string' && value.reason.trim()
        ? value.reason.trim().slice(0, 160)
        : status === 'acknowledged'
          ? 'adapter-acknowledged'
          : 'adapter-result',
  };
}

function deliveryInput(operation) {
  return Object.freeze({
    operation_id: operation.operation_id,
    capsule: operation.capsule,
    capsule_text: `${canonicalProjection(operation.capsule)}\n`,
    capsule_digest: operation.capsule_digest,
    expected_revision: operation.protocol_revision,
    target_role: operation.target_role,
    target_session_fingerprint: operation.session_fingerprint,
  });
}

async function reconcileReserved(workspace, operation, adapter, now) {
  if (typeof adapter?.reconcile !== 'function') {
    return appendWakeOutcome(
      workspace,
      operation.operation_id,
      { status: 'outcome-unknown', reason: 'adapter-reconciliation-unavailable' },
      new Date(now)
    );
  }
  let result;
  try {
    result = outcome(await adapter.reconcile(deliveryInput(operation)));
  } catch {
    result = { status: 'outcome-unknown', reason: 'adapter-reconciliation-failed' };
  }
  return appendWakeOutcome(workspace, operation.operation_id, result, new Date(now));
}

async function deliverReserved(workspace, operation, adapter, now) {
  if (typeof adapter?.deliver !== 'function') {
    return appendWakeOutcome(
      workspace,
      operation.operation_id,
      { status: 'refused', reason: 'wake-adapter-unavailable' },
      new Date(now)
    );
  }
  let result;
  try {
    result = outcome(await adapter.deliver(deliveryInput(operation)));
  } catch {
    result = { status: 'outcome-unknown', reason: 'adapter-delivery-failed' };
  }
  return appendWakeOutcome(workspace, operation.operation_id, result, new Date(now));
}

export async function reconcileWake({
  workspace,
  observation,
  adapter,
  now = Date.now(),
  platform = process.platform,
  inspect = inspectReviewAuthority,
} = {}) {
  const authority = inspect(workspace);
  const delivery = verifiedDelivery(workspace, authority);
  const decision = decideWake({ authority, delivery, observation, workspace, platform, now });
  if (decision.kind === 'idle') return Object.freeze({ status: 'idle', ...decision });

  const operationId = wakeOperationKey(decision);
  const existed = wakeOperationExists(workspace, operationId);
  let operation = reserveWakeOperation(workspace, decision, new Date(now));
  if (TERMINAL_OPERATION.has(operation.status)) return operation;

  if (existed && operation.status === 'reserved') {
    operation = await reconcileReserved(workspace, operation, adapter, now);
    if (TERMINAL_OPERATION.has(operation.status)) return operation;
  }
  if (!['reserved', 'not-submitted'].includes(operation.status)) return operation;
  return deliverReserved(workspace, operation, adapter, now);
}

export function coordinatorStatus(workspace) {
  const inspected = inspectCoordinatorLeaseOptional(workspace);
  const operation = latestWakeOperation(workspace);
  return Object.freeze({
    schema: 'ai-peer-review.coordinator-result/v1',
    command: 'status',
    review_id: operation?.review_id ?? path.basename(workspace),
    running: inspected !== null,
    lease: inspected
      ? Object.freeze({
          instance_id: inspected.lease.instance_id,
          owner: inspected.lease.owner.kind,
          heartbeat_sequence: inspected.lease.heartbeat_sequence,
          observed_at: inspected.lease.observed_at,
          state: inspected.lease.state,
        })
      : null,
    latest: operation
      ? Object.freeze({
          operation_id: operation.operation_id,
          protocol_revision: operation.protocol_revision,
          target_role: operation.target_role,
          status: operation.status,
          outcome_count: operation.outcomes.length,
        })
      : null,
  });
}

function defaultSubscribe(workspace, { onChange, onError }, watch = watchFilesystem) {
  const deliveries = path.join(workspace, 'deliveries');
  const coordinator = path.join(workspace, 'coordinator');
  mkdirSync(deliveries, { recursive: true });
  mkdirSync(coordinator, { recursive: true });
  const targets = [path.join(workspace, 'events.jsonl'), deliveries];
  const watchers = targets.map((target) => {
    const watcher = watch(target, onChange);
    watcher.on('error', onError);
    return watcher;
  });
  const stopWatcher = watch(coordinator, (_event, filename) => {
    if (String(filename ?? '') === 'stop-request.json') onChange();
  });
  stopWatcher.on('error', onError);
  watchers.push(stopWatcher);
  return Object.freeze({ close: () => watchers.forEach((watcher) => watcher.close()) });
}

function signalWait({ stop, untilStopped }) {
  return new Promise((resolve) => {
    const cleanup = () => {
      process.off('SIGINT', finish);
      process.off('SIGTERM', finish);
    };
    const finish = () => {
      cleanup();
      stop();
      resolve();
    };
    untilStopped.then(() => {
      cleanup();
      resolve();
    });
    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
  });
}

export async function runCoordinator(input = {}) {
  const lease = acquireCoordinatorLease(
    input.workspace,
    input.owner,
    new Date(input.now ?? Date.now()),
    input.leaseOptions
  );
  let subscription;
  let stopped = false;
  let fatal = null;
  let last = null;
  let queue = Promise.resolve();
  let resolveStopped;
  const untilStopped = new Promise((resolve) => {
    resolveStopped = resolve;
  });
  const reconcile = () => {
    queue = queue.then(async () => {
      if (stopped || fatal) return last;
      if (lease.stopRequested()) {
        stopped = true;
        resolveStopped();
        return last;
      }
      last = await reconcileWake(input);
      lease.heartbeat(new Date(input.now ?? Date.now()));
      return last;
    });
    queue.catch((error) => {
      fatal = error;
      stopped = true;
      resolveStopped();
    });
    return queue;
  };
  const stop = () => {
    stopped = true;
    resolveStopped();
  };
  try {
    await reconcile();
    subscription = (input.subscribe ?? defaultSubscribe)(
      input.workspace,
      {
        onChange: () => void reconcile(),
        onError: (error) => {
          fatal = error;
          stop();
        },
      },
      input.watch
    );
    await reconcile();
    if (!stopped) {
      await (input.waitForStop ?? signalWait)({
        reconcile,
        stop,
        lease: lease.lease,
        untilStopped,
      });
    }
    await queue;
    if (fatal) throw fatal;
    return Object.freeze({ status: 'stopped', last });
  } finally {
    subscription?.close();
    await adapterClose(input.adapter);
    lease.release();
  }
}

async function adapterClose(adapter) {
  try {
    await adapter?.close?.();
  } catch {
    // Shutdown remains best-effort after durable outcomes are recorded.
  }
}
