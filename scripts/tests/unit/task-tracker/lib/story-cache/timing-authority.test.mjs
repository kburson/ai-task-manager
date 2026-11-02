// @story #2070
import { registerTimingAuthorityProofCases } from '../../../../helpers/story-timing-authority-proof-cases.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  rollupTotals,
  pendingClosePairState,
  buildStructuredTimingProjection,
  computeStageDurations,
} from '../../../../../task-tracker/timing-rollup.mjs';
import {
  deriveLadder,
  parseTimingRows as parseLadderRows,
} from '../../../../../task-tracker/lib/timing-ladder.mjs';
import { bucketRowsByDay, renderDailyChart } from '../../../../../reports/lib/daily-activity.mjs';
import { renderTimingEventBatch } from '../../../../../task-tracker/gh-timing-comment.mjs';
import { timingActorKey } from '../../../../../task-tracker/lib/timing-actor.mjs';
import { reconcileReviewApprovedTiming } from '../../../../../task-tracker/lib/review-approval-timing.mjs';
import {
  completedTimingAuthority,
  appendProvisionalTransition,
  appendUnpublishedWork,
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
  'first native publication and append preserve independent measured history exactly once',
  async (t) => {
    const timingBody =
      '⏱ Timing Log\n\n| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |\n|---|---|---|---|---|---|---|---|\n| 2026-10-17 01:00:00 +00:00 | refine:started | 0 | 0 | | | historical actor | | <!-- row-sec: a=0 i=0 -->\n| 2026-10-17 01:01:00 +00:00 | refine:completed | 1 | 0 | | | historical actor | | <!-- row-sec: a=60 i=0 -->\n';
    assert.equal(buildStructuredTimingProjection({ timingBody }).totals.totalActiveSec, 60);
    const first = await completedTimingAuthority(t, { timingBody });
    const pending = await appendUnpublishedWork(first);
    for (const f of [first, pending, await appendProvisionalTransition(pending)]) {
      const ref = f.generation.generation.baseSnapshot.resources[f.receipt.timing.key];
      const body = Buffer.from(f.generation.payloads.get(ref.payloadPath)).toString('utf8');
      const timingEvidence = { events: f.events, receipts: [f.bundle], timingBody: body };
      const nativeSeconds = f.events.reduce((n, row) => n + (row.activeSeconds ?? 0), 0);
      const totals = rollupTotals([], 5, body, { timingEvidence });
      assert.equal(totals.knownEngagedSec, 60 + nativeSeconds);
      assert.equal(totals.totalActiveSec, null);
      const projection = buildStructuredTimingProjection({ timingBody: body, timingEvidence });
      assert.ok(
        projection.rows.some(
          (row) =>
            row.source === 'legacy' && row.event === 'refine:completed' && row.activeSec === 60
        )
      );
      const ladder = deriveLadder(parseLadderRows(body), { timingEvidence });
      assert.equal(ladder.totals.knownActiveSec, 60 + nativeSeconds);
      assert.ok(ladder.rows.some((row) => row.source === 'legacy' && !row.eventId && !row.actorId));
      const days = bucketRowsByDay([{ number: 2070, body, timingEvidence }]);
      assert.equal(
        days.find(
          (day) => day.date === new Date('2026-10-17T01:00:00Z').toLocaleDateString('en-CA')
        ).knownDurationSec,
        60
      );
      assert.equal(
        days.reduce((n, day) => n + (day.knownDurationSec ?? day.durationSec), 0),
        60 + nativeSeconds
      );
    }
  }
);

