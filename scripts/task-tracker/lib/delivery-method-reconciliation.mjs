// @story #1562
//
// Merge-method reconciliation record.
//
// A delivery intent's merge method is sourced from configuration
// (`fullAutoMerge.mergeMethod`, resolved in `delivery-preflight.mjs`), and
// `delivery-verification.mjs` refuses when the observed merge topology does not
// equal it. That refusal is correct: it declines to write a receipt claiming a
// squash that never happened. But configuration was the ONLY possible intent, so
// a human who merged a pull request with a different button stranded the issue
// with no route to a terminal close — observed live on #680, whose PR #1556 was
// merged from the GitHub UI as a merge commit against a squash-only config.
//
// This module backs a narrow lane that lets an operator RESTATE the intent to
// match reality. It deliberately does NOT weaken the verifier:
//
//   * `resolveReconciledMergeMethod` accepts a declared method only when live
//     observation agrees with it. An operator cannot reconcile to a lie — the
//     declaration is checked against topology, never trusted.
//   * The reconciliation is refused when it would be a no-op (declared equals
//     configured), so the lane cannot be used as a silent rubber stamp.
//   * A free-text reason is mandatory and placeholder-rejected, so the ledger
//     records WHY the divergence was accepted.
//
// The divergence is its own append-only record rather than a field on the intent
// or receipt: `delivery-records.mjs` pins `aitm.delivery-intent/v1` and
// `aitm.delivery-receipt/v1` behind strict exact-key validation, so adding a
// field there would mean a v2 schema plus migration across every parser and
// consumer. `delivery-incident-records.mjs` is the precedent for projecting
// several record types side by side.

export const METHOD_RECONCILIATION_SCHEMA = 'aitm.delivery-method-reconciliation/v1';
export const METHOD_RECONCILIATION_V2_SCHEMA = 'aitm.delivery-method-reconciliation/v2';

const MERGE_METHODS = new Set(['merge', 'squash', 'rebase']);
const SHA_RE = /^[0-9a-f]{40}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PLACEHOLDER_RE = /^(?:tbd|todo|placeholder|n\/a|none|\.\.\.)$/i;
const MIN_REASON_LENGTH = 8;

export const METHOD_RECONCILIATION_KEYS = Object.freeze([
  'acceptedSha',
  'clientCreatedAt',
  'configuredMergeMethod',
  'divergent',
  'issueNumber',
  'mergeCommitSha',
  'observedMergeMethod',
  'operator',
  'prNumber',
  'reason',
  'repository',
  'schema',
]);

export const METHOD_RECONCILIATION_V2_KEYS = Object.freeze([
  ...METHOD_RECONCILIATION_KEYS,
  'intentOrigin',
]);

const RETROACTIVE_INTENT_ORIGIN = 'retroactively-reconstructed';

function fail(category) {
  throw new TypeError(`delivery-method-reconciliation:${category}`);
}

function requireMergeMethod(value, category) {
  if (typeof value !== 'string' || !MERGE_METHODS.has(value)) fail(category);
  return value;
}

function requireSha(value, category) {
  if (typeof value !== 'string' || !SHA_RE.test(value)) fail(category);
  return value;
}

function requirePositiveInteger(value, category) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(category);
  return value;
}

function requireReason(value) {
  if (typeof value !== 'string') fail('reason');
  const trimmed = value.trim();
  if (trimmed.length < MIN_REASON_LENGTH || PLACEHOLDER_RE.test(trimmed)) fail('reason');
  return trimmed;
}

function requireOperator(value) {
  if (typeof value !== 'string' || value.trim() === '') fail('operator');
  return value.trim();
}

// Build the append-only divergence record. `divergent` is derived rather than
// supplied, so a caller cannot record a divergence that contradicts its own
// method fields.
export function buildMethodReconciliation({
  issueNumber,
  repository,
  prNumber,
  acceptedSha,
  mergeCommitSha,
  configuredMergeMethod,
  observedMergeMethod,
  reason,
  operator,
  clientCreatedAt,
  intentOrigin,
} = {}) {
  if (typeof repository !== 'string' || !REPOSITORY_RE.test(repository)) fail('repository');
  if (typeof clientCreatedAt !== 'string' || !ISO_RE.test(clientCreatedAt)) {
    fail('client-created-at');
  }
  const configured = requireMergeMethod(configuredMergeMethod, 'configured-merge-method');
  const observed = requireMergeMethod(observedMergeMethod, 'observed-merge-method');
  const retroactivelyReconstructed = intentOrigin === RETROACTIVE_INTENT_ORIGIN;
  if (intentOrigin !== undefined && !retroactivelyReconstructed) fail('intent-origin');

  return Object.freeze({
    schema: retroactivelyReconstructed ? METHOD_RECONCILIATION_V2_SCHEMA : METHOD_RECONCILIATION_SCHEMA,
    ...(retroactivelyReconstructed ? { intentOrigin: RETROACTIVE_INTENT_ORIGIN } : {}),
    issueNumber: requirePositiveInteger(issueNumber, 'issue-number'),
    repository,
    prNumber: requirePositiveInteger(prNumber, 'pr-number'),
    acceptedSha: requireSha(acceptedSha, 'accepted-sha'),
    mergeCommitSha: requireSha(mergeCommitSha, 'merge-commit-sha'),
    configuredMergeMethod: configured,
    observedMergeMethod: observed,
    divergent: configured !== observed,
    reason: requireReason(reason),
    operator: requireOperator(operator),
    clientCreatedAt,
  });
}

