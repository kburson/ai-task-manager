#!/usr/bin/env node
// @story #438
// #438 AC3 — Body-write round-trip under server normalization.
//
// Two regression shapes from the #437→#439 incident:
//
//   (1) versionedWriteBody must ACCEPT a landed write (no false
//       `overlapping-edit` / max-retries refusal) when the simulated GitHub
//       server normalizes the body — both for an idempotent mutation (marker
//       stamp) and a non-idempotent one (timing-log append). This is the
//       #437 false-verify shape.
//
//   (2) collectStreamUtf8 must reconstruct a multibyte UTF-8 sequence that is
//       split across stream-chunk boundaries — the #439 ROOT CAUSE behind
//       Bug B (the old `out += chunk` accumulator coerced each chunk
//       independently, turning the dangling fragment into U+FFFD).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Readable } from 'node:stream';

import { versionedWriteBody, collectStreamUtf8 } from '../../../lib/versioned-issue-write.mjs';

// A fake gh round-trip whose "server" normalizes by appending a trailing
// newline (the exact class of whitespace divergence the post-push verify must
// tolerate). The body is stored verbatim-plus-newline and returned on fetch.
function makeServer(initialBody = '') {
  let stored = initialBody;
  return {
    stored: () => stored,
    deps: {
      fetchBody: async () => stored,
      // Simulate GitHub appending a trailing newline on store.
      pushBody: async (_repo, _issue, body) => {
        stored = `${body}\n`;
      },
    },
  };
}

test('AC3: idempotent marker stamp lands without false-verify refusal', async () => {
  const server = makeServer('## Body\n\n<!-- aitm-body-version version="3" -->\n');
  const res = await versionedWriteBody({
    issueNumber: 438,
    repo: 'o/r',
    mutate: (base) => `${base.trimEnd()}\n\n<!-- aitm-marker-x ts="2026-06-17T00:00:00Z" -->\n`,
    deps: server.deps,
  });
  assert.equal(
    res.status,
    'ok',
    'landed write must verify ok under trailing-newline normalization'
  );
  assert.equal(res.attempts, 1, 'must succeed on first attempt — no false race-loss retry');
  assert.match(server.stored(), /aitm-marker-x/);
});

test('AC3: non-idempotent timing-log append lands without false-verify refusal', async () => {
  const server = makeServer('## Body\n\n<!-- aitm-body-version version="7" -->\n');
  const res = await versionedWriteBody({
    issueNumber: 438,
    repo: 'o/r',
    // A genuinely new line each call (non-idempotent content).
    mutate: (base) => `${base.trimEnd()}\n| 2026-06-17 | develop | 12m |\n`,
    deps: server.deps,
  });
  assert.equal(res.status, 'ok');
  assert.equal(res.version, 8, 'version must bump 7 → 8');
  assert.match(server.stored(), /\| develop \| 12m \|/);
});

test('AC3: collectStreamUtf8 reconstructs a multibyte codepoint split across chunks (#439)', async () => {
  // U+23F1 ⏱ encodes to UTF-8 bytes E2 8F B1. Split mid-sequence: the old
  // per-chunk decode produced U+FFFD; Buffer.concat + single decode must not.
  const full = Buffer.from('⏱ timer', 'utf8');
  const splitAt = 2; // mid the 3-byte ⏱ sequence
  const stream = Readable.from([full.subarray(0, splitAt), full.subarray(splitAt)]);

  const out = await collectStreamUtf8(stream);
  assert.equal(out, '⏱ timer', 'must reconstruct the multibyte char exactly');
  assert.ok(!out.includes('�'), 'must contain NO U+FFFD replacement chars (the #439 bug)');
});

test('AC3: collectStreamUtf8 resolves empty string for a no-data stream', async () => {
  const out = await collectStreamUtf8(Readable.from([]));
  assert.equal(out, '');
});
