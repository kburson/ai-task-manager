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
    outcome: 'enrolled',
    recordedAt: '2026-09-28T00:00:00.000Z',
  };
  assert.deepEqual(records.validateManifest(manifest), manifest);
  assert.throws(() => records.validateManifest({ ...manifest, sessionId: 'raw-provider-session' }));
});