// Re-validate a parsed record. `divergent` is cross-checked against the two
// method fields, so a record edited after the fact fails rather than passing on
// its own say-so.
export function validateMethodReconciliation(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) fail('record');
  const keys = Object.keys(record).sort();
  let expected;
  if (record.schema === METHOD_RECONCILIATION_SCHEMA) {
    expected = [...METHOD_RECONCILIATION_KEYS].sort();
  } else if (record.schema === METHOD_RECONCILIATION_V2_SCHEMA) {
    expected = [...METHOD_RECONCILIATION_V2_KEYS].sort();
  } else {
    fail('schema');
  }
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) fail('keys');
  if (
    record.schema === METHOD_RECONCILIATION_V2_SCHEMA &&
    record.intentOrigin !== RETROACTIVE_INTENT_ORIGIN
  ) {
    fail('intent-origin');
  }

  const configured = requireMergeMethod(record.configuredMergeMethod, 'configured-merge-method');
  const observed = requireMergeMethod(record.observedMergeMethod, 'observed-merge-method');
  requireSha(record.acceptedSha, 'accepted-sha');
  requireSha(record.mergeCommitSha, 'merge-commit-sha');
  requirePositiveInteger(record.issueNumber, 'issue-number');
  requirePositiveInteger(record.prNumber, 'pr-number');
  requireReason(record.reason);
  requireOperator(record.operator);
  if (typeof record.divergent !== 'boolean' || record.divergent !== (configured !== observed)) {
    fail('divergent');
  }
  return Object.freeze({ ok: true });
}

// The honesty guard for the lane. An operator DECLARES the method they believe
// was used; this accepts it only when live observation agrees, and only when it
// actually diverges from configuration. Everything else refuses.
export function resolveReconciledMergeMethod({ declared, observed, configured } = {}) {
  const declaredMethod = requireMergeMethod(declared, 'declared-merge-method');
  const configuredMethod = requireMergeMethod(configured, 'configured-merge-method');
  // `observed` arrives from `classifyMergeMethod`, which may report `unknown`
  // for a topology it cannot attribute. Refuse rather than let the operator's
  // declaration stand in for evidence.
  const observedMethod = requireMergeMethod(observed, 'observed-merge-method');
  if (declaredMethod !== observedMethod) fail('declared-not-observed');
  if (declaredMethod === configuredMethod) fail('not-divergent');
  return declaredMethod;
}

export const METHOD_RECONCILIATION_MARKER = 'aitm-delivery-method-reconciliation';

const MAX_RECORD_JSON_BYTES = 256 * 1024;

// Rendered as a hidden canonical record plus visible prose, matching the
// intent/receipt comment shape in `delivery-records.mjs`. The visible half
// matters: a reader scanning the issue should see the divergence and its reason
// without decoding the marker.
export function renderMethodReconciliationComment(record) {
  validateMethodReconciliation(record);
  const json = JSON.stringify(record, Object.keys(record).sort());
  if (Buffer.byteLength(json, 'utf8') > MAX_RECORD_JSON_BYTES) {
    throw new TypeError('delivery-method-reconciliation:record-too-large');
  }
  const visible =
    record.schema === METHOD_RECONCILIATION_V2_SCHEMA
      ? [
          '### Merge-method reconciliation',
          '',
          'No delivery-time intent existed. The external delivery intent was',
          'reconstructed from provider and Git evidence after the merge was verified.',
          '',
          `PR #${record.prNumber} was merged as \`${record.observedMergeMethod}\`, while this project's`,
          `delivery configuration declares \`${record.configuredMergeMethod}\`. The delivery intent is`,
          'restated to the observed method so the receipt describes what actually happened.',
          '',
          `**Reason given:** ${record.reason}`,
          '',
          `**Merge commit:** \`${record.mergeCommitSha}\` · **Accepted head:** \`${record.acceptedSha}\``,
          `· **Reconciled by:** @${record.operator}`,
          '',
          'The verifier was not relaxed: the declared method was checked against the merge topology',
          'before this record was written, and a declaration contradicting observation is refused.',
        ].join('\n')
      : [
          '### Merge-method reconciliation',
          '',
          `PR #${record.prNumber} was merged as \`${record.observedMergeMethod}\`, while this project's`,
          `delivery configuration declares \`${record.configuredMergeMethod}\`. The delivery intent is`,
          'restated to the observed method so the receipt describes what actually happened.',
          '',
          `**Reason given:** ${record.reason}`,
          '',
          `**Merge commit:** \`${record.mergeCommitSha}\` · **Accepted head:** \`${record.acceptedSha}\``,
          `· **Reconciled by:** @${record.operator}`,
          '',
          'The verifier was not relaxed: the declared method was checked against the merge topology',
          'before this record was written, and a declaration contradicting observation is refused.',
        ].join('\n');
  return `<!-- ${METHOD_RECONCILIATION_MARKER} ${json} -->\n${visible}`;
}
