// @story #489
// Dedicated coverage for the #489 blank-effective-zero rendering contract.
//
// Locked scope: in the ⏱ Timing Log, an effective-zero value in the Active,
// Idle, or ΔWords column renders as a BLANK cell rather than `0h 00m 00s` / `0`.
// This is DISPLAY-ONLY:
//   - `null`/missing is NOT effective-zero — it keeps the `—` "no data" sentinel.
//   - WordMarker is deliberately untouched — a 0 WordMarker is a genuine
//     session-start signal and must keep rendering `0`.
//   - The trailing `<!-- row-sec: a=N i=N -->` marker keeps the raw numeric
//     seconds, so rollup/aggregation is unaffected.
// #489 supersedes #484's display choice (zeros as `0h 00m 00s`) for these cells.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRow, buildFlushRow } from '../../gh-timing-comment.mjs';

const ts = () => new Date().toISOString();
const cells = (row) =>
  row
    .split('<!--')[0]
    .split('|')
    .map((s) => s.trim());

test('second-precision: zero Active/Idle render blank, row-sec marker preserved (#489)', () => {
  const row = buildRow({
    ts: ts(),
    event: 'start',
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 8541,
    description: 'task opened',
  });
  const c = cells(row);
  assert.equal(c[3], '', 'Active blank');
  assert.equal(c[4], '', 'Idle blank');
  assert.equal(c[5], '', 'ΔWords blank');
  assert.equal(c[6], '8,541', 'WordMarker untouched');
  assert.match(row, /<!-- row-sec: a=0 i=0 -->$/, 'row-sec marker carries raw zeros');
  assert.doesNotMatch(row, /0h 00m 00s/, 'no duration-form zero cells');
});

test('second-precision: only the zero cell blanks; the non-zero sibling renders (#489)', () => {
  const row = buildRow({
    ts: ts(),
    event: 'review',
    activeSec: 90, // 0h 01m 30s
    idleSec: 0,
    deltaWords: 12,
    wordMarker: 1,
    description: 'x',
  });
  const c = cells(row);
  assert.equal(c[3], '0h 01m 30s', 'non-zero Active renders');
  assert.equal(c[4], '', 'zero Idle blanks');
  assert.equal(c[5], '12', 'non-zero ΔWords renders');
  assert.match(row, /<!-- row-sec: a=90 i=0 -->$/, 'both raw seconds preserved');
});

test('null is NOT effective-zero — Active/Idle/ΔWords keep the — sentinel (#489)', () => {
  // No activeSec/idleSec and no minute values -> legacy minute path with null
  // scalars. null must remain `—`, distinct from a blanked zero.
  const row = buildRow({
    ts: ts(),
    event: 'note',
    activeMin: null,
    idleMin: null,
    deltaWords: null,
    wordMarker: null,
    description: 'no-data row',
  });
  const c = cells(row);
  assert.equal(c[3], '—', 'null Active is —');
  assert.equal(c[4], '—', 'null Idle is —');
  assert.equal(c[5], '—', 'null ΔWords is —');
  assert.equal(c[6], '—', 'null WordMarker is —');
});

test('legacy minute path: zero minutes blank, non-zero render (#489)', () => {
  const row = buildRow({
    ts: ts(),
    event: 'heartbeat',
    activeMin: 0,
    idleMin: 5,
    deltaWords: 0,
    wordMarker: 3,
    description: 'h',
  });
  const c = cells(row);
  assert.equal(c[3], '', 'zero active-min blanks');
  assert.equal(c[4], '5', 'non-zero idle-min renders');
  assert.equal(c[5], '', 'zero ΔWords blanks');
  assert.equal(c[6], '3', 'WordMarker untouched');
});

test('buildFlushRow: effective-zero pause/flush cells blank, marker intact (#489 supersedes #484)', () => {
  const row = buildFlushRow({
    ts: ts(),
    event: 'pause',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 0,
    description: '',
  });
  assert.doesNotMatch(row, /0h 00m 00s/, 'no duration-form zero cells on flush path');
  assert.match(row, /<!-- row-sec: a=0 i=0 -->$/, 'flush row-sec marker carries raw zeros');
  const c = cells(row);
  assert.equal(c[3], '', 'Active blank');
  assert.equal(c[4], '', 'Idle blank');
});

console.log('gh-timing-comment-blank-zero.test.mjs: all passed');
