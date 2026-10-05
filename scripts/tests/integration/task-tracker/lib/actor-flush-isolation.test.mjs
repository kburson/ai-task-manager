// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { buildContext } from '../../../../task-tracker/runtime.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { timingActorKey } from '../../../../task-tracker/lib/timing-actor.mjs';
import { saveState, loadState } from '../../../../task-tracker/state.mjs';
import { verbUpdate } from '../../../../task-tracker/verbs/update.mjs';
import {
  loadMarker,
  saveMarker,
  markerPathFor,
  ensureSessionTracking,
} from '../../../../task-tracker/word-counter.mjs';
import { verbResume } from '../../../../task-tracker/verbs/resume.mjs';
import { verbPause } from '../../../../task-tracker/verbs/pause.mjs';
import {
  buildRow,
  __internals as timingInternals,
} from '../../../../task-tracker/gh-timing-comment.mjs';
import { emitPhasePairRows } from '../../../../task-tracker/lib/move-state/audit-timing.mjs';
import { runTestWithEntryInterlock } from '../../../../task-tracker/verbs/test.mjs';
import { verbStatus } from '../../../../task-tracker/verbs/status.mjs';
import { actorTimingStatePath } from '../../../../task-tracker/lib/actor-timing-state.mjs';
import { readActorFlushJournal } from '../../../../task-tracker/lib/actor-flush-journal.mjs';
import { pauseReviewTiming } from '../../../../task-tracker/verbs/review.mjs';
import { runActorHookTiming } from '../../../../task-tracker/lib/actor-hook-timing.mjs';
import { deriveActorEngagement } from '../../../../task-tracker/lib/timing-engagement.mjs';
import {
  recordAskPause,
  finalizeAskResume,
  pendingAskPath,
} from '../../../../task-tracker/hooks/on-ask.mjs';

test('question hooks close only their own actor interval and resume without charging the wait', async () =>
  fixture(async ({ ctx, rows }) => {
    const start = Date.now() - 10000;
    saveState(
      { active: '#1857', entryStartTs: new Date(start).toISOString(), lastWordMarker: 10 },
      ctx.statePath
    );
    const deps = {
      context: ctx,
      postTimingEvent: async ({ row }) => rows.push(row),
      fetchTimingBody: async () => '',
    };
    const paused = await recordAskPause({ deps });
    assert.equal(paused.status, 'ok');
    assert.equal(loadState(ctx.statePath).entryStartTs, null);
    const first = parseTimingRow(rows[0]);
    assert.equal(
      first.actorKey,
      timingActorKey({ provider: 'claude', sid: process.env.AI_TASK_MANAGER_SESSION_ID })
    );
    assert.equal(first.engagement.startMs, start);
    assert.ok(!rows[0].includes(process.env.AI_TASK_MANAGER_SESSION_ID));
    const repeated = await recordAskPause({ deps });
    assert.equal(repeated.status, 'pending');
    assert.equal(rows.length, 1);
    const resumed = await finalizeAskResume({ deps });
    assert.equal(resumed.status, 'ok');
    assert.ok(loadState(ctx.statePath).entryStartTs);
    assert.equal(rows.length, 2);
    assert.equal(parseTimingRow(rows[1]).actorKey, first.actorKey);
    const aggregate = deriveActorEngagement(
      rows.map(parseTimingRow),
      parseTimingRow(rows.at(-1)).ts
    );
    assert.deepEqual(aggregate.failures, []);
    assert.ok(aggregate.engagedMs >= 10000);
    assert.equal((await finalizeAskResume({ deps })).status, 'no-marker');
  }));

