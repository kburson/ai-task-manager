// @story #1107
// @story #1857
// This integration fixture supplies its own actor.
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url);
const fixtureOriginalCwd = process.cwd();

import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadState, saveState } from '../../../../task-tracker/state.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const tmp = mkdtempProjectIsolated('timing-degraded-write-visibility-');
process.env.AI_TASK_MANAGER_PROJECT_DIR = tmp;
process.chdir(tmp);
process.env.TT_SKIP_NETWORK = '1';

mkdirSync(path.join(tmp, '.ai-task-manager'), { recursive: true });
writeFileSync(
  path.join(tmp, '.ai-task-manager', 'task-tracker.json'),
  JSON.stringify({ repo: 'owner/repo' }),
  'utf8'
);

const { buildContext } = await import('../../../../task-tracker/runtime.mjs');
const { verbPause } = await import('../../../../task-tracker/verbs/pause.mjs');
const { verbStop } = await import('../../../../task-tracker/verbs/stop.mjs');
const { verbUpdate } = await import('../../../../task-tracker/verbs/update.mjs');
const timingPostOutcome = await import('../../../../task-tracker/lib/timing-post-outcome.mjs');

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

  saveState(
    {
      active: '#1107',
      lastActive: '#1107',
      entryStartTs: new Date(Date.now() - 1_000).toISOString(),
      wordsAtEntryStart: 0,
      lastWordMarker: 0,
      lastFullWordMarker: 0,
    },
    ctx.statePath
  );
  const result = await ctx.flushActiveToGH(
    loadState(ctx.statePath),
    'pause:question',
    'pause for question'
  );

  assert.deepEqual(
    result.post,
    postFailure,
    'flushActiveToGH must preserve the durable post outcome for its caller'
  );
  const row = parseTimingRow(result.row);
  assert.equal(row.event, 'pause:question');
  assert.ok(row.actorKey, 'queued flush retains its own actor attribution');
  assert.ok(row.engagement, 'queued flush preserves the genuinely bound interval');
}

{
  const statePath = path.join(tmp, '.tmp', 'aitm', 'state', 'pause-state.json');
  mkdirSync(path.dirname(statePath), { recursive: true });
  saveState(
    {
      active: '#1107',
      lastActive: '#1107',
      entryStartTs: new Date().toISOString(),
      wordsAtEntryStart: 0,
    },
    statePath
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
      heartbeatBindingOccupancy: () => ({ status: 'updated' }),
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
  saveState(
    {
      active: '#1107',
      lastActive: '#1107',
      entryStartTs: new Date().toISOString(),
      wordsAtEntryStart: 0,
      totalActiveMinutes: 0,
    },
    statePath
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
      heartbeatBindingOccupancy: () => ({ status: 'updated' }),
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

process.chdir(fixtureOriginalCwd);
rmSync(tmp, { recursive: true, force: true });
console.log('timing-degraded-write-visibility.test.mjs: all passed');
