// @story #1142
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRow, __internals as timingInternals } from '../../../gh-timing-comment.mjs';

const { appendRow, buildInitialComment } = timingInternals;

function append(body, { event, marker, full = marker }) {
  return appendRow(
    body,
    buildRow({
      ts: new Date().toISOString(),
      event,
      activeSec: 0,
      idleSec: 0,
      deltaWords: 999_999,
      wordMarker: marker,
      fullWordMarker: full,
      description: event,
    })
  );
}

function dataRows(body) {
  return body.split('\n').filter((line) => /^\| 20/.test(line));
}

test('Delta Words is derived from adjacent comma-formatted Word Markers', () => {
  let body = buildInitialComment();
  body = append(body, { event: 'start', marker: 59_894, full: 80_000 });
  body = append(body, { event: 'update', marker: 60_021, full: 80_500 });
  assert.match(dataRows(body)[0], /\| 0 \| 59,894 \|/);
  assert.match(dataRows(body)[1], /\| 127 \| 60,021 \|/);
  assert.doesNotMatch(dataRows(body)[1], /999,999/);
});

test('Delta Words renders numeric zero for a flat marker', () => {
  let body = buildInitialComment();
  body = append(body, { event: 'start', marker: 42, full: 84 });
  body = append(body, { event: 'update', marker: 42, full: 84 });
  assert.match(dataRows(body)[1], /\| 0 \| 42 \|/);
});
