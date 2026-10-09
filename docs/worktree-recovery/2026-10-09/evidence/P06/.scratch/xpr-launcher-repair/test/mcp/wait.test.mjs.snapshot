import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  realpathSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { canonicalProjection } from '../../src/protocol/service.mjs';
import { appendEvent } from '../../src/protocol/store.mjs';
import {
  createLiveDeliverySource,
  createLiveWaitTransport,
} from '../../src/transport/live-wait.mjs';
import { createTransportRegistry } from '../../src/transport/registry.mjs';
import { waitForHandoff } from '../../src/mcp/wait.mjs';
import { createReviewWorkspace, event, reviewerTurnEvents } from '../helpers/review-fixture.mjs';

const digest = `sha256:${'d'.repeat(64)}`;

function delivered(participant = 'author', sequence = 9, deliveryId = 'delivery-9') {
  return Object.freeze({
    schema: 'ai-peer-review.delivery/v1',
    status: 'delivered',
    review_id: 'review-01',
    participant,
    sequence,
    delivery_id: deliveryId,
    digest,
  });
}

function fakeDeliveries({ initial = null, duringSubscribe = null } = {}) {
  let current = initial;
  let reads = 0;
  let subscriptions = 0;
  let closes = 0;
  const listeners = new Set();
  return {
    readAfter({ participant }) {
      reads += 1;
      return current?.participant === participant ? current : null;
    },
    subscribe({ onChange, onError }) {
      subscriptions += 1;
      listeners.add({ onChange, onError });
      if (duringSubscribe) current = duringSubscribe;
      return {
        close() {
          closes += 1;
          for (const listener of listeners) {
            if (listener.onChange === onChange) listeners.delete(listener);
          }
        },
      };
    },
    manualRecovery() {
      return Object.freeze({
        available: true,
        command: 'peer-review resume .scratch/peer-review/review-01',
      });
    },
    set(value) {
      current = value;
    },
    notify() {
      for (const listener of [...listeners]) listener.onChange();
    },
    fail(error) {
      for (const listener of [...listeners]) listener.onError(error);
    },
    counts() {
      return { reads, subscriptions, closes, listeners: listeners.size };
    },
  };
}

test('returns a delivery that exists before subscribing', async () => {
  const deliveries = fakeDeliveries({ initial: delivered() });

  const result = await waitForHandoff({
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    deliveries,
  });

  assert.deepEqual(result, delivered());
  assert.deepEqual(deliveries.counts(), {
    reads: 1,
    subscriptions: 0,
    closes: 0,
    listeners: 0,
  });
});

test('rechecks immediately after subscribing to close the delivery race', async () => {
  const deliveries = fakeDeliveries({ duringSubscribe: delivered() });

  const result = await waitForHandoff({
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    deliveries,
  });

  assert.deepEqual(result, delivered());
  assert.deepEqual(deliveries.counts(), {
    reads: 2,
    subscriptions: 1,
    closes: 1,
    listeners: 0,
  });
});

test('coalesces duplicate requests for the same participant cursor', async () => {
  const deliveries = fakeDeliveries();
  const input = {
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    deliveries,
  };

  const first = waitForHandoff(input);
  const second = waitForHandoff(input);
  await Promise.resolve();
  assert.equal(deliveries.counts().subscriptions, 1);

  deliveries.set(delivered());
  deliveries.notify();
  assert.deepEqual(await first, delivered());
  assert.deepEqual(await second, delivered());
  assert.equal(deliveries.counts().closes, 1);
});

test('keeps coalesced caller cancellation independent', async () => {
  const deliveries = fakeDeliveries();
  const firstController = new AbortController();
  const secondController = new AbortController();
  const input = {
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    deliveries,
  };

  const first = waitForHandoff({ ...input, signal: firstController.signal });
  const second = waitForHandoff({ ...input, signal: secondController.signal });
  await Promise.resolve();
  assert.equal(deliveries.counts().subscriptions, 1);

  firstController.abort();
  assert.equal((await first).reason, 'wait-cancelled');
  assert.deepEqual(deliveries.counts(), {
    reads: 3,
    subscriptions: 1,
    closes: 0,
    listeners: 1,
  });

  deliveries.set(delivered());
  deliveries.notify();
  assert.deepEqual(await second, delivered());
  assert.equal(deliveries.counts().closes, 1);
});

