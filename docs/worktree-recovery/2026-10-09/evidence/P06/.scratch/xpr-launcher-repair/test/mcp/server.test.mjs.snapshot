import assert from 'node:assert/strict';
import test from 'node:test';

import { runHandoffMcpStdio } from '../../src/cli/run.mjs';
import { AprError } from '../../src/errors.mjs';
import { createHandoffMcpServer, serveHandoffMcpStdio } from '../../src/mcp/server.mjs';

const digest = `sha256:${'a'.repeat(64)}`;

function fakeServerFactory() {
  const registered = [];
  const server = {
    registerTool(name, definition, handler) {
      registered.push({ name, definition, handler });
    },
    async connect(transport) {
      this.transport = transport;
    },
  };
  return { createServer: () => server, registered, server };
}

function success() {
  return Object.freeze({
    schema: 'ai-peer-review.delivery/v1',
    status: 'delivered',
    review_id: 'review-123',
    participant: 'author',
    sequence: 9,
    delivery_id: 'reviewer-turn-1-to-author',
    digest,
  });
}

test('registers one strict wait_for_handoff tool with the expected schema', () => {
  const fake = fakeServerFactory();
  createHandoffMcpServer({
    createServer: fake.createServer,
    repositoryRoot: '/repo',
    version: '0.2.0',
    wait: async () => success(),
    createDeliveries: () => ({}),
  });

  assert.equal(fake.registered.length, 1);
  const [{ name, definition }] = fake.registered;
  assert.equal(name, 'wait_for_handoff');
  assert.match(definition.description, /blocks without model turns/i);
  assert.deepEqual(
    definition.inputSchema.safeParse({
      review_id: 'review-123',
      participant: 'author',
      after_sequence: 8,
    }).data,
    { review_id: 'review-123', participant: 'author', after_sequence: 8 }
  );
  assert.equal(
    definition.inputSchema.safeParse({
      review_id: 'review-123',
      participant: 'author',
      after_sequence: 8,
      workspace: '/untrusted',
    }).success,
    false
  );
  assert.equal(
    definition.inputSchema.safeParse({
      review_id: '../escape',
      participant: 'author',
    }).success,
    false
  );
});

test('derives delivery authority from repository root and returns compact structured data', async () => {
  const fake = fakeServerFactory();
  const signal = new AbortController().signal;
  const deliverySource = {};
  const calls = [];
  createHandoffMcpServer({
    createServer: fake.createServer,
    repositoryRoot: '/repo',
    version: '0.2.0',
    createDeliveries(input) {
      calls.push({ kind: 'source', input });
      return deliverySource;
    },
    async wait(input) {
      calls.push({ kind: 'wait', input });
      return success();
    },
  });
  const [{ handler }] = fake.registered;

  const result = await handler(
    { review_id: 'review-123', participant: 'author', after_sequence: 8 },
    { signal }
  );

  assert.deepEqual(calls[0], {
    kind: 'source',
    input: { repositoryRoot: '/repo', reviewId: 'review-123' },
  });
  assert.deepEqual(calls[1], {
    kind: 'wait',
    input: {
      reviewId: 'review-123',
      participant: 'author',
      afterSequence: 8,
      deliveries: deliverySource,
      signal,
    },
  });
  assert.deepEqual(result.structuredContent, success());
  assert.deepEqual(JSON.parse(result.content[0].text), success());
  assert.equal(result.isError, undefined);
});

test('maps timeout and cancellation fallback deliveries to structured tool errors', async () => {
  for (const reason of ['wait-timeout', 'wait-cancelled', 'wait-unavailable']) {
    const fake = fakeServerFactory();
    createHandoffMcpServer({
      createServer: fake.createServer,
      repositoryRoot: '/repo',
      version: '0.2.0',
      createDeliveries: () => ({}),
      wait: async () => ({
        schema: 'ai-peer-review.delivery/v1',
        status: 'delivery-pending',
        reason,
        review_id: 'review-123',
        participant: 'author',
        after_sequence: 8,
        manual: { available: true, command: 'peer-review resume workspace' },
      }),
    });

    const result = await fake.registered[0].handler(
      { review_id: 'review-123', participant: 'author', after_sequence: 8 },
      { signal: new AbortController().signal }
    );
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.status, 'delivery-pending');
    assert.equal(result.structuredContent.reason, reason);
    assert.match(result.content[0].text, /peer-review resume workspace/);
  }
});

