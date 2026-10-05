// @story #1835
export const GRAPHQL_USAGE_SCHEMAS = Object.freeze({
  observation: 'aitm.graphql-usage.observation/v1',
  diagnostic: 'aitm.graphql-usage.diagnostic/v1',
  manifest: 'aitm.graphql-usage.manifest/v1',
  inventory: 'aitm.graphql-usage.inventory/v1',
});

const observationKeys = new Set([
  'schemaVersion',
  'callId',
  'logicalOperationId',
  'startedAt',
  'endedAt',
  'durationMs',
  'worktreeId',
  'sessionId',
  'sessionSource',
  'enrollmentId',
  'commonRootId',
  'processId',
  'repository',
  'issueNumber',
  'draftId',
  'lifecycleState',
  'stateSource',
  'contextScope',
  'collectorLaunchRoute',
  'originatingLaunchRoute',
  'observationKind',
  'dispatchStatus',
  'pageIndex',
  'operation',
  'queryFingerprint',
  'fingerprintVersion',
  'kind',
  'outcome',
  'httpStatus',
  'processExitCode',
  'errorClass',
  'pointCost',
  'costSource',
  'costUnknownReason',
  'costCoverage',
  'hiddenRequestCount',
  'costBasis',
  'augmentationVersion',
  'collectorVersion',
  'endpointHost',
  'budgetScopeId',
  'rateLimit',
  'rateLimitUnavailableReason',
]);
const diagnosticKeys = new Set([
  'schemaVersion',
  'occurredAt',
  'code',
  'count',
  'commonRootId',
  'worktreeId',
  'sessionId',
  'collectorVersion',
  'collectorLaunchRoute',
  'originatingLaunchRoute',
  'detailClass',
]);
const manifestKeys = new Set([
  'schemaVersion',
  'commonRootId',
  'worktreeId',
  'sessionId',
  'sessionSource',
  'enrollmentId',
  'collectorLaunchRoute',
  'originatingLaunchRoute',
  'outcome',
  'recordedAt',
  'reasonCode',
]);
const inventoryKeys = new Set([
  'schemaVersion',
  'source',
  'line',
  'classification',
  'reason',
  'coverage',
]);
const safeId = new RegExp('^[A-Za-z0-9_.:-]{1,128}$');
const safeWord = new RegExp('^[A-Za-z][A-Za-z0-9_.-]{0,127}$');
const safeRelativeSource = new RegExp(
  '^(?:bin|scripts|hooks|statusline|skill|templates|instructions)/[A-Za-z0-9_./-]+$'
);
const fingerprint = new RegExp('^sha256:[a-f0-9]{64}$');

function requireObject(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new TypeError(`${label}: expected plain object`);
}
function keys(value, allowed, required, label) {
  requireObject(value, label);
  for (const key of Object.keys(value))
    if (!allowed.has(key)) throw new TypeError(`${label}: unknown or forbidden key ${key}`);
  for (const key of required)
    if (!Object.hasOwn(value, key)) throw new TypeError(`${label}: missing ${key}`);
}
function matches(value, expression, label, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !expression.test(value)) throw new TypeError(`invalid ${label}`);
}
function member(value, options, label, nullable = false) {
  if (nullable && value === null) return;
  if (!options.includes(value)) throw new TypeError(`invalid ${label}`);
}
function integer(value, label, nullable = false, minimum = 0) {
  if (nullable && value === null) return;
  if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`invalid ${label}`);
}
function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new TypeError(`invalid ${label}`);
}
function identityFields(value) {
  for (const field of ['commonRootId', 'worktreeId', 'sessionId', 'enrollmentId']) {
    if (Object.hasOwn(value, field))
      matches(value[field], field === 'sessionId' ? fingerprint : safeId, field, true);
  }
}
const launchRoutes = [
  'aitm-cli',
  'legacy-cli-shell',
  'measurement-launcher',
  'inherited-environment',
  'unknown',
];
const sessionSources = ['runtime', 'measurement-launcher', 'unknown'];
const detailClasses = [
  'filesystem',
  'permission',
  'git-root',
  'context',
  'transport',
  'parse',
  'unknown',
];
const rootFailureCodes = [
  'shared-root-out-of-sandbox-scope',
  'shared-root-access-denied',
  'git-root-resolution-failed',
];
function routeFields(record) {
  if (record.collectorLaunchRoute === 'inherited-environment') {
    member(
      record.originatingLaunchRoute,
      launchRoutes.filter((route) => route !== 'inherited-environment' && route !== 'unknown'),
      'originatingLaunchRoute'
    );
  } else if (Object.hasOwn(record, 'originatingLaunchRoute')) {
    member(
      record.originatingLaunchRoute,
      launchRoutes.filter((route) => route !== 'inherited-environment' && route !== 'unknown'),
      'originatingLaunchRoute',
      true
    );
  }
}