test('question reply ambiguity retains the original row and replays before resuming', async () =>
  fixture(async ({ ctx, rows, root }) => {
    saveState(
      { active: '#1857', entryStartTs: new Date(Date.now() - 1000).toISOString() },
      ctx.statePath
    );
    const deps = { context: ctx };
    await recordAskPause({ deps });
    const markerPath = pendingAskPath(process.env.AI_TASK_MANAGER_SESSION_ID, root);
    let frozen;
    ctx.safePostTiming = async (issue, row) => {
      frozen = row;
      throw new Error('ambiguous publication');
    };
    await assert.rejects(finalizeAskResume({ deps }), /ambiguous publication/);
    assert.equal(loadState(ctx.statePath).entryStartTs, null);
    assert.equal(JSON.parse(readFileSync(markerPath, 'utf8')).resumeRow, frozen);
    ctx.safePostTiming = async (issue, row) => {
      assert.equal(row, frozen);
      rows.push(row);
      return { ok: true };
    };
    assert.equal((await finalizeAskResume({ deps })).status, 'ok');
    assert.equal(rows.length, 2);
  }));

test('question marker cannot substitute another event for the frozen resume', async () =>
  fixture(async ({ ctx, rows, root }) => {
    saveState(
      { active: '#1857', entryStartTs: new Date(Date.now() - 1000).toISOString() },
      ctx.statePath
    );
    const deps = { context: ctx };
    await recordAskPause({ deps });
    ctx.safePostTiming = async () => {
      throw new Error('ambiguous publication');
    };
    await assert.rejects(finalizeAskResume({ deps }), /ambiguous publication/);
    const markerPath = pendingAskPath(process.env.AI_TASK_MANAGER_SESSION_ID, root);
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    marker.resumeRow = marker.resumeRow.replace('| resume |', '| paused |');
    const corrupted = JSON.stringify(marker);
    writeFileSync(markerPath, corrupted);
    ctx.safePostTiming = async () => {
      throw new Error('must not publish');
    };
    await assert.rejects(finalizeAskResume({ deps }), /ASK_MARKER_INVALID/);
    assert.equal(readFileSync(markerPath, 'utf8'), corrupted);
    assert.equal(rows.length, 1);
    assert.equal(loadState(ctx.statePath).entryStartTs, null);
  }));

test('question hook respects its own manual pause without creating a resume marker', async () =>
  fixture(async ({ ctx, rows }) => {
    saveState({ active: '#1857', entryStartTs: null, paused: true }, ctx.statePath);
    const deps = { context: ctx };
    assert.equal((await recordAskPause({ deps })).status, 'recent-pause');
    assert.equal((await finalizeAskResume({ deps })).status, 'no-marker');
    assert.equal(rows.length, 0);
  }));

async function fixture(operation) {
  const root = createRuntimeRootFixture('actor-flush-');
  const keys = [
    'AI_TASK_MANAGER_PROJECT_DIR',
    'CLAUDE_PROJECT_DIR',
    'AI_TASK_MANAGER_SESSION_ID',
    'AI_TASK_MANAGER_APP_NAME',
    'AI_TASK_MANAGER_TRANSCRIPT_DIR',
    'TT_SKIP_NETWORK',
    'TT_SKIP_FIELD_SELF_CHECK',
  ];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const cwd = process.cwd();
  try {
    process.chdir(root);
    delete process.env.CLAUDE_PROJECT_DIR;
    process.env.AI_TASK_MANAGER_PROJECT_DIR = root;
    process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-flush-a';
    process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
    process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(root, 'transcripts');
    process.env.TT_SKIP_NETWORK = '1';
    process.env.TT_SKIP_FIELD_SELF_CHECK = '1';
    mkdirSync(path.join(root, '.ai-task-manager'), { recursive: true });
    mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR);
    writeFileSync(
      path.join(root, '.ai-task-manager', 'task-tracker.json'),
      JSON.stringify({ repo: 'fixture/repository' })
    );
    const ctx = buildContext(['status']);
    const rows = [];
    ctx.safePostTiming = async (issue, row) => {
      rows.push(row);
      return { ok: true };
    };
    ctx.safeRecordSessionRef = async () => {
      ctx.privateReferenceWrites = (ctx.privateReferenceWrites ?? 0) + 1;
    };
    await operation({ ctx, rows, root });
  } finally {
    process.chdir(cwd);
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}
test('flush preserves genuine own wall interval and unknown estimate despite another actor tail', async () =>
  fixture(async ({ ctx, rows }) => {
    const start = Date.now() - 10000;
    saveState(
      { active: '#1857', entryStartTs: new Date(start).toISOString(), lastWordMarker: 10 },
      ctx.statePath
    );
    ctx.safeReadLastRow = async () => ({
      ts: new Date(start + 5000).toISOString(),
      event: 'pause:other',
      actorKey: timingActorKey({ provider: 'claude', sid: 'fixture-flush-b' }),
    });
    const result = await ctx.flushActiveToGH(
      { active: '#1857', entryStartTs: new Date(start).toISOString(), lastWordMarker: 10 },
      'pause:other',
      'work complete'
    );
    const row = parseTimingRow(result.row);
    assert.equal(row.actorKey, timingActorKey({ provider: 'claude', sid: 'fixture-flush-a' }));
    assert.equal(row.engagement.startMs, start);
    assert.equal(row.engagement.endMs, Date.parse(result.ts));
    assert.equal(row.engagement.activeEstimateSec, null);
    assert.equal(result.deltaMin, null);
    assert.equal(rows.length, 1, 'no invented resume for another actor');
    assert.equal(ctx.privateReferenceWrites ?? 0, 0);
  }));
