// @story #863
/**
 * Parallel-safety classifier for the runner's unit lane (#863).
 *
 * #863 parallelizes the unit lane at a bounded `cpus - 1` pool. But the unit
 * lane — `laneOf === 'unit'`, a directory-segment classification (#873) — still
 * physically contains ~87 integration-natured `*.test.mjs` files that spawn real
 * child processes (a `node`/`git`/`gh` subprocess, the task-tracker CLI, etc.).
 * Those files predate the pool and assume serial execution: under a CPU-saturated
 * pool their children get starved, a subprocess the test expects to exit `1`
 * gets SIGKILLed and returns `null`, and the suite flakes (~1 run in 3). The
 * proven case is `coverage-close.test.mjs` — `execFileSync` + a `gh` shell-out.
 *
 * Cross-FILE the runner already isolates by process: each `*.test.mjs` is its own
 * `node <file>` child, so a test's `chdir`, `process.env` mutation, or `mkdtemp`
 * cannot leak into a sibling file. The ONE hazard that crosses the process
 * boundary is shared CPU: N concurrent files each forking their own subprocess
 * oversubscribe the box. So the discriminator is deliberately narrow —
 * *does this file spawn subprocesses?* — not the broader "touches git/cwd/env".
 *
 * A file that spawns runs in the SERIAL phase (one at a time, its child gets the
 * CPU); a pure in-process file runs in the POOL. Erring toward serial is the safe
 * default: a false positive costs a little wall-time, a false negative reintroduces
 * the flake. This predicate is a #863-scoped bridge — #864 isolates the
 * integration lane and #868 physically relocates these files, after which the unit
 * lane is pure by construction and this classification converges on "all parallel".
 */

import { readFileSync } from 'node:fs';

/**
 * Matches any use of `node:child_process` — the ESM import, the CJS require, or a
 * bare `child_process` identifier reference. A file that pulls in child_process
 * is assumed to spawn (the rare import-but-never-spawn file is harmlessly kept
 * serial). Comments mentioning the word are an accepted, conservative false
 * positive — they only cost that file a pool slot, never correctness.
 */
export const SUBPROCESS_RE = /(?:from\s*|require\(\s*)['"]node:child_process['"]|\bchild_process\b/;

/**
 * Does this test source spawn child processes?
 *
 * @param {string} src - the file's UTF-8 source text
 * @returns {boolean} true if the file references node:child_process
 */
export function spawnsSubprocess(src) {
  return SUBPROCESS_RE.test(String(src ?? ''));
}

/**
 * Explicit per-file opt-out for a test that spawns a subprocess *transitively*,
 * through an imported helper — invisible to `SUBPROCESS_RE`'s own-source scan
 * (#974). Mirrors the codebase's existing `@story`/`cspell:ignore` per-file
 * marker convention: cheap, explicit, grep-able at the point of use, rather than
 * walking the full transitive import graph for one known offender at a time.
 */
export const PARALLEL_UNSAFE_MARKER_RE = /@parallel-unsafe\b/;

/**
 * Is this test file safe to run inside the bounded parallel pool?
 *
 * Pure in-process tests are safe; subprocess-spawning tests are not (they must
 * run serially so their children are not CPU-starved). A file that cannot be read
 * is treated as UNSAFE — unknown provenance defaults to the serial phase rather
 * than risk a flake. A file carrying the `@parallel-unsafe` marker is always
 * treated as UNSAFE, independent of `SUBPROCESS_RE` — it declares a hazard the
 * own-source scan cannot see (e.g. a transitive subprocess spawn via an imported
 * helper).
 *
 * @param {string} fullPath - absolute path to the `*.test.mjs` file
 * @param {(p: string, enc: string) => string} [read] - injectable reader (tests)
 * @returns {boolean} true → eligible for the pool; false → run serially
 */
export function isParallelSafe(fullPath, read = readFileSync) {
  let src;
  try {
    src = read(fullPath, 'utf8');
  } catch {
    return false;
  }
  if (PARALLEL_UNSAFE_MARKER_RE.test(src)) return false;
  return !spawnsSubprocess(src);
}
