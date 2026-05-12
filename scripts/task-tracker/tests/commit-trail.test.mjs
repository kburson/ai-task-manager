#!/usr/bin/env node
// Unit tests for commit-trail lib helpers.

import { strict as assert } from 'node:assert';
import {
  detectGitCommit,
  parseMarker,
  buildInitialTrail,
  buildRow,
  appendCommitRow,
  updateMarker,
  hasWorktreeCols,
} from '../lib/commit-trail.mjs';

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

// --- hasWorktreeCols ---

{
  assert.equal(hasWorktreeCols('| SHA | Subject | Author | When | Branch | Worktree |\n'), true);
  assert.equal(hasWorktreeCols('| SHA | Subject | Author | When |\n'), false);
}

// --- buildInitialTrail ---

{
  const trail = buildInitialTrail();
  assert.match(trail, /### 🔗 Commits/);
  assert.match(trail, /<!-- aitm-commits:\s*-->/);
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
  });
  assert.equal(r, '| `abcdef1` | feat(x): do thing | kendrick burson | 2026-05-10T14:32:11Z |');
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
  assert.match(body, /<!-- aitm-commits: aaaa111 -->/);

  const row2 = buildRow({ sha: 'bbbb222', subject: 's2', author: 'a', ts: 't2' });
  body = appendCommitRow(body, row2);
  body = updateMarker(body, 'bbbb222');
  assert.match(body, /aaaa111/);
  assert.match(body, /bbbb222/);
  assert.match(body, /<!-- aitm-commits: aaaa111,bbbb222 -->/);
  // Only one marker
  assert.equal(body.match(/aitm-commits:/g).length, 1);
}

// updateMarker is idempotent for duplicate SHA
{
  let body = buildInitialTrail();
  body = updateMarker(body, 'aaa');
  const before = body;
  body = updateMarker(body, 'aaa');
  assert.equal(body, before);
}

console.log('commit-trail: ok');
