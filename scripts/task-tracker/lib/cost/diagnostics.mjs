// @story #1733

const DIAGNOSTIC_KEYS = ['code', 'eventId', 'recordRef', 'sourceId'];

function costError(category) {
  return new TypeError(`cost-schema:${category}`);
}

function isReference(value) {
  return (
    value === null ||
    (typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 128 &&
      value === value.trim() &&
      ![...value].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code === 0x7f;
      }))
  );
}

export function makeDiagnostic({ code, sourceId = null, eventId = null, recordRef = null } = {}) {
  const diagnostic = { code, sourceId, eventId, recordRef };
  validateDiagnostic(diagnostic);
  return diagnostic;
}

export function validateDiagnostic(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw costError('diagnostic');
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== DIAGNOSTIC_KEYS.length ||
    keys.some((key, index) => key !== DIAGNOSTIC_KEYS[index])
  ) {
    throw costError('diagnostic-keys');
  }
  if (
    typeof value.code !== 'string' ||
    !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.code) ||
    value.code.length > 64
  ) {
    throw costError('diagnostic-code');
  }
  for (const key of ['sourceId', 'eventId', 'recordRef']) {
    if (!isReference(value[key])) throw costError('diagnostic-reference');
  }
  return value;
}
