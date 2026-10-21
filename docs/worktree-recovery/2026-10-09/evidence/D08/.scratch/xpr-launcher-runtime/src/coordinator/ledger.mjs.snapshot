import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { resolveContainedPath } from '../collateral/paths.mjs';
import { canonicalWakeCapsule, wakeOperationKey } from './decision.mjs';
import { AprError } from '../errors.mjs';
import { canonicalProjection } from '../protocol/service.mjs';
import { atomicCreate } from '../protocol/store.mjs';

const OPERATION_SCHEMA = 'ai-peer-review.wake-operation/v1';
const OUTCOME_SCHEMA = 'ai-peer-review.wake-outcome/v1';
const OUTCOMES = new Set([
  'acknowledged',
  'not-submitted',
  'outcome-unknown',
  'refused',
  'superseded',
]);
const TERMINAL = new Set(['acknowledged', 'outcome-unknown', 'refused', 'superseded']);

function fail(code, message, recovery, details = {}) {
  throw new AprError(code, message, { recovery, details });
}

function instant(value, label) {
  const at = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(at.valueOf())) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      `${label} is invalid.`,
      'Use a valid coordinator observation time and retry.'
    );
  }
  return at.toISOString();
}

function assertDirectoryNotSymlink(directory, label) {
  try {
    const entry = lstatSync(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('not a physical directory');
  } catch (cause) {
    if (cause?.code === 'ENOENT') return;
    fail(
      'APR_WAKE_LEDGER_INVALID',
      `${label} must be a physical directory.`,
      'Preserve the review workspace, remove the unsafe indirection, and retry.',
      { directory }
    );
  }
}

function wakeRoot(workspace) {
  let contained;
  try {
    contained = resolveContainedPath(workspace, path.join(workspace, 'wake'), 'wake ledger');
  } catch (cause) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      'Wake ledger path is outside the physical review workspace.',
      'Preserve the review workspace, remove the unsafe indirection, and retry.',
      { cause: cause?.code ?? cause?.message ?? 'unknown' }
    );
  }
  assertDirectoryNotSymlink(contained.absolute, 'Wake ledger');
  return contained.absolute;
}

function operationPath(workspace, operationId) {
  const name = operationId.replace(/^sha256:/, '');
  if (!/^[0-9a-f]{64}$/.test(name)) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      'Wake operation ID is invalid.',
      'Use the operation ID returned by the durable wake ledger.'
    );
  }
  return resolveContainedPath(
    workspace,
    path.join(wakeRoot(workspace), 'operations', `${name}.json`),
    'wake operation'
  ).absolute;
}

