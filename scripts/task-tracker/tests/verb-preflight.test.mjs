#!/usr/bin/env node
// Unit: `runPreflight` from lib/verb-preflight.mjs (#208, refactored in #218).
//
// Under #218 the issue body `aitm-last-known-state` marker IS the local state.
// Branches covered:
//   1. no-active, no-target           → ok, unchanged
//   2. bind-mismatch                  → refused, exit 7
//   3. live == marker                 → ok, unchanged
//   4. marker absent (fresh issue)    → ok, unchanged
//   5. live ≠ marker                  → refused, exit 9 human-move
//   6. live empty (offline / no item) → ok, unchanged
//   7. TT_SKIP_NETWORK=1 short-circuit
//   8. missing cfg                    → ok, no network

import { strict as assert } from 'node:assert';
import { runPreflight, EXIT_BIND_MISMATCH, EXIT_HUMAN_MOVE } from '../lib/verb-preflight.mjs';

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
    stateBefore: { active: null },
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
    stateBefore: { active: '#100' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'develop', marker: 'develop' }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_BIND_MISMATCH);
  assert.equal(v.kind, 'bind-mismatch');
  assert.equal(v.active, '#100');
}

// 2b. Bind-mismatch fires BEFORE live fetch.
{
  let liveFetched = false;
  await runPreflight({
    stateBefore: { active: '#100' },
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

// 3. live == marker — ok, unchanged.
{
  const v = await runPreflight({
    stateBefore: { active: '#208' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'develop', marker: 'develop' }),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, false);
}

// 3b. live case-mismatch — both normalize to lowercase → ok.
{
  const v = await runPreflight({
    stateBefore: { active: '#208' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'Develop', marker: 'develop' }),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, false);
}

// 4. Marker absent (fresh issue, never moved) — ok, unchanged.
{
  const v = await runPreflight({
    stateBefore: { active: '#208' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'develop', marker: null }),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, false);
}

// 5. human-move: live ≠ marker.
{
  const v = await runPreflight({
    stateBefore: { active: '#208' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'review', marker: 'develop', actor: { login: 'kburson', type: 'User' } }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_HUMAN_MOVE);
  assert.equal(v.kind, 'human-move');
  assert.equal(v.live, 'review');
  assert.equal(v.marker, 'develop');
  assert.equal(v.local, 'develop', '#218: local mirrors marker');
  assert.equal(v.actor.login, 'kburson');
}

// 6. Live empty — fetch failed / item missing — ok, unchanged.
{
  const v = await runPreflight({
    stateBefore: { active: '#208' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: '', marker: 'develop' }),
  });
  assert.equal(v.ok, true);
  assert.equal(v.changed, false);
}

// 7. TT_SKIP_NETWORK=1 short-circuits live fetch.
{
  const prior = process.env.TT_SKIP_NETWORK;
  process.env.TT_SKIP_NETWORK = '1';
  try {
    let liveFetched = false;
    const v = await runPreflight({
      stateBefore: { active: '#208' },
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

// 8. Missing cfg — no network attempted, ok.
{
  let liveFetched = false;
  const v = await runPreflight({
    stateBefore: { active: '#208' },
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

// 9. #218: stateBefore.state is IGNORED — even if it's stale/wrong, the
// marker is the local source. A "stale" state field doesn't trigger drift.
{
  const v = await runPreflight({
    stateBefore: { active: '#208', state: 'review' }, // stale, should be ignored
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: 'develop', marker: 'develop' }),
  });
  assert.equal(v.ok, true, '#218: stale stateBefore.state must not cause drift');
  assert.equal(v.changed, false);
}

console.log('verb-preflight.test.mjs: ok');
