// @story #1835
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as usage from '../../../../task-tracker/lib/graphql-usage/index.mjs';

test('redacts literals and classifies operations', () => {
  const first = usage.identifyGraphqlOperation(
    'query GetIssue { issue(number: 42) { title } node(id: "SECRET_A") { id } }'
  );
  const second = usage.identifyGraphqlOperation(
    'query GetIssue { issue(number: 99) { title } node(id: "SECRET_B") { id } }'
  );
  assert.equal(first.kind, 'query');
  assert.equal(first.operation, 'GetIssue');
  assert.equal(first.queryFingerprint, second.queryFingerprint);
  assert.equal(JSON.stringify(first).includes('SECRET_A'), false);
});

test('unknown cost is explicit and payload fields are refused', () => {
  const row = {
    schemaVersion: 'aitm.graphql-usage.observation/v1',
    callId: 'c1',
    logicalOperationId: 'l1',
    startedAt: '2026-09-28T00:00:00.000Z',
    endedAt: '2026-09-28T00:00:00.010Z',
    durationMs: 10,
    worktreeId: 'w1',
    sessionId: 'sha256:' + 'a'.repeat(64),
    sessionSource: 'runtime',
    enrollmentId: 'e1',
    commonRootId: 'r1',
    processId: 123,
    repository: 'kburson/ai-task-manager',
    issueNumber: 1835,
    draftId: null,
    lifecycleState: 'develop',
    stateSource: 'local',
    contextScope: 'single-issue',
    collectorLaunchRoute: 'aitm-cli',
    originatingLaunchRoute: null,
    observationKind: 'opaque-cli-invocation',
    dispatchStatus: 'unknown',
    pageIndex: null,
    operation: 'GetProject',
    queryFingerprint: null,
    kind: 'mixed',
    outcome: 'failure',
    httpStatus: null,
    processExitCode: 1,
    errorClass: null,
    pointCost: null,
    costSource: null,
    costUnknownReason: 'opaque-cli',
    costCoverage: 'unknown',
    hiddenRequestCount: null,
    costBasis: 'instrumented-request',
    augmentationVersion: null,
    collectorVersion: 'v1',
    endpointHost: 'api.github.com',
    budgetScopeId: null,
    rateLimit: null,
    rateLimitUnavailableReason: 'transport-unavailable',
  };
  assert.deepEqual(usage.validateObservation(row), row);
  assert.throws(() => usage.validateObservation({ ...row, pointCost: 0 }));
  assert.throws(() => usage.validateObservation({ ...row, responseBody: 'secret' }));
});

test('diagnostic, manifest, and inventory rows reject payloads and raw local paths', async () => {
  const usage = await import('../../../../task-tracker/lib/graphql-usage/index.mjs');
  const diagnostic = {
    schemaVersion: 'aitm.graphql-usage.diagnostic/v1',
    occurredAt: '2026-09-28T00:00:00.000Z',
    code: 'storage-failure',
    count: null,
    commonRootId: null,
    worktreeId: null,
    sessionId: null,
  };
  const manifest = {
    schemaVersion: 'aitm.graphql-usage.manifest/v1',
    commonRootId: 'r1',
    worktreeId: 'w1',
    sessionId: 'sha256:' + 'a'.repeat(64),
    sessionSource: 'runtime',
    enrollmentId: 'e1',
    collectorLaunchRoute: 'aitm-cli',
    originatingLaunchRoute: null,
    outcome: 'enrolled',
    recordedAt: '2026-09-28T00:00:00.000Z',
  };
  const inventory = {
    schemaVersion: 'aitm.graphql-usage.inventory/v1',
    source: 'scripts/gh/lib/github-projects.mjs',
    line: 55,
    classification: 'gh-api-graphql',
    reason: 'explicit GraphQL CLI or shared gql wrapper',
    coverage: 'planned',
  };
  for (const [validate, record] of [
    [usage.validateDiagnostic, diagnostic],
    [usage.validateManifest, manifest],
    [usage.validateInventoryRow, inventory],
  ]) {
    assert.deepEqual(validate(record), record);
    for (const key of [
      'query',
      'variables',
      'responseBody',
      'issueBody',
      'token',
      'secret',
      'exceptionMessage',
    ])
      assert.throws(() => validate({ ...record, [key]: 'sensitive' }));
  }
  assert.throws(() =>
    usage.validateDiagnostic({ ...diagnostic, sessionId: '/Users/private/session' })
  );
  assert.throws(() =>
    usage.validateInventoryRow({ ...inventory, source: '/Users/private/source.mjs' })
  );
});

