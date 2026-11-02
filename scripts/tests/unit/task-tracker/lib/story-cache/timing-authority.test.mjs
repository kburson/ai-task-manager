// @story #2070
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  rollupTotals,
  pendingClosePairState,
  buildStructuredTimingProjection,
  computeStageDurations,
} from '../../../../../task-tracker/timing-rollup.mjs';
import { deriveLadder } from '../../../../../task-tracker/lib/timing-ladder.mjs';
import { bucketRowsByDay, renderDailyChart } from '../../../../../reports/lib/daily-activity.mjs';
import { renderTimingEventBatch } from '../../../../../task-tracker/gh-timing-comment.mjs';
import { timingActorKey } from '../../../../../task-tracker/lib/timing-actor.mjs';
import { reconcileReviewApprovedTiming } from '../../../../../task-tracker/lib/review-approval-timing.mjs';
import {
  completedTimingAuthority,
  appendProvisionalTransition,
  completeNextTimingAuthority,
  legacyTimingAuthority,
  unpublishCompletion,
  nativeTest,
} from '../../../../helpers/story-timing-authority-fixture.mjs';

const api = await import('../../../../../task-tracker/lib/story-cache/timing-authority.mjs').catch(
  (error) => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    return {};
  }
);

const provisional = () => ({
  events: [
    {
      eventId: 'measured',
      actorId: timingActorKey({ provider: 'codex', sid: 'historical-A' }),
      transitionId: 'move:provisional',
      timestamp: '2026-10-19T12:00:00.000Z',
      event: 'refine:completed',
      activeSeconds: 30.25,
      idleSeconds: null,
      sourceCursor: 'native-measured',
    },
  ],
  receipts: [],
  legacyEvidence: [],
});

nativeTest(
  'published legacy commit proof retains its original actor and visit despite a later sentinel',
  async (t) => {
    const f = await legacyTimingAuthority(t);
    const result = api.timingAuthority({ ...provisional(), legacyEvidence: [f] });
    assert.deepEqual(result.completedVisits, [
      {
        id: 'move:legacy',
        from: 'test',
        to: 'develop',
        visit: 2,
        actorId: null,
        legacyActor: 'historical-login',
      },
    ]);
    assert.equal(result.measuredActiveSeconds, 30.25);
    assert.equal(result.events[0].actorId, provisional().events[0].actorId);
  }
);

for (const [name, options] of Object.entries({
  foreign: { foreign: true },
  malformed: { malformed: true },
  'invalid-timestamp': { invalidTimestamp: true },
  'missing-visit': { missingVisit: true },
  duplicate: {},
})) {
  nativeTest(`${name} legacy evidence cannot complete a visit`, async (t) => {
    const f = await legacyTimingAuthority(t, options);
    const legacyEvidence = Object.keys(options).length ? [f] : [f, f];
    const result = api.timingAuthority({ ...provisional(), legacyEvidence });
    assert.deepEqual(result.completedVisits, []);
    assert.ok(result.completionFailures.length);
    assert.equal(result.measuredActiveSeconds, 30.25);
  });
}

test('native field rollup keeps measured fractions while completion and idle remain unavailable', () => {
  const totals = rollupTotals([], 5, '', { timingEvidence: provisional() });
  assert.equal(totals.totalActiveSec, 30.25);
  assert.equal(totals.knownEngagedSec, 30.25);
  assert.equal(totals.totalIdleSec, null);
  assert.deepEqual(totals.authority.completedVisits, []);
  assert.equal(totals.telemetry.status, 'incomplete');
});

