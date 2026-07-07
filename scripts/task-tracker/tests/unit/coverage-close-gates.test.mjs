#!/usr/bin/env node
// @story #590
// Coverage-lift for lib/close-gates.mjs → ≥80% via injectable deps.* seams;
// targets commitsOnTrunkGate plus error branches. No production code touched.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

import {
  shaFreshGate,
  chainIntegrityGate,
  issueDirtyGate,
  commitsOnTrunkGate,
  runCloseGates,
} from '../../lib/close-gates.mjs';

const pexec = promisify(execFile);
const cfg = { repo: 'o/r' };

async function headSha() {
  const { stdout } = await pexec('git', ['rev-parse', 'HEAD']);
  return stdout.trim();
}

const FULL_CHAIN_BODY = [
  '## Scope',
  'x',
  '<!-- aitm-entered-refine: 2026-05-17T00:00:00Z -->',
  '<!-- aitm-entered-plan: 2026-05-17T00:01:00Z -->',
  '<!-- aitm-entered-develop: 2026-05-17T00:02:00Z -->',
  '<!-- aitm-entered-test: 2026-05-17T00:03:00Z -->',
  '<!-- aitm-entered-review: 2026-05-17T00:04:00Z -->',
].join('\n');

const bodyWithMarker = (sha) =>
  [FULL_CHAIN_BODY, `<!-- aitm-dod-verified: ${sha}:2026-05-17T00:05:00Z -->`].join('\n');

const commitTrail = (shas) => [
  { body: `### 🔗 Commits\n\n<!-- aitm-commits: ${shas.join(',')} -->\n` },
];
test('shaFreshGate: marker absent / HEAD unresolved → no-marker & no-head blockers', async () => {
  const noMarker = await shaFreshGate('no markers here', 'abc1234deadbeef');
  assert.equal(noMarker.ok, false);
  assert.match(noMarker.blocker, /close-sha-fresh-no-marker/);
  const noHead = await shaFreshGate(bodyWithMarker('abc1234'), '');
  assert.equal(noHead.ok, false);
  assert.match(noHead.blocker, /close-sha-fresh-no-head/);
  // Stale marker, no commitsSince dep → default (no-extras) stale path.
  const stale = await shaFreshGate(bodyWithMarker('aaa1111'), 'bbb2222deadbeef');
  assert.match(stale.blocker, /close-sha-stale/);
});

test('shaFreshGate: stale marker, commitsSince throws → best-effort blocker without extras', async () => {
  const r = await shaFreshGate(bodyWithMarker('aaa1111'), 'bbb2222deadbeef', {
    commitsSince: async () => {
      throw new Error('git boom');
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-sha-stale/);
  assert.ok(!/New commits/.test(r.blocker), 'the failed lookup contributes no extras');
});

test('shaFreshGate: stale marker, >8 new commits → list truncates with +overflow', async () => {
  const many = Array.from({ length: 11 }, (_, i) => `sha${i}`);
  const r = await shaFreshGate(bodyWithMarker('aaa1111'), 'bbb2222deadbeef', {
    commitsSince: async () => many,
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /New commits:/);
  assert.match(r.blocker, /\+3/, 'the 11-8 overflow count is surfaced');
});

test('chainIntegrityGate: legacy grammar full chain → passes', () => {
  assert.deepEqual(chainIntegrityGate(FULL_CHAIN_BODY), { ok: true });
});

test('issueDirtyGate: missing cfg / issueNumber throw', async () => {
  await assert.rejects(() => issueDirtyGate({ issueNumber: 1 }), /cfg is required/);
  await assert.rejects(() => issueDirtyGate({ cfg }), /issueNumber is required/);
});

test('issueDirtyGate: listComments throws → close-dirty-comments-fetch-failed', async () => {
  const r = await issueDirtyGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => {
        throw new Error('gh down');
      },
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-dirty-comments-fetch-failed/);
});

test('issueDirtyGate: filesForSha throws for one sha → best-effort skip, still clean', async () => {
  const r = await issueDirtyGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => commitTrail(['abc1234', 'def5678']),
      filesForSha: async (sha) => {
        if (sha === 'abc1234') throw new Error('missing object');
        return ['src/b.mjs'];
      },
      dirtyFiles: async () => new Set(['README.md']),
    },
  });
  assert.equal(r.ok, true);
});