test('nested payload data and contradictory cost states are rejected', async () => {
  const usage = await import('../../../../task-tracker/lib/graphql-usage/index.mjs');
  const row = {
    schemaVersion: 'aitm.graphql-usage.observation/v1',
    callId: 'c1',
    logicalOperationId: 'l1',
    startedAt: '2026-09-28T00:00:00.000Z',
    endedAt: '2026-09-28T00:00:00.010Z',
    durationMs: 10,
    worktreeId: 'w1',
    sessionId: 'sha256:' + 'a'.repeat(64),
    sessionSource: 'runtime',
    enrollmentId: 'e1',
    commonRootId: 'r1',
    processId: 123,
    repository: 'kburson/ai-task-manager',
    issueNumber: 1835,
    draftId: null,
    lifecycleState: 'develop',
    stateSource: 'local',
    contextScope: 'single-issue',
    collectorLaunchRoute: 'aitm-cli',
    originatingLaunchRoute: null,
    observationKind: 'http-attempt',
    dispatchStatus: 'sent',
    pageIndex: null,
    operation: 'GetProject',
    queryFingerprint: null,
    kind: 'query',
    outcome: 'success',
    httpStatus: 200,
    processExitCode: null,
    errorClass: null,
    pointCost: 2,
    costSource: 'same-response-rate-limit',
    costUnknownReason: null,
    costCoverage: 'complete-observation',
    hiddenRequestCount: 0,
    costBasis: 'instrumented-request',
    augmentationVersion: 'v1',
    collectorVersion: 'v1',
    endpointHost: 'api.github.com',
    budgetScopeId: null,
    rateLimit: { limit: 5000, remaining: 4998, used: 2, reset: 1790553600, resource: 'graphql' },
    rateLimitUnavailableReason: null,
  };
  assert.deepEqual(usage.validateObservation(row), row);
  assert.throws(() =>
    usage.validateObservation({ ...row, rateLimit: { ...row.rateLimit, responseBody: 'secret' } })
  );
  assert.throws(() => usage.validateObservation({ ...row, kind: 'mutation' }));
  assert.throws(() => usage.validateObservation({ ...row, dispatchStatus: 'not-sent' }));
});

test('unsupported subscription and malformed text retain unknown identity', () => {
  assert.equal(
    usage.identifyGraphqlOperation('subscription Events { event { id } }').kind,
    'unknown'
  );
  assert.equal(usage.identifyGraphqlOperation('garbage ???').kind, 'unknown');
  assert.equal(usage.identifyGraphqlOperation('garbage ???').queryFingerprint, null);
});

test('inventory reasons and manifest denials use bounded codes rather than arbitrary prose', async () => {
  const records = await import('../../../../task-tracker/lib/graphql-usage/index.mjs');
  const inventory = {
    schemaVersion: 'aitm.graphql-usage.inventory/v1',
    source: 'scripts/gh/lib/github-projects.mjs',
    line: 55,
    classification: 'gh-api-graphql',
    reason: 'explicit GraphQL CLI or shared gql wrapper',
    coverage: 'planned',
  };
  const manifest = {
    schemaVersion: 'aitm.graphql-usage.manifest/v1',
    commonRootId: 'r1',
    worktreeId: 'w1',
    sessionId: 'sha256:' + 'a'.repeat(64),
    sessionSource: 'runtime',
    enrollmentId: 'e1',
    collectorLaunchRoute: 'aitm-cli',
    originatingLaunchRoute: null,
    outcome: 'denied',
    recordedAt: '2026-09-28T00:00:00.000Z',
    reasonCode: 'permission-denied',
  };
  assert.deepEqual(records.validateManifest(manifest), manifest);
  assert.throws(() => records.validateManifest({ ...manifest, reasonCode: 'raw-exception-text' }));
  assert.throws(() =>
    records.validateInventoryRow({ ...inventory, reason: 'Bearer privateToken' })
  );
});

test('fragment names and malformed delimiters do not masquerade as operations', () => {
  assert.equal(usage.identifyGraphqlOperation('fragment query on Issue { id }').kind, 'unknown');
  assert.equal(usage.identifyGraphqlOperation('query GetIssue( { viewer { id } }').kind, 'unknown');
  const selected = usage.identifyGraphqlOperation(
    'fragment Bits on Issue { id } query GetIssue { viewer { id } }'
  );
  assert.equal(selected.kind, 'query');
  assert.equal(selected.operation, 'GetIssue');
});