function outcomeDirectory(workspace, operationId) {
  const name = operationId.replace(/^sha256:/, '');
  return resolveContainedPath(
    workspace,
    path.join(wakeRoot(workspace), 'outcomes', name),
    'wake outcome directory'
  ).absolute;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalProjection(value)}\n`, 'utf8');
}

function regularBytes(file, label) {
  try {
    const metadata = lstatSync(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('not a regular file');
    return readFileSync(file);
  } catch (cause) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      `${label} cannot be read as an immutable regular file.`,
      'Preserve the review workspace and inspect the wake ledger before retrying.',
      { file, cause: cause?.code ?? cause?.message ?? 'unknown' }
    );
  }
}

function parseCanonical(file, schema, label) {
  const bytes = regularBytes(file, label);
  let value;
  try {
    value = JSON.parse(bytes);
  } catch {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      `${label} is not valid JSON.`,
      'Preserve the review workspace and restore the exact canonical ledger record.',
      { file }
    );
  }
  if (value?.schema !== schema || !bytes.equals(canonicalBytes(value))) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      `${label} is not canonical or has the wrong schema.`,
      'Preserve the review workspace and restore the exact canonical ledger record.',
      { file }
    );
  }
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('APR_WAKE_LEDGER_INVALID', `${label} is invalid.`, 'Restore canonical wake ledger bytes.');
  }
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      `${label} has an invalid field set.`,
      'Restore canonical wake ledger bytes.',
      { fields: actual }
    );
  }
}

function validateOperation(value) {
  exactKeys(
    value,
    [
      'schema',
      'operation_id',
      'review_id',
      'protocol_revision',
      'target_role',
      'session_fingerprint',
      'delivery_id',
      'adapter',
      'adapter_version',
      'capsule',
      'capsule_digest',
      'reserved_at',
    ],
    'Wake operation'
  );
  if (
    value.schema !== OPERATION_SCHEMA ||
    !/^sha256:[0-9a-f]{64}$/.test(value.operation_id) ||
    !/^sha256:[0-9a-f]{64}$/.test(value.session_fingerprint) ||
    !/^sha256:[0-9a-f]{64}$/.test(value.capsule_digest) ||
    !Number.isSafeInteger(value.protocol_revision) ||
    value.protocol_revision < 0 ||
    !['author', 'reviewer'].includes(value.target_role) ||
    typeof value.review_id !== 'string' ||
    typeof value.adapter !== 'string' ||
    typeof value.adapter_version !== 'string' ||
    (value.delivery_id !== null && typeof value.delivery_id !== 'string') ||
    !Number.isFinite(Date.parse(value.reserved_at))
  ) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      'Wake operation fields are invalid.',
      'Restore canonical wake ledger bytes.'
    );
  }
  const capsuleDigest = `sha256:${createHash('sha256')
    .update(Buffer.from(`${canonicalProjection(value.capsule)}\n`))
    .digest('hex')}`;
  if (capsuleDigest !== value.capsule_digest) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      'Wake operation capsule digest does not match its bytes.',
      'Restore the immutable operation and capsule together.'
    );
  }
  return value;
}

function listOutcomes(workspace, operationId) {
  const directory = outcomeDirectory(workspace, operationId);
  assertDirectoryNotSymlink(directory, 'Wake outcome directory');
  let entries;
  try {
    entries = lstatSync(directory).isDirectory() ? readdirSync(directory).sort() : [];
  } catch (cause) {
    if (cause?.code === 'ENOENT') return [];
    throw cause;
  }
  return entries.map((file, index) => {
    const expected = `${String(index + 1).padStart(6, '0')}.json`;
    if (file !== expected) {
      fail(
        'APR_WAKE_LEDGER_INVALID',
        'Wake outcome sequence is not contiguous.',
        'Preserve the ledger and restore its exact ordered outcome records.',
        { file, expected }
      );
    }
    const value = parseCanonical(path.join(directory, file), OUTCOME_SCHEMA, 'Wake outcome');
    exactKeys(
      value,
      ['schema', 'operation_id', 'sequence', 'status', 'reason', 'recorded_at'],
      'Wake outcome'
    );
    if (
      value.operation_id !== operationId ||
      value.sequence !== index + 1 ||
      !OUTCOMES.has(value.status) ||
      typeof value.reason !== 'string' ||
      !value.reason ||
      !Number.isFinite(Date.parse(value.recorded_at))
    ) {
      fail(
        'APR_WAKE_LEDGER_INVALID',
        'Wake outcome fields are invalid.',
        'Restore canonical wake outcome bytes.'
      );
    }
    return value;
  });
}

function projection(workspace, operation, file) {
  const outcomes = listOutcomes(workspace, operation.operation_id);
  const status = outcomes.at(-1)?.status ?? 'reserved';
  return Object.freeze({
    ...operation,
    status,
    outcomes: Object.freeze(outcomes.map((entry) => Object.freeze(entry))),
    paths: Object.freeze({
      operation: file,
      outcomes: outcomeDirectory(workspace, operation.operation_id),
    }),
  });
}

function operationRecord(decision, now) {
  const operationId = wakeOperationKey(decision);
  const capsuleBytes = canonicalWakeCapsule(decision);
  return {
    schema: OPERATION_SCHEMA,
    operation_id: operationId,
    review_id: decision.capsule.review_id,
    protocol_revision: decision.capsule.expected_revision,
    target_role: decision.capsule.target_role,
    session_fingerprint: decision.participant_fingerprint,
    delivery_id: decision.delivery?.delivery_id ?? null,
    adapter: decision.transport.adapter ?? decision.transport.capability,
    adapter_version: decision.transport.adapter_version,
    capsule: decision.capsule,
    capsule_digest: `sha256:${createHash('sha256').update(capsuleBytes).digest('hex')}`,
    reserved_at: instant(now, 'Wake reservation time'),
  };
}

export function reserveWakeOperation(workspace, decision, now = new Date()) {
  const operation = operationRecord(decision, now);
  validateOperation(operation);
  const file = operationPath(workspace, operation.operation_id);
  const bytes = canonicalBytes(operation);
  try {
    atomicCreate(file, bytes);
  } catch (cause) {
    if (cause?.code !== 'APR_OUTPUT_COLLISION') throw cause;
    const existing = validateOperation(parseCanonical(file, OPERATION_SCHEMA, 'Wake operation'));
    const immutable = ({ reserved_at: _reservedAt, ...value }) => value;
    if (canonicalProjection(immutable(existing)) !== canonicalProjection(immutable(operation))) {
      fail(
        'APR_WAKE_CONFLICT',
        'Wake operation key is already bound to different immutable bytes.',
        'Preserve the ledger and reconcile the existing operation before continuing.',
        { operation_id: operation.operation_id }
      );
    }
  }
  return readWakeOperation(workspace, operation.operation_id);
}

export function readWakeOperation(workspace, operationId) {
  const file = operationPath(workspace, operationId);
  const operation = validateOperation(parseCanonical(file, OPERATION_SCHEMA, 'Wake operation'));
  if (operation.operation_id !== operationId) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      'Wake operation path does not match its identity.',
      'Restore the operation under its digest-derived path.'
    );
  }
  return projection(workspace, operation, file);
}

export function wakeOperationExists(workspace, operationId) {
  return existsSync(operationPath(workspace, operationId));
}

export function latestWakeOperation(workspace) {
  const directory = path.join(wakeRoot(workspace), 'operations');
  let entries;
  try {
    const metadata = lstatSync(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('not a physical directory');
    }
    entries = readdirSync(directory).sort();
  } catch (cause) {
    if (cause?.code === 'ENOENT') return null;
    fail(
      'APR_WAKE_LEDGER_INVALID',
      'Wake operation directory is unsafe.',
      'Preserve the review workspace and restore its physical wake ledger.'
    );
  }
  let latest = null;
  for (const entry of entries) {
    if (!/^[0-9a-f]{64}\.json$/.test(entry)) {
      fail(
        'APR_WAKE_LEDGER_INVALID',
        'Wake operation directory contains an invalid entry.',
        'Preserve the review workspace and restore exact digest-named operation records.'
      );
    }
    const operation = readWakeOperation(workspace, `sha256:${entry.slice(0, -5)}`);
    if (!latest || operation.reserved_at > latest.reserved_at) latest = operation;
  }
  return latest;
}

export function appendWakeOutcome(workspace, operationId, outcome, now = new Date()) {
  exactKeys(outcome, ['status', 'reason'], 'Wake outcome input');
  if (!OUTCOMES.has(outcome.status) || typeof outcome.reason !== 'string' || !outcome.reason) {
    fail(
      'APR_WAKE_LEDGER_INVALID',
      'Wake outcome is outside the closed vocabulary.',
      'Record one documented wake outcome.'
    );
  }
  const current = readWakeOperation(workspace, operationId);
  if (TERMINAL.has(current.status)) {
    fail(
      'APR_WAKE_CONFLICT',
      'Terminal wake operation cannot accept another outcome.',
      'Use the existing terminal operation as the durable result.',
      { operation_id: operationId, status: current.status }
    );
  }
  const sequence = current.outcomes.length + 1;
  const record = {
    schema: OUTCOME_SCHEMA,
    operation_id: operationId,
    sequence,
    status: outcome.status,
    reason: outcome.reason,
    recorded_at: instant(now, 'Wake outcome time'),
  };
  const directory = outcomeDirectory(workspace, operationId);
  assertDirectoryNotSymlink(directory, 'Wake outcome directory');
  mkdirSync(directory, { recursive: true });
  atomicCreate(
    path.join(directory, `${String(sequence).padStart(6, '0')}.json`),
    canonicalBytes(record)
  );
  return readWakeOperation(workspace, operationId);
}
