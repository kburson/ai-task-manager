// Generalized mkdir-based file lock.
//
// EPIC #207 / #213 — Seq 2 (hooks + timing-comment concurrency).
//
// Decision recorded in `docs/guides/settings-guide.md`: lock primitive is
// `mkdir(2)` because it is atomic on every POSIX filesystem we support and
// requires no native deps. This module generalizes the pattern proven in
// `fleet-registry.mjs#withLock` so callers (hook handlers, timing-comment
// appender, future state-mutator lock in Seq 3) share one implementation.
//
//   await withLock('.ai-task-manager/locks/timing-#213.lock', async () => {
//     // critical section
//   });
//
// Behavior:
//   - Creates `<lockPath>` as a directory; releases by `rmdir`.
//   - Polls with `LOCK_RETRY_MS` while waiting; throws after `timeoutMs`.
//   - Stale-lock recovery: a lock dir older than `LOCK_STALE_MS` is removed
//     and the acquirer retries (covers a crashed holder).
//   - `retries` controls how many times the FUNCTION body is re-invoked on
//     thrown errors INSIDE the critical section (separate from lock-wait
//     polling). Defaults to 0 — pass `retries: N` to wrap the body in a
//     try/catch retry loop, used by `gh-timing-comment` for ETag/last-write
//     conflicts on the GitHub comment mutation.
//
// The lock dir's parent is created on demand; callers do not need to mkdir
// it themselves.

import { mkdirSync, rmdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const LOCK_STALE_MS = 30_000;
export const LOCK_RETRY_MS = 25;
export const DEFAULT_TIMEOUT_MS = 5_000;

function sleep(ms) {
  // Async sleep — yields the event loop so the lock holder's async work can
  // progress. The sync `Atomics.wait` used by fleet-registry only works
  // there because its critical section is fully synchronous; an async
  // `withLock` body would deadlock under that primitive.
  return new Promise((r) => setTimeout(r, ms));
}

async function acquire(lockPath, timeoutMs) {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      mkdirSync(lockPath);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const age = Date.now() - statSync(lockPath).mtimeMs;
        if (age > LOCK_STALE_MS) {
          try {
            rmdirSync(lockPath);
          } catch {
            /* lost a race; retry */
          }
          continue;
        }
      } catch {
        /* lock vanished mid-stat; retry */
      }
      if (Date.now() > deadline) {
        throw new Error(`locks: timeout acquiring ${lockPath} after ${timeoutMs}ms`);
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
}

function release(lockPath) {
  try {
    rmdirSync(lockPath);
  } catch {
    /* best-effort */
  }
}

export async function withLock(lockPath, fn, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 0 } = {}) {
  await acquire(lockPath, timeoutMs);
  try {
    let attempt = 0;
    let lastErr;
    while (attempt <= retries) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        attempt += 1;
        if (attempt > retries) throw err;
      }
    }
    // Unreachable; satisfies linter.
    throw lastErr;
  } finally {
    release(lockPath);
  }
}
