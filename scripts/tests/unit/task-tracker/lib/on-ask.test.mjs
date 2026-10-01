#!/usr/bin/env node
// @story #240
// EPIC #238 / #240 — AskUserQuestion pause/resume bracket hooks.
import { withUnitRuntimeRoot } from '../../../helpers/unit-runtime-root.mjs';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { saveState } from '../../../../task-tracker/state.mjs';
import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import { timingActorKey } from '../../../../task-tracker/lib/timing-actor.mjs';
import {
  recordAskPause,
  finalizeAskResume,
  pendingAskPath,
  computeGapSeconds,
  lastRowIsRecentPause,
} from '../../../../task-tracker/hooks/on-ask.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-on-ask-'));

const priorSid = process.env.AI_TASK_MANAGER_SESSION_ID;
const priorApp = process.env.AI_TASK_MANAGER_APP_NAME;
process.env.AI_TASK_MANAGER_APP_NAME = 'claude';
try {
  await withUnitRuntimeRoot(
    async () => {
      // Test 1: no session id → no-op, no marker, no posts.
      {
        const calls = [];
        const r = await recordAskPause({
          env: {},
          deps: { postTimingEvent: async (a) => calls.push(a), fetchTimingBody: async () => '' },
        });
        assert.equal(r.status, 'no-session');
        assert.equal(calls.length, 0);
      }

      // Test 2: session present but nothing bound → no-op (AC3), no marker written.
      {
        const env = { CLAUDE_SESSION_ID: 'unbound', AI_TASK_MANAGER_PROJECT_DIR: tmp };
        const calls = [];
        const r = await recordAskPause({
          env,
          deps: { postTimingEvent: async (a) => calls.push(a), fetchTimingBody: async () => '' },
        });
        assert.equal(r.status, 'no-active');
        assert.equal(calls.length, 0);
        assert.equal(existsSync(pendingAskPath('unbound', tmp)), false);
      }

      // Test 3: full paired cycle — pause then resume yields exactly one pause row
      // and one matching resume row, resume carries idle seconds with seconds
      // precision, marker is written then deleted (AC1, AC2, AC5).
      {
        const sid = 'paired';
        process.env.AI_TASK_MANAGER_SESSION_ID = sid;
        const started = new Date(Date.now() - 1000).toISOString();
        setActiveTask(sid, { issue: '#240', entryStartTs: started, wordsAtStart: 0 }, tmp);
        saveState(
          {
            active: '#240',
            entryStartTs: started,
            lastActive: '#240',
            lastWordMarker: 100,
            lastFullWordMarker: 200,
          },
          path.join(tmp, '.tmp/aitm/state/task-tracker-state.json')
        );
        const env = { CLAUDE_SESSION_ID: sid, AI_TASK_MANAGER_PROJECT_DIR: tmp };
        const posts = [];
        const deps = {
          context: {
            projectDir: tmp,
            statePath: path.join(tmp, '.tmp/aitm/state/task-tracker-state.json'),
            flushActiveToGH: async (state, event) => {
              const ts = new Date().toISOString();
              const row = buildRow({
                ts,
                event,
                activeSec: null,
                idleSec: null,
                actorKey: timingActorKey({ provider: 'claude', sid }),
                wordMarker: state.lastWordMarker,
                fullWordMarker: state.lastFullWordMarker,
              });
              posts.push({ row });
              return { ts, row };
            },
            safePostTiming: async (issue, row) => {
              posts.push({ row });
              return { ok: true };
            },
          },
        };

        // buildRow forbids timestamps >60s from real now, so anchor on the wall
        // clock; the gap (resume - pause) is what matters and is deterministic.
        const pauseAt = new Date();
        const rp = await recordAskPause({ env, now: () => pauseAt, deps });
        assert.equal(rp.status, 'ok');
        assert.equal(rp.issue, '#240');
        const markerPath = pendingAskPath(sid, tmp);
        assert.equal(existsSync(markerPath), true, 'marker written on pause');

        // 47 seconds later the answer comes back.
        const observedPause = JSON.parse(readFileSync(markerPath, 'utf8')).pausedAt;
        const resumeAt = new Date(Date.parse(observedPause) + 47_000);
        const rr = await finalizeAskResume({ env, now: () => resumeAt, deps });
        assert.equal(rr.status, 'ok');
        assert.equal(rr.issue, '#240');
        assert.equal(rr.idleSeconds ?? rr.idleSec, 47);

        assert.equal(posts.length, 2, 'exactly one pause + one resume row');
        const [pause, resume] = posts;
        assert.equal(parseTimingRow(pause.row).event, 'paused');
        assert.equal(parseTimingRow(resume.row).event, 'resume');
        assert.deepEqual(
          posts.map(({ row }) => parseTimingRow(row).fullWordMarker),
          ['200', '200'],
          'the real ask pause/resume producers preserve the durable full cursor'
        );
        // Human wait is reported separately, never charged as actor work.
        assert.equal(parseTimingRow(resume.row).engagement.startMs, resumeAt.getTime());
        assert.equal(parseTimingRow(resume.row).engagement.endMs, resumeAt.getTime());
        assert.equal(existsSync(markerPath), false, 'marker deleted on resume');
      }

      // Test 4: resume with no prior marker → no-op (no unbalanced resume row).
      {
        const sid = 'lonely-resume';
        process.env.AI_TASK_MANAGER_SESSION_ID = sid;
        setActiveTask(sid, { issue: '#240', entryStartTs: 'x', wordsAtStart: 0 }, tmp);
        const env = { CLAUDE_SESSION_ID: sid, AI_TASK_MANAGER_PROJECT_DIR: tmp };
        const posts = [];
        const r = await finalizeAskResume({
          env,
          deps: { postTimingEvent: async (a) => posts.push(a) },
        });
        assert.equal(r.status, 'no-marker');
        assert.equal(posts.length, 0);
      }

      // Test 5: AC4 idempotency — a manual `/task pause` row that just landed
      // suppresses the auto pause (no marker, no post).
      {
        const sid = 'recent-manual';
        process.env.AI_TASK_MANAGER_SESSION_ID = sid;
        setActiveTask(sid, { issue: '#240', entryStartTs: null, wordsAtStart: 0 }, tmp);
        saveState(
          { active: '#240', entryStartTs: null, paused: true },
          path.join(tmp, '.tmp/aitm/state/task-tracker-state.json')
        );
        const env = { CLAUDE_SESSION_ID: sid, AI_TASK_MANAGER_PROJECT_DIR: tmp };
        const now = new Date('2026-06-14T12:00:00.000Z');
        // A manual pause row stamped 1s ago.
        const recentTs = '2026-06-14 11:59:59 +00:00';
        const body = [
          '| Timestamp | Event | Active | Idle | Words | | Description |',
          '|---|---|---|---|---|---|---|',
          `| ${recentTs} | pause | 0s | 0s | 0 | | manual |`,
        ].join('\n');
        const posts = [];
        const r = await recordAskPause({
          env,
          now: () => now,
          deps: {
            context: {
              projectDir: tmp,
              statePath: path.join(tmp, '.tmp/aitm/state/task-tracker-state.json'),
              flushActiveToGH: async () => posts.push(body),
            },
          },
        });
        assert.equal(r.status, 'recent-pause');
        assert.equal(posts.length, 0);
        assert.equal(existsSync(pendingAskPath(sid, tmp)), false, 'no marker on suppressed pause');
      }

      // Test 6: foreign-session marker is refused, not consumed.
      {
        const sid = 'mine';
        process.env.AI_TASK_MANAGER_SESSION_ID = sid;
        setActiveTask(sid, { issue: '#240', entryStartTs: 'x', wordsAtStart: 0 }, tmp);
        // Write a marker stamped by another session.
        const env = { CLAUDE_SESSION_ID: sid, AI_TASK_MANAGER_PROJECT_DIR: tmp };
        // First, create another session's marker under its own session dir.
        await recordAskPause({
          env: { CLAUDE_SESSION_ID: 'other', AI_TASK_MANAGER_PROJECT_DIR: tmp },
          now: () => new Date(),
          deps: { postTimingEvent: async () => {}, fetchTimingBody: async () => '' },
        });
        // 'other' wrote pending-ask under its own session dir; 'mine' has none.
        const posts = [];
        const r = await finalizeAskResume({
          env,
          deps: { postTimingEvent: async (a) => posts.push(a) },
        });
        assert.equal(r.status, 'no-marker');
        assert.equal(posts.length, 0);
      }

      // Unit: computeGapSeconds clamps and floors.
      assert.equal(
        computeGapSeconds('2026-06-14T12:00:00.000Z', Date.parse('2026-06-14T12:00:09.900Z')),
        9
      );
      assert.equal(computeGapSeconds('not-a-date'), 0);
      assert.equal(
        computeGapSeconds('2026-06-14T12:00:10.000Z', Date.parse('2026-06-14T12:00:00.000Z')),
        0
      );

      // Unit: lastRowIsRecentPause only fires for a recent pause as the last row.
      {
        const now = Date.parse('2026-06-14T12:00:00.000Z');
        const recent = '| 2026-06-14 11:59:59 +00:00 | pause | 0s | 0s | 0 | | x |';
        const old = '| 2026-06-14 11:00:00 +00:00 | pause | 0s | 0s | 0 | | x |';
        const resume = '| 2026-06-14 11:59:59 +00:00 | resume | 0s | 0s | 0 | | x |';
        const hdr = '| Timestamp | Event |\n|---|---|';
        assert.equal(lastRowIsRecentPause(`${hdr}\n${recent}`, now), true);
        assert.equal(lastRowIsRecentPause(`${hdr}\n${old}`, now), false);
        assert.equal(lastRowIsRecentPause(`${hdr}\n${resume}`, now), false);
        assert.equal(lastRowIsRecentPause('', now), false);
      }

      rmSync(tmp, { recursive: true });
      console.log('on-ask.test.mjs: all passed');
    },
    { projectRoot: tmp }
  );
} finally {
  if (priorSid === undefined) delete process.env.AI_TASK_MANAGER_SESSION_ID;
  else process.env.AI_TASK_MANAGER_SESSION_ID = priorSid;
  if (priorApp === undefined) delete process.env.AI_TASK_MANAGER_APP_NAME;
  else process.env.AI_TASK_MANAGER_APP_NAME = priorApp;
  rmSync(tmp, { recursive: true, force: true });
}