export function validateObservation(record) {
  keys(
    record,
    observationKeys,
    [...observationKeys].filter((key) => key !== 'fingerprintVersion'),
    'observation'
  );
  member(record.schemaVersion, [GRAPHQL_USAGE_SCHEMAS.observation], 'schemaVersion');
  identityFields(record);
  for (const field of ['callId', 'logicalOperationId']) matches(record[field], safeId, field);
  for (const field of ['startedAt', 'endedAt']) timestamp(record[field], field);
  if (Date.parse(record.endedAt) < Date.parse(record.startedAt))
    throw new TypeError('invalid time order');
  integer(record.durationMs, 'durationMs');
  integer(record.processId, 'processId', true);
  integer(record.issueNumber, 'issueNumber', true, 1);
  integer(record.pageIndex, 'pageIndex', true);
  integer(record.httpStatus, 'httpStatus', true, 100);
  if (record.httpStatus !== null && record.httpStatus > 599)
    throw new TypeError('invalid httpStatus');
  integer(record.processExitCode, 'processExitCode', true);
  integer(record.hiddenRequestCount, 'hiddenRequestCount', true);
  matches(record.repository, new RegExp('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'), 'repository', true);
  matches(record.draftId, safeId, 'draftId', true);
  matches(record.operation, safeWord, 'operation', true);
  matches(record.queryFingerprint, fingerprint, 'queryFingerprint', true);
  member(record.fingerprintVersion ?? null, ['v1'], 'fingerprintVersion', true);
  member(record.sessionSource, sessionSources, 'sessionSource');
  member(record.stateSource, ['local', 'argument', 'unknown'], 'stateSource');
  member(
    record.contextScope,
    ['single-issue', 'multiple-issues', 'repository', 'unknown'],
    'contextScope'
  );
  member(record.collectorLaunchRoute, launchRoutes, 'collectorLaunchRoute');
  routeFields(record);
  member(record.observationKind, ['http-attempt', 'opaque-cli-invocation'], 'observationKind');
  member(record.dispatchStatus, ['sent', 'not-sent', 'unknown'], 'dispatchStatus');
  member(record.kind, ['query', 'mutation', 'mixed', 'unknown'], 'kind');
  member(record.outcome, ['success', 'failure', 'timeout', 'partial', 'unknown'], 'outcome');
  member(
    record.costCoverage,
    ['complete-observation', 'visible-response-only', 'unknown'],
    'costCoverage'
  );
  member(record.costBasis, ['instrumented-request'], 'costBasis');
  member(record.costSource, ['same-response-rate-limit'], 'costSource', true);
  member(
    record.costUnknownReason,
    [
      'mutation-cost-unavailable',
      'opaque-cli',
      'unsupported-syntax',
      'no-same-response-cost',
      'not-dispatched',
      'ambiguous-dispatch',
      'response-unavailable',
      'collection-disabled',
      'unknown',
    ],
    'costUnknownReason',
    true
  );
  member(
    record.errorClass,
    [
      'graphql-errors',
      'http-error',
      'spawn-error',
      'timeout',
      'parse-error',
      'storage-error',
      'unknown',
    ],
    'errorClass',
    true
  );
  matches(record.lifecycleState, safeWord, 'lifecycleState', true);
  matches(record.endpointHost, new RegExp('^[A-Za-z0-9.-]{1,253}$'), 'endpointHost', true);
  matches(record.budgetScopeId, safeId, 'budgetScopeId', true);
  matches(record.augmentationVersion, safeId, 'augmentationVersion', true);
  matches(record.collectorVersion, safeId, 'collectorVersion');
  if (record.pointCost === null) {
    if (
      record.costCoverage !== 'unknown' ||
      !record.costUnknownReason ||
      record.costSource !== null
    )
      throw new TypeError('unknown cost requires reason and unknown coverage');
  } else {
    integer(record.pointCost, 'pointCost');
    if (
      record.costSource !== 'same-response-rate-limit' ||
      record.costUnknownReason !== null ||
      record.dispatchStatus !== 'sent' ||
      record.kind !== 'query'
    )
      throw new TypeError('known cost requires sent query and same-response source');
  }
  if (record.observationKind === 'opaque-cli-invocation') {
    if (record.httpStatus !== null) throw new TypeError('opaque invocation cannot have httpStatus');
    if (record.hiddenRequestCount === 0)
      throw new TypeError('opaque invocation cannot prove zero hidden requests');
    if (record.pointCost !== null && record.costCoverage !== 'visible-response-only')
      throw new TypeError('opaque known cost covers visible response only');
  } else {
    if (record.hiddenRequestCount !== 0)
      throw new TypeError('HTTP attempt has zero hidden requests');
    if (record.costCoverage === 'visible-response-only')
      throw new TypeError('HTTP attempt cannot use visible-response-only coverage');
    if (record.pointCost !== null && record.costCoverage !== 'complete-observation')
      throw new TypeError('known HTTP cost requires complete observation coverage');
  }
  member(
    record.rateLimitUnavailableReason,
    ['transport-unavailable', 'not-returned', 'not-dispatched', 'unknown'],
    'rateLimitUnavailableReason',
    true
  );
  if (record.rateLimit === null && record.rateLimitUnavailableReason === null)
    throw new TypeError('missing rateLimit requires unavailable reason');
  if (record.rateLimit !== null && record.rateLimitUnavailableReason !== null)
    throw new TypeError('present rateLimit cannot have unavailable reason');
  if (record.rateLimit !== null) {
    keys(
      record.rateLimit,
      new Set(['limit', 'remaining', 'used', 'reset', 'resource']),
      ['limit', 'remaining', 'used', 'reset', 'resource'],
      'rateLimit'
    );
    for (const field of ['limit', 'remaining', 'used', 'reset'])
      integer(record.rateLimit[field], `rateLimit.${field}`, true);
    matches(record.rateLimit.resource, safeWord, 'rateLimit.resource', true);
  }
  return record;
}

