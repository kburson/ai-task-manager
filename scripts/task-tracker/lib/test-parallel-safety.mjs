// @story #863 #1307
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
 * A directly detected subprocess file runs in a reduced-concurrency phase after
 * the pure pool drains; a pure in-process file runs in the pure pool. Explicitly
 * unsafe and unreadable files remain exclusive serial. Conservative classification
 * costs wall time, while admitting an unsafe file to the pure pool can reintroduce
 * the flake.
 */

import { readFileSync } from 'node:fs';
import { parse } from 'espree';

/**
 * Matches any use of `node:child_process` — the ESM import, the CJS require, or a
 * bare `child_process` identifier reference. A file that pulls in child_process
 * is assumed to spawn (the rare import-but-never-spawn file is harmlessly moved
 * to the reduced pool). Comments mentioning the word are an accepted, conservative false
 * positive — they only move that file to the reduced pool, never correctness.
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
 * Explicit per-file opt-in for a test that spawns subprocesses transitively
 * through an imported helper. The required rationale keeps that safety claim
 * reviewable where the test makes it.
 */
export const PARALLEL_SUBPROCESS_MARKER_RE =
  /@parallel-subprocess\b[ \t]*\([ \t]*[^\s)\r\n][^)\r\n]*\)/;

/**
 * Slow tests are fail-closed serial unless their own source explicitly opts in.
 * The required parenthesized rationale keeps the safety claim reviewable at the
 * file that owns it instead of hiding a growing allowlist in the runner.
 */
export const SLOW_PARALLEL_SAFE_MARKER_RE =
  /@slow-parallel-safe[ \t]*\([ \t]*[^\s)\r\n][^)\r\n]*\)/;

export const TEST_SCHEDULING_CLASSES = Object.freeze({
  POOLED: 'pooled',
  SUBPROCESS: 'subprocess',
  SLOW_PARALLEL: 'slow-parallel',
  SERIAL: 'serial',
});

/**
 * Read scheduling declarations from source comments only. Source that cannot
 * be parsed is deliberately unknown: callers fail closed to the serial phase.
 *
 * @param {string} src
 * @returns {{unsafe: boolean, subprocess: boolean, malformedSubprocess: boolean, slowParallel: boolean}|null}
 */
function schedulingMarkers(src) {
  let comments;
  try {
    ({ comments } = parse(src, {
      comment: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    }));
  } catch {
    return null;
  }

  const values = comments.map(({ value }) => value);
  return {
    unsafe: values.some((value) => PARALLEL_UNSAFE_MARKER_RE.test(value)),
    subprocess: values.some((value) => PARALLEL_SUBPROCESS_MARKER_RE.test(value)),
    malformedSubprocess: values.some((value) =>
      [...value.matchAll(/@parallel-subprocess\b/g)].some(
        ({ index }) => PARALLEL_SUBPROCESS_MARKER_RE.exec(value.slice(index))?.index !== 0
      )
    ),
    slowParallel: values.some((value) => SLOW_PARALLEL_SAFE_MARKER_RE.test(value)),
  };
}

/**
 * Classify one slow test for the dedicated bounded phase. Opt-in is explicit;
 * unreadable, unmarked, or conflicting unsafe sources remain serial.
 *
 * @param {string} fullPath
 * @param {(p: string, enc: string) => string} [read]
 * @returns {'slow-parallel'|'serial'}
 */
export function slowTestSchedulingClass(fullPath, read = readFileSync) {
  let src;
  try {
    src = read(fullPath, 'utf8');
  } catch {
    return TEST_SCHEDULING_CLASSES.SERIAL;
  }
  const markers = schedulingMarkers(src);
  if (!markers || markers.unsafe || markers.malformedSubprocess) {
    return TEST_SCHEDULING_CLASSES.SERIAL;
  }
  return markers.slowParallel
    ? TEST_SCHEDULING_CLASSES.SLOW_PARALLEL
    : TEST_SCHEDULING_CLASSES.SERIAL;
}

/**
 * Classify one test source for the runner's three sequential unit phases.
 * Explicit unsafe markers, malformed transitive-subprocess declarations, and
 * unreadable or unparseable sources remain fail-closed serial. Direct
 * subprocess users and rationale-bearing transitive declarations enter the
 * reduced pool.
 *
 * @param {string} fullPath
 * @param {(p: string, enc: string) => string} [read]
 * @returns {'pooled'|'subprocess'|'serial'}
 */
export function testSchedulingClass(fullPath, read = readFileSync) {
  let src;
  try {
    src = read(fullPath, 'utf8');
  } catch {
    return TEST_SCHEDULING_CLASSES.SERIAL;
  }
  const markers = schedulingMarkers(src);
  if (!markers || markers.unsafe || markers.malformedSubprocess) {
    return TEST_SCHEDULING_CLASSES.SERIAL;
  }
  return spawnsSubprocess(src) || markers.subprocess
    ? TEST_SCHEDULING_CLASSES.SUBPROCESS
    : TEST_SCHEDULING_CLASSES.POOLED;
}

/**
 * Is this test file safe to run inside the bounded parallel pool?
 *
 * Pure in-process tests are eligible for the original `cpus - 1` pool. Directly
 * detected subprocess tests are not eligible for that saturated pool, but run in
 * the reduced phase instead of exclusive serial. A file that cannot be read is
 * treated as UNSAFE — unknown provenance defaults to the serial phase rather than
 * risk a flake. A file carrying the `@parallel-unsafe` marker is always treated as
 * UNSAFE, independent of `SUBPROCESS_RE` — it declares a hazard the own-source scan
 * cannot see (e.g. a transitive subprocess spawn via an imported helper). A
 * rationale-bearing `@parallel-subprocess` comment declares the latter hazard
 * for the reduced subprocess phase instead.
 *
 * @param {string} fullPath - absolute path to the `*.test.mjs` file
 * @param {(p: string, enc: string) => string} [read] - injectable reader (tests)
 * @returns {boolean} true → eligible for the pure pool; false → use another phase
 */
export function isParallelSafe(fullPath, read = readFileSync) {
  return testSchedulingClass(fullPath, read) === TEST_SCHEDULING_CLASSES.POOLED;
}
