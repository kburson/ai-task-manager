// @story #1117 #1450

const METHOD_ID_RE = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const ACTION_SERIALIZATIONS = new Set(['correlation', 'issue-lock']);

export class InvalidStateDefinitionError extends Error {
  constructor(code, details = {}) {
    super(`invalid-state-definition:${code}`);
    this.name = 'InvalidStateDefinitionError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function fail(code, details) {
  throw new InvalidStateDefinitionError(code, details);
}

export function validateStateMethod(method, kind) {
  const isAction = kind === 'resident-action';
  if (!method || typeof method !== 'object' || (!isAction && kind !== 'guard')) {
    fail('unknown-method-contract', { kind });
  }

  const id = typeof method.id === 'string' ? method.id : '';
  const idCode = isAction ? 'resident-action-id' : 'guard-id';
  if (!METHOD_ID_RE.test(id) || Buffer.byteLength(id, 'ascii') > 96) {
    fail(idCode, { id });
  }
  if (typeof method.run !== 'function') {
    fail('unknown-method-contract', { id, kind, missing: 'run' });
  }
  if (isAction) {
    if (typeof method.verify !== 'function') {
      fail('unknown-method-contract', { id, kind, missing: 'verify' });
    }
    if (!ACTION_SERIALIZATIONS.has(method.serialization)) {
      fail('resident-action-serialization', { id, serialization: method.serialization });
    }
  }
  return method;
}

export function buildMethodIndex(definitions) {
  const byId = Object.create(null);
  for (const definition of Array.isArray(definitions) ? definitions : []) {
    for (const method of [
      ...(definition?.entryGuards || []),
      ...(definition?.residentActions || []),
      ...(definition?.exitGuards || []),
    ]) {
      const existing = byId[method.id];
      if (existing && existing !== method) {
        fail('method-id-reference-conflict', { id: method.id });
      }
      byId[method.id] = method;
    }
  }
  return Object.freeze(byId);
}
