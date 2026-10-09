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

import { withRuntimeOperation } from './lib/runtime-writer.mjs';

export const LOCK_STALE_MS = 30_000;
export const LOCK_RETRY_MS = 25;
export const DEFAULT_TIMEOUT_MS = 5_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withLock(lockPath, fn, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 0 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let entered = false;
    try {
      return await withRuntimeOperation(lockPath, async () => {
        entered = true;
        for (let attempt = 0; ; attempt++) {
          try { return await fn(); }
          catch (error) {
            if (attempt >= retries) throw error;
          }
        }
      });
    } catch (error) {
      if (entered || error.code !== 'RUNTIME_MIGRATION_BUSY' || Date.now() >= deadline)
        throw error;
      await sleep(LOCK_RETRY_MS);
    }
  }
}
