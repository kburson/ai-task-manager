// #905 — re-sync an epic onto trunk (design: "Epic↔trunk re-sync"). Rebase the
// epic onto trunk, then republish with --force-with-lease. Also exposes the
// opportunistic is-ancestor check merge-back consults before a child merge. git +
// graph injected; the test asserts argv and the ancestor-driven branch.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as syncEpicModule from './sync-epic.mjs';

const { syncEpic, epicNeedsSync } = syncEpicModule;

const GRAPH = {
  905: { parent: null, children: [910] }, // root epic
  910: { parent: 905, children: [] }, // child
};
function makeGit({ ancestor = true, rebaseFails = false } = {}) {
  const calls = [];
  const git = (args, options) => {
    const call = [...args];
    Object.defineProperty(call, 'options', { value: options });
    calls.push(call);
    if (args[0] === 'merge-base' && args.includes('--is-ancestor')) {
      if (!ancestor) {
        const e = new Error('not an ancestor');
        e.status = 1;
        throw e;
      }
      return '';
    }
    if (args[0] === 'rebase' && rebaseFails) {
      const e = new Error('rebase conflict');
      e.status = 1;
      throw e;
    }
    return '';
  };
  git.calls = calls;
  return git;
}
const graph = (n) => GRAPH[n] ?? { parent: null, children: [] };
const LEASE_CONTEXT = {
  projectId: 'project-1',
  leaseId: 'lease-905',
  fencingToken: '42',
  worktreeId: 'wt-905',
};

function authority({ staleAt = Infinity } = {}) {
  const calls = [];
  let verifies = 0;
  return {
    calls,
    get verifies() {
      return verifies;
    },
    withGovernedEffect: async (options, callback) => {
      calls.push(options);
      return callback({
        leaseContext: LEASE_CONTEXT,
        reverify: async () => {
          verifies += 1;
          if (verifies === staleAt) {
            const error = new Error(`stale at verify ${verifies}`);
            error.code = 'fence-stale';
            throw error;
          }
        },
      });
    },
  };
}

function governed(deps) {
  return {
    ...deps,
    withGovernedEffect: async (_options, callback) =>
      callback({ leaseContext: LEASE_CONTEXT, reverify: async () => {} }),
  };
}

test('syncEpic rebases the epic onto origin/trunk (default) then force-with-lease pushes', async () => {
  const git = makeGit();
  const r = await syncEpic({ epic: 905, deps: governed({ graph, git }) });
  assert.equal(r.branch, 'feature/epic/905');
  assert.equal(r.pushed, true);
  assert.equal(r.rebasedOnto, 'origin/trunk');
  assert.deepEqual(git.calls, [
    ['rebase', 'origin/trunk', 'feature/epic/905'],
    ['push', '--force-with-lease', 'origin', 'feature/epic/905'],
  ]);
});

test('syncEpic skips the push when noPushToOrigin is set (rebase-only)', async () => {
  const git = makeGit();
  const r = await syncEpic({
    epic: 905,
    deps: governed({ graph, git, noPushToOrigin: true }),
  });
  assert.equal(r.pushed, false);
  assert.deepEqual(git.calls, [['rebase', 'origin/trunk', 'feature/epic/905']]);
});

test('#927 — syncEpic rebases onto the injected resolved ref, and it equals the ancestor-check ref', async () => {
  const rebaseGit = makeGit();
  const r = await syncEpic({
    epic: 905,
    deps: governed({ graph, git: rebaseGit, trunk: 'origin/trunk' }),
  });
  assert.equal(r.rebasedOnto, 'origin/trunk');
  assert.deepEqual(rebaseGit.calls[0], ['rebase', 'origin/trunk', 'feature/epic/905']);

  // The same injected ref is the ref epicNeedsSync checks ancestry against —
  // the two functions must agree (the #927 pre-fix disagreement was the bug).
  const ancestorGit = makeGit({ ancestor: false });
  epicNeedsSync({ epic: 905, deps: { graph, git: ancestorGit, trunk: 'origin/trunk' } });
  assert.deepEqual(ancestorGit.calls[0], [
    'merge-base',
    '--is-ancestor',
    'origin/trunk',
    'feature/epic/905',
  ]);
});

test('syncEpic surfaces a rebase conflict rather than pushing a bad state', async () => {
  const git = makeGit({ rebaseFails: true });
  await assert.rejects(syncEpic({ epic: 905, deps: governed({ graph, git }) }), /rebase/i);
  // never reached the push
  assert.ok(!git.calls.some((c) => c[0] === 'push'));
});

test('syncEpic refuses a non-epic issue', async () => {
  const git = makeGit();
  await assert.rejects(syncEpic({ epic: 910, deps: governed({ graph, git }) }), /not an epic/i);
});