test('structured projection uses native measurements once and marks unproven stage visits provisional', () => {
  const timingEvidence = provisional();
  const issueBody =
    '<!-- aitm-entered-refine ts="2026-10-19T11:00:00Z" move="move:provisional" -->\n<!-- aitm-entered-plan ts="2026-10-19T12:00:00Z" move="move:next" -->';
  const result = buildStructuredTimingProjection({
    timingBody: '| legacy duplicate |',
    issueBody,
    timingEvidence,
  });
  assert.equal(result.totals.totalActiveSec, 30.25);
  assert.equal(result.totals.totalIdleSec, null);
  assert.equal(result.rows[0].actorId, timingEvidence.events[0].actorId);
  assert.equal(result.rows[0].activeSec, 30.25);
  assert.equal(result.stageTiming.visits[0].completionVerified, false);
  assert.equal(result.stageTiming.visits[0].durationSec, 3600);
  assert.equal(
    computeStageDurations(issueBody, { timingEvidence }).visits[0].completionVerified,
    false
  );
});

test('native ladder preserves measured actor intervals without declaring provisional completion', () => {
  const result = deriveLadder([], { timingEvidence: provisional() });
  assert.equal(result.totals.knownActiveSec, 30.25);
  assert.equal(result.totals.idleSec, null);
  assert.equal(result.rows[0].activeSec, 30.25);
  assert.equal(result.rows[0].lifecycleCompleted, false);
  assert.equal(result.rows[0].actorKey, provisional().events[0].actorId);
  assert.equal(result.states.refine.activeSec, 30.25);
});

test('same-timestamp exit ordering never moves the actor back out of the entered state', () => {
  const base = { ...provisional().events[0], activeSeconds: 0, idleSeconds: 0 };
  const events = [
    { ...base, eventId: 'a-entry', event: 'test:started', sourceCursor: 'a' },
    { ...base, eventId: 'b-exit', event: 'develop:completed', sourceCursor: 'b' },
    {
      ...base,
      eventId: 'c-pause',
      event: 'paused',
      timestamp: '2026-10-19T12:00:01.000Z',
      activeSeconds: 0.25,
      sourceCursor: 'c',
    },
  ];
  assert.equal(deriveLadder([], { timingEvidence: { events } }).rows.at(-1).state, 'test');
});

test('provisional Plan work remains available to its field projection', () => {
  const source = provisional();
  source.events[0].event = 'plan:completed';
  const totals = rollupTotals([], 5, '', { timingEvidence: source });
  assert.equal(totals.planMin, 30.25 / 60);
});

test('native daily activity retains measured work and labels incomplete duration as Unknown', () => {
  const buckets = bucketRowsByDay([{ number: 2070, body: '', timingEvidence: provisional() }]);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].durationSec, null);
  assert.equal(buckets[0].knownDurationSec, 30.25);
  assert.equal(buckets[0].issueCount, 1);
  assert.equal(buckets[0].unknownIdle, true);
  const html = renderDailyChart(buckets);
  assert.match(html, /Known/);
  assert.match(html, /Unknown/);
  assert.doesNotMatch(html, /minutes = total active/);
  assert.doesNotMatch(html, /No timing-log activity/);
});

test('Unknown-only native activity remains visible without invented measured duration', () => {
  const source = provisional();
  source.events[0].activeSeconds = null;
  const buckets = bucketRowsByDay([{ number: 2070, timingEvidence: source }]);
  assert.equal(buckets[0].durationSec, null);
  assert.equal(buckets[0].knownDurationSec, 0);
  assert.equal(buckets[0].issueCount, 1);
  const chart = renderDailyChart(buckets);
  assert.match(chart, /Unknown/);
  assert.doesNotMatch(chart, /NaN|No timing-log activity/);
});

function provisionalClose() {
  const source = provisional().events[0];
  const events = [
    { ...source, eventId: 'close-exit', transitionId: 'move:close', event: 'review:approved' },
    {
      ...source,
      eventId: 'close-entry',
      transitionId: 'move:close',
      event: 'issue:wrap',
      activeSeconds: 0,
      idleSeconds: 0,
      sourceCursor: 'native-close-entry',
    },
  ];
  return {
    timingBody: renderTimingEventBatch({ timingBody: '', events, exitEventId: 'close-exit' }),
    timingEvidence: { events, receipts: [], legacyEvidence: [] },
  };
}

