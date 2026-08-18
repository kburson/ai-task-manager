// @story #1208 #1307
/** Pure partitioning seam for the runner's sequential execution phases. */

import { laneOf } from './task-tracker/lib/test-lanes.mjs';
import { runPool } from './run-tests-pool.mjs';
import {
  TEST_SCHEDULING_CLASSES,
  slowTestSchedulingClass,
  testSchedulingClass,
} from './task-tracker/lib/test-parallel-safety.mjs';

/**
 * Partition canonical run entries without executing them. Only unit entries
 * can enter the saturated unit phases. Slow entries require an explicit
 * source-local opt-in for their separate two-worker phase; integration and all
 * unmarked slow entries stay serial.
 *
 * @param {Array<{label:string, full?:string}>} entries
 * @param {object} [options]
 * @param {(entry: object) => string} [options.laneOfEntry]
 * @param {(entry: object) => string} [options.classify]
 * @param {(entry: object) => string} [options.classifySlow]
 */
export function partitionTestEntries(
  entries,
  {
    laneOfEntry = (entry) => laneOf(entry.label),
    classify = (entry) => testSchedulingClass(entry.full),
    classifySlow = (entry) => slowTestSchedulingClass(entry.full),
  } = {}
) {
  const pooledEntries = [];
  const subprocessEntries = [];
  const slowParallelEntries = [];
  const serialEntries = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const entryLane = laneOfEntry(entry);
    if (entryLane === 'slow') {
      const schedulingClass = classifySlow(entry);
      if (schedulingClass === TEST_SCHEDULING_CLASSES.SLOW_PARALLEL) {
        slowParallelEntries.push(entry);
      } else if (schedulingClass === TEST_SCHEDULING_CLASSES.SERIAL) {
        serialEntries.push(entry);
      } else {
        throw new Error(`run-tests: unknown slow scheduling class ${String(schedulingClass)}`);
      }
      continue;
    }
    if (entryLane !== 'unit') {
      serialEntries.push(entry);
      continue;
    }
    const schedulingClass = classify(entry);
    if (schedulingClass === TEST_SCHEDULING_CLASSES.POOLED) pooledEntries.push(entry);
    else if (schedulingClass === TEST_SCHEDULING_CLASSES.SUBPROCESS) subprocessEntries.push(entry);
    else if (schedulingClass === TEST_SCHEDULING_CLASSES.SERIAL) serialEntries.push(entry);
    else throw new Error(`run-tests: unknown scheduling class ${String(schedulingClass)}`);
  }

  return { pooledEntries, subprocessEntries, slowParallelEntries, serialEntries };
}

/**
 * Execute the three scheduling phases behind strict sequential barriers.
 * The generic runner still owns the concrete child policy through `runOne`.
 */
export async function runTestPhases({
  pooledEntries,
  subprocessEntries,
  slowParallelEntries = [],
  serialEntries,
  pooledConcurrency,
  subprocessConcurrency,
  slowParallelConcurrency = 1,
  runOne,
  runPoolImpl = runPool,
  now = () => process.hrtime.bigint(),
}) {
  const pooledStart = now();
  const pooled = await runPoolImpl({
    entries: pooledEntries,
    concurrency: pooledConcurrency,
    runOne,
  });
  const pooledElapsedMs = Number(now() - pooledStart) / 1e6;

  const subprocessStart = now();
  const subprocess = await runPoolImpl({
    entries: subprocessEntries,
    concurrency: subprocessConcurrency,
    runOne,
  });
  const subprocessElapsedMs = Number(now() - subprocessStart) / 1e6;

  const slowParallelStart = now();
  const slowParallel = await runPoolImpl({
    entries: slowParallelEntries,
    concurrency: slowParallelConcurrency,
    runOne,
  });
  const slowParallelElapsedMs = Number(now() - slowParallelStart) / 1e6;

  const serialStart = now();
  const serialResults = [];
  for (const entry of serialEntries) serialResults.push(await runOne(entry));
  const serialElapsedMs = Number(now() - serialStart) / 1e6;

  return {
    pooledResults: pooled.results,
    subprocessResults: subprocess.results,
    slowParallelResults: slowParallel.results,
    serialResults,
    pooledPeakConcurrency: pooled.peakConcurrency,
    subprocessPeakConcurrency: subprocess.peakConcurrency,
    slowParallelPeakConcurrency: slowParallel.peakConcurrency,
    pooledElapsedMs,
    subprocessElapsedMs,
    slowParallelElapsedMs,
    serialElapsedMs,
  };
}
