#!/usr/bin/env node
// @story #155
// #155 — Develop→Test commit-trail-contains-HEAD gate.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { gateCommitTrailContainsHead } from '../../../../task-tracker/lib/code-complete-gate.mjs';

const cfg = { repo: 'x/y' };
const HEAD = '0123456789abcdef0123456789abcdef01234567';

// --- 1. Missing trail comment → refuse with develop-to-test-no-trail ---
{
  const result = await gateCommitTrailContainsHead({
    cfg,
    issueNumber: 1,
    projectDir: '/tmp',
    deps: {
      listComments: async () => [],
      getHeadSha: async () => HEAD,
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.blocker, /develop-to-test-no-trail/);
  assert.match(result.blocker, /\/task commit-trace/);
}

// --- 2. HEAD not in trail AND HEAD is this issue's own unrecorded commit
//        (forgot commit-trace) → develop-to-test-stale-trail ---
{
  const OTHER = 'aaaaaaa1111111aaaaaaa1111111aaaaaaa11111';
  const trailComment = {
    body: `### 🔗 Commits\n\n<!-- aitm-commits: ${OTHER} -->\n\n| SHA | Subject | Author | When |\n|---|---|---|---|\n| \`${OTHER.slice(0, 6)}\` | s | a | t |`,
  };
  const result = await gateCommitTrailContainsHead({
    cfg,
    issueNumber: 1,
    projectDir: '/tmp',
    deps: {
      listComments: async () => [trailComment],
      getHeadSha: async () => HEAD,
      // HEAD carries this issue's [#1] token and is NOT in the trail → the
      // developer forgot to record it.
      attributingCommits: async () => [{ sha: HEAD, subject: '[#1] new work' }],
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.blocker, /develop-to-test-stale-trail/);
  assert.match(result.blocker, new RegExp(HEAD.slice(0, 6)));
}

// --- 3. Trail contains HEAD → pass ---
{
  const trailComment = {
    body: `### 🔗 Commits\n\n<!-- aitm-commits: ${HEAD} -->\n\n| SHA | Subject | Author | When |\n|---|---|---|---|\n| \`${HEAD.slice(0, 6)}\` | s | a | t |`,
  };
  const result = await gateCommitTrailContainsHead({
    cfg,
    issueNumber: 1,
    projectDir: '/tmp',
    deps: {
      listComments: async () => [trailComment],
      getHeadSha: async () => HEAD,
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.headSha, HEAD);
  assert.deepEqual(result.trailShas, [HEAD]);
}

// --- 4. Trail contains multiple SHAs, HEAD is one of them → pass ---
{
  const OTHER1 = 'aaaa111aaaa111aaaa111aaaa111aaaa111aaaa1';
  const OTHER2 = 'bbbb222bbbb222bbbb222bbbb222bbbb222bbbb2';
  const trailComment = {
    body: `### 🔗 Commits\n\n<!-- aitm-commits: ${OTHER1},${HEAD},${OTHER2} -->\n`,
  };
  const result = await gateCommitTrailContainsHead({
    cfg,
    issueNumber: 1,
    projectDir: '/tmp',
    deps: {
      listComments: async () => [trailComment],
      getHeadSha: async () => HEAD,
    },
  });
  assert.equal(result.ok, true);
}

// --- 5. Empty trail marker → develop-to-test-empty-trail ---
{
  const trailComment = { body: `### 🔗 Commits\n\n<!-- aitm-commits:  -->\n` };
  const result = await gateCommitTrailContainsHead({
    cfg,
    issueNumber: 1,
    projectDir: '/tmp',
    deps: {
      listComments: async () => [trailComment],
      getHeadSha: async () => HEAD,
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.blocker, /develop-to-test-empty-trail/);
}

// #834 — the shared-trunk resume cases run as named node:test declarations so
// they are individually reported (and detected by the New Automated Tests gate).
test('shared-trunk resume: HEAD is a sibling commit, all own commits recorded → pass', async () => {
  const OWN = 'cccc333cccc333cccc333cccc333cccc333cccc3';
  // HEAD advanced to a sibling's commit; not in the trail.
  const trailComment = {
    body: `### 🔗 Commits\n\n<!-- aitm-commits: ${OWN} -->\n\n| SHA | Subject | Author | When |\n|---|---|---|---|\n| \`${OWN.slice(0, 6)}\` | s | a | t |`,
  };
  const result = await gateCommitTrailContainsHead({
    cfg,
    issueNumber: 1,
    projectDir: '/tmp',
    deps: {
      listComments: async () => [trailComment],
      getHeadSha: async () => HEAD,
      // This issue's only attributed commit is OWN, which IS recorded in the
      // trail. HEAD itself carries no [#1] token (it's a sibling's commit).
      attributingCommits: async () => [{ sha: OWN, subject: '[#1] shipped work' }],
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.headSha, HEAD);
});

test('shared-trunk resume: an own [#N] commit is unrecorded → stale-trail block', async () => {
  const OWN_RECORDED = 'dddd444dddd444dddd444dddd444dddd444dddd4';
  const OWN_MISSING = 'eeee555eeee555eeee555eeee555eeee555eeee5';
  const trailComment = {
    body: `### 🔗 Commits\n\n<!-- aitm-commits: ${OWN_RECORDED} -->\n`,
  };
  const result = await gateCommitTrailContainsHead({
    cfg,
    issueNumber: 1,
    projectDir: '/tmp',
    deps: {
      listComments: async () => [trailComment],
      getHeadSha: async () => HEAD,
      attributingCommits: async () => [
        { sha: OWN_RECORDED, subject: '[#1] shipped work' },
        { sha: OWN_MISSING, subject: '[#1] forgot to commit-trace this one' },
      ],
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.blocker, /develop-to-test-stale-trail/);
  assert.match(result.blocker, new RegExp(OWN_MISSING.slice(0, 6)));
});

console.log('commit-trail-head-gate: PASS');