nativeTest(
  'mixed publication preserves historical actor keys without inventing modern event identities',
  async (t) => {
    const actorId = timingActorKey({ provider: 'codex', sid: 'pre-native-historical' });
    const base = { ...provisional().events[0], actorId, transitionId: null, idleSeconds: 0 };
    const timingBody = renderTimingEventBatch({
      timingBody: '',
      events: [
        {
          ...base,
          eventId: 'old-start',
          event: 'resumed',
          timestamp: '2026-10-17T10:00:00Z',
          activeSeconds: 0,
          sourceCursor: 'old-start',
        },
        {
          ...base,
          eventId: 'old-stop',
          event: 'paused',
          timestamp: '2026-10-17T10:00:02Z',
          activeSeconds: 2,
          sourceCursor: 'old-stop',
        },
      ],
    });
    const f = await completedTimingAuthority(t, { timingBody });
    const ref = f.generation.generation.baseSnapshot.resources[f.receipt.timing.key];
    const body = Buffer.from(f.generation.payloads.get(ref.payloadPath)).toString('utf8');
    const timingEvidence = { events: f.events, receipts: [f.bundle], timingBody: body };
    const result = buildStructuredTimingProjection({ timingBody: body, timingEvidence });
    const historical = result.rows.filter((row) => row.source === 'legacy');
    assert.equal(historical.length, 2);
    assert.ok(
      historical.every(
        (row) => row.actorKey === actorId && row.eventId === undefined && row.actorId === undefined
      )
    );
    assert.ok(
      deriveLadder(parseLadderRows(body), { timingEvidence }).rows.some(
        (row) => row.source === 'legacy' && row.actorKey === actorId && !row.lifecycleCompleted
      )
    );
  }
);

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
  'fenced-comment': { fencedComment: true },
  'fenced-visit': { fencedVisit: true },
  'inline-comment': { inlineComment: true },
  'inline-visit': { inlineVisit: true },
  'example-prose': { exampleProse: true },
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

nativeTest('quoted legacy examples do not invalidate genuine standalone proof', async (t) => {
  const f = await legacyTimingAuthority(t, { quotedDuplicate: true });
  assert.equal(
    api.timingAuthority({ ...provisional(), legacyEvidence: [f] }).completedVisits.length,
    1
  );
});

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

test('known work without an observed phase cannot imply zero Plan work', () => {
  const source = provisional();
  source.events[0].event = 'paused';
  const totals = rollupTotals([], 5, '', { timingEvidence: source });
  assert.equal(totals.totalActiveSec, 30.25);
  assert.equal(totals.planMin, null);
});

test('a handoff advances shared story phase while preserving each historical actor', () => {
  const base = { ...provisional().events[0], activeSeconds: 0, idleSeconds: 0 };
  const event = (eventId, actorId, ts, event, activeSeconds = 0) => ({
    ...base,
    eventId,
    actorId,
    timestamp: `2026-10-19T12:00:0${ts}.000Z`,
    event,
    activeSeconds,
    sourceCursor: eventId,
  });
  const events = [
    event('start', 'A', 0, 'plan:started'),
    event('exit', 'B', 1, 'plan:completed', 1),
    event('entry', 'B', 1, 'develop:started'),
    event('work', 'A', 2, 'paused', 0.5),
    event('new', 'C', 3, 'paused', 0.25),
  ];
  const result = deriveLadder([], { timingEvidence: { events } });
  assert.equal(result.rows.find((row) => row.eventId === 'work').state, 'develop');
  assert.equal(result.rows.at(-1).state, 'develop');
  assert.equal(result.rows.find((row) => row.eventId === 'work').actorId, 'A');
  assert.equal(rollupTotals([], 5, '', { timingEvidence: { events } }).planMin, 1 / 60);
});