test('raw provider session IDs are refused at the record boundary', async () => {
  const records = await import('../../../../task-tracker/lib/graphql-usage/index.mjs');
  const manifest = {
    schemaVersion: 'aitm.graphql-usage.manifest/v1',
    commonRootId: 'r1',
    worktreeId: 'w1',
    sessionId: 'sha256:' + 'a'.repeat(64),
    sessionSource: 'runtime',
    enrollmentId: 'e1',
    collectorLaunchRoute: 'aitm-cli',
    originatingLaunchRoute: null,
    outcome: 'enrolled',
    recordedAt: '2026-09-28T00:00:00.000Z',
  };
  assert.deepEqual(records.validateManifest(manifest), manifest);
  assert.throws(() => records.validateManifest({ ...manifest, sessionId: 'raw-provider-session' }));
});

const reviewedObservation = {
  schemaVersion: 'aitm.graphql-usage.observation/v1',
  callId: 'call-1',
  logicalOperationId: 'logical-1',
  startedAt: '2026-09-28T00:00:00.000Z',
  endedAt: '2026-09-28T00:00:00.010Z',
  durationMs: 10,
  worktreeId: 'w1',
  sessionId: 'sha256:' + 'a'.repeat(64),
  sessionSource: 'runtime',
  enrollmentId: 'e1',
  commonRootId: 'r1',
  processId: 123,
  repository: 'kburson/ai-task-manager',
  issueNumber: 1835,
  draftId: null,
  lifecycleState: 'develop',
  stateSource: 'local',
  contextScope: 'single-issue',
  collectorLaunchRoute: 'aitm-cli',
  originatingLaunchRoute: null,
  observationKind: 'http-attempt',
  dispatchStatus: 'sent',
  pageIndex: null,
  operation: 'GetProject',
  queryFingerprint: null,
  kind: 'query',
  outcome: 'success',
  httpStatus: 200,
  processExitCode: null,
  errorClass: null,
  pointCost: 2,
  costSource: 'same-response-rate-limit',
  costUnknownReason: null,
  costCoverage: 'complete-observation',
  hiddenRequestCount: 0,
  costBasis: 'instrumented-request',
  augmentationVersion: 'v1',
  collectorVersion: 'v1',
  endpointHost: 'api.github.com',
  budgetScopeId: null,
  rateLimit: null,
  rateLimitUnavailableReason: 'transport-unavailable',
};

test('cost coverage matches observation boundary and hidden-attempt knowledge', () => {
  assert.deepEqual(usage.validateObservation(reviewedObservation), reviewedObservation);
  const visible = {
    ...reviewedObservation,
    observationKind: 'opaque-cli-invocation',
    httpStatus: null,
    processExitCode: 0,
    costCoverage: 'visible-response-only',
    hiddenRequestCount: null,
  };
  assert.deepEqual(usage.validateObservation(visible), visible);
  for (const invalid of [
    { ...visible, costCoverage: 'complete-observation' },
    { ...reviewedObservation, hiddenRequestCount: null },
    { ...reviewedObservation, costCoverage: 'unknown' },
    { ...reviewedObservation, costCoverage: 'visible-response-only' },
  ])
    assert.throws(() => usage.validateObservation(invalid));
});

test('inherited route and unavailable budget context are explicit', () => {
  const inherited = {
    ...reviewedObservation,
    collectorLaunchRoute: 'inherited-environment',
    originatingLaunchRoute: 'measurement-launcher',
  };
  assert.deepEqual(usage.validateObservation(inherited), inherited);
  assert.throws(() => usage.validateObservation({ ...inherited, originatingLaunchRoute: null }));
  assert.throws(() =>
    usage.validateObservation({ ...reviewedObservation, rateLimitUnavailableReason: null })
  );
  const withHeaders = {
    ...reviewedObservation,
    rateLimit: { limit: 5000, remaining: 4998, used: 2, reset: 1790553600, resource: 'graphql' },
    rateLimitUnavailableReason: null,
  };
  assert.deepEqual(usage.validateObservation(withHeaders), withHeaders);
});

