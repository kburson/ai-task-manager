#!/usr/bin/env node
// @story #208
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
import {
  runPreflight,
  EXIT_BIND_MISMATCH,
  EXIT_HUMAN_MOVE,
  EXIT_ASSIGNEE_MISMATCH,
} from '../lib/verb-preflight.mjs';

const CFG = { repo: 'test/repo', projectId: 'PVT_test' };
const CFG_NO_ASSIGNEE_GATE = {
  repo: 'test/repo',
  projectId: 'PVT_test',
  preferences: { gateAssigneeMatch: false },
};

function depsOf({
  live = '',
  marker = null,
  actor = null,
  assignees = ['kburson'],
  currentUser = 'kburson',
} = {}) {
  return {
    fetchLive: async () => live,
    fetchLastKnownState: async () => marker,
    fetchLastStatusActor: async () => actor,
    fetchAssignees: async () => assignees,
    fetchCurrentUser: async () => currentUser,
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

// 10. #219: assignee guard refuses when current user not in assignees.
{
  const v = await runPreflight({
    stateBefore: { active: '#219' },
    target: '#219',
    cfg: CFG,
    deps: depsOf({
      live: 'develop',
      marker: 'develop',
      assignees: ['alice'],
      currentUser: 'kburson',
    }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_ASSIGNEE_MISMATCH);
  assert.equal(v.kind, 'assignee-mismatch');
  assert.equal(v.assigneeKind, 'assigned-to-other');
  assert.deepEqual(v.assignees, ['alice']);
}

// 11. #219: assignee guard refuses when issue is unassigned.
{
  const v = await runPreflight({
    stateBefore: { active: '#219' },
    target: '#219',
    cfg: CFG,
    deps: depsOf({ live: 'develop', marker: 'develop', assignees: [], currentUser: 'kburson' }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_ASSIGNEE_MISMATCH);
  assert.equal(v.assigneeKind, 'unassigned');
}

// 12. #219: gateAssigneeMatch=false skips guard.
{
  let assigneeFetched = false;
  const v = await runPreflight({
    stateBefore: { active: '#219' },
    target: '#219',
    cfg: CFG_NO_ASSIGNEE_GATE,
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'develop',
      fetchAssignees: async () => {
        assigneeFetched = true;
        return ['alice'];
      },
      fetchCurrentUser: async () => 'kburson',
    },
  });
  assert.equal(v.ok, true);
  assert.equal(assigneeFetched, false, 'guard skipped when gateAssigneeMatch=false');
}

// 13. #219: bind-mismatch wins over assignee-mismatch.
{
  let assigneeFetched = false;
  const v = await runPreflight({
    stateBefore: { active: '#100' },
    target: '#219',
    cfg: CFG,
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'develop',
      fetchAssignees: async () => {
        assigneeFetched = true;
        return ['alice'];
      },
      fetchCurrentUser: async () => 'kburson',
    },
  });
  assert.equal(v.code, EXIT_BIND_MISMATCH);
  assert.equal(assigneeFetched, false);
}

// 14. #219: assignee guard short-circuits before drift check.
{
  let liveFetched = false;
  const v = await runPreflight({
    stateBefore: { active: '#219' },
    target: '#219',
    cfg: CFG,
    deps: {
      fetchLive: async () => {
        liveFetched = true;
        return 'develop';
      },
      fetchLastKnownState: async () => 'develop',
      fetchAssignees: async () => ['alice'],
      fetchCurrentUser: async () => 'kburson',
    },
  });
  assert.equal(v.code, EXIT_ASSIGNEE_MISMATCH);
  assert.equal(liveFetched, false, 'live fetch skipped when assignee guard fires');
}

// 15. #219: assignee fetch failure is non-fatal (treated as ok).
{
  const v = await runPreflight({
    stateBefore: { active: '#219' },
    target: '#219',
    cfg: CFG,
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'develop',
      fetchAssignees: async () => {
        throw new Error('network down');
      },
      fetchCurrentUser: async () => 'kburson',
    },
  });
  assert.equal(v.ok, true);
}

console.log('verb-preflight.test.mjs: ok');
