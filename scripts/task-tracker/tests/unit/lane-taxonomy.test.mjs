// @story #873
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LANES, laneOf, laneManifest } from '../../lib/test-lanes.mjs';
import { discoverTestFiles } from '../../lib/discover-test-files.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
// tests/unit → repo root is four up (unit → tests → task-tracker → scripts → root).
const PROJECT_ROOT = path.resolve(__dir, '../../../..');

const opts = { projectRoot: PROJECT_ROOT };

test('LANES is the frozen unit/integration/slow tuple', () => {
  assert.deepEqual([...LANES], ['unit', 'integration', 'slow']);
  assert.ok(Object.isFrozen(LANES));
});

test('laneOf assigns every discovered file exactly one known lane', () => {
  const files = discoverTestFiles(opts);
  assert.ok(files.length > 0, 'discovery returned files to classify');
  for (const f of files) {
    const lane = laneOf(f);
    assert.ok(LANES.includes(lane), `${f} → ${lane} is a known lane`);
  }
});

test('laneOf is total — never undefined, even for odd paths', () => {
  for (const p of ['', 'a', 'x/y/z.test.mjs', 'scripts/foo/bar.test.mjs', 'tests/slow']) {
    assert.ok(LANES.includes(laneOf(p)), `total for ${JSON.stringify(p)}`);
  }
});

test('laneManifest is a true partition of the discovered set', () => {
  const files = discoverTestFiles(opts);
  const manifest = laneManifest(opts);

  // exactly the three lanes, each an array
  assert.deepEqual(Object.keys(manifest).sort(), [...LANES].sort());

  // union equals the discovered set
  const union = [...manifest.unit, ...manifest.integration, ...manifest.slow].sort();
  assert.deepEqual(union, [...files].sort(), 'union of lanes equals discovery');

  // pairwise disjoint
  const seen = new Set();
  for (const lane of LANES) {
    for (const f of manifest[lane]) {
      assert.ok(!seen.has(f), `${f} appears in only one lane`);
      seen.add(f);
    }
  }

  // every member of a lane actually classifies to that lane
  for (const lane of LANES) {
    for (const f of manifest[lane]) {
      assert.equal(laneOf(f), lane, `${f} is in the ${lane} bucket by rule`);
    }
  }
});

test('representative paths classify per the written contract', () => {
  assert.equal(laneOf('scripts/task-tracker/tests/slow/x.test.mjs'), 'slow');
  assert.equal(laneOf('scripts/task-tracker/tests/integration/y.test.mjs'), 'integration');
  assert.equal(laneOf('scripts/task-tracker/tests/unit/z.test.mjs'), 'unit');
  // a co-located test next to its source is a unit test by construction
  assert.equal(laneOf('scripts/task-tracker/lib/foo.test.mjs'), 'unit');
  // provider tests live under tests/ but not slow/integration → unit
  assert.equal(laneOf('scripts/providers/tests/p.test.mjs'), 'unit');
  // whole-segment match: a file merely NAMED slow is a unit test
  assert.equal(laneOf('scripts/task-tracker/lib/slow.test.mjs'), 'unit');
});

test('the committed contract doc exists and names all three lanes', () => {
  const doc = path.join(PROJECT_ROOT, 'docs/guides/test-lane-taxonomy.md');
  assert.ok(existsSync(doc), 'docs/guides/test-lane-taxonomy.md is committed');
  const text = readFileSync(doc, 'utf8');
  for (const lane of LANES) {
    assert.ok(new RegExp(`\\b${lane}\\b`).test(text), `contract doc names the ${lane} lane`);
  }
});
