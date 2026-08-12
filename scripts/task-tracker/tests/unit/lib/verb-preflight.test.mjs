#!/usr/bin/env node
// @story #208 #1212
// Unit: `runPreflight` from lib/verb-preflight.mjs (#208, refactored in #218).
//
// Under #218 the issue body `aitm-last-known-state` marker IS the local state.
// Branches covered:
//   1. no-active, no-target           → ok, unchanged
//   2. bind-mismatch                  → refused, exit 7
//   3. live == marker                 → ok, unchanged
//   4. marker absent (fresh issue)    → ok, unchanged
//   5. live ≠ marker                  → refused, exit 9 human-move
//   6. live empty (offline / no item) → ownership-unverifiable, fail closed
//   7. TT_SKIP_NETWORK=1 short-circuit
//   8. missing cfg                    → ok, no network

import { strict as assert } from 'node:assert';
import {
  runPreflight,
  EXIT_BIND_MISMATCH,
  EXIT_HUMAN_MOVE,
  EXIT_ASSIGNEE_MISMATCH,
} from '../../../lib/verb-preflight.mjs';

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

// 3c. Production preflight consumes one atomic Status+assignee snapshot and
// never calls the split live/assignee readers.
{
  let snapshots = 0;
  const v = await runPreflight({
    stateBefore: { active: '#1212' },
    target: '#1212',
    cfg: CFG,
    deps: {
      fetchSnapshot: async () => {
        snapshots += 1;
        return { state: 'develop', assignees: ['kburson'] };
      },
      fetchLive: async () => assert.fail('split Status read must not run'),
      fetchAssignees: async () => assert.fail('split assignee read must not run'),
      fetchCurrentUser: async () => 'kburson',
      fetchLastKnownState: async () => 'develop',
    },
  });
  assert.equal(v.ok, true);
  assert.equal(snapshots, 1);
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

// 6. Live empty — ownership policy cannot determine whether an owner is
// required, so the shared preflight fails closed.
{
  const v = await runPreflight({
    stateBefore: { active: '#208' },
    target: '#208',
    cfg: CFG,
    deps: depsOf({ live: '', marker: 'develop' }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_ASSIGNEE_MISMATCH);
  assert.equal(v.assigneeKind, 'ownership-unverifiable');
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
  assert.equal(v.assigneeKind, 'foreign-owner');
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
  assert.equal(v.assigneeKind, 'human-coordination-required');
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

// 14. #1212: live state resolves before the lifecycle-aware ownership gate.
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
  assert.equal(liveFetched, true, 'live state is required to evaluate ownership');
}

// 15. #769: assignee fetch failure fails CLOSED (was fail-open under #219).
//     A lock must not open on a transient gh failure — the verdict is
//     `unverifiable` and the caller refuses.
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
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_ASSIGNEE_MISMATCH);
  assert.equal(v.assigneeKind, 'ownership-unverifiable');
}

// 16. #845: cold bind with target now threaded — assignee gate runs and
//     refuses when the issue is unassigned. Regression: previously a cold
//     `start <N>` call always threaded `target: undefined` for active-only
//     verbs, which early-returned `{ok:true}` before this gate ever ran.
{
  const v = await runPreflight({
    stateBefore: { active: null },
    target: '#845',
    cfg: CFG,
    deps: depsOf({ live: 'develop', marker: 'develop', assignees: [], currentUser: 'kburson' }),
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, EXIT_ASSIGNEE_MISMATCH);
  assert.equal(v.assigneeKind, 'human-coordination-required');
}

// 17. #845: cold bind, assigned to someone else — refused.
{
  const v = await runPreflight({
    stateBefore: { active: null },
    target: '#845',
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
  assert.equal(v.assigneeKind, 'foreign-owner');
}

// 18. #845: cold bind, assigned to the current user — succeeds.
{
  const v = await runPreflight({
    stateBefore: { active: null },
    target: '#845',
    cfg: CFG,
    deps: depsOf({
      live: 'develop',
      marker: 'develop',
      assignees: ['kburson'],
      currentUser: 'kburson',
    }),
  });
  assert.equal(v.ok, true);
}

// 19. #845: cold bind, TT_SKIP_NETWORK=1 — gate short-circuits as elsewhere.
{
  const prior = process.env.TT_SKIP_NETWORK;
  process.env.TT_SKIP_NETWORK = '1';
  try {
    let assigneeFetched = false;
    const v = await runPreflight({
      stateBefore: { active: null },
      target: '#845',
      cfg: CFG,
      deps: {
        fetchLive: async () => 'develop',
        fetchLastKnownState: async () => 'develop',
        fetchAssignees: async () => {
          assigneeFetched = true;
          return [];
        },
        fetchCurrentUser: async () => 'kburson',
      },
    });
    assert.equal(v.ok, true);
    assert.equal(v.skippedNetwork, true);
    assert.equal(assigneeFetched, false);
  } finally {
    if (prior === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prior;
  }
}

// 20. #845: cold bind, gateAssigneeMatch=false — gate skipped as elsewhere.
{
  let assigneeFetched = false;
  const v = await runPreflight({
    stateBefore: { active: null },
    target: '#845',
    cfg: CFG_NO_ASSIGNEE_GATE,
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'develop',
      fetchAssignees: async () => {
        assigneeFetched = true;
        return [];
      },
      fetchCurrentUser: async () => 'kburson',
    },
  });
  assert.equal(v.ok, true);
  assert.equal(assigneeFetched, false);
}

console.log('verb-preflight.test.mjs: ok');
