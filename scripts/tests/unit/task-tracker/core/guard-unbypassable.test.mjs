#!/usr/bin/env node
// @story #234
// AC guard (#234): the `buildRow` 60s freshness window must reject every
// backdated timestamp, with no escape token to defeat it. The fix reconciles
// aged discovery buckets as a fresh-stamped idle row rather than poking a hole
// in the guard, so no such token may exist in the source. A negative `grep`
// (exit 1 on the PASS condition) can't run in the sandboxed Verification
// Commands runner; this positive assertion exits 0 when the guard is intact
// and fails loudly if an escape token is introduced.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const src = readFileSync(path.join(here, '../../../task-tracker/gh-timing-comment.mjs'), 'utf8');

for (const token of ['skipFreshnessCheck', 'historical']) {
  assert.ok(
    !src.includes(token),
    `gh-timing-comment.mjs must not contain "${token}" — the freshness guard must reject all backdated timestamps (#234)`
  );
}

console.log('guard freshness-token check: all passed');
