// #905 — cut a child worktree from its epic head, by construction (design:
// "Worktree ownership"). This is the correct-by-construction replacement for a
// free-form `Agent({isolation:"worktree"})` cut: the base is the epic branch, never
// trunk. git + graph injected; the test asserts the `git worktree add` argv.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as cutChildModule from './cut-child-worktree.mjs';

const { cutChildWorktree } = cutChildModule;

const GRAPH = {
  905: { parent: null, children: [910] }, // root epic
  911: { parent: 905, children: [920] }, // nested sub-epic
  910: { parent: 905, children: [] }, // child of root epic
  920: { parent: 911, children: [] }, // child of nested epic
  42: { parent: null, children: [] }, // story
};
function makeDeps() {
  const calls = [];
  return {
    calls,
    deps: {
      graph: (n) => GRAPH[n] ?? { parent: null, children: [] },
      git: (args, options) => {
        const call = [...args];
        Object.defineProperty(call, 'options', { value: options });
        calls.push(call);
        return '';
      },
      withGovernedEffect: async (_options, callback) =>
        callback({
          leaseContext: {
            projectId: 'project-1',
            leaseId: 'lease-epic',
            fencingToken: '42',
            worktreeId: 'wt-epic',
          },
          reverify: async () => {},
        }),
    },
  };
}

test('child worktree is based on its epic head, not trunk', async () => {
  const { calls, deps } = makeDeps();
  const r = await cutChildWorktree({ issue: 910, path: '/wt/910', deps });
  assert.deepEqual(r, {
    branch: 'feature/child/910',
    path: '/wt/910',
    base: 'feature/epic/905',
  });
  assert.deepEqual(calls, [
    ['worktree', 'add', '-b', 'feature/child/910', '/wt/910', 'feature/epic/905'],
  ]);
});

test('child of a nested epic is based on the nested epic head', async () => {
  const { calls, deps } = makeDeps();
  const r = await cutChildWorktree({ issue: 920, path: '/wt/920', deps });
  assert.equal(r.base, 'feature/epic/911');
  assert.deepEqual(calls, [
    ['worktree', 'add', '-b', 'feature/child/920', '/wt/920', 'feature/epic/911'],
  ]);
});

test('refuses a non-child issue', async () => {
  const { deps } = makeDeps();
  await assert.rejects(cutChildWorktree({ issue: 905, path: '/wt/x', deps }), /not a child/i);
  await assert.rejects(cutChildWorktree({ issue: 42, path: '/wt/x', deps }), /not a child/i);
});

test('requires issue, path, and injected git', async () => {
  const { deps } = makeDeps();
  await assert.rejects(cutChildWorktree({ path: '/wt/x', deps }), /issue/i);
  await assert.rejects(cutChildWorktree({ issue: 910, deps }), /path/i);
  await assert.rejects(
    cutChildWorktree({ issue: 910, path: '/wt/x', deps: { graph: deps.graph } }),
    /git/i
  );
});

test('child worktree cut is fenced by its epic controller without Task6 handoff', async () => {
  const { calls, deps } = makeDeps();
  const roots = [];
  let reverifies = 0;
  deps.withGovernedEffect = async (options, callback) => {
    roots.push(options);
    return callback({
      leaseContext: {
        projectId: 'project-1',
        leaseId: 'lease-905',
        fencingToken: '42',
        worktreeId: 'wt-905',
      },
      reverify: async () => {
        reverifies += 1;
      },
    });
  };
  deps.baseEnv = {
    KEEP_ME: 'yes',
    AITM_LEASE_ID: 'stale',
    AITM_LEASE_AUTH_TOKEN: 'secret',
  };

  await cutChildWorktree({ issue: 910, path: '/wt/910', deps });

  assert.deepEqual(roots, [
    {
      issueId: '905',
      operation: 'branch-worktree-orchestration',
      heartbeat: true,
    },
  ]);
  assert.equal(reverifies, 1);
  assert.deepEqual(calls[0].options.env, {
    KEEP_ME: 'yes',
    AITM_LEASE_ID: 'lease-905',
    AITM_FENCING_TOKEN: '42',
  });
  assert.equal(
    calls.some((call) => call.includes('handoff')),
    false,
    'lease handoff remains Task6 scope'
  );
});

test('child worktree cut rereads lineage inside epic authority before git', async () => {
  let childReads = 0;
  const gitCalls = [];
  const deps = {
    graph: (issue) => {
      if (issue === 910) {
        childReads += 1;
        return childReads === 1 ? { parent: 905, children: [] } : { parent: 911, children: [] };
      }
      return GRAPH[issue] ?? { parent: null, children: [] };
    },
    git: (args) => gitCalls.push(args),
    withGovernedEffect: async (options, callback) => {
      assert.equal(options.issueId, '905');
      return callback({ leaseContext: {}, reverify: async () => {} });
    },
  };

  await assert.rejects(cutChildWorktree({ issue: 910, path: '/wt/910', deps }), /lineage changed/i);
  assert.equal(gitCalls.length, 0);
});

test('cut-child CLI main awaits the async core before printing resolved values', async () => {
  assert.equal(typeof cutChildModule.main, 'function');
  const output = [];
  const graphEnvs = [];
  await cutChildModule.main(['910', '/wt/910'], {
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
      return GRAPH[910];
    },
    runCore: async () => ({
      branch: 'feature/child/910',
      path: '/wt/910',
      base: 'feature/epic/905',
    }),
    write: (text) => output.push(text),
  });
  assert.deepEqual(output, ['cut feature/child/910 at /wt/910 from feature/epic/905\n']);
  assert.deepEqual(graphEnvs, [{ KEEP_ME: 'yes' }]);

  const refusal = Object.assign(new Error('lease refused'), { code: 'fence-stale' });
  await assert.rejects(
    cutChildModule.main(['910', '/wt/910'], {
      loadConfig: () => ({ repo: 'o/r', projectDir: '/proj' }),
      realGraphNode: async () => GRAPH[910],
      runCore: async () => {
        throw refusal;
      },
      write: () => assert.fail('must not print success after rejection'),
    }),
    (error) => error === refusal
  );
});
