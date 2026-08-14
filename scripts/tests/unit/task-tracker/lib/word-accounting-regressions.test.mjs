// @story #1142
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRow,
  __internals as timingInternals,
} from '../../../../task-tracker/gh-timing-comment.mjs';
import { computePhaseCloseDelta } from '../../../../task-tracker/lib/timing-rows.mjs';
import { countWords } from '../../../../task-tracker/word-counter.mjs';

const { appendRow, buildInitialComment } = timingInternals;

test('fixtures modeled on #1127/#1133/#1134 derive uninterrupted formatted growth', () => {
  const body = [
    '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |',
    '|---|---|---|---|---|---|---|---|',
    '| 2026-08-07 10:00:00 -05:00 | develop:started |  |  | 0 | 59,894 | start | 70,000 |',
  ].join('\n');
  const result = computePhaseCloseDelta(body, 'develop', '2026-08-07T15:01:00Z', 60_000);
  assert.equal(result.deltaWords, 106);
});

test('fixture modeled on #1138 repairs a missing resume before phase open', () => {
  const make = (event, marker) =>
    buildRow({
      ts: new Date().toISOString(),
      event,
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      wordMarker: marker,
      fullWordMarker: marker * 2,
      description: event,
    });
  let body = appendRow(buildInitialComment(), make('start', 10));
  body = appendRow(body, make('pause:break', 20));
  body = appendRow(body, make('test:started', 30));
  assert.match(body, /\| resumed \|[\s\S]*\| test:started \|/);
});

test('an unresolved Codex transcript is explicitly unavailable', () => {
  const diagnostics = [];
  const counted = countWords('', 0, {
    provider: 'codex',
    sid: 'codex-session',
    onDiagnostic: (line) => diagnostics.push(line),
  });
  assert.equal(counted.status, 'unavailable');
  assert.equal(counted.diagnosticCode, 'codex-transcript-unresolved');
  assert.equal(diagnostics.length, 1);
});