test('issueDirtyGate: dirtyFiles throws → close-dirty-git-status-failed', async () => {
  const r = await issueDirtyGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => commitTrail(['abc1234']),
      filesForSha: async () => ['src/a.mjs'],
      dirtyFiles: async () => {
        throw new Error('status boom');
      },
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-dirty-git-status-failed/);
});

test('commitsOnTrunkGate: missing cfg / issueNumber throw', async () => {
  await assert.rejects(() => commitsOnTrunkGate({ issueNumber: 1 }), /cfg is required/);
  await assert.rejects(() => commitsOnTrunkGate({ cfg }), /issueNumber is required/);
});

test('commitsOnTrunkGate: no trail / empty marker → graceful skips', async () => {
  const noTrail = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: { listComments: async () => [] },
  });
  assert.equal(noTrail.ok, true);
  assert.equal(noTrail.skipped, 'no-commits-marker');
  const empty = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: { listComments: async () => [{ body: '### 🔗 Commits\n\n<!-- aitm-commits:  -->\n' }] },
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.skipped, 'empty-commits-marker');
});

test('commitsOnTrunkGate: listComments throws → close-trunk-comments-fetch-failed', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => {
        throw new Error('gh down');
      },
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-trunk-comments-fetch-failed/);
});

test('commitsOnTrunkGate: trunk ref unresolved → close-trunk-ref-unresolved', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: { listComments: async () => commitTrail(['abc1234']), resolveTrunkRef: async () => null },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-trunk-ref-unresolved/);
});

test('commitsOnTrunkGate: all SHAs on trunk → passes with trunkRef', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => commitTrail(['abc1234', 'def5678']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async () => 'on-trunk',
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.trunkRef, 'trunk');
});

test('commitsOnTrunkGate: stranded SHA → close-commits-not-on-trunk names it', async () => {
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => commitTrail(['aaaaaaa1', 'bbbbbbb2']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async (sha) => (sha === 'aaaaaaa1' ? 'on-trunk' : 'stranded'),
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.blocker, /close-commits-not-on-trunk/);
  assert.equal(r.stranded.length, 1);
  assert.match(r.blocker, /bbbbbbb/);
});

test('commitsOnTrunkGate: >5 stranded → display truncates; isAncestor throw → stranded', async () => {
  const shas = Array.from({ length: 7 }, (_, i) => `bbbbbb${i}`);
  const many = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => commitTrail(shas),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async () => 'stranded',
    },
  });
  assert.equal(many.ok, false);
  assert.match(many.blocker, /\+2/, 'the 7-5 overflow count is surfaced');
  assert.equal(many.stranded.length, 7);

  const throwing = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    deps: {
      listComments: async () => commitTrail(['abc1234']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async () => {
        throw new Error('rev-parse boom');
      },
    },
  });
  assert.equal(throwing.ok, false);
  assert.match(throwing.blocker, /close-commits-not-on-trunk/);
});

test('runCloseGates: getHeadSha throws → close-head-resolve-failed in blockers', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: bodyWithMarker('abc1234'),
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => {
        throw new Error('no HEAD');
      },
      listComments: async () => [],
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /close-head-resolve-failed/.test(b)));
});

test('runCloseGates: chain hole → chainIntegrityGate blockers propagate', async () => {
  const holedBody = bodyWithMarker('abc1234').replace(/<!-- aitm-entered-test:[^>]*-->\n?/, '');
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: holedBody,
    projectDir: '/tmp/x',
    deps: { getHeadSha: async () => 'abc1234deadbeef', listComments: async () => [] },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /close-chain-hole-at-test/.test(b)));
});

test('runCloseGates: stranded trunk commit blocks close', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: bodyWithMarker('abc1234'),
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => 'abc1234deadbeef',
      listComments: async () => commitTrail(['abc1234']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async () => 'stranded',
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /close-commits-not-on-trunk/.test(b)));
  assert.equal(r.trunkCheckSkipped, null);
});

