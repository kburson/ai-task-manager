// @story #731
// #731 — attribution engine: message-grep replaces SHA reachability.
//
// These tests are the demonstrable proof bound to #731's ACs. They are
// hermetic: `pexec` is injected, so no real repository, no network, and no
// dependence on the ambient git history. Each scenario feeds a canned
// `git log --all --grep` stdout and asserts the engine's behaviour.
//
// The load-bearing proofs are scenarios 3 and 4: attribution succeeds for a
// commit that is NOT reachable from HEAD, and after the SHA has been rewritten
// — because existence keys on the message token, never on reachability.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { attributingCommits, hasAttributingCommit } from './commit-attribution.mjs';

// Build a fake `pexec` that returns canned stdout and records the argv it was
// called with, so we can both drive scenarios and pin the query contract.
function fakePexec(stdout, sink) {
  return async (file, args) => {
    if (sink) {
      sink.file = file;
      sink.args = args;
    }
    return { stdout };
  };
}

// A `git log --format=%H%x09%s%x09%aI` row: SHA \t subject \t iso-timestamp.
function row(sha, subject, ts) {
  return `${sha}\t${subject}\t${ts}`;
}

test('attributingCommits — parses matching rows into {sha, subject, ts}', async () => {
  const stdout =
    row('aaaa111', '[#731] feat(attr): add engine', '2026-07-07T20:00:00Z') +
    '\n' +
    row('bbbb222', '[#731] test(attr): cover non-reachable case', '2026-07-07T20:05:00Z') +
    '\n';
  const commits = await attributingCommits(731, { cwd: '/x', pexec: fakePexec(stdout) });
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0], {
    sha: 'aaaa111',
    subject: '[#731] feat(attr): add engine',
    ts: '2026-07-07T20:00:00Z',
  });
  assert.equal(commits[1].sha, 'bbbb222');
});

test('hasAttributingCommit — true when ≥1 commit references the issue', async () => {
  const stdout = row('aaaa111', '[#731] feat: x', '2026-07-07T20:00:00Z') + '\n';
  assert.equal(await hasAttributingCommit(731, { cwd: '/x', pexec: fakePexec(stdout) }), true);
});

test('hasAttributingCommit — false when no commit references the issue', async () => {
  assert.equal(await hasAttributingCommit(731, { cwd: '/x', pexec: fakePexec('') }), false);
  assert.equal(await hasAttributingCommit(731, { cwd: '/x', pexec: fakePexec('\n\n') }), false);
});

test('attribution succeeds for a commit on a NON-REACHABLE branch', async () => {
  // The grep found the commit; the (advisory) reachability check says it is NOT
  // an ancestor of HEAD. Existence must still be true — reachability is not the
  // source of truth.
  const stdout =
    row('cccc333', '[#731] feat: work on an unmerged branch', '2026-07-07T20:00:00Z') + '\n';
  const isReachable = async () => false; // never an ancestor of HEAD
  assert.equal(
    await hasAttributingCommit(731, { cwd: '/x', pexec: fakePexec(stdout), isReachable }),
    true
  );
  // And when asked to annotate, the row is tagged reachable:false — decoration
  // on top of message-based existence, not a precondition of it.
  const commits = await attributingCommits(731, {
    cwd: '/x',
    pexec: fakePexec(stdout),
    isReachable,
    annotateReachable: true,
  });
  assert.equal(commits[0].reachable, false);
});

test('attribution survives a SHA rewrite (amend/rebase)', async () => {
  // Same token, a different SHA than any prior recorded one. The query keys on
  // the message, so the rewritten commit still attributes.
  const stdout =
    row('deadf00', '[#731] feat: same work, rewritten history', '2026-07-07T20:00:00Z') + '\n';
  const commits = await attributingCommits(731, { cwd: '/x', pexec: fakePexec(stdout) });
  assert.equal(commits.length, 1);
  assert.equal(commits[0].sha, 'deadf00');
});

test('wrong-id isolation — a numeric-prefix collision does not attribute', async () => {
  // A row for #7310 must not attribute to #731. The anchored token filter drops
  // it even if it leaks into the grep output.
  const stdout = row('eeee444', '[#7310] feat: a different issue', '2026-07-07T20:00:00Z') + '\n';
  const commits = await attributingCommits(731, { cwd: '/x', pexec: fakePexec(stdout) });
  assert.equal(commits.length, 0);
  assert.equal(await hasAttributingCommit(731, { cwd: '/x', pexec: fakePexec(stdout) }), false);
});

test('multi-id commit attributes to each of its ids', async () => {
  const stdout = row('ffff555', '[#731] [#730] feat: shared change', '2026-07-07T20:00:00Z') + '\n';
  assert.equal(await hasAttributingCommit(731, { cwd: '/x', pexec: fakePexec(stdout) }), true);
  assert.equal(await hasAttributingCommit(730, { cwd: '/x', pexec: fakePexec(stdout) }), true);
});

test('query contract — exact git argv is pinned', async () => {
  const sink = {};
  await attributingCommits(731, { cwd: '/x', pexec: fakePexec('', sink) });
  assert.equal(sink.file, 'git');
  assert.deepEqual(sink.args, [
    'log',
    '--all',
    '--fixed-strings',
    '--grep=[#731]',
    '--format=%H%x09%s%x09%aI',
  ]);
});

test('accepts "731", "#731" and 731 issue-number forms', async () => {
  const stdout = row('aaaa111', '[#731] feat: x', '2026-07-07T20:00:00Z') + '\n';
  for (const form of [731, '731', '#731']) {
    assert.equal(await hasAttributingCommit(form, { cwd: '/x', pexec: fakePexec(stdout) }), true);
  }
});

test('throws on an unparseable issue number', async () => {
  await assert.rejects(() => attributingCommits('abc', { cwd: '/x', pexec: fakePexec('') }));
});
