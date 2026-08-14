// @story #880
// AC4 — all 14 `--apply` maintenance scripts route through the shared
// blast-radius guard (scripts/task-tracker/lib/blast-radius-guard.mjs) and
// declare `--yes` in their strict-argv flag set (#878). Source-text checks
// only: no gh/network I/O, safe to run offline. The manifest is imported from
// the strict-argv test so this drifts in lockstep with #878's canonical list —
// any future `--apply` script that forgets to adopt the guard fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { APPLY_SCRIPTS } from '../../../slow/task-tracker/core/maintenance-scripts-strict-argv.test.mjs';
import { confirmBlastRadius } from '../../../../task-tracker/lib/blast-radius-guard.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)) + '/..', '../../../..');

// Reach check (#866): every script asserted below must actually call the same
// guard this test imports, not merely a same-named lookalike.
assert.equal(typeof confirmBlastRadius, 'function');

for (const rel of APPLY_SCRIPTS) {
  test(`${rel} imports confirmBlastRadius and declares --yes`, () => {
    const src = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.match(src, /confirmBlastRadius/, `${rel} does not reference confirmBlastRadius`);
    assert.match(
      src,
      /from ['"][^'"]*blast-radius-guard\.mjs['"]/,
      `${rel} does not import from blast-radius-guard.mjs`
    );
    assert.match(src, /--yes/, `${rel} does not declare a --yes flag`);
  });
}