test('daily Unknown aggregation never attributes work to a different zero-duration issue', () => {
  const unknown = { number: 1, timingEvidence: provisional() };
  const zero = {
    number: 2,
    timingEvidence: { events: [{ ...provisional().events[0], activeSeconds: 0, idleSeconds: 0 }] },
  };
  const forward = bucketRowsByDay([unknown, zero]);
  assert.deepEqual(forward, bucketRowsByDay([zero, unknown]));
  assert.equal(forward[0].issueCount, 1);
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

function provisionalClose(timestamp = '2026-10-19T12:00:00.000Z') {
  const source = { ...provisional().events[0], timestamp };
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

test('fractional native timestamps retain canonical close-pair row presence', () => {
  const f = provisionalClose('2026-10-19T12:00:00.125Z');
  const state = pendingClosePairState(f.timingBody, { timingEvidence: f.timingEvidence });
  assert.equal(state.reviewApproved, true);
  assert.equal(state.issueWrap, true);
  assert.equal(state.completionVerified, false);
});

test('an ordinary already-posted current approval is present before a close pair exists', async () => {
  const base = { ...provisional().events[0], activeSeconds: 0, idleSeconds: 0 };
  const entered = {
    ...base,
    eventId: 'review-enter',
    transitionId: 'move:review-enter',
    event: 'review:started',
    sourceCursor: 'review-enter',
  };
  const approved = {
    ...base,
    eventId: 'ordinary-approval',
    transitionId: null,
    event: 'review:approved',
    timestamp: '2026-10-19T12:01:00.000Z',
    sourceCursor: 'ordinary-approval',
  };
  const body = renderTimingEventBatch({ timingBody: '', events: [entered, approved] });
  const result = await reconcileReviewApprovedTiming({
    issueNumber: 2070,
    repo: 'owner/repo',
    issueBody:
      '<!-- aitm-entered-review ts="2026-10-19T12:00:00Z" move="move:review-enter" -->\n<!-- aitm-review-approved ts="2026-10-19T12:01:00Z" -->',
    timingEvidence: { events: [entered] },
    readTimingCommentBody: async () => ({ status: 'ok', body }),
    postTimingEvent: async () => {
      throw new Error('duplicate current approval');
    },
  });
  assert.equal(result.status, 'present');
  assert.equal(result.completionVerified, false);
});

for (const withOldRow of [true, false]) {
  test(`an earlier-visit approval cannot authorize a post after reentry ${withOldRow ? 'with' : 'without'} its old row`, async () => {
    const base = { ...provisional().events[0], activeSeconds: 0, idleSeconds: 0 };
    const entry = (id, event, timestamp) => ({
      ...base,
      eventId: id,
      transitionId: 'move:' + id,
      event,
      timestamp,
      sourceCursor: id,
    });
    const first = entry('review-1', 'review:started', '2026-10-19T12:00:00Z');
    const oldApproval = {
      ...entry('old-approval', 'review:approved', '2026-10-19T12:01:00Z'),
      transitionId: null,
    };
    const demoted = entry('demoted', 'develop:started', '2026-10-19T12:02:00Z');
    const current = entry('review-2', 'review:started', '2026-10-19T12:03:00Z');
    const body = renderTimingEventBatch({
      timingBody: '',
      events: [first, ...(withOldRow ? [oldApproval] : []), demoted, current],
    });
    const issueBody =
      '<!-- aitm-entered-review ts="2026-10-19T12:00:00Z" move="move:review-1" -->\n<!-- aitm-review-approved ts="2026-10-19T12:01:00Z" -->\n<!-- aitm-entered-develop-2 ts="2026-10-19T12:02:00Z" move="move:demoted" -->\n<!-- aitm-entered-review-2 ts="2026-10-19T12:03:00Z" move="move:review-2" -->';
    const timingEvidence = { events: [first, demoted, current] };
    let posts = 0;
    const result = await reconcileReviewApprovedTiming({
      issueNumber: 2070,
      repo: 'owner/repo',
      issueBody,
      timingEvidence,
      readTimingCommentBody: async () => ({ status: 'ok', body }),
      postTimingEvent: async () => {
        posts++;
      },
    });
    assert.equal(posts, 0);
    assert.equal(result.status, 'unavailable');
    const state = pendingClosePairState(body, {
      timingEvidence,
      issueBody,
      approvalTs: '2026-10-19T12:01:00Z',
    });
    assert.equal(state.reviewApproved, false);
    assert.equal(state.completionVerified, false);
    assert.equal(state.presenceUnavailable, true);
  });
}

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

test('a prior approval cannot suppress publication for a new Review visit', async () => {
  const f = provisionalClose();
  const entered = {
    ...f.timingEvidence.events[1],
    eventId: 'review-2',
    transitionId: 'move:review-2',
    event: 'review:started',
    timestamp: '2026-10-19T12:01:00.000Z',
    sourceCursor: 'review-2',
  };
  const calls = [];
  const result = await reconcileReviewApprovedTiming({
    issueNumber: 2070,
    repo: 'owner/repo',
    issueBody:
      '<!-- aitm-entered-review-2 ts="2026-10-19T12:01:00Z" move="move:review-2" -->\n<!-- aitm-review-approved ts="2026-10-19T12:02:00Z" -->',
    timingEvidence: { ...f.timingEvidence, events: [...f.timingEvidence.events, entered] },
    readTimingCommentBody: async () => ({
      status: 'ok',
      body: renderTimingEventBatch({ timingBody: f.timingBody, events: [entered] }),
    }),
    postTimingEvent: async (...args) => calls.push(args),
  });
  assert.equal(result.status, 'posted');
  assert.equal(calls.length, 1);
});

nativeTest('an old completed close cannot verify a later reopened Review visit', async (t) => {
  let f = await completedTimingAuthority(t);
  for (const to of ['test', 'review', 'done']) f = await completeNextTimingAuthority(f, { to });
  const ref = f.generation.generation.baseSnapshot.resources[f.receipt.timing.key];
  const body = Buffer.from(f.generation.payloads.get(ref.payloadPath)).toString('utf8');
  const current = pendingClosePairState(body, {
    timingEvidence: { events: f.events, receipts: [f.bundle] },
    approvalTs: new Date(Date.parse(f.events.at(-1).timestamp) - 30000).toISOString(),
  });
  assert.equal(current.reviewApproved, true);
  assert.equal(current.issueWrap, true);
  assert.equal(current.completionVerified, true);
  const entered = {
    ...f.events.at(-1),
    eventId: 'reopen',
    transitionId: 'move:reopen',
    event: 'review:started',
    timestamp: new Date(Date.parse(f.events.at(-1).timestamp) + 60000).toISOString(),
    activeSeconds: 0,
    idleSeconds: 0,
    sourceCursor: 'reopen',
  };
  const result = pendingClosePairState(body, {
    timingEvidence: { events: [...f.events, entered], receipts: [f.bundle] },
  });
  assert.equal(result.reviewApproved, false);
  assert.equal(result.issueWrap, false);
  assert.equal(result.completionVerified, false);
});

nativeTest(
  'a current authenticated legacy close is recognized without minting native event IDs',
  async (t) => {
    const f = await legacyTimingAuthority(t, { close: true });
    const ref =
      f.generation.generation.baseSnapshot.resources[
        'issue:' + f.generation.generation.identity.issueNodeId
      ];
    const issueBody = Buffer.from(f.generation.payloads.get(ref.payloadPath)).toString('utf8');
    const body =
      '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |\n|---|---|---|---|---|---|---|---|\n| 2026-10-19 12:00:00 +00:00 | review:approved | 0 | 0 | | | | |\n| 2026-10-19 12:00:00 +00:00 | issue:wrap | 0 | 0 | | | | |';
    const timingEvidence = { events: [], legacyEvidence: [f] };
    const current = pendingClosePairState(body, { timingEvidence, issueBody });
    assert.equal(current.completionVerified, true, JSON.stringify(current));
    const terminalBody =
      body.split('\n').slice(0, 2).join('\n') +
      '\n| 2026-10-19 12:00:00 +00:00 | issue:closed | 0 | 0 | | | | |';
    const sealed = pendingClosePairState(terminalBody, { timingEvidence, issueBody });
    assert.equal(sealed.reviewApproved, true);
    assert.equal(sealed.issueWrap, true);
    assert.equal(sealed.completionVerified, true);
    assert.equal(
      pendingClosePairState(body, {
        timingEvidence,
        issueBody:
          issueBody +
          '\n<!-- aitm-entered-review-2 ts="2026-10-19T12:01:00Z" move="move:reopen" -->',
      }).completionVerified,
      false
    );
    assert.deepEqual(api.timingAuthority(timingEvidence).completedEventIds, []);
  }
);

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

registerTimingAuthorityProofCases(api, provisional);

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

nativeTest('inline entry examples cannot close an observed stage visit', async (t) => {
  const f = await completedTimingAuthority(t);
  const body =
    '<!-- aitm-entered-plan ts="2026-10-19T00:00:00Z" -->\nDocumentation only: `' +
    `<!-- aitm-entered-develop ts="2026-10-19T01:00:00Z" move="${f.receipt.transition.id}" -->` +
    '`';
  const result = computeStageDurations(body, {
    timingEvidence: { events: f.events, receipts: [f.bundle] },
  });
  assert.equal(result.visits.length, 1);
  assert.equal(result.visits[0].completionVerified, false);
});
