// @story #484
// `buildFlushRow` is the shared flush-path row builder behind every
// timing-emitting verb (`pause` included). Before #484 the flush path passed
// minute scalars to `buildRow`, so pause rows rendered a bare integer in the
// Active/Idle columns while `resume` rows (built with `activeSec`) rendered the
// `Xh Ym Zs` duration form. These tests pin the fix: flushed rows render the
// duration form AND carry the canonical `row-sec` marker, with no change to the
// numeric content rollup consumes (minutes * 60).
//
// #489 supersedes #484's display choice for effective-zero cells: an
// effective-zero Active/Idle/ΔWords cell now renders BLANK (empty cell) rather
// than `0h 00m 00s` / `0`. The numeric invariant #484 established is unchanged —
// the `row-sec` marker still carries `minutes * 60` — only the visible zero-cell
// rendering flipped from duration-form to blank. Assertions below that exercised
// a zero cell are updated accordingly; non-zero cells render identically to #484.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildFlushRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import { parseDurationSeconds } from '../../../../task-tracker/lib/timing-rows.mjs';

const ts = () => new Date().toISOString();

test('buildFlushRow: a pause row renders Active/Idle in Xh Ym Zs duration form (#484)', () => {
  const row = buildFlushRow({
    ts: ts(),
    event: 'pause:other',
    activeMin: 6,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 0,
    description: 'pause for question',
  });
  // Active cell is the duration form, not the bare scalar `6`. Idle is
  // effective-zero, so under #489 it renders blank (not `0h 00m 00s`).
  assert.match(row, /\| 0h 06m 00s \| {2}\|/, 'non-zero Active duration-form, blank Idle (#489)');
  assert.doesNotMatch(row, /\| pause:other \| 6 \|/, 'no bare minute scalar in Active');
});

test('buildFlushRow: carries the canonical row-sec marker (#484)', () => {
  const row = buildFlushRow({
    ts: ts(),
    event: 'pause:other',
    activeMin: 6,
    idleMin: 3,
    deltaWords: 0,
    wordMarker: 0,
    description: '',
  });
  const m = row.match(/<!-- row-sec: a=(\d+) i=(\d+) -->/);
  assert.ok(m, 'row-sec marker present');
  // minutes * 60 — no numeric regression vs the pre-fix minute values.
  assert.equal(Number(m[1]), 360, 'active seconds = 6 min * 60');
  assert.equal(Number(m[2]), 180, 'idle seconds = 3 min * 60');
});

test('buildFlushRow: row-sec seconds round-trip through the duration cells (#484)', () => {
  const row = buildFlushRow({
    ts: ts(),
    event: 'develop:completed',
    activeMin: 16,
    idleMin: 0,
    deltaWords: 42,
    wordMarker: 100,
    description: 'x',
  });
  const cell = row.match(/\| ([0-9]+h [0-9]{2}m [0-9]{2}s) \|/)[1];
  assert.equal(parseDurationSeconds(cell), 16 * 60, 'rendered Active cell parses back to 960s');
});

test('buildFlushRow: effective-zero Active/Idle render blank, not a bare 0 or 0h 00m 00s (#489 supersedes #484)', () => {
  const row = buildFlushRow({
    ts: ts(),
    event: 'update',
    activeMin: 0,
    idleMin: 0,
    deltaWords: 0,
    wordMarker: 0,
    description: '',
  });
  // #489: effective-zero Active/Idle/ΔWords cells collapse to a blank cell.
  // WordMarker stays untouched — a 0 marker is a genuine session-start signal —
  // so it still renders `0`. The row-sec marker keeps the raw seconds.
  assert.match(
    row,
    /\| update \| {2}\| {2}\| {2}\| 0 \| {2}\| <!-- row-sec: a=0 i=0 -->/,
    'effective-zero Active/Idle/ΔWords blank; wordMarker 0 preserved; row-sec marker intact'
  );
  assert.doesNotMatch(row, /0h 00m 00s/, 'no duration-form zero cells under #489');
});

test('buildFlushRow: non-numeric / missing minute values clamp to zero (#484)', () => {
  const row = buildFlushRow({
    ts: ts(),
    event: 'pause:other',
    activeMin: undefined,
    idleMin: NaN,
    deltaWords: 0,
    wordMarker: 0,
    description: '',
  });
  const m = row.match(/<!-- row-sec: a=(\d+) i=(\d+) -->/);
  assert.ok(m, 'row-sec marker present even with bad inputs');
  assert.equal(Number(m[1]), 0, 'undefined active clamps to 0s');
  assert.equal(Number(m[2]), 0, 'NaN idle clamps to 0s');
});

console.log('pause-row-duration.test.mjs: all passed');