test('duplicate client requests share one delivery source and filesystem subscription', async () => {
  const fake = fakeServerFactory();
  let sourceCreations = 0;
  let subscriptions = 0;
  let current = null;
  const listeners = new Set();
  const source = {
    readAfter() {
      return current;
    },
    subscribe({ onChange }) {
      subscriptions += 1;
      listeners.add(onChange);
      return { close: () => listeners.delete(onChange) };
    },
    manualRecovery() {
      return { available: true, command: 'peer-review resume workspace' };
    },
  };
  createHandoffMcpServer({
    createServer: fake.createServer,
    repositoryRoot: '/repo',
    version: '0.2.0',
    createDeliveries() {
      sourceCreations += 1;
      return source;
    },
  });
  const input = { review_id: 'review-123', participant: 'author', after_sequence: 8 };
  const context = { signal: new AbortController().signal };
  const first = fake.registered[0].handler(input, context);
  const second = fake.registered[0].handler(input, context);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(sourceCreations, 1);
  assert.equal(subscriptions, 1);
  current = success();
  for (const notify of [...listeners]) notify();
  assert.deepEqual((await first).structuredContent, success());
  assert.deepEqual((await second).structuredContent, success());
});

test('maps authority conflicts to stable APR structured errors', async () => {
  const fake = fakeServerFactory();
  createHandoffMcpServer({
    createServer: fake.createServer,
    repositoryRoot: '/repo',
    version: '0.2.0',
    createDeliveries: () => ({}),
    wait: async () => {
      throw new AprError('APR_DELIVERY_CONFLICT', 'Receipt conflicts with event authority.', {
        recovery: 'Preserve the receipt and inspect the review.',
        details: { delivery_id: 'conflict' },
      });
    },
  });

  const result = await fake.registered[0].handler(
    { review_id: 'review-123', participant: 'author' },
    { signal: new AbortController().signal }
  );
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    schema: 'ai-peer-review.error/v1',
    code: 'APR_DELIVERY_CONFLICT',
    message: 'Receipt conflicts with event authority.',
    recovery: 'Preserve the receipt and inspect the review.',
    details: { delivery_id: 'conflict' },
  });
});

test('unexpected server errors are redacted behind APR_INTERNAL', async () => {
  const fake = fakeServerFactory();
  createHandoffMcpServer({
    createServer: fake.createServer,
    repositoryRoot: '/repo',
    version: '0.2.0',
    createDeliveries: () => ({}),
    wait: async () => {
      throw new Error('secret provider handle');
    },
  });

  const result = await fake.registered[0].handler(
    { review_id: 'review-123', participant: 'author' },
    { signal: new AbortController().signal }
  );
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, 'APR_INTERNAL');
  assert.doesNotMatch(JSON.stringify(result), /secret provider handle/);
});

test('stdio runner creates official transport and connects the configured server', async () => {
  const fake = fakeServerFactory();
  const transport = {};
  const result = await serveHandoffMcpStdio({
    repositoryRoot: '/repo',
    version: '0.2.0',
    createServer: fake.createServer,
    createTransport: () => transport,
    createDeliveries: () => ({}),
  });

  assert.equal(result, fake.server);
  assert.equal(fake.server.transport, transport);
});

test('CLI integration seam loads MCP wiring only when the resident server starts', async () => {
  const fake = fakeServerFactory();
  const transport = {};
  const result = await runHandoffMcpStdio({
    repositoryRoot: '/repo',
    version: '0.2.0',
    createServer: fake.createServer,
    createTransport: () => transport,
    createDeliveries: () => ({}),
  });

  assert.equal(result, fake.server);
  assert.equal(fake.server.transport, transport);
});

test('idle server registration and waiting invoke no model or session callback', async () => {
  const fake = fakeServerFactory();
  let modelTurns = 0;
  let sessionCallbacks = 0;
  let resolveWait;
  createHandoffMcpServer({
    createServer: fake.createServer,
    repositoryRoot: '/repo',
    version: '0.2.0',
    createDeliveries: () => ({}),
    wait: () =>
      new Promise((resolve) => {
        resolveWait = resolve;
      }),
    onModelTurn: () => {
      modelTurns += 1;
    },
    onSessionCallback: () => {
      sessionCallbacks += 1;
    },
  });
  const pending = fake.registered[0].handler(
    { review_id: 'review-123', participant: 'reviewer', after_sequence: 0 },
    { signal: new AbortController().signal }
  );
  await Promise.resolve();

  assert.equal(modelTurns, 0);
  assert.equal(sessionCallbacks, 0);
  resolveWait({ ...success(), participant: 'reviewer' });
  await pending;
});
