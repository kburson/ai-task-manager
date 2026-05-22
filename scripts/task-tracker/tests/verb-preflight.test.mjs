#!/usr/bin/env node
// Unit: `runPreflight` from lib/verb-preflight.mjs (#208).
//
// Covers the eight branches the helper must handle:
//   1. no-active, no-target           → ok, unchanged
//   2. bind-mismatch                  → refused, exit 7
//   3. active set, no target          → ok, syncs local→live
//   4. live == local                  → ok, unchanged
//   5. live present, local null       → ok, stamps state.state=live
//   6. live ≠ local, marker == live   → refused, exit 8 ai-oversight
//   7. live ≠ local, marker != live   → refused, exit 9 human-move
//   8. live empty (offline / no item) → ok, unchanged

import { strict as assert } from 'node:assert';
import {
  runPreflight,
  EXIT_BIND_MISMATCH,
  EXIT_AI_OVERSIGHT,
  EXIT_HUMAN_MOVE,
} from '../lib/verb-preflight.mjs';

const CFG = { repo: 'test/repo', projectId: 'PVT_test' };

function depsOf({ live = '', marker = null, actor = null } = {}) {
  return {
    fetchLive: async () => live,
    fetchLastKnownState: async () => marker,
    fetchLastStatusActor: async () => actor,
  };
}

// 1. No active, no target — nothing to reconcile.
{
  const v = await runPreflight({
    stateBefore: { active: null, state: null },
    target: undefined,
    cfg: CFG,
    deps: depsOf(),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, false);
}

// 2. Bind-mismatch — target differs from active.
{
  const v = await runPreflight({
    stateBefore: { active: '#100', state: 'develop' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'develop' }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_BIND_MISMATCH);
  assert.equal(v.kind, 'bind-mismatch');
  assert.equal(v.active, '#100');
}

// 2b. Bind-mismatch fires BEFORE live fetch — even when live agrees with active.
{
  let liveFetched = false;
  await runPreflight({
    stateBefore: { active: '#100', state: 'develop' },
    target: '#208',
    cfg: CFG,
    deps: {
      fetchLive: async () => {
        liveFetched = true;
        return 'develop';
      },
    },
  });
  assert.equal(liveFetched, false);
}

// 3. Active set, no target — reconciles against active.
{
  const v = await runPreflight({
    stateBefore: { active: '#208', state: 'develop' },
    target: undefined,
    cfg: CFG,
    deps: depsOf({ live: 'develop' }),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, false);
}

// 4. Live == local — ok, unchanged.
{
  const v = await runPreflight({
    stateBefore: { active: '#208', state: 'develop' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'develop' }),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, false);
}

// 5. Live present, local null — stamps state.state.
{
  const v = await runPreflight({
    stateBefore: { active: '#208', state: null },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'develop' }),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, true);
  assert.equal(v.stateAfter.state, 'develop');
}

// 5b. Live case-mismatch — normalized to lowercase, stamps.
{
  const v = await runPreflight({
    stateBefore: { active: '#208', state: 'Develop' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'develop' }),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, true);
  assert.equal(v.stateAfter.state, 'develop');
}

// 6. ai-oversight: live ≠ local, marker matches live.
{
  const v = await runPreflight({
    stateBefore: { active: '#208', state: 'develop' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'test', marker: 'test' }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_AI_OVERSIGHT);
  assert.equal(v.kind, 'ai-oversight');
  assert.equal(v.live, 'test');
  assert.equal(v.local, 'develop');
  assert.equal(v.marker, 'test');
}

// 7. human-move: live ≠ local, marker doesn't match live.
{
  const v = await runPreflight({
    stateBefore: { active: '#208', state: 'develop' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'review', marker: 'develop', actor: { login: 'kburson', type: 'User' } }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_HUMAN_MOVE);
  assert.equal(v.kind, 'human-move');
  assert.equal(v.live, 'review');
  assert.equal(v.marker, 'develop');
  assert.equal(v.actor.login, 'kburson');
}

// 7b. human-move: marker null also routes to human-move (not ai-oversight).
{
  const v = await runPreflight({
    stateBefore: { active: '#208', state: 'develop' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'review', marker: null }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_HUMAN_MOVE);
  assert.equal(v.marker, null);
}

// 8. Live empty — fetch failed / item missing — ok, unchanged.
{
  const v = await runPreflight({
    stateBefore: { active: '#208', state: 'develop' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: '' }),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, false);
}

// 9. TT_SKIP_NETWORK=1 short-circuits live fetch even with mismatch deps.
{
  const prior = process.env.TT_SKIP_NETWORK;
  process.env.TT_SKIP_NETWORK = '1';
  try {
    let liveFetched = false;
    const v = await runPreflight({
      stateBefore: { active: '#208', state: 'develop' },
      target: '#208',
      cfg: CFG,
      deps: {
        fetchLive: async () => {
          liveFetched = true;
          return 'review';
        },
      },
    });
    assert.equal(v.ok, true);
    assert.equal(v.skippedNetwork, true);
    assert.equal(liveFetched, false);
  } finally {
    if (prior === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prior;
  }
}

// 10. Missing cfg — no network attempted, ok.
{
  let liveFetched = false;
  const v = await runPreflight({
    stateBefore: { active: '#208', state: 'develop' },
    target: '#208',
    cfg: null,
    deps: {
      fetchLive: async () => {
        liveFetched = true;
        return 'review';
      },
    },
  });
  assert.equal(v.ok, true);
  assert.equal(liveFetched, false);
}

console.log('verb-preflight.test.mjs: ok');
