// @story #1838
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  row,
  input,
  options,
  declaration,
  participant,
  context,
} from '../../../helpers/graphql-usage/report-fixture.mjs';
const api = await import('../../../../task-tracker/lib/graphql-usage/report.mjs').catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
function report(data, opts = {}) {
  assert.equal(typeof api.aggregateUsage, 'function', 'offline aggregation must exist');
  return api.aggregateUsage(data, { ...options, ...opts });
}

test('UTC half-open intervals and hourly/day buckets exclude the end boundary', () => {
  const r = report(
    input([
      row('before', '2026-09-27T23:59:59.999Z'),
      row('zero'),
      row('hour', '2026-09-28T01:00:00.000Z'),
      row('end', options.endedAt),
    ])
  );
  assert.equal(r.totals.observations, 2);
  assert.deepEqual(
    r.hourly.map((b) => [b.startedAt, b.counts.observations]),
    [
      ['2026-09-28T00:00:00.000Z', 1],
      ['2026-09-28T01:00:00.000Z', 1],
    ]
  );
  assert.equal(r.daily[0].counts.observations, 2);
});

test('rolling peaks exclude exactly sixty minutes earlier and keep simultaneous starts together', () => {
  const r = report(
    input([
      row('a'),
      row('b', '2026-09-28T00:59:59.999Z'),
      row('c', '2026-09-28T01:00:00.000Z'),
      row('d', '2026-09-28T01:00:00.000Z'),
    ])
  );
  assert.equal(r.peaks.httpAttempts.observations, 3);
  assert.equal(r.peaks.knownPoints.knownPointSubtotal, 3);
});

test('local labels retain offsets through repeated daylight-saving hours', () => {
  const r = report(
    input([row('a', '2026-11-01T05:00:00.000Z'), row('b', '2026-11-01T06:00:00.000Z')]),
    {
      startedAt: '2026-11-01T00:00:00.000Z',
      endedAt: '2026-11-02T00:00:00.000Z',
      timeZone: 'America/New_York',
    }
  );
  assert.match(r.hourly[0].label, /01:00.*-04:00/);
  assert.match(r.hourly[1].label, /01:00.*-05:00/);
});

test('distributions separate known costs, HTTP latency and opaque invocation duration', () => {
  const r = report(
    input([
      row('a', undefined, { pointCost: 2, durationMs: 10 }),
      row('b', undefined, {
        pointCost: null,
        costSource: null,
        costUnknownReason: 'no-same-response-cost',
        costCoverage: 'unknown',
        durationMs: 30,
      }),
      row('c', undefined, {
        observationKind: 'opaque-cli-invocation',
        httpStatus: null,
        hiddenRequestCount: null,
        costCoverage: 'visible-response-only',
        pointCost: 8,
        durationMs: 100,
      }),
    ])
  );
  const op = r.breakdowns.operation.GetIssue;
  assert.deepEqual(op.distributions.pointCost, { samples: 2, mean: 5, median: 5, p95: 8 });
  assert.deepEqual(op.distributions.httpLatencyMs, { samples: 2, mean: 20, median: 20, p95: 30 });
  assert.equal(op.distributions.cliLatencyMs.samples, 1);
  assert.equal(op.distributions.cliLatencyMs.mean, 100);
  assert.equal(op.counts.knownPointSubtotal, 10);
  assert.equal(op.counts.unknownCostObservations, 1);
  assert.equal(op.counts.incompleteCostObservations, 2);
});

test('dispatch, failures, retries and attributed breakdowns never turn opaque volume into HTTP volume', () => {
  const r = report(
    input([
      row('a', undefined, { logicalOperationId: 'retry' }),
      row('b', undefined, { logicalOperationId: 'retry', outcome: 'failure' }),
      row('c', undefined, {
        dispatchStatus: 'unknown',
        pointCost: null,
        costSource: null,
        costUnknownReason: 'ambiguous-dispatch',
        costCoverage: 'unknown',
      }),
      row('d', undefined, {
        dispatchStatus: 'not-sent',
        pointCost: null,
        costSource: null,
        costUnknownReason: 'not-dispatched',
        costCoverage: 'unknown',
      }),
      row('e', undefined, {
        observationKind: 'opaque-cli-invocation',
        httpStatus: null,
        hiddenRequestCount: null,
        pointCost: null,
        costSource: null,
        costUnknownReason: 'opaque-cli',
        costCoverage: 'unknown',
      }),
    ])
  );
  assert.equal(r.totals.httpAttempts, 2);
  assert.equal(r.totals.httpUnknownDispatch, 1);
  assert.equal(r.totals.httpNotSent, 1);
  assert.equal(r.totals.opaqueInvocations, 1);
  assert.equal(r.totals.failures, 1);
  assert.equal(r.totals.retries, 1);
  assert.equal(r.breakdowns.issue['1836'].counts.observations, 5);
  assert.equal(r.breakdowns.stage.develop.counts.observations, 5);
});

