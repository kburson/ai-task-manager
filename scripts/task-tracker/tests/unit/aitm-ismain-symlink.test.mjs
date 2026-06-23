// #506 — `aitm` CLI emitted no output when launched through the `npx`/`.bin`
// symlink shim. The `isMain` guard compared `fileURLToPath(import.meta.url)`
// against `path.resolve(process.argv[1])`; `path.resolve` does not dereference
// symlinks, so the real file path and the `.bin` symlink path differed,
// `isMain` was false, and `run()` never executed.
//
// These tests pin the fix: `resolvesAsMain` realpaths both sides before
// comparing, with an injectable `realpath` so the symlink case is exercised
// without a live symlink on disk.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolvesAsMain } from '../../../../bin/aitm.mjs';

const REAL = '/proj/node_modules/ai-task-manager/bin/aitm.mjs';
const MODULE_URL = 'file://' + REAL;
const BIN_SHIM = '/proj/node_modules/.bin/aitm';

test('returns true when the .bin symlink realpaths to the module file', () => {
  // realpath dereferences the symlink to the real file; both sides converge.
  const realpath = (p) => (p === BIN_SHIM ? REAL : p);
  assert.equal(resolvesAsMain(MODULE_URL, BIN_SHIM, { realpath }), true);
});

test('returns true for direct invocation of the real file', () => {
  const realpath = (p) => p; // non-symlink: realpath is identity
  assert.equal(resolvesAsMain(MODULE_URL, REAL, { realpath }), true);
});

test('returns false when argv points at an unrelated script', () => {
  const realpath = (p) => p;
  assert.equal(resolvesAsMain(MODULE_URL, '/proj/other/thing.mjs', { realpath }), false);
});

test('returns false when there is no argv path', () => {
  const realpath = (p) => p;
  assert.equal(resolvesAsMain(MODULE_URL, undefined, { realpath }), false);
  assert.equal(resolvesAsMain(MODULE_URL, '', { realpath }), false);
});

test('returns false (fail-closed) when realpath throws', () => {
  const realpath = () => {
    throw new Error('ENOENT');
  };
  assert.equal(resolvesAsMain(MODULE_URL, BIN_SHIM, { realpath }), false);
});
