#!/usr/bin/env node
// @story #109
import { strict as assert } from 'node:assert';
import { runReviewPreflight } from '../lib/review-preflight.mjs';

const SHA = 'abcdef1234567890';
const TRAIL = [
  '### 🔗 Commits',
  '',
  '<!-- aitm-commits: abcdef1234567890 -->',
  '',
  '| SHA | Subject | Author | When |',
  '|---|---|---|---|',
  '| [`abcdef1`](https://github.com/o/r/commit/abcdef1234567890) | s | a | t |',
].join('\n');

// HEAD itself is in the trail and reachable → pass.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({ body: TRAIL }),
      gitIsAncestor: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, true);
}

// Parked-then-resumed (the #384 bug): trail holds the issue's own commit A,
// HEAD has advanced to a blocker's commit B, A is an ancestor of B → pass even
// though HEAD itself is not listed in the trail.
{
  const r = await runReviewPreflight({
    issueNumber: '374',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => 'e7a7400b0b0b0b0b',
      findTrailComment: async () => ({
        body: ['### 🔗 Commits', '', '<!-- aitm-commits: eabe08f1111111111 -->'].join('\n'),
      }),
      gitIsAncestor: async (sha, head) =>
        sha === 'eabe08f1111111111' && head === 'e7a7400b0b0b0b0b',
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, true, r.reasons.join('\n'));
}

// Orphaned commit: a trailed SHA is not reachable from HEAD (e.g. soft-reset +
// recommit, or a rebase dropped it) → fail with a reachability reason.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({
        body: ['### 🔗 Commits', '', '<!-- aitm-commits: def4561234567890 -->'].join('\n'),
      }),
      gitIsAncestor: async () => false,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /not reachable from current HEAD/);
}

// Empty trail: heading present but the marker records no commits → fail.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({
        body: ['### 🔗 Commits', '', '<!-- aitm-commits:  -->'].join('\n'),
      }),
      gitIsAncestor: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /records no commits/);
}

// Regression: uncommitted tracked changes still fail.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => ' M scripts/x.mjs\n',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({ body: TRAIL }),
      gitIsAncestor: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /tracked worktree changes/);
}

// Regression: a missing canonical Commits comment still fails.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => null,
      gitIsAncestor: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /canonical `### 🔗 Commits` comment/);
}

// Regression: a comment with the wrong heading is treated as malformed.
{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({
        body: ['### 🔗 Related commit', '', '<!-- aitm-commits: abcdef1234567890 -->'].join('\n'),
      }),
      gitIsAncestor: async () => true,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /canonical `### 🔗 Commits` comment/);
}

console.log('review-preflight.test.mjs: all passed');
