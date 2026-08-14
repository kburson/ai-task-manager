// @story #764
// #764 — with every production caller migrated onto the in-process
// runMoveStateHost seam (promote, demote, runtime→close, supersede, reconcile,
// dispatch-prep), move-state.mjs's standalone spawnable entrypoint is retired.
// The `isInvokedAsMain()` shim that mapped the returned code onto process.exit
// for `node scripts/gh/move-state.mjs …` is deleted, so the module is
// import-only: loading it must have zero side effects and it must never call
// process.exit at top level. Spawn-based tests that still need a real CLI process
// (cross-process lock fidelity, no-TTY gate) go through the dedicated test-only
// harness scripts/tests/helpers/move-state-cli.mjs instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(new URL('../../../../gh/move-state.mjs', import.meta.url)),
  'utf8'
);

test('move-state.mjs has no isInvokedAsMain entrypoint shim', () => {
  assert.ok(
    !/isInvokedAsMain/.test(SRC),
    'the direct-invocation shim must be gone — move-state.mjs is import-only'
  );
});

test('move-state.mjs never calls process.exit', () => {
  // Match the call syntax `process.exit(` — doc-comment mentions of the name are
  // fine; what must be gone is any actual exit call.
  assert.ok(
    !/process\.exit\(/.test(SRC),
    'runMoveStateHost RETURNS a code; the module must never process.exit()'
  );
});

test('move-state.mjs no longer imports realpathSync (shim-only usage removed)', () => {
  assert.ok(
    !/realpathSync/.test(SRC),
    'realpathSync was used only by the deleted shim and must be dropped'
  );
});

test('the spawnable CLI harness exists for cross-process/no-TTY tests', () => {
  const harness = readFileSync(
    fileURLToPath(new URL('../../../helpers/move-state-cli.mjs', import.meta.url)),
    'utf8'
  );
  assert.ok(
    /runMoveStateHost/.test(harness),
    'the harness must drive the in-process host and map its code onto process.exit'
  );
});
