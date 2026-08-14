// cspell:ignore EISSUELOCKED TOCTOU
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
// - Re-entrancy (#1261): a nested acquisition for an issue this call stack
//   already holds skips acquisition and runs its callback directly, so a parent
//   verb can delegate to a child verb that also guards itself (promote → test,
//   promote → move-state) without deadlocking against its own lock. Two carriers
//   express "held", and the distinction between them matters:
//
//     * In-process: an `AsyncLocalStorage` set of held tokens. Only the async
//       context DESCENDED from the holding frame sees it, which is what
//       separates true nesting from two concurrent same-issue runs sharing one
//       process — the latter are unrelated contexts, so they still contend and
//       still get `IssueLockError` (the #1169 Test entry interlock).
//     * Cross-process: `AITM_ISSUE_LOCK_HELD`, published for the duration of
//       `fn` so a spawned child inherits it. A token this process published is
//       deliberately NOT honored for in-process decisions — otherwise the
//       process-global env would re-introduce exactly the concurrency confusion
//       the async context exists to avoid.
//
//   The flag is issue-SCOPED: a nested acquisition for a different issue still
//   acquires its own lock. Cross-session protection is untouched — a competing
//   session neither shares this process's async context nor inherits its env.
//   Consumers outside this module must test with `isIssueLockHeld` rather than
//   comparing the raw env value.
//
// Read-only verbs (`status`, `list`, `bind`) MUST NOT call this — that is
// asserted by `tests/verb-locks.test.mjs`.

