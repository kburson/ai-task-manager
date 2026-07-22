#!/usr/bin/env node
// @story #165
// Unit tests for commitsOnTrunkGate (#B / #165).
//
// #733 migrated this gate from per-SHA `merge-base --is-ancestor` reachability
// to a TRUNK-SCOPED message-attribution check: it asserts that a `[#N]`-tagged
// commit exists in the trunk ref's history (`attributingCommits(N, {refs:[trunkRef]})`),
// not that the trail's recorded SHAs are ancestors of trunk. The injected
// `attributingCommits` dep returns the attributed commit rows for the requested
// scope.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { commitsOnTrunkGate, runCloseGates } from '../../lib/close-gates.mjs';

const cfg = { repo: 'o/r' };

const FULL_CHAIN_BODY = [
  '## Scope',
  'x',
  '<!-- aitm-entered-refine: 2026-05-17T00:00:00Z -->',
  '<!-- aitm-entered-plan: 2026-05-17T00:01:00Z -->',
  '<!-- aitm-entered-develop: 2026-05-17T00:02:00Z -->',
  '<!-- aitm-entered-test: 2026-05-17T00:03:00Z -->',
  '<!-- aitm-entered-review: 2026-05-17T00:04:00Z -->',
  '<!-- aitm-dod-verified: abc1234:2026-05-17T00:05:00Z -->',
].join('\n');

function trail(shas) {
  return [{ body: `### 🔗 Commits\n\n<!-- aitm-commits: ${shas.join(',')} -->\n` }];
}

// A helper returning attribution rows only when the requested scope includes
// trunkRef — mirrors the trunk-scoped git log the real engine runs.
function attributedOnTrunk(rows) {
  return async (_issue, { refs } = {}) => (refs && refs.includes('trunk') ? rows : []);
}

test('commitsOnTrunkGate: attributed commit exists on trunk → ok', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['abc1234', 'def5678']),
      resolveTrunkRef: async () => 'trunk',
      attributingCommits: attributedOnTrunk([{ sha: 'abc1234', subject: '[#1] feat', ts: 't' }]),
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.trunkRef, 'trunk');
});

test('commitsOnTrunkGate: no attributed commit on trunk → refuse with message-based code', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['abc1234', 'def5678']),
      resolveTrunkRef: async () => 'trunk',
      // Nothing attributed to [#1] on trunk (e.g. never merged).
      attributingCommits: async () => [],
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-no-attributed-commit-on-trunk/);
  assert.match(r.blocker, /\[#1\]/);
  assert.match(r.blocker, /trunk/);
});

test('commitsOnTrunkGate: recorded SHA unreachable but token on trunk → ok (no deadlock)', async () => {
  // The trail's recorded SHA was rewritten by a squash-merge; that SHA is NOT
  // on trunk, but the [#1] token rode along into the merge commit. The old
  // reachability gate would deadlock here; message attribution passes.
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['deadbeef']), // stranded pre-squash SHA
      resolveTrunkRef: async () => 'trunk',
      attributingCommits: attributedOnTrunk([
        { sha: 'f00d999', subject: '[#1] feat: squashed onto trunk', ts: 't' },
      ]),
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.trunkRef, 'trunk');
});

test('commitsOnTrunkGate: no trail comment → graceful skip', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => [],
      resolveTrunkRef: async () => 'trunk',
      attributingCommits: async () => [],
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 'no-commits-marker');
});

test('commitsOnTrunkGate: empty marker → graceful skip', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n\n<!-- aitm-commits:  -->\n' }],
      resolveTrunkRef: async () => 'trunk',
      attributingCommits: async () => [],
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 'empty-commits-marker');
});

test('commitsOnTrunkGate: trunk ref unresolved → refuse with helpful message', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['abc1234']),
      resolveTrunkRef: async () => null,
      attributingCommits: async () => [],
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-trunk-ref-unresolved/);
  assert.match(r.blocker, /trunkRef/);
});

test('commitsOnTrunkGate: attribution lookup failure → surfaced blocker', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['abc1234']),
      resolveTrunkRef: async () => 'trunk',
      attributingCommits: async () => {
        throw new Error('git exploded');
      },
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-trunk-attribution-failed/);
  assert.match(r.blocker, /git exploded/);
});

test('commitsOnTrunkGate: cfg.trunkRef takes precedence, attribution scoped to it', async () => {
  let resolved = null;
  let scopedRefs = null;
  const r = await commitsOnTrunkGate({
    cfg: { ...cfg, trunkRef: 'develop' },
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['abc1234']),
      resolveTrunkRef: async ({ cfg: c }) => {
        resolved = c.trunkRef;
        return c.trunkRef;
      },
      attributingCommits: async (_issue, { refs } = {}) => {
        scopedRefs = refs;
        return refs && refs.includes('develop')
          ? [{ sha: 'abc1234', subject: '[#1] feat', ts: 't' }]
          : [];
      },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(resolved, 'develop');
  assert.deepEqual(scopedRefs, ['develop']);
});

test('commitsOnTrunkGate (#927): fetches before it resolves, then attributes against origin/trunk', async () => {
  // The [#1] commit is present on origin/trunk but absent from a stale local
  // `trunk`. The gate must fetch first, resolve to the remote-tracking ref, and
  // attribute against it — closing without ever reading local `trunk`.
  const order = [];
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    projectDir: '/tmp/x',
    deps: {
      listComments: async () => trail(['abc1234']),
      fetchTrunk: async () => {
        order.push('fetch');
        return { fetched: true, remote: 'origin', branch: 'trunk' };
      },
      resolveTrunkRef: async () => {
        order.push('resolve');
        return 'origin/trunk';
      },
      attributingCommits: async (_issue, { refs } = {}) =>
        refs && refs.includes('origin/trunk')
          ? [{ sha: 'abc1234', subject: '[#1] feat', ts: 't' }]
          : [], // nothing attributed to stale local `trunk`
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.trunkRef, 'origin/trunk');
  assert.deepEqual(order, ['fetch', 'resolve'], 'fetch must run before resolve');
});

test('commitsOnTrunkGate (#927): a fetch failure is non-fatal — still resolves and closes', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    projectDir: '/tmp/x',
    deps: {
      listComments: async () => trail(['abc1234']),
      fetchTrunk: async () => ({ fetched: false, remote: 'origin' }), // offline
      resolveTrunkRef: async () => 'origin/trunk',
      attributingCommits: async (_issue, { refs } = {}) =>
        refs && refs.includes('origin/trunk')
          ? [{ sha: 'abc1234', subject: '[#1] feat', ts: 't' }]
          : [],
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.trunkRef, 'origin/trunk');
});

test('runCloseGates: no attributed commit on trunk composes into blockers', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: FULL_CHAIN_BODY,
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => 'abc1234f00d123f',
      listComments: async () => trail(['abc1234', 'aaa1111']),
      resolveTrunkRef: async () => 'trunk',
      attributingCommits: async () => [], // nothing on trunk
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /close-no-attributed-commit-on-trunk/.test(b)));
  assert.equal(r.trunkRef, 'trunk');
});

test('runCloseGates: attributed commit on trunk → trunk gate passes, full gate passes', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: FULL_CHAIN_BODY,
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => 'abc1234f00d123f',
      listComments: async () => trail(['abc1234']),
      resolveTrunkRef: async () => 'trunk',
      attributingCommits: attributedOnTrunk([{ sha: 'abc1234', subject: '[#1] feat', ts: 't' }]),
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, true, JSON.stringify(r.blockers));
  assert.equal(r.trunkRef, 'trunk');
});
