#!/usr/bin/env node
// @story #629
// #629 — coverage lift for `lib/move-state/cache-unpark.mjs`. The six post-move
// cache/unpark side-effect helpers are imported only by `scripts/gh/move-state.mjs`
// and never unit-driven, leaving the module at 0% from the named test. Two of
// them reach real `gh`/subprocess collaborators through dynamically imported
// modules; the behavior-preserving `ctx.deps` seam lets this suite drive every
// branch against fakes with ZERO network:
//
//   • dispatchOnEnterActions   — SKIP_NETWORK guard, onEnter action loop (ok +
//                                throwing action → inner catch), outer catch.
//   • refreshKanbanStateCache  — non-stage guard, sid-present refresh, sid-absent
//                                skip, active-mismatch skip, catch.
//   • unparkDoneDependents     — guard, cleared+errored release summary, catch.
//   • syncTrackerState         — happy path against an isolated sandbox.
//   • syncEventFields          — SKIP_NETWORK guard, injected-pexec dispatch,
//                                pexec-throw warning.
//   • endTaskTracking          — guard, injected-pexec fire-and-forget on done.
//
// Production assembles `ctx` with no `deps` key, so the seam is a pure
// testability affordance — real runs spawn `gh`/subprocesses exactly as before.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { existsSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import { statePath } from '../../../paths.mjs';
import {
  dispatchOnEnterActions,
  refreshKanbanStateCache,
  unparkDoneDependents,
  syncTrackerState,
  syncEventFields,
  endTaskTracking,
} from '../../../lib/move-state/cache-unpark.mjs';

// `syncEventFields`/`endTaskTracking` resolve their subprocess scripts
// relative to `__dir`, which production wires to `scripts/gh` (the directory
// of `move-state.mjs`, see `scripts/gh/move-state.mjs:60`) — not the process
// cwd. Mirror that here so the injected-pexec dispatch tests actually find
// the real scripts instead of silently no-op'ing.
const GH_DIR = path.resolve(process.cwd(), 'scripts/gh');

// A `pexec`-shaped fake: records every call; optionally throws.
function makePexec({ throws } = {}) {
  const calls = [];
  return {
    calls,
    pexec: async (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      if (throws) throw { stderr: 'sync failed line\nmore\n' };
      return { stdout: '' };
    },
  };
}

// --- dispatchOnEnterActions -------------------------------------------------

test('dispatchOnEnterActions: SKIP_NETWORK short-circuits', async () => {
  let imported = false;
  await dispatchOnEnterActions({
    issueArg: '10',
    stateArg: 'develop',
    SKIP_NETWORK: true,
    cfg: { repo: 'o/r' },
    deps: {
      states: {
        get STATES() {
          imported = true;
          return {};
        },
      },
    },
  });
  assert.equal(imported, false);
});

test('dispatchOnEnterActions: runs onEnter actions and swallows a throwing one', async () => {
  const ran = [];
  await dispatchOnEnterActions({
    issueArg: '10',
    stateArg: 'develop',
    resolvedFromState: 'plan',
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    deps: {
      states: {
        STATES: {
          develop: {
            onEnter: [
              { id: 'ok', run: async (a) => ran.push(a.toState) },
              {
                id: 'boom',
                run: async () => {
                  throw new Error('action failed');
                },
              },
            ],
          },
        },
      },
    },
  });
  assert.deepEqual(ran, ['develop']); // ok action ran; throwing action absorbed
});

test('dispatchOnEnterActions: outer catch absorbs an import/lookup failure', async () => {
  await dispatchOnEnterActions({
    issueArg: '10',
    stateArg: 'develop',
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    deps: {
      states: {
        get STATES() {
          throw new Error('states module boom');
        },
      },
    },
  });
  assert.ok(true); // no throw = outer catch handled it
});

test('dispatchOnEnterActions: governed authority errors are rethrown', async () => {
  const error = Object.assign(new Error('stale onEnter fence'), { code: 'fence-stale' });
  await assert.rejects(
    () =>
      dispatchOnEnterActions({
        issueArg: '10',
        stateArg: 'develop',
        SKIP_NETWORK: false,
        cfg: { repo: 'o/r' },
        deps: {
          states: {
            STATES: {
              develop: {
                onEnter: [{ id: 'stale', run: async () => Promise.reject(error) }],
              },
            },
          },
        },
      }),
    (thrown) => thrown === error
  );
});

