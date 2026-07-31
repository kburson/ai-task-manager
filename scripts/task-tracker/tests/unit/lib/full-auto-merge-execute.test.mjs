#!/usr/bin/env node
// @story #908 (epic #912)
// vc:1 — the impure executor WIRES the pure policy into the close flow: it
// detects a linked worktree, resolves the open PR, and either enables
// GitHub-native auto-merge or fails CLOSED — all via an injected `pexec`, so the
// wiring is provable without git/gh.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  detectLinkedWorktree,
  makeCloseTrunkRefResolver,
  resolveOpenPrNumber,
  enableFullAutoMergeForClose,
} from '../../../lib/full-auto-merge-execute.mjs';

// A recording pexec: routes by `${cmd} ${args.join(' ')}` prefix, records calls.
function fakePexec(routes) {
  const calls = [];
  const fn = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const key = `${cmd} ${args.join(' ')}`;
    for (const [prefix, val] of Object.entries(routes)) {
      if (key.startsWith(prefix)) {
        if (val instanceof Error) throw val;
        return { stdout: val, stderr: '' };
      }
    }
    throw new Error(`no route for: ${key}`);
  };
  fn.calls = calls;
  return fn;
}

test('detectLinkedWorktree: git-dir under /worktrees/ → true; plain .git → false', async () => {
  const linked = fakePexec({
    'git rev-parse --git-dir': '/repo/.git/worktrees/task-912-13506a\n',
  });
  assert.equal(await detectLinkedWorktree({ pexec: linked, cwd: '/x' }), true);

  const main = fakePexec({ 'git rev-parse --git-dir': '.git\n' });
  assert.equal(await detectLinkedWorktree({ pexec: main }), false);

  // fail-safe: missing pexec / thrown error → false (main-worktree default)
  assert.equal(await detectLinkedWorktree({}), false);
  const boom = fakePexec({ 'git rev-parse --git-dir': new Error('not a git repo') });
  assert.equal(await detectLinkedWorktree({ pexec: boom }), false);
});

test('makeCloseTrunkRefResolver: worktree → origin/trunk, main → trunk, cfg.trunkRef wins', async () => {
  const wt = makeCloseTrunkRefResolver({ inWorktree: true });
  assert.equal(await wt({ cfg: {} }), 'origin/trunk');

  const mainR = makeCloseTrunkRefResolver({ inWorktree: false });
  assert.equal(await mainR({ cfg: {} }), 'trunk');

  // explicit override wins even inside a worktree
  assert.equal(await wt({ cfg: { trunkRef: 'main' } }), 'main');

  // remoteTrunk override
  const wt2 = makeCloseTrunkRefResolver({ inWorktree: true, remoteTrunk: 'upstream/trunk' });
  assert.equal(await wt2({ cfg: {} }), 'upstream/trunk');
});

test('resolveOpenPrNumber: parses the first open PR head match; null on none/error', async () => {
  const one = fakePexec({ 'gh pr list --head claude/task-908': '[{"number":931}]' });
  assert.equal(
    await resolveOpenPrNumber({ branch: 'claude/task-908', cfg: { repo: 'o/r' }, pexec: one }),
    931
  );
  // passes -R when cfg.repo present
  assert.ok(one.calls[0].args.includes('-R') && one.calls[0].args.includes('o/r'));

  const none = fakePexec({ 'gh pr list --head b': '[]' });
  assert.equal(await resolveOpenPrNumber({ branch: 'b', pexec: none }), null);

  const err = fakePexec({ 'gh pr list --head b': new Error('gh down') });
  assert.equal(await resolveOpenPrNumber({ branch: 'b', pexec: err }), null);

  // no branch / no pexec → null (never throws)
  assert.equal(await resolveOpenPrNumber({ pexec: none }), null);
  assert.equal(await resolveOpenPrNumber({ branch: 'b' }), null);
});

test('read-only full-auto probes rethrow governed authority errors unchanged', async () => {
  const stale = Object.assign(new Error('stale close fence'), { code: 'fence-stale' });
  const detect = fakePexec({ 'git rev-parse --git-dir': stale });
  await assert.rejects(
    detectLinkedWorktree({ pexec: detect, cwd: '/x' }),
    (error) => error === stale
  );

  const resolve = fakePexec({ 'gh pr list --head b': stale });
  await assert.rejects(
    resolveOpenPrNumber({ branch: 'b', pexec: resolve }),
    (error) => error === stale
  );
});

