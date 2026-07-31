// #905 — cut an epic branch at the correct base (design: "Worktree ownership" /
// "Branching model"). A root epic forks from trunk; a nested sub-epic forks from
// its parent epic's head. git + graph are injected so the test asserts argv only.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as cutEpicModule from './cut-epic-branch.mjs';

const { cutEpicBranch } = cutEpicModule;

const GRAPH = {
  905: { parent: null, children: [910, 911] }, // root epic
  911: { parent: 905, children: [920] }, // nested sub-epic under 905
  910: { parent: 905, children: [] }, // leaf child
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

test('root epic forks from trunk', async () => {
  const { calls, deps } = makeDeps();
  const r = await cutEpicBranch({ issue: 905, deps });
  assert.deepEqual(r, { branch: 'feature/epic/905', base: 'trunk' });
  assert.deepEqual(calls, [['branch', 'feature/epic/905', 'trunk']]);
});

test('nested sub-epic forks from its parent epic head, not trunk', async () => {
  const { calls, deps } = makeDeps();
  const r = await cutEpicBranch({ issue: 911, deps });
  assert.deepEqual(r, { branch: 'feature/epic/911', base: 'feature/epic/905' });
  assert.deepEqual(calls, [['branch', 'feature/epic/911', 'feature/epic/905']]);
});

test('refuses to cut an epic branch for a non-epic issue', async () => {
  const { deps } = makeDeps();
  await assert.rejects(cutEpicBranch({ issue: 910, deps }), /not an epic/i); // child
  await assert.rejects(cutEpicBranch({ issue: 42, deps }), /not an epic/i); // story
});

test('requires an issue and injected git', async () => {
  const { deps } = makeDeps();
  await assert.rejects(cutEpicBranch({ deps }), /issue/i);
  await assert.rejects(cutEpicBranch({ issue: 905, deps: { graph: deps.graph } }), /git/i);
});

test('cut-epic uses one epic-owned root, rereads lineage, and fences the branch callback', async () => {
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

  await cutEpicBranch({ issue: 905, deps });

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
});

test('cut-epic refuses changed lineage inside the authority root before git', async () => {
  let reads = 0;
  const gitCalls = [];
  const deps = {
    graph: (issue) => {
      reads += 1;
      if (issue === 911) {
        return reads === 1 ? { parent: 905, children: [920] } : { parent: null, children: [920] };
      }
      return GRAPH[issue] ?? { parent: null, children: [] };
    },
    git: (args) => gitCalls.push(args),
    withGovernedEffect: async (_options, callback) =>
      callback({ leaseContext: {}, reverify: async () => {} }),
  };

  await assert.rejects(cutEpicBranch({ issue: 911, deps }), /lineage changed/i);
  assert.equal(gitCalls.length, 0);
});

test('cut-epic CLI main awaits the async core before printing resolved values', async () => {
  assert.equal(typeof cutEpicModule.main, 'function');
  const output = [];
  await cutEpicModule.main(['905'], {
    loadConfig: () => ({ repo: 'o/r', projectDir: '/proj' }),
    realGraphNode: async () => GRAPH[905],
    runCore: async () => ({ branch: 'feature/epic/905', base: 'origin/trunk' }),
    write: (text) => output.push(text),
  });
  assert.deepEqual(output, ['cut feature/epic/905 from origin/trunk\n']);

  const refusal = Object.assign(new Error('lease refused'), { code: 'fence-stale' });
  await assert.rejects(
    cutEpicModule.main(['905'], {
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
