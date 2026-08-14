#!/usr/bin/env node
// @story #666
// `/task #N` must decide switch-vs-fresh-bind on the CURRENT session's own
// per-session record, not on the global-overlaid `s.active`.
//
// Defect #666: a fresh session (no per-session active-task.json) inherits the
// global ghost pointer through loadState's overlay fallback, so the #N path sees
// `s.active = <ghost> !== target` and routes to verbSwitch — fabricating a
// `switch-out` departure row on the ghost issue's ledger for a switch the
// operator never made.
//
// Asserts:
//   AC4 — a #N rebind in a session with NO own record routes to fresh-bind
//         (records its own start/resumed row on #N) and does NOT call verbSwitch
//         nor post any row to the global ghost issue.
//   AC5 — a genuine in-session switch (this session itself holds #A, then
//         rebinds #B) still routes through verbSwitch (no regression).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const tmp = mkdtempProjectIsolated('tt-resume-no-switch-');
process.env.AI_TASK_MANAGER_PROJECT_DIR = tmp;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(tmp, 'transcripts');
mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });

// Import AFTER env is set so path resolution honors the tmp project.
const { verbResume } = await import('../../../../task-tracker/verbs/resume.mjs');
const { setActiveTask } = await import('../../../../task-tracker/session-state.mjs');

let stateSeq = 0;
function writeGlobalState(obj) {
  const p = path.join(tmp, `state-${stateSeq++}.json`);
  writeFileSync(p, JSON.stringify(obj), 'utf8');
  return p;
}

function makeCtx({ rest, statePath, switchSpy }) {
  const posts = [];
  return {
    ctx: {
      rest,
      cfg: {}, // no repo — keep the timing-read path inert
      statePath,
      projectDir: tmp,
      role: 'agent',
      drainQueueIfAny: async () => {},
      safePostTiming: async (issue, row) => posts.push({ issue, row }),
      nowIso: () => new Date().toISOString(),
      verbSwitch: switchSpy,
      seedKanban: async () => {},
    },
    posts,
  };
}

test('AC4 — fresh session + global ghost: no verbSwitch, start row on the target', async () => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'fresh-no-record-666';
  // Global pointer holds a prior session's ghost; this session has NO own record.
  const statePath = writeGlobalState({ active: '#628', lastActive: '#628' });

  const switchCalls = [];
  const { ctx, posts } = makeCtx({
    rest: ['#666'],
    statePath,
    switchSpy: async (_ctx, tgt) => switchCalls.push(tgt),
  });

  await verbResume(ctx);

  assert.equal(
    switchCalls.length,
    0,
    'AC4: verbSwitch must NOT be called on a fresh-session rebind'
  );
  assert.equal(posts.length, 1, 'AC4: exactly one timing row posted');
  assert.equal(posts[0].issue, '#666', 'AC4: the row lands on the target, not the ghost');
  assert.ok(
    !posts.some((p) => p.issue === '#628'),
    'AC4: no switch-out row fabricated on the ghost issue'
  );
});

test('AC5 — session holds #A, rebind #B still routes through verbSwitch', async () => {
  process.env.AI_TASK_MANAGER_SESSION_ID = 'holds-a-555';
  // This session genuinely holds #555 in its own per-session record.
  setActiveTask('holds-a-555', { issue: '#555' }, tmp);
  const statePath = writeGlobalState({ active: '#555', lastActive: '#555' });

  const switchCalls = [];
  const { ctx, posts } = makeCtx({
    rest: ['#666'],
    statePath,
    switchSpy: async (_ctx, tgt) => switchCalls.push(tgt),
  });

  await verbResume(ctx);

  assert.equal(
    switchCalls.length,
    1,
    'AC5: a genuine in-session switch still routes through verbSwitch'
  );
  assert.equal(switchCalls[0], '#666', 'AC5: verbSwitch invoked with the rebind target');
  assert.equal(
    posts.length,
    0,
    'AC5: resume itself posts nothing; the stubbed switch owns the row'
  );
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
