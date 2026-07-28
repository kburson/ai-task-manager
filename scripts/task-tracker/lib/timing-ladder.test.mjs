// #683 (AC2 / AC6) — the active/idle ladder. The canonical case is #625's real
// refine span: one `refine:started` fragmented by TWO Departure gaps
// (`switch-out:#626` and `pause:other`) before `refine:completed`. The recorded
// log collapsed both away-gaps to ~0 idle (i=9, i=5); the ladder must recover
// the truth by summing each state's sub-spans.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveLadder, parseRowTs, parseTimingRows } from './timing-ladder.mjs';
import { EVENT_CLASS } from './timing-events/index.mjs';

// The exact #625 timing fixture (19 rows), CDT (-05:00) throughout.
const FIXTURE = [
  ['2026-06-30 08:33:25 -05:00', 'resumed'],
  ['2026-06-30 08:39:49 -05:00', 'resumed'],
  ['2026-06-30 08:40:01 -05:00', 'on-deck:started'],
  ['2026-06-30 08:40:23 -05:00', 'refine:started'],
  ['2026-06-30 08:42:27 -05:00', 'switch-out:#626'],
  ['2026-07-01 07:27:15 -05:00', 'resumed'],
  ['2026-07-01 08:02:38 -05:00', 'pause:other'],
  ['2026-07-01 21:54:32 -05:00', 'resumed'],
  ['2026-07-01 21:55:01 -05:00', 'refine:completed'],
  ['2026-07-01 21:55:01 -05:00', 'plan:started'],
  ['2026-07-01 22:01:36 -05:00', 'plan:completed'],
  ['2026-07-01 22:01:36 -05:00', 'develop:started'],
  ['2026-07-01 22:09:22 -05:00', 'develop:completed'],
  ['2026-07-01 22:09:22 -05:00', 'test:started'],
  ['2026-07-01 22:10:51 -05:00', 'test:passed'],
  ['2026-07-01 22:10:51 -05:00', 'review:started'],
  ['2026-07-01 22:11:58 -05:00', 'review:approved'],
  ['2026-07-01 22:11:58 -05:00', 'issue:wrap'],
  ['2026-07-01 22:12:14 -05:00', 'issue:closed'],
].map(([ts, event]) => ({ ts, event }));

test('parseRowTs normalizes the space+offset log form', () => {
  const a = parseRowTs('2026-06-30 08:42:27 -05:00');
  const b = parseRowTs('2026-06-30T08:42:27-05:00');
  assert.equal(a, b);
  assert.ok(Number.isFinite(a));
  assert.ok(Number.isNaN(parseRowTs('not-a-date')));
  assert.ok(Number.isNaN(parseRowTs(null)));
});

test('#625 refine span: multi-egress fragmentation sums both Departure gaps', () => {
  const { states } = deriveLadder(FIXTURE);
  // refine:started→switch-out = 124s active
  // switch-out→resumed       = 81888s idle  (22h44m48s, recorded as i=9)
  // resumed→pause:other      = 2123s active (35m23s)
  // pause:other→resumed      = 49914s idle  (13h51m54s, recorded as i=5)
  // resumed→refine:completed = 29s active
  // refine:completed→plan:started = 0
  assert.equal(states.refine.activeSec, 2276, 'refine active = 124+2123+29');
  assert.equal(states.refine.idleSec, 131802, 'refine idle = 81888+49914');
});

test('each Departure row books its whole span as idle, zero active', () => {
  const { rows } = deriveLadder(FIXTURE);
  const switchOut = rows.find((r) => r.event === 'switch-out:#626');
  assert.equal(switchOut.class, EVENT_CLASS.DEPARTURE);
  assert.equal(switchOut.activeSec, 0);
  assert.equal(switchOut.idleSec, 81888);
  const pause = rows.find((r) => r.event === 'pause:other');
  assert.equal(pause.class, EVENT_CLASS.DEPARTURE);
  assert.equal(pause.activeSec, 0);
  assert.equal(pause.idleSec, 49914);
});

test('re-engagement and phase rows book their span as active, zero idle', () => {
  const { rows } = deriveLadder(FIXTURE);
  const resumeAfterSwitch = rows[5]; // 07-01 07:27:15 resumed
  assert.equal(resumeAfterSwitch.class, EVENT_CLASS.REENGAGEMENT);
  assert.equal(resumeAfterSwitch.activeSec, 2123);
  assert.equal(resumeAfterSwitch.idleSec, 0);
});

test('other states aggregate their own sub-spans', () => {
  const { states } = deriveLadder(FIXTURE);
  assert.equal(states['on-deck'].activeSec, 22); // 08:40:01→08:40:23
  assert.equal(states['on-deck'].idleSec, 0);
  assert.equal(states.plan.activeSec, 395); // 21:55:01→22:01:36
  assert.equal(states.develop.activeSec, 466); // 22:01:36→22:09:22
  assert.equal(states.test.activeSec, 89); // 22:09:22→22:10:51
  // review owns only review:started→review:approved (67). `issue:wrap` is
  // done.enter, so the 22:11:58→22:12:14 (16s) cleanup span belongs to `done`.
  assert.equal(states.review.activeSec, 67);
  assert.equal(states.review.idleSec, 0);
  assert.equal(states.done.activeSec, 16); // issue:wrap→issue:closed
});

test('leading orphan resumed rows land in the prelude bucket', () => {
  const { prelude, rows } = deriveLadder(FIXTURE);
  assert.equal(rows[0].state, null);
  assert.equal(rows[1].state, null);
  // 08:33:25→08:39:49 (384s) + 08:39:49→08:40:01 (12s)
  assert.equal(prelude.activeSec, 396);
  assert.equal(prelude.idleSec, 0);
});

test('terminal row contributes 0/0', () => {
  const { rows } = deriveLadder(FIXTURE);
  const last = rows[rows.length - 1];
  assert.equal(last.event, 'issue:closed');
  assert.equal(last.activeSec, 0);
  assert.equal(last.idleSec, 0);
});

test('empty input yields empty ladder', () => {
  const { rows, states, totals } = deriveLadder([]);
  assert.deepEqual(rows, []);
  assert.deepEqual(states, {});
  assert.equal(totals.activeSec, 0);
  assert.equal(totals.idleSec, 0);
});

test('parseTimingRows extracts data rows from a log body', () => {
  const body = [
    '## ⏱ Timing Log',
    '',
    '| Timestamp | Event | Active | Idle |',
    '|---|---|---|---|',
    '| 2026-06-30 08:40:23 -05:00 | refine:started | 0 | 0 |',
    '| 2026-06-30 08:42:27 -05:00 | switch-out:#626 | 0 | 0 |',
    'trailing prose, not a row',
  ].join('\n');
  const rows = parseTimingRows(body);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].event, 'refine:started');
  assert.equal(rows[1].event, 'switch-out:#626');
});
