export const LEASE_ERROR_CODES = Object.freeze([
  'invalid-request',
  'idempotency-conflict',
  'lease-contended',
  'worktree-contended',
  'fence-stale',
  'authority-unauthenticated',
  'authority-forbidden',
  'authority-unavailable',
  'holder-live',
  'lease-not-held',
  'main-worktree-unresolved',
]);

const SECRET_KEY = /authorization|auth[-_]?token|token[-_]?env|secret|password|credential/i;

export function sanitizeLeaseDetails(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return value.map((item) => sanitizeLeaseDetails(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    output[key] = sanitizeLeaseDetails(item, seen);
  }
  return output;
}

export class WorkLeaseError extends Error {
  constructor(code, message, details = {}) {
    if (!LEASE_ERROR_CODES.includes(code)) {
      throw new TypeError(`unknown work-lease error code: ${code}`);
    }
    super(message);
    this.name = 'WorkLeaseError';
    this.code = code;
    this.details = sanitizeLeaseDetails(details);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export function invalidRequest(message, details) {
  throw new WorkLeaseError('invalid-request', message, details);
}