import { mkdirSync, rmdirSync, writeFileSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { issueLockPath } from './paths.mjs';

// #656 — the mtime TTL is no longer the primary staleness signal. It is an
// outer backstop, raised well above the longest expected guarded action (a
// `promote` develop→test sandbox run = `npm ci` + `test:all`, minutes long) so
// it only ever clears a reused-PID false-alive or a cross-host orphan — never a
// healthy local holder. Primary staleness is now PID liveness (see
// `tryReclaimStale`).
export const ISSUE_LOCK_STALE_MS = 30 * 60_000;
export const ISSUE_LOCK_DEFAULT_RETRY_MS = 500;
export const ISSUE_LOCK_DEFAULT_RETRIES = 1;
export const ISSUE_LOCK_HELD_ENV = 'AITM_ISSUE_LOCK_HELD';

// The value published in `ISSUE_LOCK_HELD_ENV`: the issue number the frame
// holds, normalized so `1261`, `'1261'` and `'#1261'` all produce `'1261'`.
// `issueLockPath` does no `#`-stripping of its own, so normalizing here is what
// keeps the env token and the lock path in agreement.
export function issueLockToken(issue) {
  return String(issue).trim().replace(/^#/, '');
}

// In-process held set, scoped to the async context of the holding frame. A
// concurrent same-issue run in this process is a SIBLING context, not a
// descendant, so it reads an empty set and contends normally.
const heldContext = new AsyncLocalStorage();

// Tokens this process itself published into the env, refcounted. Their presence
// in the env says nothing about the CURRENT call stack — only the async context
// does — so they are excluded from the env half of the predicate.
const selfPublished = new Map();

function heldHere(token) {
  const store = heldContext.getStore();
  return store ? store.has(token) : false;
}

function anyHeldHere() {
  const store = heldContext.getStore();
  return Boolean(store && store.size > 0);
}

// Shared predicate for every reader of the re-entrancy signal. Callers outside
// this module MUST use it rather than comparing the raw env value, because the
// value is an issue token, not a boolean, and because the env is only half the
// signal (see the module header).
//
//   - `issue` given → true only when THAT issue is held. This is the
//     issue-scoping that keeps a frame holding #A from waving through an
//     acquisition for #B.
//   - `issue` omitted → true when any issue is held. For callers that only need
//     "am I inside a locked frame at all" (e.g. an authority assertion).
//   - A bare `'1'` still reads as held for both shapes: it is the legacy
//     unscoped value, honored so a mixed-version process tree degrades to the
//     pre-#1261 behavior instead of double-acquiring.
//   - An explicit `env` argument (a constructed env object rather than
//     `process.env`) is read at face value, self-published tokens included: the
//     caller is asking about that env, typically one destined for a child.
export function isIssueLockHeld(issue, env = process.env) {
  const token = issue === undefined || issue === null ? null : issueLockToken(issue);
  if (token === null ? anyHeldHere() : heldHere(token)) return true;

  const raw = env?.[ISSUE_LOCK_HELD_ENV];
  if (raw === undefined || raw === null) return false;
  const held = String(raw).trim();
  if (held === '') return false;
  // A token this process published is not evidence about this call stack.
  if (env === process.env && selfPublished.has(held)) return false;
  if (held === '1') return true;
  if (token === null) return true;
  return held === token;
}

// This process's host + a per-incarnation nonce. `host` lets a reclaiming peer
// know whether `process.kill` means anything for the holder's PID; `startToken`
// is persisted so a recycled PID belonging to an unrelated process does not
// masquerade as the original holder (the liveness probe can reject a token
// mismatch — see `isProcessAlive` / `tryReclaimStale`).
export const THIS_HOST = os.hostname();
export const PROCESS_START_TOKEN = randomBytes(8).toString('hex');

// Default liveness probe: `process.kill(pid, 0)` performs the existence /
// permission check without delivering a signal. No throw ⇒ alive. `EPERM` ⇒
// the process exists but is owned by another uid ⇒ alive. `ESRCH` (or anything
// else) ⇒ dead. The `token` argument is accepted so the seam can model
// PID-reuse in tests (a recycled PID whose token no longer matches reads as
// dead); the real OS probe cannot interrogate another process's token, so it
// ignores the argument by design.
export function isProcessAlive(pid /* , token */) {
  if (pid == null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

export class IssueLockError extends Error {
  constructor(message, { issue, holder } = {}) {
    super(message);
    this.name = 'IssueLockError';
    this.code = 'EISSUELOCKED';
    this.issue = issue;
    this.holder = holder || null;
  }
}

export { issueLockPath };

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

// #656 — decide whether an existing lock may be reclaimed. The predicate is
// inverted from the old "old ⇒ assume dead" to "holder process dead ⇒ reclaim":
//
//   - Same-host holder with a live PID  → NOT reclaimable within the TTL
//     backstop, regardless of mtime age (fixes the core defect: a multi-minute
//     live `test:all` holder is no longer steamrolled). Past the raised TTL the
//     "alive" reading is distrusted as a recycled PID and reclaim is allowed.
//   - Same-host holder with a dead PID  → reclaimed IMMEDIATELY, no TTL wait.
//   - No holder / no PID / cross-host    → PID probing is meaningless; fall back
//     to the mtime TTL backstop.
//
// A TOCTOU recheck re-reads the holder just before removal and bails if the
// PID/token changed, so a fresh holder that won the dir microseconds earlier is
// never unlinked. `deps` (now / isProcessAlive / thisHost / staleMs) is an
// injection seam for deterministic tests.
export function tryReclaimStale(lockPath, deps = {}) {
  const now = deps.now || Date.now;
  const aliveProbe = deps.isProcessAlive || isProcessAlive;
  const thisHost = deps.thisHost || THIS_HOST;
  const staleMs = deps.staleMs == null ? ISSUE_LOCK_STALE_MS : deps.staleMs;
  try {
    const age = now() - statSync(lockPath).mtimeMs;
    const holder = readIssueLockHolder(lockPath);
    const canProbe =
      holder && holder.pid != null && holder.host != null && holder.host === thisHost;

    let reclaimable;
    if (!canProbe) {
      // Cross-host or PID-less holder: the OS probe says nothing useful, so the
      // mtime TTL backstop is the only signal.
      reclaimable = age > staleMs;
    } else if (aliveProbe(holder.pid, holder.startToken)) {
      // Holder process is alive on this host. Trust "alive" only within the
      // raised TTL; beyond it, treat as a recycled PID and let the backstop fire.
      reclaimable = age > staleMs;
    } else {
      // Holder process is dead → reclaim now, no TTL wait.
      reclaimable = true;
    }
    if (!reclaimable) return false;

    // TOCTOU: re-read the holder; bail if a fresh acquirer replaced it.
    if (holder) {
      const current = readIssueLockHolder(lockPath);
      if (current && (current.pid !== holder.pid || current.startToken !== holder.startToken)) {
        return false;
      }
    }

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
      process.env.CODEX_SESSION_ID ||
      `pid-${process.pid}`,
    timeoutMs = ISSUE_LOCK_DEFAULT_RETRY_MS,
    retries = ISSUE_LOCK_DEFAULT_RETRIES,
  } = opts || {};
  if (!issue) throw new Error('withIssueLock: issue is required');
  if (!projDir) throw new Error('withIssueLock: projDir is required');

  const token = issueLockToken(issue);

  // #1261 — re-entrancy short-circuit. Deliberately placed AFTER argument
  // validation (a malformed call stays a hard error, never a silent
  // pass-through) and BEFORE any lock-dir I/O: the nested frame must not touch
  // the directory or the env, because the outer `finally` below unconditionally
  // unlinks the holder and rmdirs the lock. A nested frame that duplicated that
  // teardown would release its parent's lock early. The holding frame stays the
  // sole owner of both the lock directory and the env restore.
  if (isIssueLockHeld(issue)) return await fn();

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
    host: THIS_HOST,
    startToken: PROCESS_START_TOKEN,
    acquiredAt: new Date().toISOString(),
    verb,
  };
  try {
    writeFileSync(holderPath(lockPath), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  } catch {
    /* best-effort: contention error degrades to "unknown" if read fails */
  }

  // Publish WHICH issue is held, not a bare boolean, so an acquisition for a
  // different issue still takes its own lock. The env carries the signal across
  // a process boundary; the async-context set below carries it in-process. Read
  // either back with `isIssueLockHeld`, never by comparing the raw value.
  const priorEnv = process.env[ISSUE_LOCK_HELD_ENV];
  process.env[ISSUE_LOCK_HELD_ENV] = token;
  selfPublished.set(token, (selfPublished.get(token) || 0) + 1);

  const inherited = heldContext.getStore();
  const nextHeld = new Set(inherited || []);
  nextHeld.add(token);

  try {
    return await heldContext.run(nextHeld, fn);
  } finally {
    const depth = (selfPublished.get(token) || 1) - 1;
    if (depth <= 0) selfPublished.delete(token);
    else selfPublished.set(token, depth);
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
