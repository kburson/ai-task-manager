// #345 — shared verifier-execution primitives for evidence stamping.
//
// Extracted from `verbs/dod-stamp.mjs` (#303) so both `dod-stamp` (Functional
// DoD keys) and `ac-stamp` (Acceptance Criteria) run their declared
// `aitm-verified-by` commands the same way: in the project sandbox, refusing
// the stamp on any non-zero exit. The marker-stamping itself stays in the
// per-surface libraries (`functional-dod-evidence.mjs`, `ac-evidence.mjs`);
// this module owns only command execution + the small shared helpers.

import { TEST_RUNNER_TIMEOUT_MS } from './process-timeouts.mjs';

// Split an `aitm-verified-by` command (a backtick-delimited shell string) into
// argv. Conservative: split on whitespace. Commands declared in the templates
// use simple positional arguments (`npm test`, `npm run lint`,
// `git log --grep #303`); anything more complex should be wrapped in `bash -c`
// in the marker itself.
export function splitCmd(cmd) {
  return String(cmd || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
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

// Run each command in `commands` (raw backtick-stripped strings) sequentially
// via `pexec(bin, args, runOptions)`. Stops at the first non-zero exit.
//
// Returns { ran: [{ cmd, exit }], allPassed, firstFailure }.
//   - `ran` records every command actually attempted, in order, with its exit.
//   - `allPassed` is true iff every command exited 0 (and at least one ran).
//   - `firstFailure` is the first `{ cmd, exit }` with exit !== 0, or null.
//
// `runOptions` defaults: { cwd, timeout: TEST_RUNNER_TIMEOUT_MS,
// maxBuffer: 64 MiB } — verifier commands are typically test/lint runs whose
// stdout overflows the 1 MiB default.
export async function runVerifiers({ commands, pexec, cwd, timeout, maxBuffer } = {}) {
  const list = Array.isArray(commands) ? commands : [];
  const runOptions = {
    cwd,
    timeout: timeout ?? TEST_RUNNER_TIMEOUT_MS,
    maxBuffer: maxBuffer ?? 64 * 1024 * 1024,
  };
  const ran = [];
  let firstFailure = null;
  for (const raw of list) {
    const argv = splitCmd(raw);
    if (!argv.length) continue;
    const [bin, ...args] = argv;
    let exit = 0;
    try {
      await pexec(bin, args, runOptions);
    } catch (err) {
      // pexec convention: throw on non-zero. Best-effort capture exit code.
      exit = Number(err?.code ?? err?.status ?? 1) || 1;
    }
    ran.push({ cmd: raw, exit });
    if (exit !== 0 && firstFailure === null) {
      firstFailure = { cmd: raw, exit };
      break;
    }
  }
  return {
    ran,
    allPassed: ran.length > 0 && firstFailure === null,
    firstFailure,
  };
}
