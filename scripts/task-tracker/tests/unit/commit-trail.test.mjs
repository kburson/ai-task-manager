#!/usr/bin/env node
// @story #82
// Unit tests for commit-trail lib helpers.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  detectGitCommit,
  parseMarker,
  buildInitialTrail,
  buildRow,
  appendCommitRow,
  updateMarker,
  hasWorktreeCols,
  hasCanonicalCommitTrace,
  pruneUnreachable,
} from '../../lib/commit-trail.mjs';
import { defaultIsReachable } from '../../commit-trail-handler.mjs';

// --- detectGitCommit ---

// Simple commit
{
  const r = detectGitCommit('git commit -m "x"');
  assert.equal(r.isCommit, true);
  assert.equal(r.isAmend, false);
}

// With -c flags before commit
{
  const r = detectGitCommit('git -c user.email=foo@bar commit -m "x"');
  assert.equal(r.isCommit, true);
  assert.equal(r.isAmend, false);
}

// cd && git commit
{
  const r = detectGitCommit('cd /tmp/foo && git commit -m "x"');
  assert.equal(r.isCommit, true);
}

// Amend
{
  const r = detectGitCommit('git commit --amend --no-edit');
  assert.equal(r.isCommit, true);
  assert.equal(r.isAmend, true);
}

// git status (not commit)
{
  const r = detectGitCommit('git status');
  assert.equal(r.isCommit, false);
}

// Echoed string only — no git invocation
{
  const r = detectGitCommit('echo "git commit"');
  assert.equal(r.isCommit, false);
}

// Env-var prefix
{
  const r = detectGitCommit('GIT_AUTHOR_NAME=foo git commit -m x');
  assert.equal(r.isCommit, true);
}

// Empty / non-string
{
  assert.equal(detectGitCommit('').isCommit, false);
  assert.equal(detectGitCommit(null).isCommit, false);
  assert.equal(detectGitCommit(undefined).isCommit, false);
}

// --- parseMarker ---

{
  const body = '### 🔗 Commits\n\n<!-- aitm-commits: abc123,def456 -->\n\n| SHA |';
  const p = parseMarker(body);
  assert.deepEqual(Array.from(p.shas), ['abc123', 'def456']);
}

{
  const body = '### 🔗 Commits\n\n<!-- aitm-commits:  -->\n';
  const p = parseMarker(body);
  assert.equal(p.shas.size, 0);
  assert.notEqual(p.index, -1);
}

{
  const p = parseMarker('no marker here');
  assert.equal(p.index, -1);
}

// --- parseMarker: new quoted-attribute grammar (#381 dual-read) ---

// New `shas="..."` form, multi.
{
  const body = '### 🔗 Commits\n\n<!-- aitm-commits shas="abc123,def456" -->\n\n| SHA |';
  const p = parseMarker(body);
  assert.deepEqual(Array.from(p.shas), ['abc123', 'def456']);
}

// New form, empty list.
{
  const body = '### 🔗 Commits\n\n<!-- aitm-commits shas="" -->\n';
  const p = parseMarker(body);
  assert.equal(p.shas.size, 0);
  assert.notEqual(p.index, -1);
}

// Legacy and new forms yield identical SHA sets.
{
  const legacy = parseMarker('<!-- aitm-commits: abc123,def456 -->');
  const neu = parseMarker('<!-- aitm-commits shas="abc123,def456" -->');
  assert.deepEqual(Array.from(legacy.shas), Array.from(neu.shas));
}

// --- hasWorktreeCols ---

{
  assert.equal(hasWorktreeCols('| SHA | Subject | Author | When | Branch | Worktree |\n'), true);
  assert.equal(hasWorktreeCols('| SHA | Subject | Author | When |\n'), false);
}

// --- buildInitialTrail ---

