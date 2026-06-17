#!/usr/bin/env node
// @story #234
// Regression: promoting a discovery bucket older than the 60s buildRow
// freshness window must succeed. The replay loop must NOT re-stamp the
// bucket's original (stale) ts — that trips the freshness guard (which no
// flag defeats) and deadlocks `/task new`. Instead the elapsed bucket time is
// reconciled as a single fresh-stamped idle row. See issue #234.
import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import { mkdtempProjectIsolated } from '../lib/scratch-dir.mjs';
import path from 'node:path';
import { verbNew } from '../verbs/new.mjs';
import { parseDurationSeconds } from '../lib/timing-rows.mjs';

function parseRow(row) {
  // | ts | event | activeMin | idleMin | dWords | wMarker | desc | <!-- ... -->
  const cells = row
    .replace(/<!--.*?-->\s*$/, '')
    .split('|')
    .map((c) => c.trim());
  // cells[0] is '' (leading pipe)
  return {
    ts: cells[1],
    event: cells[2],
    activeMin: cells[3],
    idleMin: cells[4],
    deltaWords: cells[5],
    wordMarker: cells[6],
    description: cells[7],
  };
}

// #442 — verbNew (with TT_FAKE_NEW_ISSUE) registers a fleet entry; git-isolate
// the sandbox so registerTask cannot escape into the live registry.
const dir = mkdtempProjectIsolated('aitm-aged-bucket-');
const statePath = path.join(dir, 'state.json');

// Bucket opened 10 minutes ago — well beyond the 60s freshness window.
const TEN_MIN_MS = 10 * 60 * 1000;
const now = new Date();
const startedAt = new Date(now.getTime() - TEN_MIN_MS).toISOString();
const nowIso = now.toISOString();

writeFileSync(
  statePath,
  JSON.stringify({
    active: 'discover',
    lastActive: null,
    entryStartTs: null,
    wordsAtEntryStart: 0,
    discoverBucket: {
      startedAt,
      wordsAtStart: 1234,
      entries: [{ ts: startedAt, event: 'discover-start', deltaMin: null, deltaWords: null }],
    },
  }),
  'utf8'
);

const rows = [];
process.env.TT_FAKE_NEW_ISSUE = '#999';

const ctx = {
  cfg: {
    repo: 'o/r',
    assignee: '@me',
    defaultLabels: [],
    autoEndOnSwitch: true,
    hookNetworkTimeoutMs: 1000,
  },
  statePath,
  projectDir: dir,
  rest: ['Aged', 'bucket', 'promotion'],
  role: 'dev',
  SKIP_NETWORK: false,
  drainQueueIfAny: async () => {},
  safePostTiming: async (issue, row) => {
    rows.push({ issue, row });
    return { ok: true };
  },
  flushActiveToGH: async () => ({ deltaMin: 0, deltaWords: 0 }),
  nowIso: () => nowIso,
};

// Must NOT throw `retroactive timing entries are forbidden`.
await verbNew(ctx);

const discoveryRows = rows
  .map((r) => parseRow(r.row))
  .filter((r) => /discovery/i.test(r.event) || /discover/i.test(r.description));

assert.equal(discoveryRows.length, 1, 'exactly one reconciliation row expected');
const recon = discoveryRows[0];

// Row stamped with the fresh now, not the stale bucket-open ts. The row is
// rendered in local-tz display format, so compare by parsed instant: it must
// be within the 60s freshness window (the whole point — it passed buildRow).
const rowMs = Date.parse(recon.ts);
assert.ok(Number.isFinite(rowMs), `row ts should parse, got ${recon.ts}`);
assert.ok(
  Math.abs(rowMs - now.getTime()) <= 60_000,
  `row ts should be fresh (within 60s of now), got ${recon.ts}`
);
assert.ok(
  Math.abs(rowMs - Date.parse(startedAt)) > 60_000,
  `row ts must NOT be the stale bucket-open ts, got ${recon.ts}`
);

// Elapsed bucket time recorded as idle, ~10 minutes. The Idle cell now renders
// the seconds-precision `Xh Ym Zs` duration form (#239); parse it back.
const idleSec = parseDurationSeconds(recon.idleMin);
assert.equal(idleSec, 600, `expected idle=600s (0h 10m 00s), got ${recon.idleMin}`);

// No fabricated active work.
assert.equal(
  parseDurationSeconds(recon.activeMin),
  0,
  `expected active=0 (0h 00m 00s), got ${recon.activeMin}`
);

// Description names the original discover window.
assert.ok(
  recon.description.includes(startedAt) || /discover/i.test(recon.description),
  `description should reference the discover window, got "${recon.description}"`
);

console.log('discover-promote-aged-bucket.test.mjs: all passed');
