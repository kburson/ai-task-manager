#!/usr/bin/env node
// Unit tests for commitsOnTrunkGate (#B / #165).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { commitsOnTrunkGate, runCloseGates } from '../lib/close-gates.mjs';

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

test('commitsOnTrunkGate: all SHAs on trunk → ok', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['abc1234', 'def5678']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async () => 'on-trunk',
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.trunkRef, 'trunk');
});

test('commitsOnTrunkGate: one stranded SHA → refuse listing it', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['abc1234', 'def5678', 'aaa1111']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async (sha) => (sha === 'def5678' ? 'stranded' : 'on-trunk'),
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-commits-not-on-trunk/);
  assert.match(r.blocker, /1 SHA\(s\)/);
  assert.match(r.blocker, /def5678/);
  assert.match(r.blocker, /trunk/);
  assert.deepEqual(r.stranded, ['def5678']);
});

test('commitsOnTrunkGate: unknown SHA treated as not-on-trunk', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['deadbee']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async () => 'unknown-sha',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /deadbee/);
});

test('commitsOnTrunkGate: no trail comment → graceful skip', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => [],
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async () => 'on-trunk',
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
      isAncestor: async () => 'on-trunk',
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
      isAncestor: async () => 'on-trunk',
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-trunk-ref-unresolved/);
  assert.match(r.blocker, /trunkRef/);
});

test('commitsOnTrunkGate: cfg.trunkRef takes precedence over fallback probing', async () => {
  let resolved = null;
  const r = await commitsOnTrunkGate({
    cfg: { ...cfg, trunkRef: 'develop' },
    issueNumber: 1,
    deps: {
      listComments: async () => trail(['abc1234']),
      resolveTrunkRef: async ({ cfg: c }) => {
        resolved = c.trunkRef;
        return c.trunkRef;
      },
      isAncestor: async (_sha, ref) => (ref === 'develop' ? 'on-trunk' : 'stranded'),
    },
  });
  assert.equal(r.ok, true);
  assert.equal(resolved, 'develop');
});

test('runCloseGates: stranded SHA composes into blockers alongside existing gates', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: FULL_CHAIN_BODY,
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => 'abc1234deadbeef',
      listComments: async () => trail(['abc1234', 'aaa1111']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async (sha) => (sha === 'aaa1111' ? 'stranded' : 'on-trunk'),
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /close-commits-not-on-trunk/.test(b)));
  assert.equal(r.trunkRef, 'trunk');
});

test('runCloseGates: all SHAs on trunk → trunk gate passes, full gate passes', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: FULL_CHAIN_BODY,
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => 'abc1234deadbeef',
      listComments: async () => trail(['abc1234']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async () => 'on-trunk',
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, true, JSON.stringify(r.blockers));
  assert.equal(r.trunkRef, 'trunk');
});
