// @story #1408
/**
 * Offline `gh` test double (#1408 / rung 1 of #1407).
 *
 * Tests across the unit, integration, and slow lanes document themselves as
 * fully stubbed while still issuing live `gh` calls. A census of
 * `scripts/tests/slow/task-tracker/verbs/promote-verb.test.mjs` counted 49 real
 * invocations from one test process; every one is a network round-trip against
 * a fixture repo (`o/r`) that does not exist, and the resulting failures are
 * swallowed as non-fatal.
 *
 * The 49 split in two, and that split is why this helper has two layers:
 *
 *   - 32 are `gh api graphql --input -`, issued through the `#645` injectable
 *     seam `deps = { execFile, spawn }` in `scripts/gh/lib/github-projects.mjs`.
 *     Layer 1 overrides that seam in-process, so those calls never spawn at all.
 *   - 17 are `gh issue view …`, issued from module-level `const pexec =
 *     promisify(execFile)` bindings that no seam override can reach (see
 *     `lib/review-derive-rescan.mjs` and `lib/issue-body-push.mjs`). Layer 2
 *     prepends an offline `gh` executable to `PATH`, which intercepts every
 *     remaining child process regardless of which module spawned it.
 *
 * Layer 2 is what makes the double complete without touching production code.
 * Retiring those hardcoded bindings is #1409's job; failing closed on them is
 * #1410's. This helper only has to stop paying for them.
 *
 * Both layers default to **refusing**: exit 1 with `stub-gh: refused <argv>` on
 * stderr. That is deliberate. Those calls already fail today against the
 * nonexistent fixture repo, and callers already swallow the failure, so
 * refusing reproduces current observed behaviour exactly — no assertion changes
 * meaning — while paying nothing for it. Callers that need a real answer
 * register a response (layer 1 only; see `responses` below).
 */

import { EventEmitter } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';

import { deps as githubProjectsDeps } from '../../gh/lib/github-projects.mjs';
import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';

/** The refusal every unmatched invocation produces, on both layers. */
export function refusalFor(argv) {
  return {
    code: 1,
    stdout: '',
    stderr: `stub-gh: refused ${argv.join(' ')}\n`,
  };
}

// A response matches when its `match` is a predicate that returns true, or an
// argv prefix (array or whitespace-joined string) that the invocation starts
// with. A response with no `match` matches everything, so it reads as a
// catch-all default.
function matches(response, argv) {
  const { match } = response;
  if (match === undefined) return true;
  if (typeof match === 'function') return Boolean(match(argv));
  const prefix = Array.isArray(match) ? match : String(match).trim().split(/\s+/);
  return prefix.every((token, index) => argv[index] === token);
}

function resolveResponse(responses, argv) {
  const hit = responses.find((response) => matches(response, argv));
  if (!hit) return refusalFor(argv);
  return {
    code: hit.code ?? 0,
    stdout: hit.stdout ?? '',
    stderr: hit.stderr ?? '',
  };
}

function spawnError(argv, { code, stderr, stdout }) {
  const err = new Error(`gh exited ${code}: ${stderr}`);
  err.code = code;
  err.stderr = stderr;
  err.stdout = stdout;
  return err;
}

/**
 * Install the offline double.
 *
 * @param {object} [options]
 * @param {Array<{match?: Function|string|string[], stdout?: string, stderr?: string, code?: number}>} [options.responses]
 *   Layer-1 responses, first match wins. Unmatched invocations refuse.
 *   Layer 2 always refuses — a `PATH` shim cannot consult these without paying
 *   for a Node process per call, which is the cost this helper exists to avoid.
 * @param {{execFile: Function, spawn: Function}} [options.seam]
 *   The seam to override. Defaults to the live `github-projects` seam.
 * @param {NodeJS.ProcessEnv} [options.env] Environment whose `PATH` is shimmed.
 * @returns {{calls: Function, count: Function, restore: Function, binDir: string}}
 */
export function installStubGh({
  responses = [],
  seam = githubProjectsDeps,
  env = process.env,
} = {}) {
  const intercepted = [];

  // Layer 2 — the PATH shim. Materialized under the project scratch dir, never
  // `os.tmpdir()` (see `rules/scratch-dirs.md`); `/bin/sh` rather than Node so a
  // call costs no interpreter start-up.
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'stub-gh-'));
  const binDir = path.join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const logPath = path.join(dir, 'calls.log');
  writeFileSync(logPath, '');
  const shimPath = path.join(binDir, 'gh');
  writeFileSync(
    shimPath,
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${logPath}'`,
      `printf 'stub-gh: refused %s\\n' "$*" >&2`,
      'exit 1',
      '',
    ].join('\n')
  );
  chmodSync(shimPath, 0o755);

  const previousPath = env.PATH;
  env.PATH = `${binDir}${path.delimiter}${previousPath ?? ''}`;

  // Layer 1 — the in-process seam override.
  const previousExecFile = seam.execFile;
  const previousSpawn = seam.spawn;

  const stubExecFile = (file, args = [], options, callback) => {
    const done = typeof options === 'function' ? options : callback;
    const argv = [file, ...args];
    intercepted.push(argv.join(' '));
    const result = resolveResponse(responses, argv);
    queueMicrotask(() => {
      if (result.code === 0) done(null, result.stdout, result.stderr);
      else done(spawnError(argv, result), result.stdout, result.stderr);
    });
    return new EventEmitter();
  };

  // `gh()` calls `promisify(deps.execFile)(...)` and destructures `{ stdout }`.
  // The real `child_process.execFile` carries a `promisify.custom` that resolves
  // to `{ stdout, stderr }`; without it promisify resolves to the bare stdout
  // string and the destructure yields undefined. Carry the same symbol so the
  // double is substitutable for the real binding, not merely similar to it.
  stubExecFile[promisify.custom] = (file, args = [], options) =>
    new Promise((resolve, reject) => {
      stubExecFile(file, args, options, (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
        } else resolve({ stdout, stderr });
      });
    });

  seam.execFile = stubExecFile;

  seam.spawn = (file, args = []) => {
    const argv = [file, ...args];
    intercepted.push(argv.join(' '));
    const result = resolveResponse(responses, argv);
    const child = new EventEmitter();
    child.stdout = Readable.from(result.stdout ? [result.stdout] : []);
    child.stderr = Readable.from(result.stderr ? [result.stderr] : []);
    // `gh()` writes the graphql payload to stdin and ends it; swallow both.
    child.stdin = { write() {}, end() {} };
    // Let the caller attach its own listeners before the streams drain.
    setImmediate(() => child.emit('close', result.code));
    return child;
  };

  const pathLayerCalls = () => {
    if (!existsSync(logPath)) return [];
    return readFileSync(logPath, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => `gh ${line}`);
  };

  return {
    binDir,
    /** Every argv this double intercepted, seam layer first then PATH layer. */
    calls: () => [...intercepted, ...pathLayerCalls()],
    /** How many invocations the double absorbed across both layers. */
    count: () => intercepted.length + pathLayerCalls().length,
    restore: () => {
      seam.execFile = previousExecFile;
      seam.spawn = previousSpawn;
      if (previousPath === undefined) delete env.PATH;
      else env.PATH = previousPath;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