test('epicNeedsSync: true when origin/trunk is NOT yet an ancestor of the epic', () => {
  const git = makeGit({ ancestor: false });
  assert.equal(epicNeedsSync({ epic: 905, deps: { graph, git } }), true);
  assert.deepEqual(git.calls[0], [
    'merge-base',
    '--is-ancestor',
    'origin/trunk',
    'feature/epic/905',
  ]);
});

test('epicNeedsSync: false when the epic already contains origin/trunk', () => {
  const git = makeGit({ ancestor: true });
  assert.equal(epicNeedsSync({ epic: 905, deps: { graph, git } }), false);
});

test('requires an issue and injected git', async () => {
  await assert.rejects(syncEpic({ deps: governed({ graph, git: makeGit() }) }), /epic/i);
  await assert.rejects(syncEpic({ epic: 905, deps: governed({ graph }) }), /git/i);
});

test('sync-epic holds one epic root and reverifies before fetch, rebase, and push', async () => {
  const auth = authority();
  const git = makeGit();
  const fetches = [];
  const result = await syncEpic({
    epic: 905,
    deps: {
      graph,
      git,
      fetch: (options) => options.runAttempt(() => fetches.push(options)),
      withGovernedEffect: auth.withGovernedEffect,
      baseEnv: {
        KEEP_ME: 'yes',
        REMOTE_LEASE_BEARER: 'secret',
        AITM_LEASE_ID: 'stale',
        AITM_FENCING_TOKEN: '7',
      },
      tokenEnv: 'REMOTE_LEASE_BEARER',
    },
  });

  assert.equal(result.pushed, true);
  assert.deepEqual(auth.calls, [
    {
      issueId: '905',
      operation: 'branch-worktree-orchestration',
      heartbeat: true,
    },
  ]);
  assert.equal(auth.verifies, 3);
  assert.equal(fetches.length, 1);
  for (const options of [...fetches, ...git.calls.map((args) => args.options)].filter(Boolean)) {
    assert.deepEqual(options.env, {
      KEEP_ME: 'yes',
      AITM_LEASE_ID: 'lease-905',
      AITM_FENCING_TOKEN: '42',
    });
  }
});

test('sync-epic no-push mode performs no push verification', async () => {
  const auth = authority({ staleAt: 3 });
  const git = makeGit();
  const result = await syncEpic({
    epic: 905,
    deps: {
      graph,
      git,
      fetch: ({ runAttempt }) => runAttempt(() => {}),
      withGovernedEffect: auth.withGovernedEffect,
      noPushToOrigin: true,
    },
  });
  assert.equal(result.pushed, false);
  assert.equal(auth.verifies, 2, 'noPush skips both push verification and push callback');
  assert.equal(
    git.calls.some((args) => args[0] === 'push'),
    false
  );
});

test('sync-epic stale fence blocks the selected mutating callback', async () => {
  const auth = authority({ staleAt: 3 });
  const git = makeGit();
  await assert.rejects(
    syncEpic({
      epic: 905,
      deps: {
        graph,
        git,
        fetch: ({ runAttempt }) => runAttempt(() => {}),
        withGovernedEffect: auth.withGovernedEffect,
      },
    }),
    (error) => error.code === 'fence-stale'
  );
  assert.equal(
    git.calls.some((args) => args[0] === 'push'),
    false
  );
});

test('sync-epic CLI main awaits the async core before printing resolved values', async () => {
  assert.equal(typeof syncEpicModule.main, 'function');
  const output = [];
  const graphEnvs = [];
  await syncEpicModule.main(['905'], {
    loadConfig: () => ({
      repo: 'o/r',
      projectDir: '/proj',
      workLease: { tokenEnv: 'REMOTE_LEASE_BEARER' },
    }),
    baseEnv: {
      KEEP_ME: 'yes',
      AITM_LEASE_ID: 'stale',
      AITM_FENCING_TOKEN: '7',
      AITM_LEASE_RECEIPT: 'untrusted',
      REMOTE_LEASE_BEARER: 'secret',
    },
    realGraphNode: async (_issue, _cfg, { env }) => {
      graphEnvs.push(env);
      return GRAPH[905];
    },
    runCore: async () => ({
      branch: 'feature/epic/905',
      rebasedOnto: 'origin/trunk',
      pushed: true,
    }),
    write: (text) => output.push(text),
  });
  assert.deepEqual(output, ['synced feature/epic/905 onto origin/trunk and pushed\n']);
  assert.deepEqual(graphEnvs, [{ KEEP_ME: 'yes' }]);

  const refusal = Object.assign(new Error('lease refused'), { code: 'fence-stale' });
  await assert.rejects(
    syncEpicModule.main(['905'], {
      loadConfig: () => ({ repo: 'o/r', projectDir: '/proj' }),
      realGraphNode: async () => GRAPH[905],
      runCore: async () => {
        throw refusal;
      },
      write: () => assert.fail('must not print success after rejection'),
    }),
    (error) => error === refusal
  );
});
