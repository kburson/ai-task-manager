// @story #649
// Offline coverage-lift for scripts/gh/dispatch-prep.mjs. Drives the exported
// main(argv, deps) and parseArgs through injected runMoveState/loadConfig/buildRow/
// postTimingEvent/durableWordMarker/getProjectDir/emitSelfDoc/log/err/exit — no
// gh, no move-state, no network. Covers the help route, the missing-issue and
// invalid-issue usage exits, the no-repo guard, the skipNetwork happy path (no
// timing post), the network happy path (in-process move flip + timing post), and
// the parseArgs --description / #-strip / default-description branches.
// #764 — the board flip is now the injectable in-process `runMoveState` seam
// (returns a numeric exit code) rather than an execFile spawn of move-state.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main, parseArgs } from '../../../../gh/dispatch-prep.mjs';
import {
  buildRow as realBuildRow,
  postTimingEvent as realPostTimingEvent,
} from '../../../gh-timing-comment.mjs';

const argv = (...rest) => ['node', 'dispatch-prep.mjs', ...rest];

// A fake runMoveState matching the migrated seam: ({ issue }) → numeric code.
// Records each call so tests can assert the issue flowed through unchanged.
function fakeRunMoveState(code = 0) {
  const calls = [];
  const fn = async ({ issue, anchor }) => {
    calls.push({ issue, anchor });
    return code;
  };
  fn.calls = calls;
  return fn;
}

function harness({ cfg = { repo: 'o/r' }, runMoveState, withGovernedEffect } = {}) {
  const logs = [];
  const errs = [];
  const exits = [];
  const posts = [];
  const overrides = {
    runMoveState: runMoveState || fakeRunMoveState(),
    loadConfig: () => cfg,
    buildRow: (r) => ({ row: r }),
    postTimingEvent: async (p) => posts.push(p),
    durableWordMarker: () => 'MARK',
    getProjectDir: () => '/proj',
    baseEnv: { KEEP_ME: 'yes' },
    emitSelfDoc: () => logs.push('self-doc-emitted'),
    log: (s) => logs.push(s),
    err: (s) => errs.push(s),
    exit: (c) => exits.push(c),
    withGovernedEffect:
      withGovernedEffect ||
      (async (options, callback) => {
        logs.push(`verify:${options.issueId}:${options.operation}`);
        return callback({ reverify: async () => {} });
      }),
  };
  return { overrides, logs, errs, exits, posts };
}

test('help route emits self-doc and exits 0', async () => {
  const h = harness();
  await main(argv('--help'), h.overrides);
  assert.deepEqual(h.exits, [0]);
  assert.ok(h.logs.includes('self-doc-emitted'));
});

test('missing issue → usage, exit 2', async () => {
  const h = harness();
  await main(argv(), h.overrides);
  assert.deepEqual(h.exits, [2]);
  assert.match(h.errs.join(''), /Usage:/);
});

test('non-numeric issue → invalid, exit 2', async () => {
  const h = harness();
  await main(argv('abc'), h.overrides);
  assert.deepEqual(h.exits, [2]);
  assert.match(h.errs.join(''), /invalid issue/);
});

test('no repo configured → config-not-found, exit 2', async () => {
  const h = harness({ cfg: {} });
  await main(argv('42', '--anchor', '7'), h.overrides);
  assert.deepEqual(h.exits, [2]);
  assert.match(h.errs.join(''), /config-not-found/);
});

test('missing dispatch anchor refuses before child board or timing effects', async () => {
  const fx = fakeRunMoveState();
  const h = harness({ runMoveState: fx });
  await main(argv('42'), { ...h.overrides, skipNetwork: false });
  assert.deepEqual(h.exits, [2]);
  assert.equal(fx.calls.length, 0);
  assert.equal(h.posts.length, 0);
  assert.match(h.errs.join(''), /--anchor/);
});

test('child self-anchor refuses before child board or timing effects', async () => {
  const fx = fakeRunMoveState();
  const h = harness({ runMoveState: fx });
  await main(argv('42', '--anchor', '42'), { ...h.overrides, skipNetwork: false });
  assert.deepEqual(h.exits, [2]);
  assert.equal(fx.calls.length, 0);
  assert.equal(h.posts.length, 0);
  assert.match(h.errs.join(''), /cannot authorize its own dispatch/);
});

