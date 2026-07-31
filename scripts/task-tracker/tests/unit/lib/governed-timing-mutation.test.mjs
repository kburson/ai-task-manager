// @story #1049

import assert from 'node:assert/strict';
import test from 'node:test';

import { postTimingEvent } from '../../../gh-timing-comment.mjs';

const ROW =
  '| 2026-07-30 12:00:00 +00:00 | update |  |  |  | 0 | governed timing | <!-- row-sec: a=0 i=0 -->';

test('stale timing authority invokes zero timing-comment read or mutation effects', async () => {
  const effects = [];
  const authorityCalls = [];
  await assert.rejects(
    () =>
      postTimingEvent({
        issueNumber: '#1049',
        repo: 'owner/repo',
        row: ROW,
        lock: false,
        timeoutMs: 10,
        withGovernedEffect: async (options) => {
          authorityCalls.push(options);
          const error = new Error('stale timing fence');
          error.code = 'fence-stale';
          throw error;
        },
        deps: {
          findTimingComment: async () => {
            effects.push('find');
            return null;
          },
          createTimingComment: async () => {
            effects.push('create');
          },
          updateTimingComment: async () => {
            effects.push('update');
          },
        },
      }),
    (error) => error.code === 'fence-stale'
  );
  assert.deepEqual(authorityCalls, [
    { issueId: '1049', operation: 'evidence-mutation', heartbeat: true },
  ]);
  assert.deepEqual(effects, []);
});

test('timing retry obtains fresh authority and reverifies before each remote mutation', async () => {
  const events = [];
  let updateAttempts = 0;
  const existing = {
    id: 'comment-1',
    body: [
      '⏱ Timing Log',
      '',
      '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |',
      '|---|---|---|---|---|---|---|---|',
    ].join('\n'),
  };

  await postTimingEvent({
    issueNumber: 1049,
    repo: 'owner/repo',
    row: ROW,
    lock: true,
    retries: 1,
    projDir: process.cwd(),
    withGovernedEffect: async (options, callback) => {
      events.push(`verify:${options.operation}`);
      return callback({
        reverify: async () => {
          events.push('reverify');
        },
      });
    },
    deps: {
      findTimingComment: async () => {
        events.push('find');
        return existing;
      },
      updateTimingComment: async () => {
        events.push('update');
        updateAttempts += 1;
        if (updateAttempts === 1) throw new Error('simulated timing conflict');
      },
    },
  });

  assert.deepEqual(events, [
    'verify:evidence-mutation',
    'find',
    'reverify',
    'update',
    'verify:evidence-mutation',
    'find',
    'reverify',
    'update',
  ]);
});

test('timing lock retry never retries an authority refusal', async () => {
  let authorityCalls = 0;
  await assert.rejects(
    () =>
      postTimingEvent({
        issueNumber: 1049,
        repo: 'owner/repo',
        row: ROW,
        retries: 2,
        projDir: process.cwd(),
        withGovernedEffect: async () => {
          authorityCalls += 1;
          const error = new Error('missing timing lease');
          error.code = 'lease-not-held';
          throw error;
        },
        deps: {
          findTimingComment: async () => assert.fail('authority must precede timing reads'),
        },
      }),
    (error) => error.code === 'lease-not-held'
  );
  assert.equal(authorityCalls, 1);
});