test('budget contexts preserve headers by host/scope and disclose shim-only transport unavailability', () => {
  const headers = { limit: 5000, remaining: 4998, used: 2, reset: 1790553600, resource: 'graphql' };
  const r = report(
    input([
      row('a', undefined, {
        rateLimit: headers,
        rateLimitUnavailableReason: null,
        budgetScopeId: 'scope-a',
      }),
      row('b', undefined, {
        endpointHost: 'enterprise.example',
        budgetScopeId: 'scope-a',
        rateLimit: headers,
        rateLimitUnavailableReason: null,
      }),
      row('c', undefined, { rateLimitUnavailableReason: 'transport-unavailable' }),
    ])
  );
  assert.equal(r.budgets.length, 3);
  assert.deepEqual(
    r.budgets.find((b) => b.endpointHost === 'api.github.com' && b.budgetScopeId === 'scope-a')
      .samples[0].rateLimit,
    headers
  );
  assert.equal(
    r.budgets.find((b) => b.budgetScopeId === null).unavailable['transport-unavailable'],
    1
  );
});

test('foreign roots are excluded and root/participant/mixed-version diagnostics remain visible', () => {
  const r = report(
    input(
      [
        row('a'),
        row('foreign', undefined, { commonRootId: 'other' }),
        row('new', undefined, { collectorVersion: 'v2' }),
      ],
      {
        participants: [
          participant(),
          participant({ commonRootId: 'other' }),
          participant({ worktreeId: 'denied', outcome: 'denied', reasonCode: 'permission-denied' }),
        ],
        malformedLineCount: 2,
        unsupportedVersionCount: 1,
        partialLineCount: 1,
        duplicateCount: 1,
        conflictCount: 1,
      }
    )
  );
  assert.equal(r.totals.observations, 2);
  assert.equal(r.coverage.rootMismatchObservations, 1);
  assert.equal(r.coverage.outOfRootParticipants, 1);
  assert.equal(r.coverage.deniedParticipants, 1);
  assert.equal(r.coverage.mixedCollectorVersions, true);
  assert.equal(r.coverage.malformedLines, 2);
  assert.equal(r.coverage.unsupportedVersions, 1);
  assert.equal(r.coverage.partialLines, 1);
  assert.equal(r.coverage.conflictingDuplicates, 1);
  assert.equal(r.coverage.fleetCompleteness, 'lower-bound');
});

test('complete predeclared point groups pass while absence or late declaration stays preliminary', () => {
  const r = report(input([row('a')]), { declaration: declaration() });
  assert.equal(r.comparisons[0].status, 'complete-point-ranking');
  assert.equal(r.comparisons[0].denominator, 1);
  assert.equal(report(input([row('a')])).comparisons.length, 0);
  assert.equal(
    report(input([]), { declaration: declaration() }).comparisons[0].status,
    'preliminary'
  );
  assert.throws(
    () =>
      report(input([row('a')]), {
        declaration: declaration({ declaredAt: '2026-09-28T00:00:00.001Z' }),
      }),
    /predeclared/
  );
});

for (const [name, patch] of [
  [
    'denied participant',
    { participants: [participant({ outcome: 'denied', reasonCode: 'permission-denied' })] },
  ],
  ['unknown enrollment', { participants: [participant({ outcome: 'unknown' })] }],
  ['missing manifest', { participants: [] }],
  [
    'storage gap',
    {
      diagnostics: [
        {
          schemaVersion: 'aitm.graphql-usage.diagnostic/v1',
          occurredAt: options.startedAt,
          code: 'storage-failure',
          count: 1,
          commonRootId: 'root-a',
          worktreeId: context.worktreeId,
          sessionId: context.sessionId,
        },
      ],
    },
  ],
  ['active or unclean writer', { unclosedWriterCount: 1 }],
])
  test(`all recorded costs known cannot certify point ranking with ${name}`, () => {
    const r = report(input([row('a')], patch), { declaration: declaration() });
    assert.equal(r.comparisons[0].status, 'preliminary');
    assert.equal(r.comparisons[0].pointSufficient, false);
  });

test('uncovered relevant path and visible-response-only opaque costs cannot produce complete totals', () => {
  const d = declaration();
  d.inventory[0].coverage = 'uncovered';
  assert.equal(report(input([row('a')]), { declaration: d }).comparisons[0].status, 'preliminary');
  const opaque = row('o', undefined, {
    observationKind: 'opaque-cli-invocation',
    httpStatus: null,
    hiddenRequestCount: null,
    costCoverage: 'visible-response-only',
  });
  const o = declaration();
  o.groups[0].observationKind = 'opaque-cli-invocation';
  o.groups[0].signal = 'opaque-invocation-volume';
  const r = report(input([opaque]), { declaration: o });
  assert.equal(r.comparisons[0].status, 'volume-ranking');
  assert.equal(r.comparisons[0].pointSufficient, false);
});

