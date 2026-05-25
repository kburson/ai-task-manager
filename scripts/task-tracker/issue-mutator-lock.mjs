// cspell:ignore EISSUELOCKED
// Per-issue advisory lock for state-mutating verbs.
//
// EPIC #207 / #214 — Seq 3. Built on the same mkdir-based primitive as
// `locks.mjs` (used for the timing-comment append), but adds a `holder.json`
// payload inside the lock directory so contention messages can identify the
// session that holds the lock and when it grabbed it.
//
// Contract:
//   await withIssueLock(
//     { issue, verb, projDir, sessionId, timeoutMs, retries },
//     async () => { /* state mutation */ }
//   );
//
// - Lock path: `<projDir>/.ai-task-manager/locks/issue-<N>.lock` (a directory).
// - Payload file: `<lockPath>/holder.json` containing
//   `{ sessionId, pid, acquiredAt, verb }`.
// - On contention (lock held), retries `retries` times waiting `timeoutMs`ms
//   between attempts. After exhaustion, throws `IssueLockError` whose message
//   matches `/issue \d+ locked by session [^\s]+ \(held since /` and whose
//   `.holder` property is the parsed payload.
// - Stale-lock recovery: if the lock directory's mtime is older than
//   `ISSUE_LOCK_STALE_MS`, the dir is forcibly removed and acquisition retried.
//   This is the same recovery rule as `locks.mjs`, but here the holder file is
//   unlinked first so the rmdir succeeds.
// - Caller hint: when the inner `fn` spawns a child process that also calls
//   into a state-mutator chokepoint (e.g. verbs spawning `move-state.mjs`),
//   the inner script should detect `AITM_ISSUE_LOCK_HELD=1` and skip its own
//   lock acquisition. This module sets that env var for the duration of `fn`.
//
// Read-only verbs (`status`, `list`, `bind`) MUST NOT call this — that is
// asserted by `tests/verb-locks.test.mjs`.

import { mkdirSync, rmdirSync, writeFileSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';

export const ISSUE_LOCK_STALE_MS = 30_000;
export const ISSUE_LOCK_DEFAULT_RETRY_MS = 500;
export const ISSUE_LOCK_DEFAULT_RETRIES = 1;
export const ISSUE_LOCK_HELD_ENV = 'AITM_ISSUE_LOCK_HELD';

export class IssueLockError extends Error {
  constructor(message, { issue, holder } = {}) {
    super(message);
    this.name = 'IssueLockError';
    this.code = 'EISSUELOCKED';
    this.issue = issue;
    this.holder = holder || null;
  }
}

export function issueLockPath(issue, projDir) {
  return path.join(projDir, '.ai-task-manager', 'locks', `issue-${issue}.lock`);
}

function holderPath(lockPath) {
  return path.join(lockPath, 'holder.json');
}

export function readIssueLockHolder(lockPath) {
  try {
    return JSON.parse(readFileSync(holderPath(lockPath), 'utf8'));
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function tryReclaimStale(lockPath) {
  try {
    const age = Date.now() - statSync(lockPath).mtimeMs;
    if (age > ISSUE_LOCK_STALE_MS) {
      try {
        unlinkSync(holderPath(lockPath));
      } catch {
        /* holder may not exist */
      }
      try {
        rmdirSync(lockPath);
        return true;
      } catch {
        /* lost the race */
      }
    }
  } catch {
    /* lock vanished mid-stat */
  }
  return false;
}

export async function withIssueLock(opts, fn) {
  const {
    issue,
    verb = 'unknown',
    projDir,
    sessionId = process.env.CLAUDE_SESSION_ID ||
      process.env.AI_TASK_MANAGER_SESSION_ID ||
      `pid-${process.pid}`,
    timeoutMs = ISSUE_LOCK_DEFAULT_RETRY_MS,
    retries = ISSUE_LOCK_DEFAULT_RETRIES,
  } = opts || {};
  if (!issue) throw new Error('withIssueLock: issue is required');
  if (!projDir) throw new Error('withIssueLock: projDir is required');
  const lockPath = issueLockPath(issue, projDir);
  mkdirSync(path.dirname(lockPath), { recursive: true });

  let attempt = 0;
  let acquired = false;
  while (!acquired) {
    try {
      mkdirSync(lockPath);
      acquired = true;
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (tryReclaimStale(lockPath)) continue;
      if (attempt >= retries) {
        const holder = readIssueLockHolder(lockPath);
        const sid = holder?.sessionId || 'unknown';
        const since = holder?.acquiredAt || 'unknown';
        throw new IssueLockError(`issue ${issue} locked by session ${sid} (held since ${since})`, {
          issue,
          holder,
        });
      }
      attempt += 1;
      await sleep(timeoutMs);
    }
  }

  const payload = {
    sessionId,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    verb,
  };
  try {
    writeFileSync(holderPath(lockPath), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } catch {
    /* best-effort: contention error degrades to "unknown" if read fails */
  }

  const priorEnv = process.env[ISSUE_LOCK_HELD_ENV];
  process.env[ISSUE_LOCK_HELD_ENV] = '1';
  try {
    return await fn();
  } finally {
    if (priorEnv === undefined) delete process.env[ISSUE_LOCK_HELD_ENV];
    else process.env[ISSUE_LOCK_HELD_ENV] = priorEnv;
    try {
      unlinkSync(holderPath(lockPath));
    } catch {
      /* best-effort */
    }
    try {
      rmdirSync(lockPath);
    } catch {
      /* best-effort */
    }
  }
}