{
  const trail = buildInitialTrail();
  assert.match(trail, /### 🔗 Commits/);
  assert.match(trail, /<!-- aitm-commits shas="" -->/);
  assert.match(trail, /\| SHA \| Subject \| Author \| When \|/);
  assert.doesNotMatch(trail, /Branch/);
}

{
  const trail = buildInitialTrail({ worktreeCols: true });
  assert.match(trail, /Branch \| Worktree/);
}

// --- buildRow ---

{
  const r = buildRow({
    sha: 'abcdef1234567890',
    subject: 'feat(x): do thing',
    author: 'kendrick burson',
    ts: '2026-05-10T14:32:11Z',
    commitUrl: 'https://github.com/o/r/commit/abcdef1234567890',
  });
  assert.equal(
    r,
    '| [`abcdef`](https://github.com/o/r/commit/abcdef1234567890) | feat(x): do thing | kendrick burson | 2026-05-10T14:32:11Z |'
  );
}

// Without commitUrl, legacy callers still render a short SHA in code style.
{
  const r = buildRow({
    sha: 'abcdef1234567890',
    subject: 'feat(x): do thing',
    author: 'kendrick burson',
    ts: '2026-05-10T14:32:11Z',
  });
  assert.equal(r, '| `abcdef` | feat(x): do thing | kendrick burson | 2026-05-10T14:32:11Z |');
}

// Pipe characters in subject escaped
{
  const r = buildRow({
    sha: 'abcdef1',
    subject: 'foo | bar',
    author: 'a',
    ts: 't',
  });
  assert.match(r, /foo \\\| bar/);
}

// Worktree columns
{
  const r = buildRow(
    {
      sha: 'abcdef1',
      subject: 's',
      author: 'a',
      ts: 't',
      branch: 'feat/x',
      worktree: '/tmp/wt',
    },
    { worktreeCols: true }
  );
  assert.match(r, /feat\/x/);
  assert.match(r, /\/tmp\/wt/);
}

// --- appendCommitRow + updateMarker ---

{
  let body = buildInitialTrail();
  const row1 = buildRow({ sha: 'aaaa111', subject: 's1', author: 'a', ts: 't1' });
  body = appendCommitRow(body, row1);
  body = updateMarker(body, 'aaaa111');
  assert.match(body, /aaaa111/);
  assert.match(body, /<!-- aitm-commits shas="aaaa111" -->/);

  const row2 = buildRow({ sha: 'bbbb222', subject: 's2', author: 'a', ts: 't2' });
  body = appendCommitRow(body, row2);
  body = updateMarker(body, 'bbbb222');
  assert.match(body, /aaaa111/);
  assert.match(body, /bbbb222/);
  assert.match(body, /<!-- aitm-commits shas="aaaa111,bbbb222" -->/);
  // Only one marker
  assert.equal(body.match(/<!-- aitm-commits /g).length, 1);
}

// updateMarker is idempotent for duplicate SHA
{
  let body = buildInitialTrail();
  body = updateMarker(body, 'aaa');
  const before = body;
  body = updateMarker(body, 'aaa');
  assert.equal(body, before);
}

// --- canonical trace validation ---

{
  const body = [
    '### 🔗 Commits',
    '',
    '<!-- aitm-commits: abcdef1234567890 -->',
    '',
    '| SHA | Subject | Author | When |',
    '|---|---|---|---|',
    '| [`abcdef1`](https://github.com/o/r/commit/abcdef1234567890) | s | a | t |',
    '',
  ].join('\n');
  assert.equal(hasCanonicalCommitTrace(body, 'abcdef1234567890'), true);
}

{
  const wrongHeading = [
    '### 🔗 Related commit',
    '',
    '<!-- aitm-commits: abcdef1234567890 -->',
  ].join('\n');
  assert.equal(hasCanonicalCommitTrace(wrongHeading, 'abcdef1234567890'), false);
}

{
  const missingMarker = ['### 🔗 Commits', '', '| SHA | Subject | Author | When |'].join('\n');
  assert.equal(hasCanonicalCommitTrace(missingMarker, 'abcdef1234567890'), false);
}

{
  const missingSha = ['### 🔗 Commits', '', '<!-- aitm-commits: def456 -->'].join('\n');
  assert.equal(hasCanonicalCommitTrace(missingSha, 'abcdef1234567890'), false);
}

// --- pruneUnreachable ---

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SHA_C = 'cccccccccccccccccccccccccccccccccccccccc';

function makeTrail(shas, repo = 'o/r') {
  let body = buildInitialTrail();
  for (const sha of shas) {
    const row = buildRow(
      {
        sha,
        subject: `s-${sha.slice(0, 7)}`,
        author: 'a',
        ts: 't',
        commitUrl: `https://github.com/${repo}/commit/${sha}`,
      },
      {}
    );
    body = appendCommitRow(body, row);
    body = updateMarker(body, sha);
  }
  return body;
}

// Drop unreachable middle SHA; preserve order of remaining rows + marker.
{
  const body = makeTrail([SHA_A, SHA_B, SHA_C]);
  const reachable = new Set([SHA_A, SHA_C]);
  const out = await pruneUnreachable(body, { existsSha: (s) => reachable.has(s) });
  const parsed = parseMarker(out);
  assert.deepEqual(Array.from(parsed.shas), [SHA_A, SHA_C]);
  assert.ok(!out.includes(SHA_B), 'full SHA_B should be gone from URL');
  assert.ok(!out.includes('`' + SHA_B.slice(0, 6) + '`'), 'short SHA_B should be gone from table');
  // Order preserved
  const idxA = out.indexOf(SHA_A);
  const idxC = out.indexOf(SHA_C);
  assert.ok(idxA > 0 && idxC > idxA, 'rows preserve original order');
}

// All reachable → idempotent no-op.
{
  const body = makeTrail([SHA_A, SHA_B]);
  const out = await pruneUnreachable(body, { existsSha: () => true });
  assert.equal(out, body);
}

// No marker → no-op.
{
  const body = 'no marker here';
  const out = await pruneUnreachable(body, { existsSha: () => false });
  assert.equal(out, body);
}

// existsSha not provided → no-op.
{
  const body = makeTrail([SHA_A]);
  const out = await pruneUnreachable(body, {});
  assert.equal(out, body);
}

// Async existsSha is awaited.
{
  const body = makeTrail([SHA_A, SHA_B]);
  const out = await pruneUnreachable(body, {
    existsSha: async (s) => s === SHA_A,
  });
  const parsed = parseMarker(out);
  assert.deepEqual(Array.from(parsed.shas), [SHA_A]);
}

// --- defaultIsReachable (#424) ---
// The production prune predicate must agree with the review gate: keep a SHA
// only when it is REACHABLE from HEAD (`git merge-base --is-ancestor`), not
// merely when the object still exists. execFile rejects on any non-zero exit,
// so exit 1 (non-ancestor) AND exit 128 (unknown/GC'd object) must both map to
// false. This is the exact contract that diverged from review-preflight.

// exit 0 (ancestor) → true.
{
  let calledArgs = null;
  const pexec = async (cmd, args) => {
    calledArgs = { cmd, args };
    return { stdout: '', stderr: '' };
  };
  const ok = await defaultIsReachable(SHA_A, { cwd: '/repo', pexec });
  assert.equal(ok, true);
  assert.equal(calledArgs.cmd, 'git');
  assert.deepEqual(calledArgs.args, ['merge-base', '--is-ancestor', SHA_A, 'HEAD']);
}

// exit 1 (non-ancestor / orphaned-but-existing) → false.
{
  const pexec = async () => {
    const err = new Error('non-ancestor');
    err.code = 1;
    throw err;
  };
  const ok = await defaultIsReachable(SHA_A, { cwd: '/repo', pexec });
  assert.equal(ok, false);
}

// exit 128 (unknown / GC'd object) → false.
{
  const pexec = async () => {
    const err = new Error('bad object');
    err.code = 128;
    throw err;
  };
  const ok = await defaultIsReachable(SHA_A, { cwd: '/repo', pexec });
  assert.equal(ok, false);
}

// --- pruneUnreachable doc comment (#424 AC3) ---
// The doc comment above `pruneUnreachable` must describe the merge-base
// reachability semantics and must NOT mislabel `git cat-file -e` as a
// reachability check (the original wording that induced the bug).
{
  const libPath = new URL('../../lib/commit-trail.mjs', import.meta.url);
  const src = readFileSync(libPath, 'utf8');
  const idx = src.indexOf('export async function pruneUnreachable');
  assert.notEqual(idx, -1, 'pruneUnreachable not found in commit-trail.mjs');
  const before = src.slice(0, idx);
  const commentStart = before.lastIndexOf('\n// Drop SHAs');
  assert.notEqual(commentStart, -1, 'pruneUnreachable doc comment (// Drop SHAs) not found');
  const comment = before.slice(commentStart);
  assert.match(
    comment,
    /merge-base --is-ancestor/,
    'doc comment must describe merge-base reachability'
  );
  assert.doesNotMatch(
    comment,
    /cat-file[^\n]*reachability/i,
    'doc comment must not label cat-file -e a reachability check'
  );
}

console.log('commit-trail: ok');