test('a provisional close pair is present for idempotency but is not verified completion', () => {
  const f = provisionalClose();
  const state = pendingClosePairState(f.timingBody, { timingEvidence: f.timingEvidence });
  assert.equal(state.reviewApproved, true);
  assert.equal(state.issueWrap, true);
  assert.equal(state.completionVerified, false);
  assert.equal(state.provisional, true);
});

test('existing projection callers retain their public row shape without explicit native evidence', () => {
  const result = buildStructuredTimingProjection({ timingBody: provisionalClose().timingBody });
  assert.deepEqual(Object.keys(result.rows[0]).sort(), [
    'activeSec',
    'event',
    'idleSec',
    'tsMs',
    'wordMarker',
  ]);
});

test('approval reconciliation never posts a duplicate of an already present provisional pair', async () => {
  const f = provisionalClose();
  const result = await reconcileReviewApprovedTiming({
    issueNumber: 2070,
    repo: 'owner/repo',
    issueBody: '<!-- aitm-review-approved ts="2026-10-19T12:00:00Z" -->',
    timingEvidence: f.timingEvidence,
    readTimingCommentBody: async () => ({ status: 'ok', body: f.timingBody }),
    postTimingEvent: async () => {
      throw new Error('duplicate timing publication');
    },
  });
  assert.equal(result.status, 'present');
  assert.equal(result.completionVerified, false);
});

test('provisional completion preserves measured work and independent Unknown idle', () => {
  assert.equal(typeof api.timingAuthority, 'function', 'timing authority contract is missing');
  const events = [
    {
      eventId: 'evt-1',
      actorId: 'author-A',
      transitionId: 'move:00000000-0000-4000-8000-000000000001',
      timestamp: '2026-10-19T12:00:00.000Z',
      event: 'refine:completed',
      activeSeconds: 30,
      idleSeconds: null,
      sourceCursor: 'native-1',
    },
  ];
  const result = api.timingAuthority({ events, receipts: [], legacyEvidence: [] });
  assert.deepEqual(result.completedVisits, []);
  assert.equal(result.measuredActiveSeconds, 30);
  assert.equal(result.unknownActive, false);
  assert.equal(result.measuredIdleSeconds, 0);
  assert.equal(result.unknownIdle, true);
  assert.equal(events[0].idleSeconds, null);
});

nativeTest(
  'a second published timing pair remains provisional without erasing the first receipt',
  async (t) => {
    const first = await completedTimingAuthority(t);
    const f = await appendProvisionalTransition(first);
    const current = f.generation.generation.baseSnapshot.resources[f.receipt.timing.key];
    assert.notEqual(current.digest, f.receipt.timing.resourceDigest);
    const result = api.timingAuthority({ events: f.events, receipts: [f.bundle] });
    assert.deepEqual(result.completedVisits, [first.receipt.transition]);
    assert.equal(result.measuredActiveSeconds, 1.5);
    assert.equal(result.unknownIdle, true);
  }
);

nativeTest(
  'consecutive completed transitions and demotion reentry retain each historical visit',
  async (t) => {
    const first = await completedTimingAuthority(t);
    const second = await completeNextTimingAuthority(first, { to: 'test' });
    const third = await completeNextTimingAuthority(second, { to: 'develop', visit: 2 });
    const receipts = [third, second, first].map((f) => ({
      ...f.bundle,
      generation: third.generation,
    }));
    const result = api.timingAuthority({ events: third.events, receipts });
    assert.deepEqual(result.completedVisits, [
      first.receipt.transition,
      second.receipt.transition,
      third.receipt.transition,
    ]);
    assert.equal(result.measuredActiveSeconds, 2.75);
    assert.equal(result.unknownIdle, true);
  }
);