test('runCloseGates: commitsOnTrunkGate throws → close-trunk-gate-error caught', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: bodyWithMarker('abc1234'),
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => 'abc1234deadbeef',
      listComments: async () => commitTrail(['abc1234']),
      resolveTrunkRef: async () => {
        throw new Error('trunk resolve boom'); // un-wrapped await → escapes gate
      },
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /close-trunk-gate-error/.test(b)));
});

test('runCloseGates: issueDirtyGate throws → close-dirty-gate-error caught', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: bodyWithMarker('abc1234'),
    projectDir: '/tmp/x',
    deps: {
      getHeadSha: async () => 'abc1234deadbeef',
      listComments: async () => commitTrail(['abc1234']),
      resolveTrunkRef: async () => 'trunk',
      isAncestor: async () => 'on-trunk',
      filesForSha: async () => ['src/a.mjs'],
      dirtyFiles: async () => null, // non-Set → dirty.has(f) throws out of gate
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => /close-dirty-gate-error/.test(b)));
});

test('runCloseGates: dirty touched file blocks close; clean deps → ok', async () => {
  const base = {
    getHeadSha: async () => 'abc1234deadbeef',
    listComments: async () => commitTrail(['abc1234']),
    resolveTrunkRef: async () => 'trunk',
    isAncestor: async () => 'on-trunk',
    filesForSha: async () => ['src/a.mjs'],
  };
  const dirty = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: bodyWithMarker('abc1234'),
    projectDir: '/tmp/x',
    deps: { ...base, dirtyFiles: async () => new Set(['src/a.mjs']) },
  });
  assert.equal(dirty.ok, false);
  assert.ok(dirty.blockers.some((b) => /close-dirty-touched/.test(b)));

  const clean = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: bodyWithMarker('abc1234'),
    projectDir: '/tmp/x',
    deps: { ...base, dirtyFiles: async () => new Set(['README.md']) },
  });
  assert.equal(clean.ok, true, JSON.stringify(clean.blockers));
  assert.equal(clean.trunkRef, 'trunk');
});

// Default git-backed I/O helpers, driven against the real repo: only
// `listComments` is injected; the other deps fall through to real git defaults.
test('commitsOnTrunkGate: cfg.trunkRef short-circuits defaultResolveTrunkRef', async () => {
  const sha = await headSha();
  const r = await commitsOnTrunkGate({
    cfg: { ...cfg, trunkRef: 'trunk' },
    issueNumber: 1,
    projectDir: process.cwd(),
    deps: { listComments: async () => commitTrail([sha]) },
  });
  assert.ok(r.ok === true || /close-commits-not-on-trunk/.test(r.blocker || ''), JSON.stringify(r)); // #729
  assert.equal(r.trunkRef, 'trunk');
});

test('commitsOnTrunkGate: default trunk-ref fallback + default isAncestor (real git)', async () => {
  const sha = await headSha();
  const r = await commitsOnTrunkGate({
    cfg,
    issueNumber: 1,
    projectDir: process.cwd(),
    deps: { listComments: async () => commitTrail([sha]) },
  });
  assert.ok(r.ok === true || /close-commits-not-on-trunk/.test(r.blocker || ''), JSON.stringify(r)); // #729
  assert.equal(r.trunkRef, 'trunk');
});

test('issueDirtyGate: default filesForSha + dirtyFiles (real git) on HEAD', async () => {
  const sha = await headSha();
  const r = await issueDirtyGate({
    cfg,
    issueNumber: 1,
    projectDir: process.cwd(),
    deps: { listComments: async () => commitTrail([sha]) },
  });
  // Either outcome means both default git helpers (show + status) ran.
  assert.ok(r.ok === true || /close-dirty-touched/.test(r.blocker || ''));
});

test('runCloseGates: default getHeadSha (real git) resolves HEAD', async () => {
  const r = await runCloseGates({
    cfg,
    issueNumber: 1,
    body: bodyWithMarker('abc1234'),
    projectDir: process.cwd(),
    deps: { listComments: async () => [] },
  });
  assert.equal(typeof r.headSha, 'string');
  assert.ok(r.headSha.length >= 7);
});
