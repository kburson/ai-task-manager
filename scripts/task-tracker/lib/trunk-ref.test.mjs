// #927 — the one shared trunk-ref resolver. Pure unit tests: the injected git
// runner reports which refs "exist", so no real repo is touched. Covers the
// resolution order (cfg override → remote-tracking → local fallback → null), the
// synchronous twin used by the hot-path edit-guard, and the best-effort
// (never-fatal) fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveTrunkRef, resolveTrunkRefSync, fetchTrunk } from './trunk-ref.mjs';

// Build an async git fake whose `rev-parse --verify --quiet <ref>` resolves only
// for refs in `existing`, and throws otherwise (mirroring git's non-zero exit).
// Records every arg vector in `.calls`.
function makeGit(existing = []) {
  const set = new Set(existing);
  const calls = [];
  const git = async (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') {
      const ref = args[args.length - 1];
      if (set.has(ref)) return 'deadbeef';
      const e = new Error(`bad ref ${ref}`);
      e.status = 128;
      throw e;
    }
    if (args[0] === 'fetch') return '';
    return '';
  };
  git.calls = calls;
  return git;
}

// Sync twin of makeGit for resolveTrunkRefSync.
function makeGitSync(existing = []) {
  const set = new Set(existing);
  const calls = [];
  const git = (args) => {
    calls.push(args);
    const ref = args[args.length - 1];
    if (set.has(ref)) return 'deadbeef';
    const e = new Error(`bad ref ${ref}`);
    e.status = 128;
    throw e;
  };
  git.calls = calls;
  return git;
}

test('resolveTrunkRef: cfg.trunkRef override wins outright (no git probe)', async () => {
  const git = makeGit([]);
  const ref = await resolveTrunkRef({ cfg: { trunkRef: '  origin/trunk  ' }, deps: { git } });
  assert.equal(ref, 'origin/trunk'); // trimmed
  assert.equal(git.calls.length, 0, 'override short-circuits before any probe');
});

test('resolveTrunkRef: prefers the remote-tracking ref (origin/trunk) by default', async () => {
  const git = makeGit(['refs/remotes/origin/trunk', 'refs/heads/trunk']);
  const ref = await resolveTrunkRef({ cfg: {}, deps: { git } });
  assert.equal(ref, 'origin/trunk');
});

test('resolveTrunkRef: falls through trunk→main→master for the remote ref', async () => {
  const git = makeGit(['refs/remotes/origin/main']);
  const ref = await resolveTrunkRef({ cfg: {}, deps: { git } });
  assert.equal(ref, 'origin/main');
});

test('resolveTrunkRef: honors a custom remote name (cfg.trunkRemote)', async () => {
  const git = makeGit(['refs/remotes/upstream/trunk']);
  const ref = await resolveTrunkRef({ cfg: { trunkRemote: 'upstream' }, deps: { git } });
  assert.equal(ref, 'upstream/trunk');
});

test('resolveTrunkRef: local-branch fallback only when no remote-tracking ref exists', async () => {
  const git = makeGit(['refs/heads/trunk']); // no remote-tracking ref
  const ref = await resolveTrunkRef({ cfg: {}, deps: { git } });
  assert.equal(ref, 'trunk');
});

test('resolveTrunkRef: null when nothing resolves', async () => {
  const git = makeGit([]);
  const ref = await resolveTrunkRef({ cfg: {}, deps: { git } });
  assert.equal(ref, null);
});

test('resolveTrunkRefSync: mirrors the async order (remote-first, cfg override, local fallback)', () => {
  assert.equal(
    resolveTrunkRefSync({ cfg: { trunkRef: 'origin/trunk' }, deps: { gitSync: makeGitSync([]) } }),
    'origin/trunk'
  );
  assert.equal(
    resolveTrunkRefSync({
      cfg: {},
      deps: { gitSync: makeGitSync(['refs/remotes/origin/trunk', 'refs/heads/trunk']) },
    }),
    'origin/trunk'
  );
  assert.equal(
    resolveTrunkRefSync({ cfg: {}, deps: { gitSync: makeGitSync(['refs/heads/main']) } }),
    'main'
  );
  assert.equal(resolveTrunkRefSync({ cfg: {}, deps: { gitSync: makeGitSync([]) } }), null);
});

test('fetchTrunk: fetches the trunk ref before a read and reports status', async () => {
  const git = makeGit([]);
  const r = await fetchTrunk({ cfg: {}, deps: { git } });
  assert.equal(r.fetched, true);
  assert.equal(r.remote, 'origin');
  assert.deepEqual(git.calls[0], ['fetch', 'origin', 'trunk']);
});

test('fetchTrunk: a pinned origin ref narrows the fetch to that one branch', async () => {
  const git = makeGit([]);
  const r = await fetchTrunk({ cfg: { trunkRef: 'origin/main' }, deps: { git } });
  assert.equal(r.branch, 'main');
  assert.deepEqual(git.calls[0], ['fetch', 'origin', 'main']);
});

test('fetchTrunk: NEVER fatal — a failing fetch resolves to {fetched:false}', async () => {
  const git = async (args) => {
    if (args[0] === 'fetch') {
      const e = new Error('offline');
      e.status = 1;
      throw e;
    }
    return '';
  };
  const r = await fetchTrunk({ cfg: {}, deps: { git } });
  assert.equal(r.fetched, false);
  assert.equal(r.remote, 'origin');
});
