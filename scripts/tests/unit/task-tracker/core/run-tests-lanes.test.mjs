// @story #864
// #864 — `unit` and `integration` are first-class selectable run-lanes.
//
// Half A of the test-architecture change promotes the two manifest keys to
// selectable lanes so integration tests get their own channel instead of riding
// the `fast` lane interleaved with unit tests. These assertions pin that
// `laneFiles('unit')` and `laneFiles('integration')` each resolve to exactly
// their section of the canonical manifest, that neither leaks into the other,
// and that the internal `all` union still spans both (it backs the divergence
// guard and `test:coverage`, so it must survive the retirement of `test:all`).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { RUN_LANES, laneFiles } from '../../../../run-tests-lanes.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

// Build a throwaway repo-shaped fixture with one file per lane, then drive
// laneFiles against it via the discovery opts (root + projectRoot).
function fixture() {
  const projectRoot = mkdtempProjectIsolated('aitm-lanes-');
  const mk = (rel) => {
    const abs = path.join(projectRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, '// fixture test file\n');
  };
  mk('scripts/tests/unit/alpha.test.mjs');
  mk('scripts/tests/integration/beta.test.mjs');
  mk('scripts/tests/slow/gamma.test.mjs');
  return { root: 'scripts', projectRoot };
}

test('#864: RUN_LANES exposes unit and integration as selectable lanes', () => {
  assert.ok(RUN_LANES.includes('unit'), 'unit must be a selectable lane');
  assert.ok(RUN_LANES.includes('integration'), 'integration must be a selectable lane');
});

test('#864: laneFiles("unit") resolves to only the unit section', () => {
  const opts = fixture();
  const unit = laneFiles('unit', opts);
  assert.deepEqual(unit, ['scripts/tests/unit/alpha.test.mjs']);
  assert.ok(
    !unit.some((f) => f.includes('/integration/') || f.includes('/slow/')),
    'the unit lane must not carry integration or slow files'
  );
});

test('#864: laneFiles("integration") resolves to only the integration section', () => {
  const opts = fixture();
  const integration = laneFiles('integration', opts);
  assert.deepEqual(integration, ['scripts/tests/integration/beta.test.mjs']);
});

test('#864: integration files no longer ride the fast lane alone — but fast is still the union', () => {
  const opts = fixture();
  const unit = laneFiles('unit', opts);
  const integration = laneFiles('integration', opts);
  const fast = laneFiles('fast', opts);
  // fast is exactly unit ∪ integration; each section is independently runnable.
  assert.deepEqual(fast, [...unit, ...integration].sort());
  // The integration file is reachable on its own channel, not only via fast.
  assert.ok(integration.includes('scripts/tests/integration/beta.test.mjs'));
});

test('#864: the internal all-lane union survives (backs divergence + coverage)', () => {
  const opts = fixture();
  const all = laneFiles('all', opts);
  assert.deepEqual(all, [
    'scripts/tests/integration/beta.test.mjs',
    'scripts/tests/slow/gamma.test.mjs',
    'scripts/tests/unit/alpha.test.mjs',
  ]);
});

test('#864: an unknown lane fails loud', () => {
  assert.throws(() => laneFiles('bogus', fixture()), /--lane must be one of/);
});
