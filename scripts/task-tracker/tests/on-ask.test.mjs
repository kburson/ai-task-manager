#!/usr/bin/env node
// EPIC #238 / #240 — AskUserQuestion pause/resume bracket hooks.
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { projectScratchDir } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { setActiveTask } from '../session-state.mjs';
import {
  recordAskPause,
  finalizeAskResume,
  pendingAskPath,
  computeGapSeconds,
  lastRowIsRecentPause,
} from '../hooks/on-ask.mjs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'tt-on-ask-'));

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
  setActiveTask(sid, { issue: '#240', entryStartTs: 'x', wordsAtStart: 0 }, tmp);
  const env = { CLAUDE_SESSION_ID: sid, AI_TASK_MANAGER_PROJECT_DIR: tmp };
  const posts = [];
  const deps = {
    postTimingEvent: async (a) => posts.push(a),
    fetchTimingBody: async () => '',
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
  const resumeAt = new Date(pauseAt.getTime() + 47_000);
  const rr = await finalizeAskResume({ env, now: () => resumeAt, deps });
  assert.equal(rr.status, 'ok');
  assert.equal(rr.issue, '#240');
  assert.equal(rr.idleSeconds ?? rr.idleSec, 47);

  assert.equal(posts.length, 2, 'exactly one pause + one resume row');
  const [pause, resume] = posts;
  assert.match(pause.row, /\bpause\b/);
  assert.match(pause.row, /reason: ask-pause/);
  assert.match(resume.row, /\bresume\b/);
  assert.match(resume.row, /reason: ask-resume/);
  // Seconds-precision idle cell rides the row-sec marker (AC5).
  assert.match(resume.row, /row-sec: a=0 i=47/);
  assert.equal(existsSync(markerPath), false, 'marker deleted on resume');
}

// Test 4: resume with no prior marker → no-op (no unbalanced resume row).
{
  const sid = 'lonely-resume';
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
  setActiveTask(sid, { issue: '#240', entryStartTs: 'x', wordsAtStart: 0 }, tmp);
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
    deps: { postTimingEvent: async (a) => posts.push(a), fetchTimingBody: async () => body },
  });
  assert.equal(r.status, 'recent-pause');
  assert.equal(posts.length, 0);
  assert.equal(existsSync(pendingAskPath(sid, tmp)), false, 'no marker on suppressed pause');
}

// Test 6: foreign-session marker is refused, not consumed.
{
  const sid = 'mine';
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
