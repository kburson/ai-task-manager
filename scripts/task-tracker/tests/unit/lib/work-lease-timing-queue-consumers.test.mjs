#!/usr/bin/env node
// @story #1049
// Both production queue consumers must preserve optional timing projection
// identity while leaving legacy queue-item delivery byte-for-byte unchanged.

import { strict as assert } from 'node:assert';

import { postHookQueuedTimingEvent } from '../../../hook-handler.mjs';
import { postRuntimeQueuedTimingEvent } from '../../../runtime.mjs';

const consumers = [
  ['runtime', postRuntimeQueuedTimingEvent],
  ['hook', postHookQueuedTimingEvent],
];

for (const [name, consume] of consumers) {
  const projectedCalls = [];
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
      post: async (input) => {
        projectedCalls.push(input);
        return 'projected-result';
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

  const legacyCalls = [];
  const legacyResult = await consume(
    { kind: 'timing', issue: '#77', row: 'legacy row' },
    {
      repo: 'owner/repo',
      timeoutMs: 3456,
      post: async (input) => {
        legacyCalls.push(input);
        return 'legacy-result';
      },
    }
  );
  assert.equal(legacyResult, 'legacy-result', `${name}: forwards legacy result`);
  assert.deepEqual(legacyCalls, [
    {
      issueNumber: '#77',
      repo: 'owner/repo',
      row: 'legacy row',
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

console.log('work-lease-timing-queue-consumers.test.mjs: all passed');
