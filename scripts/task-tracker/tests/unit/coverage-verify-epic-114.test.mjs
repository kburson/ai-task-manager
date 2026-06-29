// @story #605
// Smoke leaf for `scripts/task-tracker/verify-epic-114.mjs` (epic #586, Group B).
//
// Per the #586 smoke-only split this epic-invariant checker is covered by a
// clean-invocation smoke rather than a >=80% coverage target. The script takes
// no arguments — it runs three repo/environment invariant checks (cross-adapter
// SKILL.md parity, the DESIGN.md "Skill loading model" section, and the memory
// archive directory) and exits 0 with `epic #114 invariants: ok` when they all
// hold, or 1 with diagnostics otherwise. The smoke drives it as a child process
// and asserts the success path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../verify-epic-114.mjs', import.meta.url));

test('verify-epic-114 smoke: invariants hold → prints ok and exits 0', () => {
  const res = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /epic #114 invariants: ok/);
});
