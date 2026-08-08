// @story #1107
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';

const tmp = mkdtempProjectIsolated('timing-degraded-write-visibility-');
process.env.AI_TASK_MANAGER_PROJECT_DIR = tmp;
process.env.TT_SKIP_NETWORK = '1';

mkdirSync(path.join(tmp, '.ai-task-manager'), { recursive: true });
writeFileSync(
  path.join(tmp, '.ai-task-manager', 'task-tracker.json'),
  JSON.stringify({ repo: 'owner/repo' }),
  'utf8'
);

const { buildContext } = await import('../../../runtime.mjs');
const { verbPause } = await import('../../../verbs/pause.mjs');
const { verbStop } = await import('../../../verbs/stop.mjs');
const { verbUpdate } = await import('../../../verbs/update.mjs');
const timingPostOutcome = await import('../../../lib/timing-post-outcome.mjs');

const postFailure = { ok: false, queued: true, err: 'gh timed out' };

assert.equal(
  typeof timingPostOutcome.postTimingSafely,
  'function',
  'the durable-write wrapper must be independently injectable for failure-path verification'
);
{
  const queued = [];
  const warnings = [];
  const result = await timingPostOutcome.postTimingSafely(
    {
      issue: '#1107',
      row: '| 2026-08-05 01:00:00 -05:00 | pause:question |  |  |  | 10 | pause |',
      repo: 'owner/repo',
      timeoutMs: 10_000,
      queuePath: '/tmp/not-written-by-injected-enqueue',
    },
    {
      postTimingEvent: async () => {
        throw new Error('gh timed out');
      },
      enqueue: (entry) => queued.push(entry),
      warn: (message) => warnings.push(message),
    }
  );
  assert.deepEqual(result, postFailure);
  assert.equal(queued.length, 1, 'failed row is queued');
  assert.ok(
    warnings.some(
      (message) =>
        message.includes('pause:question') &&
        message.includes('#1107') &&
        message.includes('gh timed out')
    ),
    `warning must name the queued row and error; got: ${warnings.join('\n')}`
  );
}

{
  const ctx = buildContext(['status']);
  ctx.safePostTiming = async () => postFailure;

  const result = await ctx.flushActiveToGH(
    { active: '#1107', entryStartTs: null, lastWordMarker: 0 },
    'pause:question',
    'pause for question'
  );

  assert.deepEqual(
    result.post,
    postFailure,
    'flushActiveToGH must preserve the durable post outcome for its caller'
  );
}

{
  const statePath = path.join(tmp, '.tmp', 'aitm', 'state', 'pause-state.json');
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify({
      active: '#1107',
      lastActive: '#1107',
      entryStartTs: new Date().toISOString(),
      wordsAtEntryStart: 0,
    }),
    'utf8'
  );

  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await verbPause({
      statePath,
      projectDir: tmp,
      rest: ['pause for question'],
      drainQueueIfAny: async () => {},
      flushActiveToGH: async () => ({
        deltaMin: 0,
        deltaWallMin: 0,
        deltaWords: 0,
        ts: new Date().toISOString(),
        post: postFailure,
      }),
    });
  } finally {
    console.log = originalLog;
  }

  assert.ok(
    lines.some(
      (line) =>
        line.includes('WARNING: timing row queued, not posted') && line.includes('gh timed out')
    ),
    `pause output must disclose the degraded durable write; got: ${lines.join('\n')}`
  );
}

for (const [name, verb, expectedPrefix] of [
  ['stop', verbStop, 'Stopped #1107'],
  ['update', verbUpdate, 'Update #1107'],
]) {
  const statePath = path.join(tmp, '.tmp', 'aitm', 'state', `${name}-state.json`);
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    JSON.stringify({
      active: '#1107',
      lastActive: '#1107',
      entryStartTs: new Date().toISOString(),
      wordsAtEntryStart: 0,
      totalActiveMinutes: 0,
    }),
    'utf8'
  );

  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await verb({
      cfg: { repo: 'owner/repo' },
      statePath,
      projectDir: tmp,
      rest: [],
      drainQueueIfAny: async () => {},
      readTimingCommentBody: async () => '',
      flushActiveToGH: async () => ({
        deltaMin: 0,
        idleMin: 0,
        deltaWallMin: 0,
        deltaWords: 0,
        wordMarker: 0,
        ts: new Date().toISOString(),
        post: postFailure,
      }),
    });
  } finally {
    console.log = originalLog;
  }

  assert.ok(
    lines.some(
      (line) =>
        line.includes(expectedPrefix) &&
        line.includes('WARNING: timing row queued, not posted') &&
        line.includes('gh timed out')
    ),
    `${name} output must disclose the degraded durable write; got: ${lines.join('\n')}`
  );
}

console.log('timing-degraded-write-visibility.test.mjs: all passed');