test('mismatched dispatch anchor authority refuses before child board or timing effects', async () => {
  const fx = fakeRunMoveState();
  const h = harness({
    runMoveState: fx,
    withGovernedEffect: async () => {
      const error = new Error('anchor does not match persisted lease');
      error.code = 'lease-not-held';
      throw error;
    },
  });
  await assert.rejects(
    () =>
      main(argv('42', '--anchor', '7'), {
        ...h.overrides,
        skipNetwork: false,
      }),
    (error) => error.code === 'lease-not-held'
  );
  assert.equal(fx.calls.length, 0);
  assert.equal(h.posts.length, 0);
});

test('skipNetwork happy path: verifies anchor, flips board, posts no timing row', async () => {
  const fx = fakeRunMoveState();
  const h = harness({ runMoveState: fx });
  await main(argv('42', '--anchor', '7'), { ...h.overrides, skipNetwork: true });
  assert.equal(fx.calls.length, 1);
  // in-process move flip invoked with the issue
  assert.equal(fx.calls[0].issue, '42');
  assert.equal(fx.calls[0].anchor, '7');
  assert.equal(h.posts.length, 0);
  assert.match(h.logs.join(''), /flipped to In Progress/);
});

test('network happy path: flips board and posts a start timing row', async () => {
  const fx = fakeRunMoveState();
  const h = harness({ runMoveState: fx });
  await main(argv('42', '--anchor', '7', '--description', 'boot pending'), {
    ...h.overrides,
    skipNetwork: false,
  });
  assert.equal(fx.calls.length, 1);
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0].issueNumber, '#42');
  assert.equal(h.posts[0].repo, 'o/r');
  assert.ok(h.logs.includes('verify:7:branch-worktree-orchestration'));
  assert.deepEqual(h.exits, []);
});

test('dispatch uses one anchor-owned root, a narrow move continuation, and timing after move', async () => {
  const events = [];
  let roots = 0;
  const h = harness({
    cfg: { repo: 'o/r', workLease: { tokenEnv: 'REMOTE_LEASE_BEARER' } },
    withGovernedEffect: async (options, callback) => {
      roots += 1;
      events.push(`root:${options.issueId}:${options.operation}:${options.heartbeat}`);
      return callback({
        leaseContext: {
          projectId: 'project-1',
          leaseId: 'lease-7',
          fencingToken: '42',
          worktreeId: 'wt-7',
        },
        reverify: async () => events.push('reverify'),
      });
    },
    runMoveState: async ({ anchor, withGovernedEffect, env }) => {
      assert.deepEqual(env, {
        KEEP_ME: 'yes',
        AITM_LEASE_ID: 'lease-7',
        AITM_FENCING_TOKEN: '42',
      });
      return withGovernedEffect(
        {
          issueId: anchor,
          operation: 'branch-worktree-orchestration',
          heartbeat: true,
        },
        async () => {
          events.push('move');
          return 0;
        }
      );
    },
  });
  h.overrides.baseEnv = {
    KEEP_ME: 'yes',
    REMOTE_LEASE_BEARER: 'secret',
    AITM_LEASE_ID: 'stale',
    AITM_FENCING_TOKEN: '7',
    AITM_LEASE_RECEIPT: 'untrusted',
  };
  h.overrides.postTimingEvent = async ({ issueNumber, operation, withGovernedEffect, env }) => {
    assert.equal(issueNumber, '#42');
    assert.equal(operation, 'branch-worktree-orchestration');
    assert.deepEqual(env, {
      KEEP_ME: 'yes',
      AITM_LEASE_ID: 'lease-7',
      AITM_FENCING_TOKEN: '42',
    });
    return withGovernedEffect(
      {
        issueId: '42',
        operation: 'branch-worktree-orchestration',
        heartbeat: true,
      },
      async (authority) => {
        await authority.reverify();
        events.push('timing');
      }
    );
  };

  await main(argv('42', '--anchor', '7'), { ...h.overrides, skipNetwork: false });

  assert.equal(roots, 1, 'the move continuation must not open a second authority root');
  assert.deepEqual(events, [
    'root:7:branch-worktree-orchestration:true',
    'reverify',
    'move',
    'reverify',
    'reverify',
    'timing',
  ]);
});