test('first attributed interruption retains observed cursor delta without a fabricated opener', async () =>
  fixture(async ({ ctx, rows, root }) => {
    writeFileSync(
      path.join(root, 'transcripts', 'fixture-flush-a.jsonl'),
      JSON.stringify({ type: 'assistant', message: { content: 'one two three' } }) + '\n'
    );
    ctx.safeReadLastRow = async () => null;
    saveState(
      {
        active: '#1857',
        entryStartTs: new Date(Date.now() - 1000).toISOString(),
        wordsAtEntryStart: 10,
        lastWordMarker: 10,
        lastFullWordMarker: 20,
      },
      ctx.statePath
    );
    const result = await ctx.flushActiveToGH(
      {
        active: '#1857',
        entryStartTs: new Date(Date.now() - 1000).toISOString(),
        wordsAtEntryStart: 10,
        lastWordMarker: 10,
        lastFullWordMarker: 20,
      },
      'pause:other',
      'done',
      null,
      { suppressRowWords: true }
    );
    const row = parseTimingRow(result.row);
    assert.equal(row.engagement.wordStart, 10);
    assert.equal(row.engagement.wordEnd, 13);
    assert.equal(row.engagement.fullWordStart, 20);
    assert.equal(row.engagement.fullWordEnd, 23);
    assert.equal(rows.length, 1);
  }));

test('update preserves cumulative actor cursor and unknown total after an unavailable estimate', async () =>
  fixture(async ({ ctx, root }) => {
    writeFileSync(
      path.join(root, 'transcripts', 'fixture-flush-a.jsonl'),
      JSON.stringify({ type: 'assistant', message: { content: 'one two three' } }) + '\n'
    );
    ctx.safeReadLastRow = async () => null;
    ctx.heartbeatBindingOccupancy = () => {};
    ctx.rest = ['checkpoint'];
    saveState(
      {
        active: '#1857',
        entryStartTs: new Date(Date.now() - 1000).toISOString(),
        wordsAtEntryStart: 10,
        lastWordMarker: 10,
        lastFullWordMarker: 20,
      },
      ctx.statePath
    );
    const logs = [];
    const log = console.log;
    try {
      console.log = (...parts) => logs.push(parts.join(' '));
      await verbUpdate(ctx);
    } finally {
      console.log = log;
    }
    const state = loadState(ctx.statePath);
    assert.equal(state.wordsAtEntryStart, 13);
    assert.equal(loadMarker(markerPathFor('fixture-flush-a')).words, 13);
    assert.equal(state.totalActiveMinutes, null);
    assert.match(logs.join(' '), /Unknown/);
    assert.doesNotMatch(logs.join(' '), /null active/);
  }));

