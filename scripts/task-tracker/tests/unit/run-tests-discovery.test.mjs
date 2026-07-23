// @story #874
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUN_LANES, SKIP, laneFiles, discoveryDivergence } from '../../../run-tests-lanes.mjs';
import { discoverTestFiles, divergence } from '../../lib/discover-test-files.mjs';
import { laneManifest } from '../../lib/test-lanes.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
// tests/unit → repo root is four up (unit → tests → task-tracker → scripts → root).
const PROJECT_ROOT = path.resolve(__dir, '../../../..');
const opts = { projectRoot: PROJECT_ROOT };

// The four flat directories the legacy runner read — the source of the false
// green. Reconstructed here to prove the migrated runner is a strict superset.
const LEGACY_DIRS = [
  'scripts/task-tracker/tests/unit',
  'scripts/providers/tests',
  'scripts/task-tracker/tests/integration',
  'scripts/task-tracker/tests/slow',
];

function legacySet() {
  const set = new Set();
  for (const dir of LEGACY_DIRS) {
    let entries = [];
    try {
      entries = readdirSync(path.join(PROJECT_ROOT, dir));
    } catch {
      entries = [];
    }
    for (const f of entries) if (f.endsWith('.test.mjs')) set.add(`${dir}/${f}`);
  }
  return set;
}

// AC1 — the runner builds its list from canonical discovery + lane assignment,
// not from hardcoded readdirSync directories.
test('AC1: laneFiles is a pure view over canonical discovery', () => {
  const all = laneFiles('all', opts);
  assert.deepEqual(all, [...discoverTestFiles(opts)].sort(), 'all-lane == discoverTestFiles()');

  const m = laneManifest(opts);
  assert.deepEqual(
    laneFiles('fast', opts),
    [...m.unit, ...m.integration].sort(),
    'fast = unit ∪ integration'
  );
  assert.deepEqual(laneFiles('slow', opts), [...m.slow].sort(), 'slow = slow');
  // #864 — unit and integration are now first-class sections; `all` stays as the
  // internal union that backs this divergence guard and `test:coverage`.
  assert.deepEqual(laneFiles('unit', opts), [...m.unit].sort(), 'unit = unit');
  assert.deepEqual(
    laneFiles('integration', opts),
    [...m.integration].sort(),
    'integration = integration'
  );

  assert.deepEqual([...RUN_LANES], ['unit', 'integration', 'fast', 'slow', 'all']);
});

// AC2 — the divergence guard fails a run that would omit an on-disk test.
test('AC2: divergence guard bites on an incomplete selection', () => {
  const all = laneFiles('all', opts);
  assert.ok(all.length > 0, 'discovery returned files');

  const dropped = all[0];
  const incomplete = all.slice(1);
  const d = divergence({ discovered: incomplete, ...opts });
  assert.ok(d.missing.includes(dropped), 'a dropped on-disk file surfaces as missing');

  // The runner's own full selection has zero divergence — a green run is honest.
  const own = discoveryDivergence(opts);
  assert.deepEqual(own.missing, [], 'runner omits nothing on disk');
  assert.deepEqual(own.extra, [], 'runner selects nothing off disk');
});

// AC3 — SKIP is keyed by repo-relative path and every entry references an issue.
test('AC3: SKIP contract — repo-relative keys, issue-referenced values', () => {
  assert.ok(SKIP instanceof Map, 'SKIP is a Map');
  for (const [key, value] of SKIP) {
    assert.match(key, /^scripts\/.+\.test\.mjs$/, `SKIP key ${key} is a repo-relative test path`);
    assert.match(String(value), /#\d+/, `SKIP value for ${key} references an issue`);
  }
});

// AC4 — the previously-dead co-located files are now wired into the runner.
test('AC4: co-located tests the legacy runner missed are now selected', () => {
  const legacy = legacySet();
  const all = laneFiles('all', opts);
  const selected = new Set(all);

  // Every legacy file is still selected (no regression).
  for (const f of legacy) assert.ok(selected.has(f), `legacy file still selected: ${f}`);

  // The co-located delta — discovered minus the four legacy dirs — is non-empty
  // and wholly contained in the runner's selection. These are the files that
  // ran nowhere before this migration.
  const coLocated = all.filter((f) => !legacy.has(f));
  assert.ok(coLocated.length > 0, 'there exist co-located tests the legacy runner omitted');
  for (const f of coLocated) assert.ok(selected.has(f), `co-located file now selected: ${f}`);

  assert.ok(all.length > legacy.size, 'runner selection is a strict superset of the legacy set');
});
