#!/usr/bin/env node
// @story #732
// #732 — the commit trail is an informational point-in-time ledger, NOT a
// reachability contract. These are the demonstrable proofs bound to #732's ACs.
//
// The load-bearing inversion: where the trail used to DROP a SHA that was no
// longer reachable from HEAD (deadlocking gates after rebase/squash/amend), it
// now TOLERATES it. Gate assertion has moved to message-based attribution
// (#731 `hasAttributingCommit` / #733 gate migration). The trail records the
// SHA observed at commit time, plus a caveat that it may change during history
// maintenance and a `git log --all --grep` lookup that survives the churn.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildInitialTrail,
  buildRow,
  appendCommitRow,
  updateMarker,
  parseMarker,
  buildLedgerCaveat,
  ensureLedgerCaveat,
  reconcileLedger,
  pruneUnreachable,
  LEDGER_CAVEAT_MARKER,
} from '../../../lib/commit-trail.mjs';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function makeTrail(shas, { issueNumber } = {}) {
  let body = buildInitialTrail({ issueNumber });
  for (const sha of shas) {
    const row = buildRow({
      sha,
      subject: `s-${sha.slice(0, 7)}`,
      author: 'a',
      ts: 't',
      commitUrl: `https://github.com/o/r/commit/${sha}`,
    });
    body = appendCommitRow(body, row);
    body = updateMarker(body, sha);
  }
  return body;
}

// AC2 — each trail carries the observed-SHA caveat + a `git log --all --grep`
// lookup keyed to the issue's [#N] attribution token.
test('buildLedgerCaveat — caveat text + [#N] grep lookup + hidden marker', () => {
  const caveat = buildLedgerCaveat(732);
  assert.match(caveat, /Informational ledger/i);
  assert.match(caveat, /may change during history maintenance/i);
  assert.match(caveat, /git log --all --grep='\[#732\]'/);
  assert.ok(caveat.includes(LEDGER_CAVEAT_MARKER), 'carries the hidden idempotency marker');
});

test('buildLedgerCaveat — accepts 732, "732" and "#732"', () => {
  for (const form of [732, '732', '#732']) {
    assert.match(buildLedgerCaveat(form), /git log --all --grep='\[#732\]'/);
  }
});

// AC2 — a freshly built trail embeds the caveat; each recorded SHA is present.
test('buildInitialTrail — embeds the caveat when given an issue number', () => {
  const trail = buildInitialTrail({ issueNumber: 732 });
  assert.match(trail, /### 🔗 Commits/);
  assert.ok(trail.includes(LEDGER_CAVEAT_MARKER));
  assert.match(trail, /git log --all --grep='\[#732\]'/);
});

test('buildInitialTrail — no issue number → no caveat (back-compat)', () => {
  const trail = buildInitialTrail();
  assert.ok(!trail.includes(LEDGER_CAVEAT_MARKER));
});

// AC1 + AC4 — reconcileLedger never drops SHAs, even ones reported unreachable,
// and the caveat is present so the ledger self-documents.
test('reconcileLedger — an UNREACHABLE SHA survives in the ledger with its caveat', async () => {
  const body = makeTrail([SHA_A, SHA_B], { issueNumber: 732 });
  // Every SHA reports NOT reachable from HEAD (orphaned by a rebase/reset).
  const out = await reconcileLedger(body, { issueNumber: 732, isReachable: async () => false });
  const parsed = parseMarker(out);
  assert.deepEqual(Array.from(parsed.shas), [SHA_A, SHA_B], 'both SHAs survive');
  assert.ok(out.includes(SHA_A) && out.includes(SHA_B), 'both rows survive');
  assert.ok(out.includes(LEDGER_CAVEAT_MARKER), 'caveat present in the ledger');
});

// AC1 — a SHA rewritten to a brand-new value is tolerated: the old row stays
// (informational point-in-time record) and nothing deadlocks.
test('reconcileLedger — tolerates a rewritten/missing SHA (no drop)', async () => {
  const body = makeTrail([SHA_A], { issueNumber: 732 });
  const out = await reconcileLedger(body, { issueNumber: 732, isReachable: async () => false });
  assert.ok(out.includes(SHA_A), 'the original SHA is retained, not pruned');
});

// AC1 — the deprecated prune alias no longer drops: passing an existsSha that
// rejects every SHA must keep them all (proves the inversion at the old seam).
test('pruneUnreachable (deprecated alias) — no longer drops any SHA', async () => {
  const body = makeTrail([SHA_A, SHA_B], { issueNumber: 732 });
  const out = await pruneUnreachable(body, { issueNumber: 732, existsSha: () => false });
  const parsed = parseMarker(out);
  assert.deepEqual(Array.from(parsed.shas), [SHA_A, SHA_B], 'alias tolerates all SHAs');
});

// AC2/AC3 — ensureLedgerCaveat back-fills the caveat onto a legacy trail that
// predates the ledger reframing, idempotently.
test('ensureLedgerCaveat — injects the caveat onto a legacy trail, idempotently', () => {
  const legacy =
    '### 🔗 Commits\n\n<!-- aitm-commits: ' +
    SHA_A +
    ' -->\n\n| SHA | Subject | Author | When |\n|---|---|---|---|\n| `aaaaaa` | s | a | t |\n';
  const once = ensureLedgerCaveat(legacy, 732);
  assert.ok(once.includes(LEDGER_CAVEAT_MARKER), 'caveat injected');
  assert.match(once, /git log --all --grep='\[#732\]'/);
  // Idempotent: a second pass is a no-op.
  const twice = ensureLedgerCaveat(once, 732);
  assert.equal(twice, once, 'second injection is a no-op');
  // The marker still parses and the SHA is untouched.
  assert.deepEqual(Array.from(parseMarker(twice).shas), [SHA_A]);
});

test('ensureLedgerCaveat — no issue number → returns body unchanged', () => {
  const body = makeTrail([SHA_A]);
  assert.equal(ensureLedgerCaveat(body, null), body);
});

// AC3 — the reconcile doc comment must frame the trail as an informational
// ledger that TOLERATES unreachable SHAs, and must NOT claim to drop them.
test('reconcileLedger doc comment describes informational tolerance, not dropping', () => {
  const libPath = new URL('../../../lib/commit-trail.mjs', import.meta.url);
  const src = readFileSync(libPath, 'utf8');
  const idx = src.indexOf('export async function reconcileLedger');
  assert.notEqual(idx, -1, 'reconcileLedger not found in commit-trail.mjs');
  const comment = src.slice(0, idx);
  const start = comment.lastIndexOf('\n// ', idx);
  const doc = comment.slice(comment.lastIndexOf('// Ledger reconciliation'));
  assert.match(doc, /informational/i, 'doc frames the trail as informational');
  assert.match(doc, /tolerate/i, 'doc states unreachable SHAs are tolerated');
  assert.ok(start !== -1);
});
