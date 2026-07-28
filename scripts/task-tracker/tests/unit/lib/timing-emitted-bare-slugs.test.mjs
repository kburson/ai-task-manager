// @story #1020
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_CLASS,
  classifyTimingEvent,
  isCanonicalPhaseSlug,
} from '../../../lib/timing-event-map.mjs';
import { validate as validateTimingLog } from '../../../lib/agent-review/validators/timing-log-sequence.mjs';

const EMITTED_BARE_SLUGS = Object.freeze([
  'pre-compact-flush',
  'post-compact-resume',
  'session-end-recovery',
  'session-start',
  'lifecycle-warn',
  'chore-mode-enter',
  'closed-with-dirty-tree',
  'switch-end',
  'stop',
]);

function strictReaderAccepts(event) {
  return validateTimingLog({
    comments: [
      {
        body: [
          '## ⏱ Timing Log',
          '| Timestamp | Event | Active | Idle | Words | Marker | Description |',
          '|---|---|---:|---:|---:|---:|---|',
          `| 2026-07-27T00:00:00.000Z | ${event} | 0 | 0 | 0 | 0 | emitted audit |`,
        ].join('\n'),
      },
    ],
    markers: { enteredStages: [] },
  }).pass;
}

test('every production-emitted bare slug is canonical and accepted by the strict reader', () => {
  for (const slug of EMITTED_BARE_SLUGS) {
    assert.equal(isCanonicalPhaseSlug(slug), true, slug);
    assert.equal(strictReaderAccepts(slug), true, slug);
  }
});

test('recognizing the emitted bare slugs does not change interruption classification', () => {
  for (const slug of EMITTED_BARE_SLUGS) {
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
  }
});