test('real start pause and resume retain one actor identity and explicit current boundaries', async () =>
  fixture(async ({ ctx, rows }) => {
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--allow-empty',
        '-qm',
        'fixture',
      ],
      { cwd: ctx.projectDir }
    );
    ctx.cfg.repo = '';
    ctx.verb = 'start';
    ctx.rest = ['#1857'];
    ctx.reconcileDependencyDisposition = async () => ({ status: 'unchanged' });
    ctx.safeReadLastRow = async () => rows.map(parseTimingRow).at(-1) ?? null;
    await verbResume(ctx);
    const key = timingActorKey({ provider: 'claude', sid: 'fixture-flush-a' });
    assert.equal(parseTimingRow(rows[0]).actorKey, key);
    ctx.rest = ['other'];
    await verbPause(ctx);
    assert.equal(loadState(ctx.statePath).paused, true);
    ctx.rest = [];
    await verbResume(ctx);
    const parsed = rows.map(parseTimingRow);
    assert.deepEqual(
      parsed.map((row) => row.actorKey),
      [key, key, key]
    );
    assert.deepEqual(
      parsed.map((row) => row.event),
      ['start', 'pause:other', 'resumed']
    );
    assert.equal(loadState(ctx.statePath).paused, undefined);
  }));

test('phase boundary flushes own actor interval and shared lifecycle rows do not duplicate actor work', async () =>
  fixture(async ({ ctx }) => {
    const start = new Date(Date.now() - 2000).toISOString();
    let body = timingInternals.buildInitialComment();
    body = timingInternals.appendRow(
      body,
      buildRow({
        ts: start,
        event: 'develop:started',
        activeSec: 0,
        idleSec: 0,
        wordMarker: 0,
        fullWordMarker: 0,
      })
    );
    saveState(
      { active: '#1857', entryStartTs: start, wordsAtEntryStart: 0, lastWordMarker: 0 },
      ctx.statePath
    );
    const posted = [];
    const post = async ({ row }) => {
      posted.push(row);
      body = timingInternals.appendRow(body, row);
      return { ok: true };
    };
    ctx.safePostTiming = async (issue, row) => post({ row });
    ctx.safeReadLastRow = async () => null;
    await emitPhasePairRows({
      issueArg: '1857',
      stateArg: 'test',
      resolvedFromState: 'develop',
      cfg: ctx.cfg,
      deps: {
        actorContext: ctx,
        ghTimingComment: {
          buildRow,
          postTimingEvent: post,
          readTimingCommentBody: async () => ({ status: 'found', body }),
          bodyOf: (result) => result.body,
        },
      },
    });
    const rows = posted.map(parseTimingRow);
    const interval = rows.find((row) => row.engagement);
    assert.ok(interval, 'phase transition must preserve the genuine current actor interval');
    assert.equal(interval.engagement.startMs, Date.parse(start));
    const completed = rows.find((row) => row.event === 'develop:completed');
    assert.equal(completed.actorKey, undefined, 'stage boundary is an issue-level fact');
    assert.match(completed.marker, /row-sec: a=0 i=0/);
    assert.equal(
      loadState(ctx.statePath).entryStartTs,
      new Date(interval.engagement.endMs).toISOString()
    );
  }));