test('dispatch real timing helper authorizes the child under one controller root', async () => {
  const events = [];
  let roots = 0;
  let timingBody = '';
  const h = harness({
    cfg: { repo: 'o/r', workLease: { tokenEnv: 'REMOTE_LEASE_BEARER' } },
    withGovernedEffect: async (options, callback) => {
      roots += 1;
      events.push(`root:${options.issueId}`);
      return callback({
        leaseContext: {
          projectId: 'project-1',
          leaseId: 'lease-7',
          fencingToken: '42',
          worktreeId: 'wt-7',
        },
        reverify: async () => events.push('reverify'),
      });
    },
    runMoveState: async ({ anchor, withGovernedEffect }) =>
      withGovernedEffect(
        {
          issueId: anchor,
          operation: 'branch-worktree-orchestration',
          heartbeat: true,
        },
        async () => {
          events.push('move');
          return 0;
        }
      ),
  });
  h.overrides.baseEnv = {
    KEEP_ME: 'yes',
    REMOTE_LEASE_BEARER: 'secret',
    AITM_LEASE_ID: 'stale',
    AITM_FENCING_TOKEN: '7',
    AITM_LEASE_RECEIPT: 'untrusted',
  };
  h.overrides.buildRow = realBuildRow;
  h.overrides.postTimingEvent = (options) =>
    realPostTimingEvent({
      ...options,
      lock: false,
      retries: 0,
      deps: {
        findTimingComment: async (issueNumber, _repo, io) => {
          assert.equal(issueNumber, '#42');
          assert.deepEqual(io.env, {
            KEEP_ME: 'yes',
            AITM_LEASE_ID: 'lease-7',
            AITM_FENCING_TOKEN: '42',
          });
          events.push('find');
          return null;
        },
        createTimingComment: async (issueNumber, _repo, body, io) => {
          assert.equal(issueNumber, '#42');
          assert.deepEqual(io.env, {
            KEEP_ME: 'yes',
            AITM_LEASE_ID: 'lease-7',
            AITM_FENCING_TOKEN: '42',
          });
          timingBody = body;
          events.push('create');
        },
      },
    });

  await main(argv('42', '--anchor', '7'), { ...h.overrides, skipNetwork: false });

  assert.equal(roots, 1);
  assert.deepEqual(events, [
    'root:7',
    'reverify',
    'move',
    'reverify',
    'find',
    'reverify',
    'create',
  ]);
  assert.match(timingBody, /\| start \|/);
});

test('a child-bound lease cannot authorize its epic controller', async () => {
  let callbacks = 0;
  const h = harness({
    runMoveState: async () => {
      callbacks += 1;
      return 0;
    },
    withGovernedEffect: async (options) => {
      assert.equal(options.issueId, '7', 'the epic/controller anchor owns dispatch');
      const error = new Error('child #42 cannot authorize epic #7');
      error.code = 'lease-not-held';
      throw error;
    },
  });

  await assert.rejects(
    () => main(argv('42', '--anchor', '7'), { ...h.overrides, skipNetwork: false }),
    (error) => error.code === 'lease-not-held'
  );
  assert.equal(callbacks, 0);
  assert.equal(h.posts.length, 0);
});

test('non-zero move exit: reports and exits with the move code, posts no row', async () => {
  const fx = fakeRunMoveState(3);
  const h = harness({ runMoveState: fx });
  await main(argv('42', '--anchor', '7'), { ...h.overrides, skipNetwork: false });
  assert.equal(fx.calls.length, 1);
  assert.deepEqual(h.exits, [3]);
  assert.equal(h.posts.length, 0);
  assert.match(h.errs.join(''), /exited 3/);
});

// ── direct unit tests for the exported parser ────────────────────────────────
test('parseArgs strips leading # and reads --description', () => {
  const out = parseArgs(['#77', '--anchor', '#8', '--description', 'hello']);
  assert.equal(out.issue, '77');
  assert.equal(out.description, 'hello');
  assert.equal(out.anchor, '8');
});

test('parseArgs defaults description and marks help', () => {
  const out = parseArgs(['5']);
  assert.equal(out.issue, '5');
  assert.match(out.description, /agent boot pending/);
  assert.equal(parseArgs(['--help']).help, true);
});
