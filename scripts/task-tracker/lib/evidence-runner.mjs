// #345 — shared verifier-execution primitives for evidence stamping.
//
// Extracted from `verbs/dod-stamp.mjs` (#303) so both `dod-stamp` (Functional
// DoD keys) and `ac-stamp` (Acceptance Criteria) run their declared
// `aitm-verified-by` commands the same way: in the project sandbox, refusing
// the stamp on any non-zero exit. The marker-stamping itself stays in the
// per-surface libraries (`functional-dod-evidence.mjs`, `ac-evidence.mjs`);
// this module owns only command execution + the small shared helpers.

import { TEST_RUNNER_TIMEOUT_MS } from './process-timeouts.mjs';
import {
  isCacheEligible,
  lookup as cacheLookup,
  record as cacheRecord,
} from './verifier-cache.mjs';

// Split an `aitm-verified-by` command (a backtick-delimited shell string) into
// argv with POSIX-style quote handling. Single quotes pass their contents
// through literally (so `bash -c '<script>'` delivers the whole script as one
// argv entry); double quotes allow backslash escaping of `" \ $` and backtick;
// a bare backslash escapes the next character; runs of whitespace separate
// tokens. Unterminated quotes throw — that surfaces an authoring mistake rather
// than silently mis-splitting. Simple positional commands (`npm test`,
// `git log --grep #303`) tokenize exactly as before; quoted multi-word
// arguments (`grep -n -A3 'Verification Commands' file`) now survive intact
// instead of shattering (#546). The result is run WITHOUT a shell, so the argv
// must already be final — no further expansion happens.
export function splitCmd(cmd) {
  const s = String(cmd || '');
  const argv = [];
  let cur = '';
  let started = false; // a quoted empty token ("" / '') still counts as a token
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      if (started) {
        argv.push(cur);
        cur = '';
        started = false;
      }
      i++;
    } else if (c === "'") {
      started = true;
      i++;
      while (i < n && s[i] !== "'") {
        cur += s[i];
        i++;
      }
      if (i >= n) throw new Error(`splitCmd: unterminated single quote in: ${s}`);
      i++; // consume closing '
    } else if (c === '"') {
      started = true;
      i++;
      while (i < n && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < n && '"\\$`'.includes(s[i + 1])) {
          cur += s[i + 1];
          i += 2;
        } else {
          cur += s[i];
          i++;
        }
      }
      if (i >= n) throw new Error(`splitCmd: unterminated double quote in: ${s}`);
      i++; // consume closing "
    } else if (c === '\\') {
      if (i + 1 < n) {
        cur += s[i + 1];
        started = true;
        i += 2;
      } else {
        i++;
      }
    } else {
      cur += c;
      started = true;
      i++;
    }
  }
  if (started) argv.push(cur);
  return argv;
}

export async function headSha(pexec) {
  const { stdout } = await pexec('git', ['rev-parse', '--short', 'HEAD'], {});
  return String(stdout || '').trim() || 'unknown';
}

export function nowIso(deps) {
  // Tests can inject `deps.now` for determinism. Production: new Date().
  if (deps && typeof deps.now === 'function') return deps.now();
  return new Date().toISOString();
}

// Resolve the (HEAD sha, clean-tree) identity of `cwd` once, before the command
// loop. Any git failure → { sha: 'unknown', clean: false } so the caller's cache
// is disabled for the whole invocation (fail-safe — never a false reuse).
async function treeIdentity(pexec, cwd) {
  try {
    const { stdout: shaOut } = await pexec('git', ['rev-parse', '--short', 'HEAD'], { cwd });
    const sha = String(shaOut || '').trim();
    if (!sha) return { sha: 'unknown', clean: false };
    const { stdout: statusOut } = await pexec('git', ['status', '--porcelain'], { cwd });
    const clean = String(statusOut || '').trim() === '';
    return { sha, clean };
  } catch {
    return { sha: 'unknown', clean: false };
  }
}

// Run each command in `commands` (raw backtick-stripped strings) sequentially
// via `pexec(bin, args, runOptions)`. Stops at the first non-zero exit.
//
// Returns { ran: [{ cmd, exit, cached, ts }], allPassed, firstFailure, sha, clean }.
//   - `ran` records every command actually attempted (or served from cache), in
//     order, with its exit. `cached` is true when the result was served from the
//     content-addressed store instead of a fresh run; `ts` carries the ISO time
//     of the originating real run (for a hit, the ORIGINAL run's ts).
//   - `allPassed` is true iff every command exited 0 (and at least one ran).
//   - `firstFailure` is the first `{ cmd, exit }` with exit !== 0, or null.
//   - `sha` / `clean` are the resolved tree identity (present only when caching).
//
// `runOptions` defaults: { cwd, timeout: TEST_RUNNER_TIMEOUT_MS,
// maxBuffer: 64 MiB } — verifier commands are typically test/lint runs whose
// stdout overflows the 1 MiB default.
//
// `cache` (opt-in, #446): { dir, now? }. When supplied, eligible heavyweight
// suite commands consult/record a content-addressed result cache keyed on
// (normalized command, HEAD sha) at a clean tree. Callers that omit `cache`
// behave byte-identically to the pre-#446 runner. `now` is an injectable clock
// (() => ISO string) used to timestamp fresh runs that get recorded; defaults to
// `new Date().toISOString()`.
export async function runVerifiers({ commands, pexec, cwd, timeout, maxBuffer, cache, env } = {}) {
  const list = Array.isArray(commands) ? commands : [];
  const runOptions = {
    cwd,
    timeout: timeout ?? TEST_RUNNER_TIMEOUT_MS,
    maxBuffer: maxBuffer ?? 64 * 1024 * 1024,
    ...(env !== undefined ? { env } : {}),
  };
  const cacheDir = cache && cache.dir;
  const nowFn =
    cache && typeof cache.now === 'function' ? cache.now : () => new Date().toISOString();

  let sha = 'unknown';
  let clean = false;
  if (cacheDir) ({ sha, clean } = await treeIdentity(pexec, cwd));

  const ran = [];
  let firstFailure = null;
  for (const raw of list) {
    const argv = splitCmd(raw);
    if (!argv.length) continue;

    // Cache read: only at a clean tree, only for eligible commands, only when a
    // recorded green result exists at the current sha.
    if (cacheDir && clean && isCacheEligible(raw)) {
      const hit = cacheLookup({ dir: cacheDir, cmd: raw, sha });
      if (hit) {
        ran.push({ cmd: raw, exit: 0, cached: true, ts: hit.ts });
        continue;
      }
    }

    const [bin, ...args] = argv;
    let exit = 0;
    try {
      await pexec(bin, args, runOptions);
    } catch (err) {
      // pexec convention: throw on non-zero. Best-effort capture exit code.
      exit = Number(err?.code ?? err?.status ?? 1) || 1;
    }
    const ts = nowFn();
    ran.push({ cmd: raw, exit, cached: false, ts });

    // Cache write: record only genuine green runs at a clean tree for eligible
    // commands. `record` itself re-asserts these preconditions and prunes the
    // store to the current sha before inserting.
    if (cacheDir && clean && exit === 0) {
      cacheRecord({ dir: cacheDir, cmd: raw, sha, exit, ts });
    }

    if (exit !== 0 && firstFailure === null) {
      firstFailure = { cmd: raw, exit };
      break;
    }
  }
  return {
    ran,
    allPassed: ran.length > 0 && firstFailure === null,
    firstFailure,
    sha,
    clean,
  };
}
