import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { AprError } from '../errors.mjs';
import { createLiveDeliverySource } from '../transport/live-wait.mjs';
import { waitForHandoff } from './wait.mjs';

const safeId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const inputSchema = z
  .object({
    review_id: z.string().regex(safeId),
    participant: z.enum(['author', 'reviewer']),
    after_sequence: z.number().int().nonnegative().safe().optional(),
  })
  .strict();

const outputSchema = z
  .object({
    schema: z.string(),
    status: z.string().optional(),
    code: z.string().optional(),
    message: z.string().optional(),
    recovery: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
    reason: z.string().optional(),
    review_id: z.string().optional(),
    participant: z.string().optional(),
    sequence: z.number().int().optional(),
    after_sequence: z.number().int().optional(),
    delivery_id: z.string().optional(),
    digest: z.string().optional(),
    manual: z.object({ available: z.literal(true), command: z.string() }).optional(),
  })
  .passthrough();

function internalError() {
  return new AprError('APR_INTERNAL', 'unexpected peer-review failure', {
    recovery: 'Retry the wait and report the failure if it persists.',
  });
}

function toolResult(value, { error = false } = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    ...(error ? { isError: true } : {}),
  };
}

export function createHandoffMcpServer({
  createServer = (identity) => new McpServer(identity),
  repositoryRoot,
  version = '0.2.2',
  wait = waitForHandoff,
  createDeliveries = createLiveDeliverySource,
} = {}) {
  const server = createServer({ name: 'ai-peer-review', version });
  const deliverySources = new Map();
  server.registerTool(
    'wait_for_handoff',
    {
      description:
        'Blocks without model turns until the next event-authorized peer-review handoff.',
      inputSchema,
      outputSchema,
    },
    async (input, context = {}) => {
      try {
        let deliveries = deliverySources.get(input.review_id);
        if (!deliveries) {
          deliveries = createDeliveries({ repositoryRoot, reviewId: input.review_id });
          deliverySources.set(input.review_id, deliveries);
        }
        const result = await wait({
          reviewId: input.review_id,
          participant: input.participant,
          afterSequence: input.after_sequence ?? 0,
          deliveries,
          signal: context.signal,
        });
        return toolResult(result, { error: result.status !== 'delivered' });
      } catch (cause) {
        const error = cause instanceof AprError ? cause : internalError();
        return toolResult(error.toJSON(), { error: true });
      }
    }
  );
  return server;
}

export async function serveHandoffMcpStdio({
  createServer,
  createTransport = () => new StdioServerTransport(),
  repositoryRoot,
  version,
  wait,
  createDeliveries,
} = {}) {
  const server = createHandoffMcpServer({
    ...(createServer ? { createServer } : {}),
    repositoryRoot,
    version,
    ...(wait ? { wait } : {}),
    ...(createDeliveries ? { createDeliveries } : {}),
  });
  await server.connect(createTransport());
  return server;
}
