#!/usr/bin/env node
// @story #438
// #438 AC2 — Config-completeness invariant.
//
// Parametrized over EVERY slug in the canonical state chain (STATES). For each
// slug assert it is:
//   1. present in the production STATUS_CONFIG_KEYS map (project-tether),
//   2. present in config.mjs DEFAULTS (the gate that loadConfig merges against),
//   3. present in the exported TYPES coercion table,
//   4. RETAINED through a real loadConfig() round-trip from an on-disk
//      task-tracker.json (the silent drop that hid Bug A — loadConfig discards
//      any key absent from DEFAULTS), and
//   5. resolving to a non-empty option ID once loaded.
//
// Plus EXACT-COVERAGE assertions: STATUS_CONFIG_KEYS has no orphan slugs beyond
// STATES, so a future state insertion that forgets a column cannot pass.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { mkdtempProjectIsolated } from '../../lib/scratch-dir.mjs';
import { STATES } from '../../state-machine.mjs';
import { STATUS_CONFIG_KEYS } from '../../../gh/lib/project-tether.mjs';
import { DEFAULTS, TYPES, loadConfig } from '../../config.mjs';

// Exact coverage: STATUS_CONFIG_KEYS keys === STATES (no orphans, no gaps).
test('AC2: STATUS_CONFIG_KEYS covers exactly the canonical states', () => {
  assert.deepEqual(
    Object.keys(STATUS_CONFIG_KEYS).sort(),
    [...STATES].sort(),
    'STATUS_CONFIG_KEYS must map exactly the canonical states — no orphan or missing slug'
  );
});

for (const slug of STATES) {
  test(`AC2: "${slug}" — registered in all config tables and survives loadConfig`, () => {
    const key = STATUS_CONFIG_KEYS[slug];
    assert.ok(key, `slug ${slug} must have a STATUS_CONFIG_KEYS entry`);

    // (2) DEFAULTS membership — the merge gate. A key absent here is dropped.
    assert.ok(key in DEFAULTS, `${key} must be a DEFAULTS key (Bug A: it was not)`);

    // (3) TYPES membership — coercion table parity.
    assert.ok(key in TYPES, `${key} must be in the TYPES coercion table`);

    // (4) round-trip: write a populated task-tracker.json, loadConfig, assert retained.
    const sandbox = mkdtempProjectIsolated(`tt-cfg-${slug}-`);
    try {
      const dir = path.join(sandbox, '.ai-task-manager');
      mkdirSync(dir, { recursive: true });
      const projectPath = path.join(dir, 'task-tracker.json');
      const optId = `OPT_${slug.toUpperCase().replace(/-/g, '_')}`;
      writeFileSync(projectPath, JSON.stringify({ repo: 'o/r', [key]: optId }, null, 2));

      const cfg = loadConfig({ projectPath });

      // (4) retained — NOT silently dropped.
      assert.equal(
        cfg[key],
        optId,
        `${key} must survive loadConfig round-trip (Bug A: loadConfig dropped it)`
      );
      // (5) non-empty resolution.
      assert.ok(cfg[key] && cfg[key].length > 0, `${key} must resolve non-empty after load`);
    } finally {
      rmSync(sandbox, { recursive: true });
    }
  });
}
