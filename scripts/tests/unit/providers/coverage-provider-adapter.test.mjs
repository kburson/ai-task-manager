// @story #609
// Coverage leaf for `scripts/providers/provider-adapter.mjs`.
//
// The module is a pure typedef carrier: it documents the ProviderAdapter shape
// in JSDoc and emits a bare `export {}` with no runtime values or side effects.
// The honest coverage assertion is therefore that it imports cleanly and
// exposes no enumerable exports — exercising the single executable line.

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('provider-adapter module imports with no runtime exports', async () => {
  const mod = await import('../../../providers/provider-adapter.mjs');
  assert.equal(typeof mod, 'object');
  assert.deepEqual(Object.keys(mod), []);
});
