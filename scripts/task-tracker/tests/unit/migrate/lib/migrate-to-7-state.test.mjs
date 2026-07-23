#!/usr/bin/env node
// @story #52
// Tests for the pure mapping helper at scripts/migrate/lib/state-map.mjs.
// Six cases: each legacy state's expected mapping, no-op for already-migrated,
// throw for unknown source, throw when the target option is absent on the board.

import { strict as assert } from 'node:assert';
import { mapOption, SOURCE_TO_TARGET } from '../../../../../migrate/lib/state-map.mjs';

const FULL_OPTIONS = {
  Backlog: 'OP_b',
  Groom: 'OP_grm',
  Analyze: 'OP_anl',
  Development: 'OP_dev',
  Validate: 'OP_val',
  Review: 'OP_rev',
  Done: 'OP_done',
};

// (a) Ready → Groom
{
  const r = mapOption('Ready', FULL_OPTIONS);
  assert.deepEqual(r, { targetOptionId: 'OP_grm', targetOptionName: 'Groom' });
}

// (b) In Progress → Development
{
  const r = mapOption('In Progress', FULL_OPTIONS);
  assert.deepEqual(r, { targetOptionId: 'OP_dev', targetOptionName: 'Development' });
}

// (c) In Review → Review
{
  const r = mapOption('In Review', FULL_OPTIONS);
  assert.deepEqual(r, { targetOptionId: 'OP_rev', targetOptionName: 'Review' });
}

// (c2) R4R → Review (deprecated alias collapse)
{
  const r = mapOption('R4R', FULL_OPTIONS);
  assert.deepEqual(r, { targetOptionId: 'OP_rev', targetOptionName: 'Review' });
}

// (d) already-Groom is a no-op (returns null)
{
  assert.equal(mapOption('Groom', FULL_OPTIONS), null);
  assert.equal(mapOption('Development', FULL_OPTIONS), null);
  assert.equal(mapOption('Backlog', FULL_OPTIONS), null);
  assert.equal(mapOption('Done', FULL_OPTIONS), null);
}

// (e) unknown source throws
{
  assert.throws(() => mapOption('Bogus', FULL_OPTIONS), /unknown source Status/);
}

// (f) missing target on board raises a clear error
{
  const partial = { Backlog: 'OP_b', Done: 'OP_done' }; // no Groom present
  assert.throws(
    () => mapOption('Ready', partial),
    /target option "Groom" is not present on the board/
  );
}

// SOURCE_TO_TARGET sanity
assert.equal(SOURCE_TO_TARGET.Ready, 'Groom');
assert.equal(SOURCE_TO_TARGET['In Progress'], 'Development');
assert.equal(SOURCE_TO_TARGET['In Review'], 'Review');
assert.equal(SOURCE_TO_TARGET.R4R, 'Review');
assert.equal(SOURCE_TO_TARGET.Backlog, null);
assert.equal(SOURCE_TO_TARGET.Done, null);

console.log('migrate-to-7-state.test.mjs: all passed');
