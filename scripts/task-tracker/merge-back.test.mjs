// #905 — merge a child back into its epic (design: "Merge-back protocol").
// Opportunistically sync the epic onto its parent (skip if already current),
// rebase the child onto the epic head, run the child's tests, then fast-forward
// only. Refuse on rebase conflict or test failure; clean up on success. git +
// graph + test-runner injected.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mergeBack } from './merge-back.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const GRAPH = {
  905: { parent: null, children: [910] }, // root epic (parent = trunk)
  910: { parent: 905, children: [] }, // child of 905
};
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

function makeGit({ grandparentIsAncestor = true, rebaseChildFails = false } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'merge-base' && args.includes('--is-ancestor')) {
      if (!grandparentIsAncestor) {
        const e = new Error('trunk moved ahead');
        e.status = 1;
        throw e;
      }
      return '';
    }
    // rebase of the CHILD onto the epic: args = ['rebase','feature/epic/905','feature/child/910']
    if (args[0] === 'rebase' && args[2] === 'feature/child/910' && rebaseChildFails) {
      const e = new Error('rebase conflict in child');
      e.status = 1;
      throw e;
    }
    return '';
  };
  git.calls = calls;
  return git;
}

test('clean fast-forward path: sync-skip, rebase child, test, ff, cleanup', async () => {
  const git = makeGit(); // grandparent already ancestor → epic sync is a no-op
  const r = await mergeBack({
    child: 910,
    path: '/wt/910',
    deps: governed({ graph, git, runTests: () => true }),
  });
  assert.equal(r.merged, true);
  assert.equal(r.epic, 'feature/epic/905');
  assert.equal(r.child, 'feature/child/910');
  const kinds = git.calls.map((c) => c.join(' '));
  // epic was NOT rebased onto trunk (grandparent unchanged) ...
  assert.ok(!kinds.includes('rebase trunk feature/epic/905'));
  // ... but the child WAS rebased onto the epic, then ff-merged, then cleaned up.
  assert.ok(kinds.includes('rebase feature/epic/905 feature/child/910'));
  assert.ok(kinds.includes('merge --ff-only feature/child/910'));
  assert.ok(kinds.includes('worktree remove /wt/910'));
  assert.ok(kinds.some((k) => k.startsWith('branch -d feature/child/910')));
});

test('grandparent advanced: epic is rebased onto trunk before the child merge', async () => {
  const git = makeGit({ grandparentIsAncestor: false });
  await mergeBack({
    child: 910,
    path: '/wt/910',
    deps: governed({ graph, git, runTests: () => true }),
  });
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(kinds.includes('rebase trunk feature/epic/905'));
});

test('rebase conflict on the child refuses before any merge', async () => {
  const git = makeGit({ rebaseChildFails: true });
  await assert.rejects(
    mergeBack({
      child: 910,
      path: '/wt/910',
      deps: governed({ graph, git, runTests: () => true }),
    }),
    /rebase|conflict/i
  );
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(!kinds.some((k) => k.startsWith('merge --ff-only')));
});

test('post-rebase test failure refuses the merge and skips cleanup', async () => {
  const git = makeGit();
  await assert.rejects(
    mergeBack({
      child: 910,
      path: '/wt/910',
      deps: governed({ graph, git, runTests: () => false }),
    }),
    /test/i
  );
  const kinds = git.calls.map((c) => c.join(' '));
  assert.ok(!kinds.some((k) => k.startsWith('merge --ff-only')));
  assert.ok(!kinds.some((k) => k.startsWith('worktree remove')));
});

test('#864: the test-runner runs bounded sections, not the retired test:all', () => {
  const src = readFileSync(path.join(__dir, 'merge-back.mjs'), 'utf8');
  // No functional caller of the retired monolith may remain.
  assert.ok(
    !/\brun',\s*'test:all'|\['run',\s*'test:all'\]/.test(src),
    'merge-back.mjs must not invoke `npm run test:all` (it is retired by #864)'
  );
  // It must instead run each bounded section, each under its own ceiling.
  for (const section of ['test:unit', 'test:integration', 'test:slow']) {
    assert.ok(
      src.includes(`'${section}'`),
      `merge-back.mjs must run the ${section} section in place of test:all`
    );
  }
});

