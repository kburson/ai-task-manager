#!/usr/bin/env node
// AC guard (#234): the `buildRow` 60s freshness window must stay
// un-bypassable. The fix reconciles aged discovery buckets as a fresh-stamped
// idle row rather than poking a hole in the guard, so no escape token may
// exist in the source. A negative `grep` (exit 1 on the PASS condition) can't
// run in the sandboxed Verification Commands runner; this positive assertion
// exits 0 when the guard is intact and fails loudly if a bypass is introduced.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', 'gh-timing-comment.mjs'), 'utf8');

for (const token of ['skipFreshnessCheck', 'historical']) {
  assert.ok(
    !src.includes(token),
    `gh-timing-comment.mjs must not contain "${token}" — the freshness guard must stay un-bypassable (#234)`
  );
}

console.log('guard-unbypassable.test.mjs: all passed');
