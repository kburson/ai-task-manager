import { AprError } from '../errors.mjs';

const inflightBySource = new WeakMap();
const REVIEW_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_TIMEOUT_MS = 2_147_483_647;

function invalid(message, details = {}) {
  throw new AprError('APR_WAIT_INVALID', message, {
    recovery:
      'Call wait_for_handoff with a safe review ID, author or reviewer participant, and a valid cursor.',
    details,
  });
}

function validate({ reviewId, participant, afterSequence, deliveries, signal, timeoutMs }) {
  if (typeof reviewId !== 'string' || !REVIEW_ID.test(reviewId)) {
    invalid('Review ID is invalid.', { review_id: reviewId });
  }
  if (!['author', 'reviewer'].includes(participant)) {
    invalid('Wait participant must be author or reviewer.', { participant });
  }
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
    invalid('Wait cursor must be a non-negative safe integer.', {
      after_sequence: afterSequence,
    });
  }
  if (
    timeoutMs !== undefined &&
    (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS)
  ) {
    invalid('Wait timeout must fit the supported Node timer range.', {
      timeout_ms: timeoutMs,
      maximum_timeout_ms: MAX_TIMEOUT_MS,
    });
  }
  if (
    signal !== undefined &&
    (!signal ||
      typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' ||
      typeof signal.removeEventListener !== 'function')
  ) {
    invalid('Wait cancellation signal is invalid.');
  }
  if (
    !deliveries ||
    typeof deliveries !== 'object' ||
    typeof deliveries.readAfter !== 'function' ||
    typeof deliveries.subscribe !== 'function' ||
    typeof deliveries.manualRecovery !== 'function'
  ) {
    invalid('Wait delivery source is unavailable.');
  }
}

function stableDelivery(value, { reviewId, participant, afterSequence }) {
  if (
    value?.schema !== 'ai-peer-review.delivery/v1' ||
    value.status !== 'delivered' ||
    value.review_id !== reviewId ||
    value.participant !== participant ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence <= afterSequence ||
    typeof value.delivery_id !== 'string' ||
    !REVIEW_ID.test(value.delivery_id) ||
    !/^sha256:[0-9a-f]{64}$/.test(value.digest ?? '')
  ) {
    throw new AprError('APR_DELIVERY_INVALID', 'Wait source returned an invalid delivery.', {
      recovery: 'Inspect event and receipt authority before retrying the wait.',
      details: { review_id: reviewId, participant, after_sequence: afterSequence },
    });
  }
  return Object.freeze({ ...value });
}

function pending(reason, input) {
  const manual = input.deliveries.manualRecovery({
    reviewId: input.reviewId,
    participant: input.participant,
    afterSequence: input.afterSequence,
  });
  if (manual?.available !== true || typeof manual.command !== 'string' || !manual.command.trim()) {
    throw new AprError('APR_TRANSPORT_UNAVAILABLE', 'Manual wait recovery is unavailable.', {
      recovery: 'Run peer-review status and resume the participant manually.',
    });
  }
  return Object.freeze({
    schema: 'ai-peer-review.delivery/v1',
    status: 'delivery-pending',
    reason,
    review_id: input.reviewId,
    participant: input.participant,
    after_sequence: input.afterSequence,
    manual: Object.freeze({ available: true, command: manual.command }),
  });
}

function inflightMap(deliveries) {
  let map = inflightBySource.get(deliveries);
  if (!map) {
    map = new Map();
    inflightBySource.set(deliveries, map);
  }
  return map;
}

function waitForChange(input) {
  return new Promise((resolve, reject) => {
    let subscription;
    let timer;
    let settled = false;
    let checking = false;
    let recheckRequested = false;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      input.signal?.removeEventListener('abort', onAbort);
      try {
        subscription?.close();
      } catch {}
    };
    const finish = (action, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      action(value);
    };
    const finishPending = (reason) => {
      try {
        finish(resolve, pending(reason, input));
      } catch (error) {
        finish(reject, error);
      }
    };
    const check = async () => {
      if (settled) return;
      if (checking) {
        recheckRequested = true;
        return;
      }
      checking = true;
      try {
        do {
          recheckRequested = false;
          const ready = await input.deliveries.readAfter({
            reviewId: input.reviewId,
            participant: input.participant,
            afterSequence: input.afterSequence,
          });
          if (ready) {
            finish(resolve, stableDelivery(ready, input));
            return;
          }
        } while (recheckRequested && !settled);
      } catch (error) {
        finish(reject, error);
      } finally {
        checking = false;
      }
    };
    const onAbort = () => finishPending('wait-cancelled');
    const onError = () => finishPending('wait-unavailable');

    if (input.signal?.aborted) {
      finishPending('wait-cancelled');
      return;
    }
    try {
      subscription = input.deliveries.subscribe({
        reviewId: input.reviewId,
        participant: input.participant,
        onChange: check,
        onError,
      });
      if (!subscription || typeof subscription.close !== 'function') {
        finishPending('wait-unavailable');
        return;
      }
      if (settled) {
        subscription.close();
        return;
      }
    } catch {
      finishPending('wait-unavailable');
      return;
    }
    input.signal?.addEventListener('abort', onAbort, { once: true });
    if (input.timeoutMs !== undefined) {
      timer = setTimeout(() => finishPending('wait-timeout'), input.timeoutMs);
    }
    void check();
  });
}

function createSharedWait(map, key, input) {
  const controller = new AbortController();
  const shared = {
    clients: 0,
    controller,
    done: false,
    map,
    key,
    promise: undefined,
  };
  shared.promise = waitForChange({
    ...input,
    signal: controller.signal,
    timeoutMs: undefined,
  });
  const markDone = () => {
    shared.done = true;
    if (map.get(key) === shared) map.delete(key);
  };
  void shared.promise.then(markDone, markDone);
  map.set(key, shared);
  return shared;
}

function waitOnShared(shared, input) {
  return new Promise((resolve, reject) => {
    let timer;
    let settled = false;

    const release = () => {
      if (timer !== undefined) clearTimeout(timer);
      input.signal?.removeEventListener('abort', onAbort);
      shared.clients -= 1;
      if (shared.clients === 0 && !shared.done) {
        if (shared.map.get(shared.key) === shared) shared.map.delete(shared.key);
        shared.controller.abort();
      }
    };
    const finish = (action, value) => {
      if (settled) return;
      settled = true;
      release();
      action(value);
    };
    const finishPending = (reason) => {
      try {
        finish(resolve, pending(reason, input));
      } catch (error) {
        finish(reject, error);
      }
    };
    const onAbort = () => finishPending('wait-cancelled');

    shared.clients += 1;
    if (input.signal?.aborted) {
      onAbort();
      return;
    }
    input.signal?.addEventListener('abort', onAbort, { once: true });
    if (input.timeoutMs !== undefined) {
      timer = setTimeout(() => finishPending('wait-timeout'), input.timeoutMs);
    }
    void shared.promise.then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error)
    );
  });
}

export async function waitForHandoff({
  reviewId,
  participant,
  afterSequence = 0,
  deliveries,
  signal,
  timeoutMs,
} = {}) {
  const input = { reviewId, participant, afterSequence, deliveries, signal, timeoutMs };
  validate(input);
  const ready = await deliveries.readAfter({ reviewId, participant, afterSequence });
  if (ready) return stableDelivery(ready, input);

  const key = `${reviewId}\0${participant}\0${afterSequence}`;
  const map = inflightMap(deliveries);
  const shared = map.get(key) ?? createSharedWait(map, key, input);
  return waitOnShared(shared, input);
}
