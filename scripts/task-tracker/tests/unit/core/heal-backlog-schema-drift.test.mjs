// @story #699
// Schema-drift false positives: CANONICAL_STATUS_OPTIONS was a second
// hand-maintained column list (stale — no 'On Deck' after #433) and the
// diffSchema builtIns set predated GitHub's Created/Updated/Closed fields.
// Post-#699 the options derive from the move-state STATE_TO_CONFIG_KEY
// constant and the newer built-ins are recognized.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffSchema, CANONICAL_STATUS_OPTIONS } from '../../../heal-backlog.mjs';
import { STATE_TO_CONFIG_KEY } from '../../../lib/move-state/policy.mjs';

const FIELD_DEFS = [
  {
    key: 'priority',
    name: 'Priority',
    type: 'single_select',
    options: [{ name: 'P0' }, { name: 'P1' }],
  },
  { key: 'rank', name: 'Rank', type: 'number' },
];

const CURRENT_STATUS_FIELD = {
  name: 'Status',
  dataType: 'SINGLE_SELECT',
  options: CANONICAL_STATUS_OPTIONS.map((name) => ({ name })),
};

function currentBoardFields() {
  return [
    {
      name: 'Priority',
      dataType: 'SINGLE_SELECT',
      options: [{ name: 'P0' }, { name: 'P1' }],
    },
    { name: 'Rank', dataType: 'NUMBER' },
    CURRENT_STATUS_FIELD,
    { name: 'Title', dataType: 'TITLE' },
    { name: 'Assignees', dataType: 'ASSIGNEES' },
    // The newer GitHub built-ins that used to be flagged as `extra`.
    { name: 'Created', dataType: 'DATE' },
    { name: 'Updated', dataType: 'DATE' },
    { name: 'Closed', dataType: 'DATE' },
  ];
}

test('CANONICAL_STATUS_OPTIONS derives from the move-state state list and includes On Deck', () => {
  const expected = Object.keys(STATE_TO_CONFIG_KEY).map((state) =>
    state
      .split('-')
      .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
      .join(' ')
  );
  assert.deepEqual(CANONICAL_STATUS_OPTIONS, expected);
  assert.ok(CANONICAL_STATUS_OPTIONS.includes('On Deck'));
});

test('current 8-column board with Created/Updated/Closed reports no drift', () => {
  const drift = diffSchema(currentBoardFields(), FIELD_DEFS);
  assert.equal(drift.hasDrift, false);
  assert.deepEqual(drift.extra, []);
  assert.deepEqual(drift.statusOptionDrift, []);
});

test('legacy 7-column board (no On Deck) reports status-option drift missing on deck', () => {
  const fields = currentBoardFields().map((f) =>
    f.name === 'Status' ? { ...f, options: f.options.filter((o) => o.name !== 'On Deck') } : f
  );
  const drift = diffSchema(fields, FIELD_DEFS);
  assert.equal(drift.hasDrift, true);
  assert.equal(drift.statusOptionDrift.length, 1);
  assert.deepEqual(drift.statusOptionDrift[0].missing, ['on deck']);
  assert.deepEqual(drift.statusOptionDrift[0].extra, []);
});

test('genuinely unknown fields and status options still report drift (regression)', () => {
  const fields = [
    ...currentBoardFields(),
    { name: 'Foo', dataType: 'TEXT' }, // unknown custom field
  ].map((f) => (f.name === 'Status' ? { ...f, options: [...f.options, { name: 'Limbo' }] } : f));
  const drift = diffSchema(fields, FIELD_DEFS);
  assert.equal(drift.hasDrift, true);
  assert.deepEqual(
    drift.extra.map((d) => d.name),
    ['Foo']
  );
  assert.equal(drift.statusOptionDrift.length, 1);
  assert.deepEqual(drift.statusOptionDrift[0].extra, ['limbo']);
});
