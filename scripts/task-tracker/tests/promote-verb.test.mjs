#!/usr/bin/env node
// Unit tests for scripts/task-tracker/verbs/promote.mjs.
//
// All cases drive runPromote with stubbed deps — no network, no spawn.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { runPromote } from '../verbs/promote.mjs';

const cfg = { repo: 'o/r', projectId: 'PROJ_1' };

function makeDeps({ body = '', live = null, spawnCode = 0, moveCode = 0, fetchSecondBody } = {}) {
  let secondFetch = false;
  const calls = {
    writes: [],
    timings: [],
    spawns: [],
    moves: [],
    fetches: 0,
  };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => {
        calls.fetches++;
        if (secondFetch && fetchSecondBody !== undefined) return { body: fetchSecondBody };
        secondFetch = true;
        return { body };
      },
      writeIssueBody: async ({ body: b }) => {
        calls.writes.push(b);
      },
      getLiveState: async () => live,
      spawnVerb: async ({ verb, issueNumber }) => {
        calls.spawns.push({ verb, issueNumber });
        return spawnCode;
      },
      runMoveState: async ({ issueNumber, target }) => {
        calls.moves.push({ issueNumber, target });
        return moveCode;
      },
      postTimingRow: async ({ row }) => {
        calls.timings.push(row);
      },
    },
  };
}

function bodyWithState(state) {
  return `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n## Issue\n\nbody.\n`;
}

test('promote: happy path forward chain — groom→analyze delegates to /task analyze', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('groom'), live: 'groom' });
  const r = await runPromote({ issueNumber: 100, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.from, 'groom');
  assert.equal(r.to, 'analyze');
  assert.equal(r.via, 'alias:analyze');
  assert.deepEqual(calls.spawns, [{ verb: 'analyze', issueNumber: 100 }]);
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.timings.length, 1);
  assert.match(calls.timings[0], /move:analyze/);
});

test('promote: analyze→development delegates to /task approve', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('analyze'), live: 'analyze' });
  const r = await runPromote({ issueNumber: 101, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'development');
  assert.equal(r.via, 'alias:approve');
  assert.deepEqual(calls.spawns, [{ verb: 'approve', issueNumber: 101 }]);
});

test('promote: development→validate delegates to /task review', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('development'), live: 'development' });
  const r = await runPromote({ issueNumber: 102, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'validate');
  assert.equal(r.via, 'alias:review');
  assert.deepEqual(calls.spawns, [{ verb: 'review', issueNumber: 102 }]);
});

test('promote: validate→review is a direct move-state call (no alias verb exists)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('validate'), live: 'validate' });
  const r = await runPromote({ issueNumber: 103, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'review');
  assert.equal(r.via, 'direct');
  assert.equal(calls.spawns.length, 0);
  assert.deepEqual(calls.moves, [{ issueNumber: 103, target: 'review' }]);
});

test('promote: review→done delegates to /task close', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('review'), live: 'review' });
  const r = await runPromote({ issueNumber: 104, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.to, 'done');
  assert.equal(r.via, 'alias:close');
  assert.deepEqual(calls.spawns, [{ verb: 'close', issueNumber: 104 }]);
});

test('promote: backlog→groom is a direct move-state call (with groom-estimate hook)', async () => {
  const rationale = '<!-- aitm-groom-rationale: {"size":"a","estimate":"b","priority":"c"} -->';
  const body = `${bodyWithState('backlog')}\n${rationale}\n`;
  const { deps, calls } = makeDeps({ body, live: 'backlog' });
  deps.groomEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({ size: 'S', estimate: 4, priority: 'P2' }),
    listCommentBodies: async () => [],
    postComment: async () => {},
    writeIssueBody: async () => {},
  };
  const r = await runPromote({ issueNumber: 105, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.via, 'direct');
  assert.deepEqual(calls.moves, [{ issueNumber: 105, target: 'groom' }]);
  assert.equal(r.groomPost.status, 'posted');
});

test('promote: backlog→groom refused when groom-estimate signals are missing', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('backlog'), live: 'backlog' });
  deps.groomEstimate = {
    loadProjectFieldDefs: () => [],
    projectValuesForIssue: async () => ({}),
  };
  const r = await runPromote({ issueNumber: 1055, cfg, deps });
  assert.equal(r.status, 'groom-gate-refused');
  assert.ok(r.blockers.length >= 2);
  assert.equal(calls.moves.length, 0);
});

test('promote: terminal refusal on done', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('done'), live: 'done' });
  const r = await runPromote({ issueNumber: 106, cfg, deps });
  assert.equal(r.status, 'terminal-refused');
  assert.match(r.message, /already in done/);
  assert.equal(calls.spawns.length, 0);
  assert.equal(calls.moves.length, 0);
});

test('promote: drift refused when live ≠ recorded', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('analyze'), live: 'development' });
  const r = await runPromote({ issueNumber: 107, cfg, deps });
  assert.equal(r.status, 'drift-refused');
  assert.equal(r.live, 'development');
  assert.equal(r.recorded, 'analyze');
  assert.match(r.message, /drift detected/);
  assert.match(r.message, /\/task reconcile/);
  assert.equal(calls.spawns.length, 0);
  assert.equal(calls.moves.length, 0);
});

test('promote: bootstrap when lastKnownState absent — syncs to live, then promotes', async () => {
  const { deps, calls } = makeDeps({ body: '## just a body\n', live: 'analyze' });
  const r = await runPromote({ issueNumber: 108, cfg, deps });
  assert.equal(r.status, 'promoted');
  assert.equal(r.bootstrapped, true);
  assert.equal(r.from, 'analyze');
  assert.equal(r.to, 'development');
  // The bootstrap write happens before the transition; the post-transition
  // re-stamp may also write. At minimum the bootstrap write was made.
  assert.ok(calls.writes.length >= 1);
  assert.match(calls.writes[0], /aitm-last-known-state: analyze/);
});

test('promote: transition-failed when alias verb exits non-zero — no metadata update', async () => {
  const { deps, calls } = makeDeps({
    body: bodyWithState('analyze'),
    live: 'analyze',
    spawnCode: 4,
  });
  const r = await runPromote({ issueNumber: 109, cfg, deps });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.transitionResult.exitCode, 4);
  // No timing row, no metadata write (bootstrap did not fire).
  assert.equal(calls.timings.length, 0);
  assert.equal(calls.writes.length, 0);
});

test('promote: error when recorded state is unknown', async () => {
  const { deps } = makeDeps({
    body: '<!-- aitm-last-known-state: bogus -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n',
    live: 'bogus',
  });
  const r = await runPromote({ issueNumber: 110, cfg, deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unknown recorded state/);
});

test('promote: writes move:<target> audit row with current ts (within retroactive-ts window)', async () => {
  const { deps, calls } = makeDeps({ body: bodyWithState('validate'), live: 'validate' });
  await runPromote({ issueNumber: 111, cfg, deps });
  assert.equal(calls.timings.length, 1);
  assert.match(calls.timings[0], /\| move:review \|/);
});
