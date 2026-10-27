import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { AprError } from '../errors.mjs';

function canonicalValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError('cyclic value');
    const next = new Set(ancestors).add(value);
    return value.map((entry) => canonicalValue(entry, next));
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    if (ancestors.has(value)) throw new TypeError('cyclic value');
    const next = new Set(ancestors).add(value);
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key], next)])
    );
  }
  throw new TypeError('unsupported value');
}

function canonicalJson(value) {
  try {
    return JSON.stringify(canonicalValue(value));
  } catch (cause) {
    const error = new AprError(
      'APR_STORE_VALUE_INVALID',
      'Value cannot be encoded as canonical JSON.',
      {
        recovery: 'Provide JSON-safe data with finite numbers, plain objects, and no cycles.',
      }
    );
    error.cause = cause;
    throw error;
  }
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, 'r');
    fsyncSync(descriptor);
  } catch (error) {
    const unsupported = new Set(['EINVAL', 'EISDIR', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM']);
    if (!unsupported.has(error?.code)) throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function atomicWrite(file, bytes) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
  let descriptor;
  try {
    mkdirSync(directory, { recursive: true });
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, payload);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, file);
    syncDirectory(directory);
  } catch (cause) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original write failure.
      }
    }
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // Cleanup is best-effort and limited to this operation's random sibling.
    }
    const error = new AprError('APR_ATOMIC_WRITE_FAILED', `Atomic write failed: ${file}`, {
      recovery: 'Verify the destination is writable and retry the peer-review command.',
      details: { file },
    });
    error.cause = cause;
    throw error;
  }
}

export function atomicCreate(file, bytes) {
  const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
  let descriptor;
  let linking = false;
  try {
    mkdirSync(directory, { recursive: true });
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, payload);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linking = true;
    linkSync(temporary, file);
    linking = false;
    unlinkSync(temporary);
    syncDirectory(directory);
  } catch (cause) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original failure.
      }
    }
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // Cleanup is best-effort and limited to this operation's random sibling.
    }
    if (cause?.code === 'EEXIST' && linking) {
      const error = new AprError('APR_OUTPUT_COLLISION', `Output already exists: ${file}`, {
        recovery: `Preserve ${file}, inspect the collision, and choose explicit recovery.`,
        details: { file },
      });
      error.cause = cause;
      throw error;
    }
    const error = new AprError('APR_ATOMIC_WRITE_FAILED', `Atomic create failed: ${file}`, {
      recovery: 'Verify the destination is writable and retry the peer-review command.',
      details: { file },
    });
    error.cause = cause;
    throw error;
  }
}

export async function withReviewLock(workspace, operation) {
  const lockDirectory = path.join(workspace, 'locks');
  const lockFile = path.join(lockDirectory, 'review.lock');
  const token = randomUUID();
  let descriptor;
  let created = false;
  let attemptedOpen = false;
  try {
    mkdirSync(lockDirectory, { recursive: true });
    attemptedOpen = true;
    descriptor = openSync(lockFile, 'wx', 0o600);
    created = true;
    writeFileSync(
      descriptor,
      `${canonicalJson({ schema: 'ai-peer-review.lock/v1', token, pid: process.pid, acquiredAt: new Date().toISOString() })}\n`
    );
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
  } catch (cause) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the acquisition failure.
      }
    }
    if (created) {
      try {
        unlinkSync(lockFile);
      } catch {
        // Cleanup is limited to the lock file this acquisition created.
      }
    }
    if (cause?.code === 'EEXIST' && attemptedOpen && !created) {
      throw new AprError('APR_REVIEW_LOCKED', 'The review is locked by another operation.', {
        recovery: `Wait for the owner recorded in ${lockFile} to finish, then retry.`,
        details: { lockFile },
      });
    }
    const error = new AprError('APR_REVIEW_LOCK_FAILED', 'The review lock could not be acquired.', {
      recovery: 'Verify the scratch workspace is writable and retry.',
      details: { lockFile },
    });
    error.cause = cause;
    throw error;
  }

  try {
    return await operation(Object.freeze({ lockFile, token }));
  } finally {
    try {
      const owner = JSON.parse(readFileSync(lockFile, 'utf8'));
      if (owner?.token === token) unlinkSync(lockFile);
    } catch (cause) {
      if (cause?.code !== 'ENOENT') {
        // A missing, malformed, or foreign lock is preserved for explicit recovery.
      }
    }
  }
}

export async function appendEvent(file, event) {
  const workspace = path.dirname(file);
  return withReviewLock(workspace, async () => {
    const prior = existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
    if (prior.length > 0 && prior.at(-1) !== 0x0a) {
      throw new AprError('APR_EVENT_LOG_CORRUPT', 'The event log ends with a torn record.', {
        recovery: 'Restore events.jsonl from its last complete newline-terminated record.',
        details: { file },
      });
    }
    const record = Buffer.from(`${canonicalJson(event)}\n`, 'utf8');
    atomicWrite(file, Buffer.concat([prior, record]));
    return Object.freeze({ file, bytes: record.length });
  });
}
