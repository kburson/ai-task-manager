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

test('current closed evidence accounts genuine work after unknown legacy history', () => {
  const result = deriveActorEngagement(
    [
      { ts: at(0), event: 'develop:started' },
      { ts: at(1), event: 'start' },
      {
        ts: at(40),
        event: 'pause:blocked',
        actorKey: keyA,
        engagement: {
          startMs: Date.parse(at(10)),
          endMs: Date.parse(at(40)),
          activeEstimateSec: null,
          wordStart: 10,
          wordEnd: 15,
          fullWordStart: null,
          fullWordEnd: null,
        },
      },
    ],
    at(50)
  );
  assert.equal(result.engagedMs, 30000);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.incompleteActors, []);
  assert.equal(result.complete, false);
  assert.equal(result.unknownRows, 1);
  assert.equal(result.byActor[keyA].words, 5);
});
test('same actor explicit coverage unions overlaps while independent actors add', () => {
  const evidence = (key, start, end, words) => ({
    ts: at(end),
    event: 'pause:blocked',
    actorKey: key,
    engagement: {
      startMs: Date.parse(at(start)),
      endMs: Date.parse(at(end)),
      activeEstimateSec: null,
      wordStart: words === null ? null : 0,
      wordEnd: words,
      fullWordStart: null,
      fullWordEnd: null,
    },
  });
  const result = deriveActorEngagement(
    [evidence(keyA, 0, 30, null), evidence(keyB, 10, 30, 7), evidence(keyA, 20, 40, null)],
    at(50)
  );
  assert.equal(result.engagedMs, 60000);
  assert.equal(result.byActor[keyA].engagedMs, 40000);
  assert.equal(result.byActor[keyB].engagedMs, 20000);
  assert.equal(result.byActor[keyA].words, null);
  assert.equal(result.byActor[keyB].words, 7);
});
test('evidence ending after row and reversed shared lifecycle facts remain invalid', () => {
  const bad = deriveActorEngagement(
    [
      {
        ts: at(20),
        event: 'pause',
        actorKey: keyA,
        engagement: {
          startMs: Date.parse(at(0)),
          endMs: Date.parse(at(30)),
          activeEstimateSec: null,
          wordStart: 0,
          wordEnd: 1,
          fullWordStart: null,
          fullWordEnd: null,
        },
      },
    ],
    at(40)
  );
  assert.ok(bad.failures.includes('actor-evidence-window'));
  const lifecycle = deriveActorEngagement(
    [
      { ts: at(20), event: 'develop:started', actorKey: keyA },
      { ts: at(10), event: 'develop:completed', actorKey: keyB },
    ],
    at(40)
  );
  assert.ok(lifecycle.failures.includes('lifecycle-out-of-order'));
});
test('tagged close cannot claim a missing phase or invalid current instant matched', () => {
  assert.equal(computePhaseCloseDelta(actorBody, 'plan', at(50)).matched, false);
  assert.equal(computePhaseCloseDelta(actorBody, 'develop', 'bad').matched, false);
});

test('duplicate immutable interval replay cannot double-count or erase known cursors', () => {
  const row = {
    ts: at(40),
    event: 'pause',
    actorKey: keyA,
    engagement: {
      startMs: Date.parse(at(10)),
      endMs: Date.parse(at(40)),
      activeEstimateSec: null,
      wordStart: 10,
      wordEnd: 15,
      fullWordStart: 100,
      fullWordEnd: 110,
    },
  };
  const result = deriveActorEngagement([row, structuredClone(row)], at(50));
  assert.equal(result.engagedMs, 30000);
  assert.equal(result.byActor[keyA].words, 5);
  assert.deepEqual(result.failures, []);
});
test('contradictory same-interval cursors cannot become a trusted word total', () => {
  const row = {
    ts: at(40),
    event: 'pause',
    actorKey: keyA,
    engagement: {
      startMs: Date.parse(at(10)),
      endMs: Date.parse(at(40)),
      activeEstimateSec: null,
      wordStart: 10,
      wordEnd: 15,
      fullWordStart: null,
      fullWordEnd: null,
    },
  };
  const changed = structuredClone(row);
  changed.engagement.wordEnd = 16;
  const result = deriveActorEngagement([row, changed], at(50));
  assert.equal(result.complete, false);
  assert.ok(result.failures.includes('actor-evidence-conflict'));
});