test('diagnostic classes and root-denial vocabularies are finite', () => {
  const diagnostic = {
    schemaVersion: 'aitm.graphql-usage.diagnostic/v1',
    occurredAt: '2026-09-28T00:00:00.000Z',
    code: 'shared-root-out-of-sandbox-scope',
    count: null,
    commonRootId: null,
    worktreeId: null,
    sessionId: null,
    detailClass: 'filesystem',
  };
  assert.deepEqual(usage.validateDiagnostic(diagnostic), diagnostic);
  assert.throws(() => usage.validateDiagnostic({ ...diagnostic, detailClass: 'privateToken' }));
  for (const code of ['shared-root-access-denied', 'git-root-resolution-failed'])
    assert.deepEqual(usage.validateDiagnostic({ ...diagnostic, code }), { ...diagnostic, code });
  const manifest = {
    schemaVersion: 'aitm.graphql-usage.manifest/v1',
    commonRootId: null,
    worktreeId: 'w1',
    sessionId: null,
    sessionSource: 'unknown',
    enrollmentId: null,
    collectorLaunchRoute: 'inherited-environment',
    originatingLaunchRoute: 'aitm-cli',
    outcome: 'denied',
    recordedAt: '2026-09-28T00:00:00.000Z',
    reasonCode: 'shared-root-access-denied',
  };
  assert.deepEqual(usage.validateManifest(manifest), manifest);
  assert.throws(() => usage.validateManifest({ ...manifest, originatingLaunchRoute: null }));
});

test('retry, page, disabled, unsupported, and ambiguous metadata remain distinguishable', () => {
  const retry = {
    ...reviewedObservation,
    callId: 'call-2',
    outcome: 'failure',
    errorClass: 'graphql-errors',
    pointCost: null,
    costSource: null,
    costUnknownReason: 'response-unavailable',
    costCoverage: 'unknown',
  };
  assert.deepEqual(usage.validateObservation(retry), retry);
  const page = { ...reviewedObservation, callId: 'call-3', pageIndex: 2 };
  assert.deepEqual(usage.validateObservation(page), page);
  assert.equal(retry.logicalOperationId, page.logicalOperationId);
  const ambiguous = {
    ...reviewedObservation,
    observationKind: 'opaque-cli-invocation',
    dispatchStatus: 'unknown',
    kind: 'unknown',
    outcome: 'timeout',
    httpStatus: null,
    processExitCode: null,
    pointCost: null,
    costSource: null,
    costUnknownReason: 'ambiguous-dispatch',
    costCoverage: 'unknown',
    hiddenRequestCount: null,
  };
  assert.deepEqual(usage.validateObservation(ambiguous), ambiguous);
  const disabled = {
    schemaVersion: 'aitm.graphql-usage.diagnostic/v1',
    occurredAt: '2026-09-28T00:00:00.000Z',
    code: 'collection-disabled',
    count: null,
    commonRootId: null,
    worktreeId: null,
    sessionId: null,
  };
  assert.deepEqual(usage.validateDiagnostic(disabled), disabled);
  const unsupported = { ...ambiguous, costUnknownReason: 'unsupported-syntax' };
  assert.deepEqual(usage.validateObservation(unsupported), unsupported);
});

test('enum, boolean, null, list, object, and variable-default values are redacted before hashing', () => {
  const first = usage.identifyGraphqlOperation(
    'query Q($mode: Mode = PRIVATE) { item(status: SECRET_ENUM, enabled: true, missing: null, nested: {mode: HIDDEN, items: [ALPHA, false, null]}) { id } }'
  );
  const second = usage.identifyGraphqlOperation(
    'query Q($mode: Mode = PUBLIC) { item(status: OTHER_ENUM, enabled: false, missing: false, nested: {mode: OPEN, items: [BETA, true, true]}) { id } }'
  );
  assert.equal(first.kind, 'query');
  assert.equal(first.queryFingerprint, second.queryFingerprint);
  assert.equal(JSON.stringify(first).includes('SECRET_ENUM'), false);
  assert.equal(JSON.stringify(first).includes('PRIVATE'), false);
});

test('balanced malformed GraphQL never receives a confident operation identity', () => {
  for (const document of [
    'query Q { }',
    'query Q { viewer @ }',
    'query Q { viewer(arg:) }',
    'query Q { viewer { } }',
    'query Q { viewer(arg: [A, :]) }',
  ]) {
    assert.equal(usage.identifyGraphqlOperation(document).kind, 'unknown', document);
    assert.equal(usage.identifyGraphqlOperation(document).queryFingerprint, null, document);
  }
  const valid = usage.identifyGraphqlOperation(
    'query Q($id: ID! = "x") @include(if: true) { alias: node(id: $id) { ...F } } fragment F on Node { id }'
  );
  assert.equal(valid.kind, 'query');
  assert.equal(valid.operation, 'Q');
});