test('enableFullAutoMergeForClose: not full-auto → skipped, no gh calls', async () => {
  const px = fakePexec({});
  const r = await enableFullAutoMergeForClose({
    cfg: {},
    branch: 'b',
    isFullAuto: false,
    pexec: px,
  });
  assert.deepEqual(r, { status: 'skipped-not-full-auto' });
  assert.equal(px.calls.length, 0);
});

test('enableFullAutoMergeForClose: no open PR → skipped-no-pr (interactive/local path)', async () => {
  const px = fakePexec({ 'gh pr list --head b': '[]' });
  const r = await enableFullAutoMergeForClose({
    cfg: {},
    branch: 'b',
    isFullAuto: true,
    pexec: px,
  });
  assert.deepEqual(r, { status: 'skipped-no-pr' });
});

test('enableFullAutoMergeForClose: PR present + fullAutoMerge unconfigured → fail-closed', async () => {
  const px = fakePexec({ 'gh pr list --head b': '[{"number":42}]' });
  const r = await enableFullAutoMergeForClose({
    cfg: {},
    branch: 'b',
    isFullAuto: true,
    pexec: px,
  });
  assert.equal(r.status, 'fail-closed');
  assert.match(r.message, /full-auto-merge-unconfigured/);
  // it must NOT have attempted any merge command
  assert.ok(!px.calls.some((c) => c.args.includes('merge')));
});

test('enableFullAutoMergeForClose: gh-auto-merge configured → enables auto-merge (--auto), never bare merge', async () => {
  const px = fakePexec({
    'gh pr list --head b': '[{"number":907}]',
    'gh pr merge 907 --auto --merge': '',
  });
  const r = await enableFullAutoMergeForClose({
    cfg: { repo: 'o/r', fullAutoMerge: { mechanism: 'gh-auto-merge' } },
    branch: 'b',
    isFullAuto: true,
    pexec: px,
  });
  assert.equal(r.status, 'enabled');
  assert.equal(r.prNumber, 907);
  assert.deepEqual(r.argv, ['pr', 'merge', '907', '--auto', '--merge']);
  const mergeCall = px.calls.find((c) => c.args.includes('merge') && c.args[0] === 'pr');
  assert.ok(mergeCall.args.includes('--auto'), 'must ENABLE auto-merge, not merge now');
  assert.ok(mergeCall.args.includes('-R') && mergeCall.args.includes('o/r'));
});

test('enableFullAutoMergeForClose: local-trunk-lane authorized → local-lane (no gh merge)', async () => {
  const px = fakePexec({ 'gh pr list --head b': '[{"number":50}]' });
  const r = await enableFullAutoMergeForClose({
    cfg: { fullAutoMerge: { mechanism: 'local-trunk-lane', operatorAuthorized: true } },
    branch: 'b',
    isFullAuto: true,
    pexec: px,
  });
  assert.deepEqual(r, { status: 'local-lane', prNumber: 50 });
  assert.ok(!px.calls.some((c) => c.args.includes('--auto')));
});

test('enableFullAutoMergeForClose: gh enable errors → exec-failed (issue kept OPEN by caller)', async () => {
  const px = fakePexec({
    'gh pr list --head b': '[{"number":7}]',
    'gh pr merge 7 --auto --merge': new Error('branch protection: no required checks'),
  });
  const r = await enableFullAutoMergeForClose({
    cfg: { fullAutoMerge: { mechanism: 'gh-auto-merge' } },
    branch: 'b',
    isFullAuto: true,
    pexec: px,
  });
  assert.equal(r.status, 'exec-failed');
  assert.match(r.message, /branch protection/);
});

test('full-auto merge executor rethrows governed authority errors unchanged', async () => {
  const stale = Object.assign(new Error('stale close fence'), { code: 'fence-stale' });
  const px = fakePexec({
    'gh pr list --head b': '[{"number":7}]',
    'gh pr merge 7 --auto --merge': stale,
  });
  await assert.rejects(
    enableFullAutoMergeForClose({
      cfg: { fullAutoMerge: { mechanism: 'gh-auto-merge' } },
      branch: 'b',
      isFullAuto: true,
      pexec: px,
    }),
    (error) => error === stale
  );
});
