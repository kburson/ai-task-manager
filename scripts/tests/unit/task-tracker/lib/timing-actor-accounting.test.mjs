// @story #1857
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveActorEngagement,
  reconcileActorCoverage,
} from '../../../../task-tracker/lib/timing-engagement.mjs';
const keyA = timingActorKey({ provider: 'codex', sid: 'one' });
const keyB = timingActorKey({ provider: 'claude', sid: 'two' });
const at = (seconds) => new Date(Date.parse('2026-10-01T00:00:00Z') + seconds * 1000).toISOString();
const rows = [
  { ts: at(0), event: 'develop:started' },
  { ts: at(0), event: 'start', actorKey: keyA },
  { ts: at(10), event: 'start', actorKey: keyB },
  { ts: at(30), event: 'pause:blocked', actorKey: keyB },
  { ts: at(40), event: 'pause:blocked', actorKey: keyA },
  { ts: at(50), event: 'develop:completed' },
  { ts: at(50), event: 'review:started' },
];
test('actor engagement overlaps additively without manufacturing phase starts', () => {
  const result = deriveActorEngagement(rows, at(50));
  assert.equal(result.engagedMs, 60000);
  assert.equal(result.byActor[keyA].engagedMs, 40000);
  assert.equal(result.byActor[keyB].engagedMs, 20000);
  assert.equal(result.byPhase.develop.engagedMs, 60000);
  assert.equal(result.byPhase.review?.engagedMs ?? 0, 0);
  assert.equal(result.incompleteActors.length, 0);
});
test('unknown legacy attribution and missing actor end remain explicit', () => {
  const result = deriveActorEngagement(
    [...rows.slice(0, 3), { ts: at(20), event: 'update' }],
    at(50)
  );
  assert.deepEqual(result.incompleteActors.sort(), [keyA, keyB].sort());
  assert.equal(result.unknownRows, 1);
  assert.equal(result.complete, false);
});
test('same actor migration coverage is unioned while different actors remain additive', () => {
  const intervals = [{ actorKey: keyA, startMs: 0, endMs: 40000 }];
  assert.deepEqual(
    reconcileActorCoverage(intervals, { actorKey: keyA, startMs: 10000, endMs: 30000 }),
    { status: 'known', coveredMs: 20000, uncoveredMs: 0 }
  );
  assert.deepEqual(
    reconcileActorCoverage(intervals, { actorKey: keyA, startMs: 30000, endMs: 50000 }),
    { status: 'known', coveredMs: 10000, uncoveredMs: 10000 }
  );
  assert.deepEqual(
    reconcileActorCoverage(intervals, { actorKey: keyB, startMs: 10000, endMs: 30000 }),
    { status: 'known', coveredMs: 0, uncoveredMs: 20000 }
  );
  assert.equal(
    reconcileActorCoverage(intervals, { actorKey: keyA, startMs: 10000, endMs: null }).status,
    'unknown'
  );
});

import { timingActorKey, timingActorMarker } from '../../../../task-tracker/lib/timing-actor.mjs';
import {
  lastRowFromBody,
  computeActiveByPhaseSpans,
  computePhaseCloseDelta,
} from '../../../../task-tracker/lib/timing-rows.mjs';
import { lastOpenInterruption } from '../../../../task-tracker/lib/bind-event.mjs';
import { parseTimingRows, deriveLadder } from '../../../../task-tracker/lib/timing-ladder.mjs';
const actorA = timingActorKey({ provider: 'codex', sid: 'actor-a' });
const actorB = timingActorKey({ provider: 'claude', sid: 'actor-b' });
const tableRow = (sec, event, key) =>
  '| ' +
  at(sec).replace('T', ' ').replace('.000Z', ' +00:00') +
  ' | ' +
  event +
  ' | | | | 0 | work | |' +
  (key ? timingActorMarker(key) : '') +
  ' <!-- row-sec: a=0 i=0 -->';
const actorBody = [
  tableRow(0, 'develop:started'),
  tableRow(0, 'start', actorA),
  tableRow(10, 'start', actorB),
  tableRow(30, 'pause:blocked', actorB),
  tableRow(40, 'pause:blocked', actorA),
  tableRow(50, 'develop:completed'),
].join('\n');
test('existing last-row and interruption readers scope exact actors', () => {
  assert.equal(lastRowFromBody(actorBody, { actorKey: actorB }).event, 'pause:blocked');
  assert.match(lastRowFromBody(actorBody, { actorKey: actorB }).ts, /00:00:30/);
  assert.deepEqual(lastOpenInterruption(actorBody, { actorKey: actorB }), {
    kind: 'pause',
    reason: 'blocked',
  });
  assert.equal(
    lastRowFromBody(actorBody, { actorKey: timingActorKey({ provider: 'codex', sid: 'absent' }) }),
    null
  );
});
test('phase aggregate, close and ladder preserve concurrent actor engagement', () => {
  assert.equal(computeActiveByPhaseSpans(actorBody).totalActiveSec, 60);
  assert.equal(computePhaseCloseDelta(actorBody, 'develop', at(50)).activeSec, 60);
  assert.equal(deriveLadder(parseTimingRows(actorBody)).totals.activeSec, 60);
});

test('canonical aliases pair and actor ordering and malformed keys stay explicit', () => {
  const aliases = deriveActorEngagement(
    [
      { ts: at(0), event: 'start', actorKey: keyA },
      { ts: at(10), event: 'paused', actorKey: keyA },
      { ts: at(20), event: 'resume', actorKey: keyA },
      { ts: at(30), event: 'stop', actorKey: keyA },
    ],
    at(40)
  );
  assert.equal(aliases.engagedMs, 20000);
  assert.deepEqual(aliases.incompleteActors, []);
  const reversed = deriveActorEngagement(
    [
      { ts: at(20), event: 'start', actorKey: keyA },
      { ts: at(10), event: 'pause:blocked', actorKey: keyA },
    ],
    at(30)
  );
  assert.equal(reversed.complete, false);
  assert.ok(reversed.failures.some((failure) => failure.includes('out-of-order')));
  assert.throws(
    () => deriveActorEngagement([{ ts: at(0), event: 'start', actorKey: 'bad' }], at(10)),
    { code: 'TIMING_ACTOR_INVALID' }
  );
});
