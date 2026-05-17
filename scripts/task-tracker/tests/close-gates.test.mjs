#!/usr/bin/env node
// Unit tests for lib/close-gates.mjs (#138).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  markerPresentGate,
  shaFreshGate,
  chainIntegrityGate,
  issueDirtyGate,
  runCloseGates,
} from '../lib/close-gates.mjs';

const cfg = { repo: 'o/r' };
const FULL_CHAIN_BODY = [
  '## Scope',
  'x',
  '<!-- aitm-entered-refine: 2026-05-17T00:00:00Z -->',
  '<!-- aitm-entered-plan: 2026-05-17T00:01:00Z -->',
  '<!-- aitm-entered-develop: 2026-05-17T00:02:00Z -->',
  '<!-- aitm-entered-test: 2026-05-17T00:03:00Z -->',
  '<!-- aitm-entered-review: 2026-05-17T00:04:00Z -->',
].join('\n');

function bodyWithMarker(sha) {
  return [FULL_CHAIN_BODY, `<!-- aitm-dod-verified: ${sha}:2026-05-17T00:05:00Z -->`].join('\n');
}

test('markerPresentGate: absent → refuses', () => {
  const r = markerPresentGate('no markers');
  assert.equal(r.ok, false);
  assert.match(r.blocker, /aitm-dod-verified/);
  assert.match(r.blocker, /\/task test/);
});

test('markerPresentGate: present → passes', () => {
  assert.deepEqual(markerPresentGate(bodyWithMarker('abc1234')), { ok: true });
});

test('shaFreshGate: matching prefix → passes', async () => {
  const r = await shaFreshGate(bodyWithMarker('abc1234'), 'abc1234deadbeef');
  assert.equal(r.ok, true);
});

test('shaFreshGate: marker stale → refuses with new-commit list', async () => {
  const r = await shaFreshGate(bodyWithMarker('aaa1111'), 'bbb2222deadbeef', {
    commitsSince: async () => ['bbb2222', 'ccc3333'],
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-sha-stale/);
  assert.match(r.blocker, /bbb2222/);
});

test('chainIntegrityGate: full chain → passes', () => {
  const r = chainIntegrityGate(FULL_CHAIN_BODY);
  assert.equal(r.ok, true);
});

test('chainIntegrityGate: missing test entry → chain-hole-at-test', () => {
  const body = FULL_CHAIN_BODY.replace(/<!-- aitm-entered-test:[^>]*-->\n?/, '');
  const r = chainIntegrityGate(body);
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /chain-hole-at-test/.test(b)));
});

test('chainIntegrityGate: out-of-order timestamps → refuses', () => {
  const body = [
    '<!-- aitm-entered-refine: 2026-05-17T05:00:00Z -->',
    '<!-- aitm-entered-plan: 2026-05-17T01:00:00Z -->',
    '<!-- aitm-entered-develop: 2026-05-17T02:00:00Z -->',
    '<!-- aitm-entered-test: 2026-05-17T03:00:00Z -->',
    '<!-- aitm-entered-review: 2026-05-17T04:00:00Z -->',
  ].join('\n');
  const r = chainIntegrityGate(body);
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /out-of-order/.test(b)));
});

test('issueDirtyGate: no trail comment → graceful skip', async () => {
  const r = await issueDirtyGate({
    cfg,
    issueNumber: 1,
    deps: { listComments: async () => [] },
  });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 'no-commits-marker');
});

test('issueDirtyGate: trail with empty marker → graceful skip', async () => {
  const r = await issueDirtyGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n\n<!-- aitm-commits:  -->\n' }],
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 'empty-commits-marker');
});

test('issueDirtyGate: touched file dirty → refuse', async () => {
  const r = await issueDirtyGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => [
        { body: '### 🔗 Commits\n\n<!-- aitm-commits: abc1234,def5678 -->\n' },
      ],
      filesForSha: async (sha) => (sha === 'abc1234' ? ['src/a.mjs'] : ['src/b.mjs']),
      dirtyFiles: async () => new Set(['src/a.mjs', 'README.md']),
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-dirty-touched/);
  assert.match(r.blocker, /src\/a\.mjs/);
});

test('issueDirtyGate: dirty file not in touch-set → passes', async () => {
  const r = await issueDirtyGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n\n<!-- aitm-commits: abc1234 -->\n' }],
      filesForSha: async () => ['src/a.mjs'],
      dirtyFiles: async () => new Set(['README.md']),
    },
  });
  assert.equal(r.ok, true);
});

test('runCloseGates: full green → ok', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: bodyWithMarker('abc1234'),
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => 'abc1234deadbeef',
      listComments: async () => [],
    },
  });
  assert.equal(r.ok, true, JSON.stringify(r.blockers));
  assert.equal(r.dirtyCheckSkipped, 'no-commits-marker');
});

test('runCloseGates: marker missing → marker-missing in blockers, sha-fresh skipped', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: FULL_CHAIN_BODY,
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => 'abc1234deadbeef',
      listComments: async () => [],
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /marker-missing/.test(b)));
  assert.equal(r.blockers.filter((b) => /sha-fresh/.test(b)).length, 0);
});