test('mixed history exposes known subtotal without a complete numeric total', () => {
  const body = tableRow(0, 'start') + '\n' + actorBody;
  const summary = computeActiveByPhaseSpans(body);
  assert.equal(summary.totalActiveSec, null);
  assert.equal(summary.knownActiveSec, 60);
  assert.equal(summary.engagement.complete, false);
  const ladder = deriveLadder(parseTimingRows(body));
  assert.equal(ladder.totals.activeSec, null);
  assert.equal(ladder.totals.knownActiveSec, 60);
  for (const row of ladder.rows) {
    assert.equal(typeof row.class, 'string');
    assert.ok(Object.hasOwn(row, 'state'));
    assert.ok(Object.hasOwn(row, 'activeSec'));
    assert.ok(Object.hasOwn(row, 'idleSec'));
  }
});
test('ladder lexical path preserves current interval evidence', () => {
  const body =
    tableRow(40, 'pause', actorA).replace(' <!-- row-sec: a=0 i=0 -->', '') +
    ' <!-- aitm-engagement:v1 start=1790812810000 end=1790812840000 active=unknown wstart=0 wend=0 fstart=unknown fend=unknown -->';
  assert.equal(deriveLadder(parseTimingRows(body)).totals.activeSec, 30);
});

test('unattributed historical phase totals stay unknown beside later actor intervals', () => {
  const old = tableRow(0, 'plan:completed').replace('a=0', 'a=120');
  const summary = computeActiveByPhaseSpans(old + '\n' + actorBody);
  assert.equal(summary.totalActiveSec, null);
  assert.equal(summary.knownActiveSec, 60);
  assert.equal(summary.engagement.unknownRows, 1);
});

test('exact current start agrees with genuine opener rounded to its table second', () => {
  const startMs = Date.parse(at(10)) + 250;
  const result = deriveActorEngagement(
    [
      { ts: at(10), event: 'resumed', actorKey: keyA },
      {
        ts: at(40),
        event: 'pause',
        actorKey: keyA,
        engagement: {
          startMs,
          endMs: Date.parse(at(40)) + 250,
          activeEstimateSec: null,
          wordStart: 0,
          wordEnd: 5,
          fullWordStart: null,
          fullWordEnd: null,
        },
      },
    ],
    at(41)
  );
  assert.equal(result.engagedMs, 30000);
  assert.deepEqual(result.failures, []);
});

test('final phase uses validated exact evidence cutoff instead of dropping fractional work', () => {
  const result = deriveActorEngagement(
    [
      { ts: at(0), event: 'develop:started' },
      {
        ts: at(40),
        event: 'pause',
        actorKey: keyA,
        engagement: {
          startMs: Date.parse(at(10)) + 250,
          endMs: Date.parse(at(40)) + 750,
          activeEstimateSec: null,
          wordStart: 0,
          wordEnd: 5,
          fullWordStart: null,
          fullWordEnd: null,
        },
      },
    ],
    at(40)
  );
  assert.equal(result.engagedMs, 30500);
  assert.equal(result.byPhase.develop.engagedMs, 30500);
});

test('explicit unknown session recovery preserves the lost interval without charging or fabricating its end', () => {
  const result = deriveActorEngagement(
    [
      { ts: at(0), event: 'start', actorKey: keyA },
      {
        ts: at(10),
        event: 'session-end-recovery',
        actorKey: keyA,
        cells: ['', at(10), 'session-end-recovery', 'Unknown', 'Unknown'],
      },
      { ts: at(10), event: 'session-start', actorKey: keyA },
      {
        ts: at(20),
        event: 'pause:other',
        actorKey: keyA,
        engagement: {
          startMs: Date.parse(at(10)),
          endMs: Date.parse(at(20)),
          activeEstimateSec: null,
          wordStart: null,
          wordEnd: null,
          fullWordStart: null,
          fullWordEnd: null,
        },
      },
    ],
    at(20)
  );
  assert.deepEqual(result.failures, []);
  assert.equal(result.engagedMs, 10000);
  assert.equal(result.unknownRows, 1);
  assert.equal(result.complete, false);
});
