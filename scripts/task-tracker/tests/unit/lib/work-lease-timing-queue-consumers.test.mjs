#!/usr/bin/env node
// @story #1049
// Both production queue consumers must preserve durable timing projection
// identity and derive the same canonical identity for legacy queue entries.

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { postHookQueuedTimingEvent } from '../../../hook-handler.mjs';
import { drain, enqueue, peek } from '../../../queue.mjs';
import { postRuntimeQueuedTimingEvent } from '../../../runtime.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { canonicalTimingQueueProjection } from '../../../lib/timing-queue-projection.mjs';

const consumers = [
  ['runtime', postRuntimeQueuedTimingEvent],
  ['hook', postHookQueuedTimingEvent],
];
const allowGovernedEffect = async (_options, callback) => callback();

for (const [name, consume] of consumers) {
  const projectedCalls = [];
  const projectedReads = [];
  const projectedResult = await consume(
    {
      kind: 'timing',
      issue: 1049,
      row: 'prebuilt projected row',
      projectionId: 'acquire:request-1049:timing',
      subOperationId: 'acquire:request-1049:timing:bind',
    },
    {
      repo: 'owner/repo',
      timeoutMs: 2345,
      withGovernedEffect: allowGovernedEffect,
      post: async (input) => {
        projectedCalls.push(input);
        return 'projected-result';
      },
      read: async (input) => {
        projectedReads.push(input);
        return { reconciled: true, projectionId: input.projectionId };
      },
    }
  );
  assert.equal(projectedResult, 'projected-result', `${name}: forwards projected result`);
  assert.deepEqual(projectedCalls, [
    {
      issueNumber: 1049,
      repo: 'owner/repo',
      row: 'prebuilt projected row',
      projectionId: 'acquire:request-1049:timing',
      subOperationId: 'acquire:request-1049:timing:bind',
      timeoutMs: 2345,
    },
  ]);
  assert.deepEqual(projectedReads, [
    {
      issueNumber: 1049,
      repo: 'owner/repo',
      projectionId: 'acquire:request-1049:timing',
      subOperationIds: ['acquire:request-1049:timing:bind'],
      expectedRows: {
        'acquire:request-1049:timing:bind': 'prebuilt projected row',
      },
      timeoutMs: 2345,
    },
  ]);

  const legacyCalls = [];
  const legacyReads = [];
  const legacyEvent = { kind: 'timing', issue: '#77', row: 'legacy row' };
  const legacyProjection = canonicalTimingQueueProjection(legacyEvent);
  const legacyResult = await consume(legacyEvent, {
    repo: 'owner/repo',
    timeoutMs: 3456,
    withGovernedEffect: allowGovernedEffect,
    post: async (input) => {
      legacyCalls.push(input);
      return 'legacy-result';
    },
    read: async (input) => {
      legacyReads.push(input);
      return { reconciled: true, projectionId: input.projectionId };
    },
  });
  assert.equal(legacyResult, 'legacy-result', `${name}: forwards legacy result`);
  assert.deepEqual(legacyCalls, [
    {
      issueNumber: '#77',
      repo: 'owner/repo',
      row: 'legacy row',
      ...legacyProjection,
      timeoutMs: 3456,
    },
  ]);
  assert.deepEqual(legacyReads, [
    {
      issueNumber: '#77',
      repo: 'owner/repo',
      projectionId: legacyProjection.projectionId,
      subOperationIds: [legacyProjection.subOperationId],
      expectedRows: { [legacyProjection.subOperationId]: 'legacy row' },
      timeoutMs: 3456,
    },
  ]);

  const ignoredCalls = [];
  assert.equal(
    await consume(
      { kind: 'other', issue: '#77', row: 'not timing' },
      {
        repo: 'owner/repo',
        timeoutMs: 3456,
        post: async (input) => ignoredCalls.push(input),
      }
    ),
    undefined,
    `${name}: ignores non-timing queue items`
  );
  assert.deepEqual(ignoredCalls, []);
}

for (const [name, consume] of consumers) {
  test(`${name}: stale queued timing authority retains the exact queue entry`, async () => {
    const dir = mkdtempSync(path.join(projectScratchDir('test'), `aitm-${name}-queue-`));
    const queuePath = path.join(dir, 'queue.json');
    const item = { kind: 'timing', issue: '#1049', row: 'queued evidence row' };
    enqueue(item, queuePath);
    const [queued] = peek(queuePath);
    const authorityCalls = [];
    const postCalls = [];
    try {
      assert.equal(
        await drain(
          (event) =>
            consume(event, {
              repo: 'owner/repo',
              timeoutMs: 2000,
              withGovernedEffect: async (options) => {
                authorityCalls.push(options);
                const error = new Error('stale queued timing authority');
                error.code = 'fence-stale';
                throw error;
              },
              post: async (options) => {
                postCalls.push(options);
              },
            }),
          queuePath
        ),
        false
      );
      assert.deepEqual(authorityCalls, [
        { issueId: '1049', operation: 'evidence-mutation', heartbeat: true },
      ]);
      assert.deepEqual(postCalls, []);
      assert.deepEqual(peek(queuePath), [queued]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

console.log('work-lease-timing-queue-consumers.test.mjs: all passed');