test('mutation candidates use predeclared comparable volume with explicit insufficient point finding', () => {
  const mutation = row('m', undefined, {
    kind: 'mutation',
    pointCost: null,
    costSource: null,
    costUnknownReason: 'mutation-cost-unavailable',
    costCoverage: 'unknown',
  });
  const d = declaration();
  d.groups[0].signal = 'http-attempt-volume';
  const r = report(input([mutation]), { declaration: d });
  assert.equal(r.comparisons[0].status, 'volume-ranking');
  assert.equal(r.comparisons[0].pointSufficient, false);
  assert.match(r.comparisons[0].pointFinding, /insufficient/);
});

test('unknown participant outside declared sample is disclosed without manufacturing fleet completeness', () => {
  const r = report(
    input([row('a')], {
      participants: [
        participant(),
        participant({
          worktreeId: 'excluded',
          sessionId: 'sha256:' + 'b'.repeat(64),
          outcome: 'denied',
          reasonCode: 'permission-denied',
        }),
      ],
    }),
    { declaration: declaration() }
  );
  assert.equal(r.comparisons[0].status, 'complete-point-ranking');
  assert.equal(r.coverage.fleetCompleteness, 'lower-bound');
  assert.equal(r.comparisons[0].scope, 'predeclared-participant-sample');
});

test('every declared candidate needs observations and inventory before any ranking', () => {
  const d = declaration();
  d.groups[0].operations.push('MissingCandidate');
  assert.equal(report(input([row('a')]), { declaration: d }).comparisons[0].status, 'preliminary');
  const missing = declaration();
  missing.inventory = [];
  assert.equal(
    report(input([row('a')]), { declaration: missing }).comparisons[0].status,
    'preliminary'
  );
});

test('unknown attribution and mixed collector versions block comparable rankings', () => {
  for (const unknown of [
    row('unknown', undefined, { sessionId: null, sessionSource: 'unknown' }),
    row('unknown', undefined, { operation: null }),
  ]) {
    assert.equal(
      report(input([row('a'), unknown]), { declaration: declaration() }).comparisons[0].status,
      'preliminary'
    );
  }
  assert.equal(
    report(input([row('a'), row('new', undefined, { collectorVersion: 'v2' })]), {
      declaration: declaration(),
    }).comparisons[0].status,
    'preliminary'
  );
});

test('declaration cannot change root or interval, mix volume kinds, or repeat a candidate group', () => {
  for (const d of [
    declaration({ commonRootId: 'foreign' }),
    declaration({ endedAt: '2026-09-30T00:00:00.000Z' }),
    declaration({ groups: [{ ...declaration().groups[0], signal: 'opaque-invocation-volume' }] }),
    declaration({ groups: [declaration().groups[0], declaration().groups[0]] }),
  ]) {
    assert.throws(() => report(input([row('a')]), { declaration: d }), /declaration/);
  }
});

test('retries crossing buckets retain attribution and separate page advances', () => {
  const r = report(
    input([
      row('first', '2026-09-28T00:59:00.000Z', { logicalOperationId: 'logical', pageIndex: 0 }),
      row('retry', '2026-09-28T01:00:00.000Z', { logicalOperationId: 'logical', pageIndex: 0 }),
      row('next-page', '2026-09-28T01:01:00.000Z', { logicalOperationId: 'logical', pageIndex: 1 }),
    ])
  );
  assert.equal(r.totals.retries, 1);
  assert.equal(r.hourly[1].counts.retries, 1);
  assert.equal(r.breakdowns.operation.GetIssue.counts.retries, 1);
});

test('raw invalid observations cannot manufacture finite cost distributions', () => {
  const r = report(
    input([
      row('good'),
      row('bad', undefined, { pointCost: -1 }),
      row('nan', undefined, { durationMs: NaN }),
    ])
  );
  assert.equal(r.totals.observations, 1);
  assert.equal(r.coverage.malformedLines, 2);
  assert.equal(r.distributions.pointCost.samples, 1);
});

test('missing issue or stage attribution prevents ranking despite complete known costs', () => {
  for (const patch of [
    { issueNumber: null },
    { lifecycleState: 'unknown', stateSource: 'unknown' },
  ]) {
    assert.equal(
      report(input([row('a', undefined, patch)]), { declaration: declaration() }).comparisons[0]
        .status,
      'preliminary'
    );
  }
});

test('unreadable source files invalidate a historical comparison even when the read failure is observed later', () => {
  const data = input([row('a')], {
    unreadableFileCount: 1,
    diagnostics: [
      {
        schemaVersion: 'aitm.graphql-usage.diagnostic/v1',
        occurredAt: '2026-10-05T00:00:00.000Z',
        code: 'storage-failure',
        count: 1,
        commonRootId: null,
        worktreeId: null,
        sessionId: null,
      },
    ],
  });
  const r = report(data, { declaration: declaration() });
  assert.equal(r.coverage.unreadableFiles, 1);
  assert.equal(r.comparisons[0].status, 'preliminary');
});
