// @story #1020
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_CLASS,
  classifyTimingEventForAccounting as classifyTimingEvent,
  isCanonicalPhaseEvent as isCanonicalPhaseSlug,
} from '../../../lib/timing-events/index.mjs';
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
  const eventClass = classifyTimingEvent(event);
  const events = eventClass === EVENT_CLASS.DEPARTURE ? ['start', event, 'resumed'] : [event];
  return validateTimingLog({
    comments: [
      {
        body: [
          '## ⏱ Timing Log',
          '| Timestamp | Event | Active | Idle | Words | Marker | Description |',
          '|---|---|---:|---:|---:|---:|---|',
          ...events.map(
            (slug, index) =>
              `| 2026-07-27T00:00:0${index}.000Z | ${slug} | 0 | 0 | 0 | 0 | emitted event |`
          ),
        ].join('\n'),
      },
    ],
    markers: { enteredStages: [] },
  }).pass;
}

test('every production-emitted bare slug is canonical and accepted by the strict reader', () => {
  for (const slug of EMITTED_BARE_SLUGS) {
    if (slug === 'stop') {
      assert.equal(isCanonicalPhaseSlug(slug), false, 'stop is a departure, not a phase slug');
    } else {
      assert.equal(isCanonicalPhaseSlug(slug), true, slug);
    }
    assert.equal(strictReaderAccepts(slug), true, slug);
  }
});

test('audit slugs remain phase events while stop is an explicit departure', () => {
  for (const slug of EMITTED_BARE_SLUGS) {
    assert.equal(
      classifyTimingEvent(slug),
      slug === 'stop' ? EVENT_CLASS.DEPARTURE : EVENT_CLASS.PHASE,
      slug
    );
  }
});