test('Test interlock records actual verification engagement from a paused own binding', async () =>
  fixture(async ({ ctx, rows }) => {
    saveState(
      { active: '#1857', entryStartTs: null, paused: true, wordsAtEntryStart: 0 },
      ctx.statePath
    );
    ctx.safeReadLastRow = async () => null;
    let executionStart;
    const result = await runTestWithEntryInterlock({
      cfg: ctx.cfg,
      issueNumber: '1857',
      projectDir: ctx.projectDir,
      timingContext: ctx,
      deps: {
        acquireIssueLock: async (options, run) => run(),
        runVerbTest: async () => {
          executionStart = loadState(ctx.statePath).entryStartTs;
          assert.ok(executionStart, 'verification work must open a genuine current actor interval');
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { status: 'passed' };
        },
      },
    });
    assert.equal(result.status, 'passed');
    const interval = rows.map(parseTimingRow).find((row) => row.engagement);
    assert.ok(interval, 'verification work must be flushed before a successful pause');
    assert.equal(interval.engagement.startMs, Date.parse(executionStart));
    assert.ok(interval.engagement.endMs >= interval.engagement.startMs);
    assert.equal(interval.engagement.activeEstimateSec, null);
    const aggregate = deriveActorEngagement(rows.map(parseTimingRow), interval.ts);
    assert.deepEqual(aggregate.failures, []);
    assert.equal(aggregate.engagedMs, interval.engagement.endMs - interval.engagement.startMs);
    assert.ok(
      aggregate.engagedMs >= 5,
      'actual successful verification contributes observed wall engagement'
    );
  }));

test('status distinguishes missing activity observation from zero work', async () =>
  fixture(async ({ ctx }) => {
    saveState(
      {
        active: '#1857',
        entryStartTs: new Date(Date.now() - 60000).toISOString(),
        wordsAtEntryStart: 0,
      },
      ctx.statePath
    );
    const logs = [];
    const previous = console.log;
    try {
      console.log = (...parts) => logs.push(parts.join(' '));
      await verbStatus(ctx);
    } finally {
      console.log = previous;
    }
    assert.match(logs.join(' '), /Unknown active min/);
    assert.match(logs.join(' '), /wall 1/);
  }));

test('failed Test execution retains both its failure and actual actor work', async () =>
  fixture(async ({ ctx, rows }) => {
    saveState(
      { active: '#1857', entryStartTs: null, paused: true, wordsAtEntryStart: 0 },
      ctx.statePath
    );
    ctx.safeReadLastRow = async () => null;
    const failure = new Error('fixture verification failed');
    await assert.rejects(
      runTestWithEntryInterlock({
        cfg: ctx.cfg,
        issueNumber: '1857',
        projectDir: ctx.projectDir,
        timingContext: ctx,
        deps: {
          acquireIssueLock: async (options, run) => run(),
          runVerbTest: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            throw failure;
          },
        },
      }),
      (error) => error === failure
    );
    const interval = rows.map(parseTimingRow).find((row) => row.engagement);
    assert.ok(interval);
    assert.equal(interval.engagement.activeEstimateSec, null);
    const aggregate = deriveActorEngagement(rows.map(parseTimingRow), interval.ts);
    assert.deepEqual(aggregate.failures, []);
    assert.equal(aggregate.engagedMs, interval.engagement.endMs - interval.engagement.startMs);
    assert.ok(
      aggregate.engagedMs >= 5,
      'failed verification also contributes observed wall engagement'
    );
  }));

test('session tracking initializes a versioned own cursor and refuses corrupt existing authority', async () =>
  fixture(async () => {
    const sid = 'fixture-flush-a';
    ensureSessionTracking(sid);
    const file = markerPathFor(sid);
    const record = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(record.schema, 'aitm.word-cursor/v1');
    assert.equal(record.actor, timingActorKey({ provider: 'claude', sid }));
    writeFileSync(file, '{broken');
    assert.throws(() => ensureSessionTracking(sid), { code: 'WORD_CURSOR_INVALID' });
    assert.equal(readFileSync(file, 'utf8'), '{broken');
  }));