test('refuses a non-child issue', async () => {
  const git = makeGit();
  await assert.rejects(
    mergeBack({
      child: 905,
      path: '/wt/x',
      deps: governed({ graph, git, runTests: () => true }),
    }),
    /not a child/i
  );
});

test('requires child, git, and a test runner', async () => {
  const git = makeGit();
  await assert.rejects(
    mergeBack({ path: '/wt/x', deps: governed({ graph, git, runTests: () => true }) }),
    /child/i
  );
  await assert.rejects(mergeBack({ child: 910, path: '/wt/x', deps: governed({ graph }) }), /git/i);
  await assert.rejects(
    mergeBack({ child: 910, path: '/wt/x', deps: governed({ graph, git }) }),
    /runTests/i
  );
});

test('merge-back holds one epic-owned root across fetch, tests, merge, and cleanup', async () => {
  const auth = authority();
  const events = [];
  const envs = [];
  const git = (args, options) => {
    events.push(args.join(' '));
    envs.push(options?.env);
    if (args[0] === 'merge-base') return '';
    return '';
  };
  await mergeBack({
    child: 910,
    path: '/wt/910',
    deps: {
      graph,
      git,
      withGovernedEffect: auth.withGovernedEffect,
      fetch: (_options) => events.push('fetch'),
      runTests: (options) => {
        events.push('tests');
        envs.push(options.env);
        return true;
      },
      baseEnv: {
        KEEP_ME: 'yes',
        REMOTE_LEASE_BEARER: 'secret',
        AITM_LEASE_ID: 'stale',
        AITM_FENCING_TOKEN: '7',
        AITM_LEASE_RECEIPT: 'untrusted',
      },
      tokenEnv: 'REMOTE_LEASE_BEARER',
    },
  });

  assert.deepEqual(auth.calls, [
    {
      issueId: '905',
      operation: 'branch-worktree-orchestration',
      heartbeat: true,
    },
  ]);
  assert.deepEqual(events, [
    'fetch',
    'merge-base --is-ancestor trunk feature/epic/905',
    'rebase feature/epic/905 feature/child/910',
    'tests',
    'checkout feature/epic/905',
    'merge --ff-only feature/child/910',
    'worktree remove /wt/910',
    'branch -d feature/child/910',
  ]);
  assert.equal(auth.verifies, 7, 'fetch, tests, and every mutating git step reverify just in time');
  for (const env of envs.filter(Boolean)) {
    assert.deepEqual(env, {
      KEEP_ME: 'yes',
      AITM_LEASE_ID: 'lease-905',
      AITM_FENCING_TOKEN: '42',
    });
  }
});

test('stale authority after tests blocks checkout, merge, and cleanup callbacks', async () => {
  const auth = authority({ staleAt: 4 });
  const git = makeGit();
  let tests = 0;
  await assert.rejects(
    mergeBack({
      child: 910,
      path: '/wt/910',
      deps: {
        graph,
        git,
        withGovernedEffect: auth.withGovernedEffect,
        fetch: () => {},
        runTests: () => {
          tests += 1;
          return true;
        },
      },
    }),
    (error) => error.code === 'fence-stale'
  );
  assert.equal(tests, 1);
  const kinds = git.calls.map((args) => args.join(' '));
  assert.ok(!kinds.some((kind) => kind.startsWith('checkout ')));
  assert.ok(!kinds.some((kind) => kind.startsWith('merge --ff-only')));
  assert.ok(!kinds.some((kind) => kind.startsWith('worktree remove')));
  assert.ok(!kinds.some((kind) => kind.startsWith('branch -d')));
});

for (const cleanupFence of [
  { staleAt: 6, forbidden: 'worktree remove /wt/910' },
  { staleAt: 7, forbidden: 'branch -d feature/child/910' },
]) {
  test(`cleanup fence ${cleanupFence.staleAt} blocks its mutating git callback`, async () => {
    const auth = authority({ staleAt: cleanupFence.staleAt });
    const git = makeGit();
    await assert.rejects(
      mergeBack({
        child: 910,
        path: '/wt/910',
        deps: {
          graph,
          git,
          withGovernedEffect: auth.withGovernedEffect,
          fetch: () => {},
          runTests: () => true,
        },
      }),
      (error) => error.code === 'fence-stale'
    );
    assert.ok(!git.calls.map((args) => args.join(' ')).includes(cleanupFence.forbidden));
  });
}
