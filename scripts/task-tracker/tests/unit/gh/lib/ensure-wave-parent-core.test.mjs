// @story #1049
import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureWaveParentCore } from '../../../../../gh/lib/ensure-wave-parent-core.mjs';

const CFG = { repo: 'o/r', workLease: { tokenEnv: 'REMOTE_LEASE_BEARER' } };
const LEASE_CONTEXT = {
  projectId: 'project-1',
  leaseId: 'lease-controller',
  fencingToken: '42',
  worktreeId: 'wt-controller',
};

function authority({ staleAt = Infinity } = {}) {
  const roots = [];
  let verifies = 0;
  return {
    roots,
    get verifies() {
      return verifies;
    },
    withGovernedEffect: async (options, callback) => {
      roots.push(options);
      return callback({
        leaseContext: LEASE_CONTEXT,
        reverify: async () => {
          verifies += 1;
          if (verifies === staleAt) {
            const error = new Error(`stale controller at effect ${verifies}`);
            error.code = 'fence-stale';
            throw error;
          }
        },
      });
    },
  };
}

function fixture({ staleAt = Infinity } = {}) {
  const auth = authority({ staleAt });
  const state = {
    parent: null,
    creates: 0,
    tethers: 0,
    bodies: 0,
    links: new Set(),
    titleUpdates: 0,
    timingPosts: 0,
  };
  const events = [];
  const invoke = (withGovernedEffect, operation, callback) =>
    withGovernedEffect(
      {
        issueId: '900',
        operation,
        heartbeat: true,
      },
      callback
    );
  const deps = {
    waveId: () => 'wave-stable',
    findExistingParent: async () => state.parent,
    createParent: async ({ withGovernedEffect }) => {
      await invoke(withGovernedEffect, 'evidence-mutation', async () => {
        events.push('create');
        state.creates += 1;
        state.parent = 1000;
      });
      await invoke(withGovernedEffect, 'lifecycle-mutation', async () => {
        events.push('tether');
        state.tethers += 1;
      });
      await invoke(withGovernedEffect, 'evidence-mutation', async () => {
        events.push('body');
        state.bodies += 1;
      });
      return state.parent;
    },
    getIssueNodeId: async ({ issueNumber }) => `node-${issueNumber}`,
    addSubIssue: async ({ childId }) => {
      events.push(`link:${childId}`);
      if (state.links.has(childId)) {
        const error = new Error('already linked');
        error.code = 'already-linked';
        throw error;
      }
      state.links.add(childId);
    },
    ensureParentEpicTitle: async ({ withGovernedEffect }) =>
      invoke(withGovernedEffect, 'evidence-mutation', async () => {
        events.push('title');
        state.titleUpdates += 1;
      }),
    postTimingEvent: async ({ withGovernedEffect }) =>
      invoke(withGovernedEffect, 'evidence-mutation', async () => {
        events.push('timing');
        if (state.timingPosts === 0) state.timingPosts += 1;
      }),
  };
  return { auth, deps, state, events };
}

function run(fx) {
  return ensureWaveParentCore({
    controllerIssueId: 900,
    children: [12, 13],
    purpose: 'bounded wave',
    cfg: CFG,
    withGovernedEffect: fx.auth.withGovernedEffect,
    deps: fx.deps,
  });
}

test('wave-parent chain uses one existing-controller root and narrow JIT continuations', async () => {
  const fx = fixture();
  const result = await run(fx);

  assert.equal(result.parentNumber, 1000);
  assert.deepEqual(fx.auth.roots, [
    {
      issueId: '900',
      operation: 'branch-worktree-orchestration',
      heartbeat: true,
    },
  ]);
  assert.deepEqual(fx.events, [
    'create',
    'tether',
    'body',
    'link:node-12',
    'link:node-13',
    'title',
    'timing',
  ]);
  assert.equal(fx.state.creates, 1);
  assert.equal(fx.state.links.size, 2);
  assert.equal(fx.state.titleUpdates, 1);
  assert.equal(fx.state.timingPosts, 1);
});

test('Nth stale failure blocks that callback and retry reuses parent without duplicates', async () => {
  const fx = fixture({ staleAt: 5 });
  await assert.rejects(run(fx), (error) => error.code === 'fence-stale');
  assert.equal(fx.state.creates, 1);
  assert.equal(fx.state.links.size, 1, 'first child linked before the stale second-child fence');
  assert.equal(fx.state.titleUpdates, 0);
  assert.equal(fx.state.timingPosts, 0);

  const retryAuth = authority();
  fx.auth = retryAuth;
  const result = await run(fx);

  assert.equal(result.parentNumber, 1000);
  assert.equal(fx.state.creates, 1, 'retry finds the durable wave parent');
  assert.equal(fx.state.links.size, 2, 'already-linked retry does not duplicate the first child');
  assert.equal(fx.state.titleUpdates, 1);
  assert.equal(fx.state.timingPosts, 1);
});

test('child or newly-created parent authority cannot substitute for controller authority', async () => {
  const fx = fixture();
  fx.auth.withGovernedEffect = async (options) => {
    assert.equal(options.issueId, '900');
    const error = new Error('controller lease is not held');
    error.code = 'lease-not-held';
    throw error;
  };

  await assert.rejects(run(fx), (error) => error.code === 'lease-not-held');
  assert.equal(fx.state.creates, 0);
  assert.equal(fx.state.links.size, 0);
});