test('keeps simultaneous participant cursors independent', async () => {
  const deliveries = fakeDeliveries();
  const author = waitForHandoff({
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    deliveries,
  });
  const reviewer = waitForHandoff({
    reviewId: 'review-01',
    participant: 'reviewer',
    afterSequence: 8,
    deliveries,
  });
  await Promise.resolve();
  assert.equal(deliveries.counts().subscriptions, 2);

  deliveries.set(delivered('reviewer', 10, 'delivery-reviewer'));
  deliveries.notify();
  assert.deepEqual(await reviewer, delivered('reviewer', 10, 'delivery-reviewer'));

  deliveries.set(delivered('author'));
  deliveries.notify();
  assert.deepEqual(await author, delivered('author'));
  assert.equal(deliveries.counts().closes, 2);
});

test('duplicate filesystem notifications resolve one immutable delivery', async () => {
  const deliveries = fakeDeliveries();
  const pending = waitForHandoff({
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    deliveries,
  });
  await Promise.resolve();
  deliveries.set(delivered());
  deliveries.notify();
  deliveries.notify();

  const result = await pending;
  assert.deepEqual(result, delivered());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(deliveries.counts().closes, 1);
});

test('an idle wait uses no polling loop or model callback', async () => {
  const deliveries = fakeDeliveries();
  let modelTurns = 0;
  const pending = waitForHandoff({
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    deliveries,
    onModelTurn: () => {
      modelTurns += 1;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(modelTurns, 0);
  assert.deepEqual(deliveries.counts(), {
    reads: 2,
    subscriptions: 1,
    closes: 0,
    listeners: 1,
  });

  deliveries.set(delivered());
  deliveries.notify();
  await pending;
});

test('timeout closes resources and returns exact manual recovery', async () => {
  const deliveries = fakeDeliveries();

  const result = await waitForHandoff({
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    timeoutMs: 10,
    deliveries,
  });

  assert.deepEqual(result, {
    schema: 'ai-peer-review.delivery/v1',
    status: 'delivery-pending',
    reason: 'wait-timeout',
    review_id: 'review-01',
    participant: 'author',
    after_sequence: 8,
    manual: {
      available: true,
      command: 'peer-review resume .scratch/peer-review/review-01',
    },
  });
  assert.deepEqual(deliveries.counts(), {
    reads: 2,
    subscriptions: 1,
    closes: 1,
    listeners: 0,
  });
});

test('abort closes resources without acknowledging a delivery', async () => {
  const deliveries = fakeDeliveries();
  const controller = new AbortController();
  const pending = waitForHandoff({
    reviewId: 'review-01',
    participant: 'reviewer',
    afterSequence: 4,
    signal: controller.signal,
    deliveries,
  });
  await Promise.resolve();
  controller.abort();

  assert.deepEqual(await pending, {
    schema: 'ai-peer-review.delivery/v1',
    status: 'delivery-pending',
    reason: 'wait-cancelled',
    review_id: 'review-01',
    participant: 'reviewer',
    after_sequence: 4,
    manual: {
      available: true,
      command: 'peer-review resume .scratch/peer-review/review-01',
    },
  });
  assert.equal(deliveries.counts().closes, 1);
});

test('a timed-out cursor can reconnect and a server restart reads durable delivery', async () => {
  const firstSource = fakeDeliveries();
  const timedOut = await waitForHandoff({
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    timeoutMs: 5,
    deliveries: firstSource,
  });
  assert.equal(timedOut.status, 'delivery-pending');

  const restartedSource = fakeDeliveries({ initial: delivered() });
  assert.deepEqual(
    await waitForHandoff({
      reviewId: 'review-01',
      participant: 'author',
      afterSequence: 8,
      deliveries: restartedSource,
    }),
    delivered()
  );
  assert.equal(restartedSource.counts().subscriptions, 0);
});

test('advancing the participant cursor does not repeat a sealed delivery', async () => {
  const deliveries = fakeDeliveries({ initial: delivered() });
  assert.deepEqual(
    await waitForHandoff({
      reviewId: 'review-01',
      participant: 'author',
      afterSequence: 8,
      deliveries,
    }),
    delivered()
  );

  deliveries.set(null);
  const next = await waitForHandoff({
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 9,
    timeoutMs: 5,
    deliveries,
  });
  assert.equal(next.status, 'delivery-pending');
  assert.equal(next.after_sequence, 9);
});

test('watch failures preserve manual recovery', async () => {
  const deliveries = fakeDeliveries();
  const pending = waitForHandoff({
    reviewId: 'review-01',
    participant: 'author',
    afterSequence: 8,
    deliveries,
  });
  await Promise.resolve();
  deliveries.fail(new Error('watch failed'));

  const result = await pending;
  assert.equal(result.status, 'delivery-pending');
  assert.equal(result.reason, 'wait-unavailable');
  assert.match(result.manual.command, /peer-review resume/);
});

test('validates identifiers, participant, cursor, timeout, signal, and source', async () => {
  const deliveries = fakeDeliveries();
  const invalid = [
    { reviewId: '../escape', participant: 'author', afterSequence: 0, deliveries },
    { reviewId: 'review-01', participant: 'observer', afterSequence: 0, deliveries },
    { reviewId: 'review-01', participant: 'author', afterSequence: -1, deliveries },
    {
      reviewId: 'review-01',
      participant: 'author',
      afterSequence: 0,
      timeoutMs: 0,
      deliveries,
    },
    {
      reviewId: 'review-01',
      participant: 'author',
      afterSequence: 0,
      timeoutMs: 2_147_483_648,
      deliveries,
    },
    { reviewId: 'review-01', participant: 'author', afterSequence: 0, signal: {}, deliveries },
    { reviewId: 'review-01', participant: 'author', afterSequence: 0, deliveries: {} },
  ];
  for (const input of invalid) {
    await assert.rejects(waitForHandoff(input), { code: 'APR_WAIT_INVALID' });
  }
});

test(
  'cached live source rejects a workspace replaced by an outside-repository symlink',
  { skip: process.platform === 'win32' },
  async (t) => {
    const inside = await createReviewWorkspace({ events: reviewerTurnEvents() });
    const outsideEvents = reviewerTurnEvents();
    const outside = await createReviewWorkspace({ events: outsideEvents });
    t.after(inside.cleanup);
    t.after(outside.cleanup);
    const deliveryEvent = event('delivery-written', {
      sequence: outsideEvents.length + 1,
      revision: outsideEvents.at(-1).revision,
      payload: {
        delivery: { delivery_id: 'external-delivery', recipient: 'author', digest },
      },
    });
    await appendEvent(outside.events, deliveryEvent);
    mkdirSync(path.join(outside.workspace, 'deliveries'), { recursive: true });
    writeFileSync(
      path.join(outside.workspace, 'deliveries', 'external-delivery.json'),
      canonicalProjection({
        delivery_id: 'external-delivery',
        recipient: 'author',
        digest,
      })
    );
    const source = createLiveDeliverySource({
      repositoryRoot: inside.root,
      reviewId: 'review-01',
    });
    renameSync(inside.workspace, `${inside.workspace}.original`);
    symlinkSync(outside.workspace, inside.workspace, 'dir');

    assert.throws(
      () =>
        source.readAfter({
          reviewId: 'review-01',
          participant: 'author',
          afterSequence: 2,
        }),
      { code: 'APR_WAIT_INVALID' }
    );
  }
);

test('live source reads the first event-authorized matching receipt after the cursor', async (t) => {
  const events = reviewerTurnEvents();
  const fixture = await createReviewWorkspace({ events });
  t.after(fixture.cleanup);
  const deliveryEvent = event('delivery-written', {
    sequence: events.length + 1,
    revision: events.at(-1).revision,
    payload: {
      delivery: { delivery_id: 'turn-to-author', recipient: 'author', digest },
    },
  });
  await appendEvent(fixture.events, deliveryEvent);
  const receipt = path.join(fixture.workspace, 'deliveries', 'turn-to-author.json');
  mkdirSync(path.dirname(receipt), { recursive: true });
  writeFileSync(
    receipt,
    canonicalProjection({ delivery_id: 'turn-to-author', recipient: 'author', digest })
  );
  const source = createLiveDeliverySource({
    repositoryRoot: fixture.root,
    reviewId: 'review-01',
  });

  assert.deepEqual(
    source.readAfter({ reviewId: 'review-01', participant: 'author', afterSequence: 2 }),
    delivered('author', 3, 'turn-to-author')
  );
  assert.equal(
    source.readAfter({ reviewId: 'review-01', participant: 'reviewer', afterSequence: 2 }),
    null
  );
  assert.equal(
    source.readAfter({ reviewId: 'review-01', participant: 'author', afterSequence: 3 }),
    null
  );
});

test('live source treats a missing receipt as pending and conflicts as authority errors', async (t) => {
  const events = reviewerTurnEvents();
  const fixture = await createReviewWorkspace({ events });
  t.after(fixture.cleanup);
  const deliveryEvent = event('delivery-written', {
    sequence: events.length + 1,
    revision: events.at(-1).revision,
    payload: {
      delivery: { delivery_id: 'turn-to-author', recipient: 'author', digest },
    },
  });
  await appendEvent(fixture.events, deliveryEvent);
  const source = createLiveDeliverySource({
    repositoryRoot: fixture.root,
    reviewId: 'review-01',
  });
  const input = { reviewId: 'review-01', participant: 'author', afterSequence: 2 };

  assert.equal(source.readAfter(input), null);
  const receipt = path.join(fixture.workspace, 'deliveries', 'turn-to-author.json');
  writeFileSync(receipt, '{"conflict":true}\n');
  assert.throws(() => source.readAfter(input), { code: 'APR_DELIVERY_CONFLICT' });
});

test(
  'live source rejects receipt symlinks even when their bytes match',
  { skip: process.platform === 'win32' },
  async (t) => {
    const events = reviewerTurnEvents();
    const fixture = await createReviewWorkspace({ events });
    t.after(fixture.cleanup);
    const deliveryEvent = event('delivery-written', {
      sequence: events.length + 1,
      revision: events.at(-1).revision,
      payload: {
        delivery: { delivery_id: 'turn-to-author', recipient: 'author', digest },
      },
    });
    await appendEvent(fixture.events, deliveryEvent);
    const receipt = path.join(fixture.workspace, 'deliveries', 'turn-to-author.json');
    const outside = path.join(fixture.root, 'outside-receipt.json');
    mkdirSync(path.dirname(receipt), { recursive: true });
    writeFileSync(
      outside,
      canonicalProjection({ delivery_id: 'turn-to-author', recipient: 'author', digest })
    );
    symlinkSync(outside, receipt);
    const source = createLiveDeliverySource({
      repositoryRoot: fixture.root,
      reviewId: 'review-01',
    });

    assert.throws(
      () =>
        source.readAfter({
          reviewId: 'review-01',
          participant: 'author',
          afterSequence: 2,
        }),
      { code: 'APR_DELIVERY_CONFLICT' }
    );
  }
);

test('live source derives a contained workspace and emits exact manual recovery', async (t) => {
  const fixture = await createReviewWorkspace({ events: reviewerTurnEvents() });
  t.after(fixture.cleanup);
  let watched;
  const source = createLiveDeliverySource({
    repositoryRoot: fixture.root,
    reviewId: 'review-01',
    watch(directory, _listener) {
      watched = directory;
      return { close() {}, on() {} };
    },
  });
  const subscription = source.subscribe({
    reviewId: 'review-01',
    participant: 'author',
    onChange() {},
    onError() {},
  });
  subscription.close();

  assert.equal(watched, path.join(realpathSync(fixture.workspace), 'deliveries'));
  assert.match(source.manualRecovery().command, /peer-review resume/);
  assert.throws(
    () => createLiveDeliverySource({ repositoryRoot: fixture.root, reviewId: '../escape' }),
    { code: 'APR_WAIT_INVALID' }
  );
});

test('registers and resolves live-wait as a wait-only transport capability', () => {
  const registry = createTransportRegistry();
  const adapter = createLiveWaitTransport({ repositoryRoot: '/repo' });
  registry.register(adapter);

  assert.equal(registry.resolve('live-wait'), adapter);
  assert.deepEqual(registry.capabilities(), ['live-wait']);
});

test('live source refuses an unknown review without creating scratch authority', async (t) => {
  const fixture = await createReviewWorkspace({ events: reviewerTurnEvents() });
  t.after(fixture.cleanup);
  const unknown = path.join(fixture.root, '.scratch', 'peer-review', 'unknown-review');

  assert.throws(
    () => createLiveDeliverySource({ repositoryRoot: fixture.root, reviewId: 'unknown-review' }),
    { code: 'APR_EVENT_LOG_MISSING' }
  );
  assert.equal(existsSync(unknown), false);
});

test(
  'live source rejects a delivery-directory symlink escape',
  { skip: process.platform === 'win32' },
  async (t) => {
    const fixture = await createReviewWorkspace({ events: reviewerTurnEvents() });
    t.after(fixture.cleanup);
    const outside = path.join(fixture.root, 'outside-deliveries');
    mkdirSync(outside);
    symlinkSync(outside, path.join(fixture.workspace, 'deliveries'));

    assert.throws(
      () => createLiveDeliverySource({ repositoryRoot: fixture.root, reviewId: 'review-01' }),
      { code: 'APR_PATH_OUTSIDE_REPOSITORY' }
    );
  }
);
