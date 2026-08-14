#!/usr/bin/env node
// @story #166
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  deriveStateMoveDelta,
  parsePauseMarkers,
  pauseSpansBetween,
} from '../../../../task-tracker/lib/timing-rows.mjs';
import {
  applyPauseSpansToRows,
  parseTimingRows,
  rollupTotals,
} from '../../../../task-tracker/timing-rollup.mjs';

const F = '2026-05-18T02:45:00Z';
const U = '2026-05-18T03:05:00Z';
const FMS = Date.parse(F);
const UMS = Date.parse(U);

test('parsePauseMarkers: dot-dot back-compat form', () => {
  const body = `prelude <!-- aitm-pause: ${F}..${U} --> trailing`;
  const out = parsePauseMarkers(body);
  assert.equal(out.length, 1);
  assert.equal(out[0].from.getTime(), FMS);
  assert.equal(out[0].until.getTime(), UMS);
  assert.equal(out[0].reason, '');
});

test('parsePauseMarkers: kv form with reason', () => {
  const body = `<!-- aitm-pause: from=${F} until=${U} reason=hung-rm-prompt -->`;
  const out = parsePauseMarkers(body);
  assert.equal(out.length, 1);
  assert.equal(out[0].from.getTime(), FMS);
  assert.equal(out[0].until.getTime(), UMS);
  assert.equal(out[0].reason, 'hung-rm-prompt');
});

test('parsePauseMarkers: kv form without reason', () => {
  const body = `<!-- aitm-pause: from=${F} until=${U} -->`;
  const out = parsePauseMarkers(body);
  assert.equal(out.length, 1);
  assert.equal(out[0].reason, '');
});

test('parsePauseMarkers: kv form rejects missing timestamp', () => {
  assert.equal(parsePauseMarkers(`<!-- aitm-pause: from=${F} -->`).length, 0);
  assert.equal(parsePauseMarkers(`<!-- aitm-pause: until=${U} -->`).length, 0);
});

test('parsePauseMarkers: rejects until <= from', () => {
  assert.equal(parsePauseMarkers(`<!-- aitm-pause: ${U}..${F} -->`).length, 0);
  assert.equal(parsePauseMarkers(`<!-- aitm-pause: from=${U} until=${F} -->`).length, 0);
  assert.equal(parsePauseMarkers(`<!-- aitm-pause: ${F}..${F} -->`).length, 0);
});

test('parsePauseMarkers: rejects garbage timestamps', () => {
  assert.equal(parsePauseMarkers(`<!-- aitm-pause: not-a-ts..${U} -->`).length, 0);
  assert.equal(parsePauseMarkers(`<!-- aitm-pause: from=not-a-ts until=${U} -->`).length, 0);
});

test('parsePauseMarkers: handles both forms together', () => {
  const body = `
    <!-- aitm-pause: ${F}..${U} -->
    <!-- aitm-pause: from=${F} until=${U} reason=x -->
  `;
  const out = parsePauseMarkers(body);
  assert.equal(out.length, 2);
});

test('pauseSpansBetween: kv-form span fully inside window', () => {
  const body = `<!-- aitm-pause: from=${F} until=${U} reason=x -->`;
  const startMs = Date.parse('2026-05-18T02:00:00Z');
  const endMs = Date.parse('2026-05-18T04:00:00Z');
  const spans = pauseSpansBetween(body, startMs, endMs);
  assert.deepEqual(spans, [20 * 60]);
});

test('pauseSpansBetween: partial-overlap is pro-rated', () => {
  const body = `<!-- aitm-pause: from=${F} until=${U} -->`;
  const startMs = Date.parse('2026-05-18T02:55:00Z');
  const endMs = Date.parse('2026-05-18T03:00:00Z');
  const spans = pauseSpansBetween(body, startMs, endMs);
  assert.deepEqual(spans, [5 * 60]);
});

test('pauseSpansBetween: span outside window returns nothing', () => {
  const body = `<!-- aitm-pause: from=${F} until=${U} -->`;
  const startMs = Date.parse('2026-05-18T04:00:00Z');
  const endMs = Date.parse('2026-05-18T05:00:00Z');
  assert.deepEqual(pauseSpansBetween(body, startMs, endMs), []);
});

test('deriveStateMoveDelta: subtracts kv-form pause from window', () => {
  const body = [
    '| Timestamp | Event |',
    '|---|---|',
    '| 2026-05-18 02:30:00 +00:00 | start |',
    '',
    `<!-- aitm-pause: from=${F} until=${U} reason=hung-rm-prompt -->`,
  ].join('\n');
  const nowTs = '2026-05-18T03:30:00Z';
  const { activeSec, idleSec } = deriveStateMoveDelta(body, nowTs);
  assert.equal(idleSec, 20 * 60);
  // total window = 60 min; pause = 20 min; active = 40 min.
  assert.equal(activeSec, 40 * 60);
});

test('applyPauseSpansToRows: rollup drops engaged time by 20 min', () => {
  const commentBody = [
    '| Timestamp | Event | Active Min | Active | Word Marker |',
    '|---|---|---|---|---|',
    `| 2026-05-18 02:30:00 +00:00 | start | 0 | 0 | 0 | <!-- row-sec: a=0 i=0 -->`,
    `| 2026-05-18 03:30:00 +00:00 | promote | 60 | 3600 | 100 | <!-- row-sec: a=3600 i=0 -->`,
  ].join('\n');
  const issueBody = `<!-- aitm-pause: from=${F} until=${U} reason=hung-rm-prompt -->`;
  const rawRows = parseTimingRows(commentBody);
  const baseline = rollupTotals(rawRows, 5);
  const adjustedRows = applyPauseSpansToRows(rawRows, issueBody);
  const adjusted = rollupTotals(adjustedRows, 5);
  // Engaged should drop by ~20 minutes.
  assert.equal(baseline.engagedMin - adjusted.engagedMin, 20);
});