test('failed publication retains original row and cursor, then exact replay precedes new work', async () =>
  fixture(async ({ ctx, root }) => {
    const identity = { provider: 'claude', sid: 'fixture-flush-a' };
    writeFileSync(
      path.join(root, 'transcripts', identity.sid + '.jsonl'),
      JSON.stringify({ type: 'assistant', message: { content: 'one two three' } }) +
        String.fromCharCode(10)
    );
    saveState(
      {
        active: '#1857',
        entryStartTs: new Date(Date.now() - 1000).toISOString(),
        wordsAtEntryStart: 0,
        lastWordMarker: 0,
      },
      ctx.statePath
    );
    ctx.safeReadLastRow = async () => null;
    ctx.safePostTiming = async () => {
      throw new Error('publication and queue unavailable');
    };
    await assert.rejects(
      ctx.flushActiveToGH(loadState(ctx.statePath), 'update', 'original evidence'),
      /publication and queue/
    );
    assert.equal(
      loadMarker(markerPathFor(identity.sid)).words,
      0,
      'unpublished words cannot be consumed'
    );
    const file = actorTimingStatePath(identity, root) + '.flush.json';
    const original = readActorFlushJournal(file, identity);
    assert.ok(original);
    const replayed = [];
    ctx.safePostTiming = async (issue, row) => {
      replayed.push(row);
      return { ok: true };
    };
    await ctx.flushActiveToGH(loadState(ctx.statePath), 'pause:other', 'later departure');
    assert.equal(
      replayed[0],
      original.payload.row,
      'original event and bytes must survive a later caller'
    );
    assert.equal(parseTimingRow(replayed[1]).event, 'pause:other');
    assert.equal(parseTimingRow(replayed[1]).engagement.wordStart, 3);
    assert.equal(parseTimingRow(replayed[1]).engagement.wordEnd, 3);
    assert.equal(loadMarker(markerPathFor(identity.sid)).words, 3);
    assert.equal(readActorFlushJournal(file, identity), null);
  }));

test('publication cannot overwrite a concurrently changed own timing boundary', async () =>
  fixture(async ({ ctx }) => {
    saveState(
      {
        active: '#1857',
        entryStartTs: new Date(Date.now() - 1000).toISOString(),
        wordsAtEntryStart: 0,
        lastWordMarker: 0,
      },
      ctx.statePath
    );
    ctx.safeReadLastRow = async () => null;
    const changedStart = new Date(Date.now() + 60000).toISOString();
    ctx.safePostTiming = async () => {
      saveState({ ...loadState(ctx.statePath), entryStartTs: changedStart }, ctx.statePath);
      return { ok: true };
    };
    await assert.rejects(
      ctx.flushActiveToGH(loadState(ctx.statePath), 'update', 'concurrent publication'),
      /ACTOR_FLUSH_STATE_CONFLICT/
    );
    assert.equal(loadState(ctx.statePath).entryStartTs, changedStart);
  }));

test('Review human handoff flushes actual actor work before pausing its own binding', async () =>
  fixture(async ({ ctx, rows }) => {
    const start = new Date(Date.now() - 1000).toISOString();
    saveState(
      { active: '#1857', entryStartTs: start, wordsAtEntryStart: 0, lastWordMarker: 0 },
      ctx.statePath
    );
    ctx.safeReadLastRow = async () => null;
    await pauseReviewTiming(ctx, '#1857');
    const interval = rows.map(parseTimingRow).find((row) => row.engagement);
    assert.equal(interval.engagement.startMs, Date.parse(start));
    assert.equal(interval.event, 'pause:other');
    assert.equal(loadState(ctx.statePath).entryStartTs, null);
    assert.equal(loadState(ctx.statePath).active, '#1857');
  }));

test('compaction hooks use the same actor journal and never resume a paused binding', async () =>
  fixture(async ({ ctx, rows }) => {
    const sid = 'fixture-flush-a';
    saveState(
      {
        active: '#1857',
        entryStartTs: new Date(Date.now() - 1000).toISOString(),
        wordsAtEntryStart: 0,
        lastWordMarker: 0,
      },
      ctx.statePath
    );
    ctx.safeReadLastRow = async () => null;
    await runActorHookTiming(ctx, { event: 'PreCompact', sid });
    await runActorHookTiming(ctx, { event: 'PostCompact', sid });
    const parsed = rows.map(parseTimingRow);
    assert.deepEqual(
      parsed.map((row) => row.event),
      ['pre-compact-flush', 'post-compact-resume']
    );
    assert.equal(parsed[1].engagement.startMs, parsed[0].engagement.endMs);
    assert.equal(parsed[0].engagement.activeEstimateSec, null);
    saveState({ ...loadState(ctx.statePath), entryStartTs: null }, ctx.statePath);
    assert.equal((await runActorHookTiming(ctx, { event: 'PostCompact', sid })).status, 'paused');
    assert.equal(rows.length, 2);
    await assert.rejects(
      runActorHookTiming(ctx, { event: 'PreCompact', sid: 'fixture-foreign' }),
      /HOOK_ACTOR_MISMATCH/
    );
  }));