export function validateDiagnostic(record) {
  keys(
    record,
    diagnosticKeys,
    ['schemaVersion', 'occurredAt', 'code', 'count', 'commonRootId', 'worktreeId', 'sessionId'],
    'diagnostic'
  );
  member(record.schemaVersion, [GRAPHQL_USAGE_SCHEMAS.diagnostic], 'schemaVersion');
  timestamp(record.occurredAt, 'occurredAt');
  member(
    record.code,
    [
      'collection-disabled',
      'storage-failure',
      'unsupported-context',
      'dropped-observation',
      'enrollment-denied',
      'invalid-inherited-context',
      'writer-start',
      'writer-close',
      'malformed-record',
      'duplicate-call-id',
      ...rootFailureCodes,
      'unknown',
    ],
    'code'
  );
  integer(record.count, 'count', true);
  identityFields(record);
  if (record.collectorVersion !== undefined)
    matches(record.collectorVersion, safeId, 'collectorVersion');
  if (record.collectorLaunchRoute !== undefined)
    member(record.collectorLaunchRoute, launchRoutes, 'collectorLaunchRoute');
  if (record.collectorLaunchRoute !== undefined || Object.hasOwn(record, 'originatingLaunchRoute'))
    routeFields(record);
  if (record.detailClass !== undefined) member(record.detailClass, detailClasses, 'detailClass');
  return record;
}

export function validateManifest(record) {
  keys(
    record,
    manifestKeys,
    [
      'schemaVersion',
      'commonRootId',
      'worktreeId',
      'sessionId',
      'sessionSource',
      'enrollmentId',
      'collectorLaunchRoute',
      'originatingLaunchRoute',
      'outcome',
      'recordedAt',
    ],
    'manifest'
  );
  member(record.schemaVersion, [GRAPHQL_USAGE_SCHEMAS.manifest], 'schemaVersion');
  identityFields(record);
  member(record.sessionSource, sessionSources, 'sessionSource');
  member(record.collectorLaunchRoute, launchRoutes, 'collectorLaunchRoute');
  routeFields(record);
  member(record.outcome, ['enrolled', 'denied', 'unknown'], 'outcome');
  timestamp(record.recordedAt, 'recordedAt');
  if (record.reasonCode !== undefined)
    member(
      record.reasonCode,
      [
        'permission-denied',
        'root-unavailable',
        'probe-failed',
        'context-invalid',
        ...rootFailureCodes,
        'unknown',
      ],
      'reasonCode',
      true
    );
  return record;
}

export function validateInventoryRow(record) {
  keys(record, inventoryKeys, [...inventoryKeys], 'inventory');
  member(record.schemaVersion, [GRAPHQL_USAGE_SCHEMAS.inventory], 'schemaVersion');
  matches(record.source, safeRelativeSource, 'source');
  if (record.source.includes('..')) throw new TypeError('invalid source');
  integer(record.line, 'line', false, 1);
  member(
    record.classification,
    [
      'direct-http',
      'gh-api-graphql',
      'opaque-gh-cli',
      'rest-or-non-graphql',
      'uncovered',
      'out-of-scope',
    ],
    'classification'
  );
  member(
    record.coverage,
    ['covered', 'planned', 'opaque', 'uncovered', 'out-of-scope'],
    'coverage'
  );
  member(
    record.reason,
    [
      'direct GraphQL HTTP endpoint',
      'absolute gh executable bypasses inherited PATH',
      'environment selected gh executable may bypass PATH',
      'explicit GraphQL CLI or shared gql wrapper',
      'explicit REST or non GraphQL endpoint',
      'high level gh CLI invocation hides request attempts',
      'shared action capture shim process boundary',
      'shared action capture shim lacks usage observation',
      'static command text without dispatch evidence',
      'dynamic gh wrapper arguments require runtime classification',
    ],
    'reason'
  );
  return record;
}
