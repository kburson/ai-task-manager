// @story #355
// #355 — asserts the contiguity check has been migrated out of move-state.mjs
// into the state-keyed entryGuards registry. Reads move-state.mjs as text and
// confirms it no longer references `evaluateContiguity` directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const moveStatePath = resolve(here, '../../gh/move-state.mjs');

test('move-state.mjs does not invoke evaluateContiguity inline (#355)', async () => {
  const src = await readFile(moveStatePath, 'utf8');
  assert.ok(
    !src.includes('evaluateContiguity'),
    'move-state.mjs still references evaluateContiguity — contiguity check should live in the entryGuards registry, not inline.'
  );
});
