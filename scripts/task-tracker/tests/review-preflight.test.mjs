#!/usr/bin/env node
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

{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({ body: TRAIL }),
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, true);
}

{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => ' M scripts/x.mjs\n',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({ body: TRAIL }),
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /tracked worktree changes/);
}

{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => null,
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /canonical `### 🔗 Commits` comment/);
}

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
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /canonical `### 🔗 Commits` comment/);
}

{
  const r = await runReviewPreflight({
    issueNumber: '109',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => SHA,
      findTrailComment: async () => ({
        body: ['### 🔗 Commits', '', '<!-- aitm-commits: def456 -->'].join('\n'),
      }),
      getIssueBody: async () => '',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /current HEAD/);
}

console.log('review-preflight.test.mjs: all passed');