test('session restart records unknown prior work without synthesizing historical active or idle time', async () =>
  fixture(async ({ ctx, rows }) => {
    const sid = 'fixture-flush-a';
    saveState(
      {
        active: '#1857',
        entryStartTs: new Date(Date.now() - 3600000).toISOString(),
        wordsAtEntryStart: 0,
        lastWordMarker: 0,
      },
      ctx.statePath
    );
    ctx.safeReadLastRow = async () => null;
    const before = Date.now();
    await runActorHookTiming(ctx, { event: 'SessionStart', sid });
    const parsed = rows.map(parseTimingRow);
    assert.equal(parsed[0].event, 'session-end-recovery');
    assert.equal(parsed[0].engagement, undefined);
    assert.equal(parsed[0].cells[3], 'Unknown');
    assert.equal(parsed[0].cells[4], 'Unknown');
    assert.ok(parsed[1].engagement.startMs >= before);
    const result = deriveActorEngagement(parsed, parsed.at(-1).ts);
    assert.equal(result.unknownRows, 1);
    assert.equal(result.complete, false);
    assert.deepEqual(result.failures, []);
  }));

test('actual hook entrypoint refuses a foreign payload actor before mutating timing state', async () =>
  fixture(async ({ ctx, root }) => {
    saveState(
      {
        active: '#1857',
        entryStartTs: new Date(Date.now() - 1000).toISOString(),
        wordsAtEntryStart: 0,
        lastWordMarker: 0,
      },
      ctx.statePath
    );
    const before = loadState(ctx.statePath);
    const run = spawnSync(
      process.execPath,
      [new URL('../../../../task-tracker/hook-handler.mjs', import.meta.url).pathname],
      {
        cwd: root,
        env: process.env,
        encoding: 'utf8',
        input: JSON.stringify({
          hook_event_name: 'PreCompact',
          session_id: 'fixture-foreign',
          event_timestamp: new Date().toISOString(),
        }),
      }
    );
    assert.equal(run.status, 1);
    assert.match(run.stderr, /HOOK_ACTOR_MISMATCH/);
    assert.deepEqual(loadState(ctx.statePath), before);
  }));

test('actual idle SessionStart preserves cumulative actor word evidence', async () =>
  fixture(async ({ ctx, root }) => {
    const sid = 'fixture-flush-a';
    saveState(
      {
        active: null,
        lastActive: '#1857',
        entryStartTs: null,
        paused: true,
        lastWordMarker: 10,
        lastFullWordMarker: 20,
      },
      ctx.statePath
    );
    saveMarker(markerPathFor(sid), 0, 10, '#1857', 20);
    writeFileSync(
      path.join(root, 'transcripts', sid + '.jsonl'),
      JSON.stringify({ type: 'assistant', message: { content: 'idle session record' } }) +
        String.fromCharCode(10)
    );
    const run = spawnSync(
      process.execPath,
      [new URL('../../../../task-tracker/hook-handler.mjs', import.meta.url).pathname],
      {
        cwd: root,
        env: process.env,
        encoding: 'utf8',
        input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: sid }),
      }
    );
    assert.equal(run.status, 0, run.stderr);
    const marker = loadMarker(markerPathFor(sid));
    assert.equal(marker.words, 10);
    assert.equal(marker.wordsFull, 20);
    assert.equal(loadState(ctx.statePath).entryStartTs, null);
  }));
