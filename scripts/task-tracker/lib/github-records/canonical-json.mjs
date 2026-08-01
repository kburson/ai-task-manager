const MAX_NESTING_DEPTH = 64;

function canonicalJsonError(category) {
  return new TypeError(`canonical-json:invalid:${category}`);
}

function assertDataProperty(descriptor) {
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
    throw canonicalJsonError('property');
  }
}

function assertWellFormed(value) {
  if (!value.isWellFormed()) throw canonicalJsonError('unicode');
}

function serializeArray(value, ancestors, depth) {
  const keys = Object.keys(value);
  if (
    keys.length !== value.length ||
    keys.some((key, index) => key !== String(index)) ||
    Reflect.ownKeys(value).some((key) => key !== 'length' && !keys.includes(key))
  ) {
    throw canonicalJsonError('array');
  }

  const serialized = keys.map((key) => {
    assertDataProperty(Object.getOwnPropertyDescriptor(value, key));
    return serializeValue(value[key], ancestors, depth);
  });
  return `[${serialized.join(',')}]`;
}

function serializeObject(value, ancestors, depth) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw canonicalJsonError('object');
  }

  const keys = Object.keys(value);
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    throw canonicalJsonError('property');
  }

  const serialized = keys.sort().map((key) => {
    assertWellFormed(key);
    assertDataProperty(Object.getOwnPropertyDescriptor(value, key));
    return `${JSON.stringify(key)}:${serializeValue(value[key], ancestors, depth)}`;
  });
  return `{${serialized.join(',')}}`;
}

function serializeComposite(value, ancestors, depth) {
  if (ancestors.has(value)) throw canonicalJsonError('cycle');
  ancestors.add(value);
  try {
    return Array.isArray(value)
      ? serializeArray(value, ancestors, depth)
      : serializeObject(value, ancestors, depth);
  } finally {
    ancestors.delete(value);
  }
}

function serializeValue(value, ancestors, depth) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertWellFormed(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw canonicalJsonError('number');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw canonicalJsonError('value');
  if (depth >= MAX_NESTING_DEPTH) throw canonicalJsonError('nesting');
  return serializeComposite(value, ancestors, depth + 1);
}

/**
 * Serializes a durable JSON-domain value with recursively sorted object keys.
 * Values that native JSON would erase, coerce, or inspect through accessors are
 * rejected instead of being normalized silently.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalRecordJson(value) {
  return serializeValue(value, new Set(), 0);
}
