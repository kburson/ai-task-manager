// @story #1107
import assert from 'node:assert/strict';
import path from 'node:path';

import { buildRow } from '../../../../task-tracker/gh-timing-comment.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  classifyTimingEvent,
  EVENT_CLASS,
} from '../../../../task-tracker/lib/timing-events/index.mjs';
import { parseTimingRow } from '../../../../task-tracker/lib/timing-row-reader.mjs';
import { drainAndDiscard, enqueue, peek } from '../../../../task-tracker/queue.mjs';
import { mkdtempSync, rmSync } from 'node:fs';

const tmp = mkdtempSync(path.join(projectScratchDir('test'), 'timing-queue-retention-'));
const queuePath = path.join(tmp, 'queue.json');

function row(event) {
  return buildRow({
    ts: new Date().toISOString(),
    event,
    activeSec: 0,
    idleSec: 0,
    deltaWords: 0,
    wordMarker: 0,
    description: event,
  });
}

const shouldRetainSequenceRow = (evt) => {
  if (evt.kind !== 'timing') return false;
  const event = parseTimingRow(evt.row)?.event;
  const eventClass = classifyTimingEvent(event);
  return eventClass === EVENT_CLASS.DEPARTURE || eventClass === EVENT_CLASS.REENGAGEMENT;
};

enqueue({ kind: 'timing', issue: '#1107', row: row('pause:question') }, queuePath);
enqueue({ kind: 'timing', issue: '#1107', row: row('resume:question') }, queuePath);
enqueue({ kind: 'timing', issue: '#1107', row: row('develop:started') }, queuePath);
enqueue({ kind: 'timing', issue: '#1109', row: row('pause:question') }, queuePath);

const result = await drainAndDiscard(
  async () => {
    throw new Error('network unavailable');
  },
  queuePath,
  (evt) => String(evt.issue).replace(/^#/, '') === '1107',
  shouldRetainSequenceRow
);

assert.deepEqual(result, { delivered: 0, discarded: 1, retained: 2 });
const survivors = peek(queuePath);
assert.equal(survivors.length, 3, 'two sequence rows and the non-target row survive');
assert.deepEqual(
  survivors.map(({ issue, row: timingRow }) => [issue, parseTimingRow(timingRow)?.event]),
  [
    ['#1109', 'pause:question'],
    ['#1107', 'pause:question'],
    ['#1107', 'resume:question'],
  ]
);

rmSync(tmp, { recursive: true, force: true });
console.log('timing-queue-retention.test.mjs: all passed');