nativeTest(
  'raw copied receipts and duplicate witnesses cannot manufacture completion',
  async (t) => {
    const f = await completedTimingAuthority(t);
    for (const receipts of [[f.receipt], [f.bundle, f.bundle]]) {
      const result = api.timingAuthority({ events: f.events, receipts });
      assert.deepEqual(result.completedVisits, []);
      assert.equal(result.measuredActiveSeconds, 0.25);
      assert.equal(result.unknownIdle, true);
      assert.ok(result.completionFailures.length > 0);
    }
  }
);

nativeTest(
  'a receipt remaining only in working content cannot complete a published visit',
  async (t) => {
    const f = await completedTimingAuthority(t);
    const result = api.timingAuthority({
      events: f.events,
      receipts: [await unpublishCompletion(f)],
    });
    assert.deepEqual(result.completedVisits, []);
    assert.match(result.completionFailures[0].reason, /not-published/);
    assert.equal(result.measuredActiveSeconds, 0.25);
  }
);

nativeTest(
  'changed or removed receipt event subsets reject completion while retaining actual work',
  async (t) => {
    const f = await completedTimingAuthority(t);
    const altered = f.events.map((e) => (e.activeSeconds ? { ...e, activeSeconds: 1.25 } : e));
    for (const events of [altered, f.events.filter((e) => e.activeSeconds === 0)]) {
      const result = api.timingAuthority({ events, receipts: [f.bundle] });
      assert.deepEqual(result.completedVisits, []);
      assert.equal(result.measuredActiveSeconds, events === altered ? 1.25 : 0);
      assert.ok(result.completionFailures.length > 0);
    }
  }
);

test('native event IDs are idempotent and historical actors retain independent Unknown components', () => {
  const first = {
    eventId: 'one',
    actorId: 'historical-A',
    transitionId: null,
    timestamp: '2026-10-19T12:00:00.000Z',
    event: 'paused',
    activeSeconds: 1.25,
    idleSeconds: null,
    sourceCursor: 'one',
  };
  const second = {
    ...first,
    eventId: 'two',
    actorId: 'historical-B',
    sourceCursor: 'two',
    activeSeconds: null,
    idleSeconds: 2.5,
  };
  const result = api.timingAuthority({ events: [first, second, { ...first }] });
  assert.equal(result.measuredActiveSeconds, 1.25);
  assert.equal(result.measuredIdleSeconds, 2.5);
  assert.equal(result.unknownActive, true);
  assert.equal(result.unknownIdle, true);
  assert.equal(first.actorId, 'historical-A');
  assert.throws(() => api.timingAuthority({ events: [first, { ...first, activeSeconds: 2 }] }), {
    code: 'STORY_TIMING_EVENT_CONFLICT',
  });
});

nativeTest(
  'an actually published native receipt completes its exact visit without rounding work',
  async (t) => {
    const f = await completedTimingAuthority(t);
    const result = api.timingAuthority({
      events: f.events,
      receipts: [f.bundle],
      legacyEvidence: [],
    });
    assert.deepEqual(result.completedVisits, [f.receipt.transition]);
    assert.equal(result.measuredActiveSeconds, 0.25);
    assert.equal(result.unknownIdle, true);
  }
);

nativeTest(
  'invalid legacy timestamps do not shift completion onto a different stage visit',
  async (t) => {
    const f = await completedTimingAuthority(t);
    const body =
      '<!-- aitm-entered-backlog ts="invalid" -->\n' +
      '<!-- aitm-entered-plan ts="2026-10-19T00:00:00Z" -->\n' +
      `<!-- aitm-entered-develop ts="2026-10-19T01:00:00Z" move="${f.receipt.transition.id}" -->`;
    const result = computeStageDurations(body, {
      timingEvidence: { events: f.events, receipts: [f.bundle] },
    });
    assert.equal(result.visits.find((visit) => visit.stage === 'plan').completionVerified, true);
    assert.equal(result.visits.at(-1).completionVerified, false);
  }
);