// --- refreshKanbanStateCache ------------------------------------------------

test('refreshKanbanStateCache: non-stage stateArg short-circuits', async () => {
  let called = false;
  await refreshKanbanStateCache({
    issueArg: '10',
    stateArg: 'not-a-stage',
    deps: {
      wordCounter: {
        currentSessionId: () => {
          called = true;
          return 'sid';
        },
      },
    },
  });
  assert.equal(called, false);
});

test('refreshKanbanStateCache: refreshes cache for the matching active task', async () => {
  const set = [];
  const events = [];
  await refreshKanbanStateCache({
    issueArg: '10',
    stateArg: 'develop',
    reverifyGovernedEffect: async () => events.push('reverify'),
    deps: {
      wordCounter: { currentSessionId: () => 'sid1' },
      sessionState: {
        getActiveTask: () => ({ issue: '#10' }),
        setSessionKanbanState: (sid, st) => {
          events.push('set');
          set.push([sid, st]);
        },
      },
    },
  });
  assert.deepEqual(set, [['sid1', 'develop']]);
  assert.deepEqual(events, ['reverify', 'set']);
});

test('refreshKanbanStateCache: no session id → skip, and mismatched active → skip', async () => {
  const set = [];
  await refreshKanbanStateCache({
    issueArg: '10',
    stateArg: 'develop',
    deps: {
      wordCounter: { currentSessionId: () => null },
      sessionState: {
        getActiveTask: () => ({ issue: '#10' }),
        setSessionKanbanState: () => set.push(1),
      },
    },
  });
  await refreshKanbanStateCache({
    issueArg: '10',
    stateArg: 'develop',
    deps: {
      wordCounter: { currentSessionId: () => 'sid2' },
      sessionState: {
        getActiveTask: () => ({ issue: '#99' }),
        setSessionKanbanState: () => set.push(1),
      },
    },
  });
  assert.equal(set.length, 0);
});

test('refreshKanbanStateCache: catch absorbs a throwing collaborator', async () => {
  await refreshKanbanStateCache({
    issueArg: '10',
    stateArg: 'develop',
    deps: {
      wordCounter: {
        currentSessionId: () => {
          throw new Error('session lookup boom');
        },
      },
      sessionState: { getActiveTask: () => null, setSessionKanbanState: () => {} },
    },
  });
  assert.ok(true);
});

// --- unparkDoneDependents ---------------------------------------------------

test('unparkDoneDependents: non-done move short-circuits', async () => {
  let called = false;
  await unparkDoneDependents({
    issueArg: '10',
    stateArg: 'develop',
    SKIP_NETWORK: false,
    cfg: { repo: 'o/r' },
    deps: {
      unparkMod: {
        unparkDependents: async () => {
          called = true;
          return [];
        },
      },
    },
  });
  assert.equal(called, false);
});

test('unparkDoneDependents: summarizes cleared + errored releases', async () => {
  const savedCascade = process.env.AITM_CASCADE;
  delete process.env.AITM_CASCADE;
  try {
    let seen;
    await unparkDoneDependents({
      issueArg: '10',
      stateArg: 'done',
      SKIP_NETWORK: false,
      cfg: { repo: 'o/r' },
      deps: {
        unparkMod: {
          unparkDependents: async (a) => {
            seen = a;
            return [
              { issue: 11, cleared: 'ref' },
              { issue: 12, error: 'boom' },
              { issue: null, error: 'x' },
            ];
          },
        },
      },
    });
    assert.equal(seen.doneIssueNumber, 10);
  } finally {
    if (savedCascade !== undefined) process.env.AITM_CASCADE = savedCascade;
  }
});

test('unparkDoneDependents: enforcement catch absorbs a throw', async () => {
  const savedCascade = process.env.AITM_CASCADE;
  delete process.env.AITM_CASCADE;
  try {
    await unparkDoneDependents({
      issueArg: '10',
      stateArg: 'done',
      SKIP_NETWORK: false,
      cfg: { repo: 'o/r' },
      deps: {
        unparkMod: {
          unparkDependents: async () => {
            throw new Error('unpark down');
          },
        },
      },
    });
    assert.ok(true);
  } finally {
    if (savedCascade !== undefined) process.env.AITM_CASCADE = savedCascade;
  }
});

