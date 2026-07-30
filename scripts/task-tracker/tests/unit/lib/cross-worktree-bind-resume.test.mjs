// @story #708
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { verbResume } from '../../../verbs/resume.mjs';
import {
  classifyEvent,
  lastOpenInterruption,
  shouldSuppressActiveBindEvent,
} from '../../../lib/bind-event.mjs';

const row = (ts, event) => `| ${ts} | ${event} | 0 | 0 | 0 | 0 | test | <!-- row-sec: a=0 i=0 -->`;
const body = (...rows) => ['| Timestamp | Event |', '|---|---|', ...rows].join('\n');

test('confirmed short active phase tail suppresses a duplicate bind event', () => {
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: body(row('2026-07-28 01:00:00 -05:00', 'plan:started')),
      readStatus: 'found',
      paused: false,
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    true
  );
});

test('fresh, unreadable, paused, and long-gap tails retain bind behavior', () => {
  const activeBody = body(row('2026-07-28 01:00:00 -05:00', 'plan:started'));
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: '',
      readStatus: 'absent',
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    false
  );
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: '',
      readStatus: 'error',
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    false
  );
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: activeBody,
      readStatus: 'found',
      paused: true,
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    false
  );
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: activeBody,
      readStatus: 'found',
      nowTs: '2026-07-28 10:00:01 -05:00',
    }),
    false
  );
});

test('malformed and future-dated tails are not treated as confirmed recent', () => {
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: body(row('2026-99-99 99:99:99 +00:00', 'plan:started')),
      readStatus: 'found',
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    false
  );
  assert.equal(
    shouldSuppressActiveBindEvent({
      timingBody: body(row('2026-07-28 01:10:00 -05:00', 'plan:started')),
      readStatus: 'found',
      nowTs: '2026-07-28 01:05:00 -05:00',
    }),
    false
  );
});

test('pause, switch-out, and stop are departures that still need resumed', () => {
  for (const event of ['pause:question', 'switch-out:#1007', 'stop']) {
    const timingBody = body(
      row('2026-07-28 01:00:00 -05:00', 'plan:started'),
      row('2026-07-28 01:05:00 -05:00', event)
    );
    assert.equal(
      shouldSuppressActiveBindEvent({
        timingBody,
        readStatus: 'found',
        nowTs: '2026-07-28 01:10:00 -05:00',
      }),
      false
    );
    assert.equal(lastOpenInterruption(timingBody)?.kind, event.split(':')[0]);
  }
  assert.deepEqual(classifyEvent('stop'), { role: 'open', kind: 'stop' });
});

test('fresh worktree bind uses the one governed coordinator path', () => {
  const source = readFileSync(
    new URL('../../../lib/work-lease/bind-orchestration.mjs', import.meta.url),
    'utf8'
  );
  assert.equal(typeof verbResume, 'function');
  assert.match(source, /shouldSuppressActiveBindEvent/);
  assert.match(source, /coordinateWorkLeaseAcquire/);
  assert.doesNotMatch(source, /verbResumeLegacy|safePostTiming/);
});
