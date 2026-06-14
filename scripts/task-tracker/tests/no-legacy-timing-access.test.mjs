// Guard (#243): no live source outside the duration helper may read board
// timing values as legacy float-hours. The four board "actuals" fields are now
// Text duration strings (`DDd HHh MMm SSs`, integer seconds); consumers parse
// them via `parseDuration` at the boundary. `secondsToFloatHours` is retained in
// lib/duration.mjs solely for its historical unit tests — any *other* source
// reference would mean a consumer still speaks float-hours, which this test
// fails on so the regression can't land silently.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const scriptsRoot = path.resolve(__dir, '..', '..');

// Files allowed to mention the legacy helper: the helper module itself (it
// defines + documents the LEGACY converter) and the test corpus.
const ALLOWED = new Set([path.join(scriptsRoot, 'task-tracker', 'lib', 'duration.mjs')]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (entry.name.endsWith('.mjs')) {
      out.push(full);
    }
  }
  return out;
}

test('no live source reads board timing as legacy float-hours (#243)', () => {
  const offenders = [];
  for (const file of walk(scriptsRoot)) {
    if (ALLOWED.has(file)) continue;
    if (file.includes(`${path.sep}tests${path.sep}`)) continue;
    const src = readFileSync(file, 'utf8');
    if (src.includes('secondsToFloatHours')) {
      offenders.push(path.relative(scriptsRoot, file));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Legacy float-hours timing access found in: ${offenders.join(', ')}`
  );
});