test('unparkDoneDependents: parent authority cannot authorize child mutation', async () => {
  const savedCascade = process.env.AITM_CASCADE;
  delete process.env.AITM_CASCADE;
  let called = false;
  try {
    await unparkDoneDependents({
      issueArg: '10',
      stateArg: 'done',
      SKIP_NETWORK: false,
      cfg: { repo: 'o/r' },
      withGovernedEffect: async () => {
        throw new Error('parent continuation must never be called for a child');
      },
      deps: {
        unparkMod: {
          unparkDependents: async () => {
            called = true;
            return [];
          },
        },
      },
    });
    assert.equal(called, false, 'unpark fails closed without exact child authority');
  } finally {
    if (savedCascade !== undefined) process.env.AITM_CASCADE = savedCascade;
  }
});

// --- syncTrackerState -------------------------------------------------------

test('syncTrackerState: syncs the tracker ledger immediately after reverify', async () => {
  const sandbox = mkdtempProjectIsolated('cache-unpark-');
  const savedProjectDir = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = sandbox;
  try {
    // #218 strips `state` from the on-disk ledger (issue body is source of
    // truth), so the observable effect is that the load→save round-trip runs
    // and materializes the ledger file in the isolated project dir.
    const events = [];
    await syncTrackerState({
      stateArg: 'test',
      reverifyGovernedEffect: async () => events.push('reverify'),
      deps: { beforeTrackerSave: () => events.push('save') },
    });
    assert.ok(existsSync(statePath(sandbox)), 'tracker ledger was written');
    assert.deepEqual(events, ['reverify', 'save']);
  } finally {
    if (savedProjectDir !== undefined) process.env.AI_TASK_MANAGER_PROJECT_DIR = savedProjectDir;
    else delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
  }
});

// --- syncEventFields --------------------------------------------------------

test('syncEventFields: SKIP_NETWORK short-circuits', async () => {
  const { pexec, calls } = makePexec();
  await syncEventFields({
    issueArg: '10',
    stateArg: 'develop',
    itemId: 'IT',
    SKIP_NETWORK: true,
    pexec,
    __dir: GH_DIR,
  });
  assert.equal(calls.length, 0);
});

test('syncEventFields: invokes update-event-fields in-process with the exact continuation', async () => {
  const { pexec, calls } = makePexec();
  const updates = [];
  const continuation = async () => {};
  await syncEventFields({
    issueArg: '10',
    stateArg: 'develop',
    itemId: 'IT-1',
    SKIP_NETWORK: false,
    pexec,
    __dir: GH_DIR,
    governedOperation: 'review-mutation',
    withGovernedEffect: continuation,
    deps: {
      updateEventFields: async (args, options) => updates.push({ args, options }),
    },
  });
  assert.equal(calls.length, 0, 'no ungoverned subprocess is spawned');
  assert.deepEqual(updates[0].args, ['10', 'develop', '--item-id', 'IT-1']);
  assert.equal(updates[0].options.operation, 'review-mutation');
  assert.equal(updates[0].options.withGovernedEffect, continuation);
});

test('syncEventFields: an ordinary in-process update failure surfaces a warning, no rethrow', async () => {
  const { pexec } = makePexec();
  await syncEventFields({
    issueArg: '10',
    stateArg: 'develop',
    itemId: 'IT',
    SKIP_NETWORK: false,
    pexec,
    __dir: GH_DIR,
    deps: {
      updateEventFields: async () => {
        throw new Error('sync failed');
      },
    },
  });
  assert.ok(true); // warning written, best-effort
});

// --- endTaskTracking --------------------------------------------------------

test('endTaskTracking: non-done move short-circuits', () => {
  const { pexec, calls } = makePexec();
  endTaskTracking({ stateArg: 'develop', SKIP_NETWORK: false, pexec, __dir: GH_DIR });
  assert.equal(calls.length, 0);
});

test('endTaskTracking: fires the local task-tracker end on the move to done', () => {
  const savedCascade = process.env.AITM_CASCADE;
  delete process.env.AITM_CASCADE;
  try {
    const { pexec, calls } = makePexec();
    endTaskTracking({ stateArg: 'done', SKIP_NETWORK: false, pexec, __dir: GH_DIR });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args.slice(-1), ['end']);
  } finally {
    if (savedCascade !== undefined) process.env.AITM_CASCADE = savedCascade;
  }
});
