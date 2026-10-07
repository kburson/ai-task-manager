// @story #1208 #1307
/** Pure partitioning seam for the runner's sequential execution phases. */

import { laneOf } from './task-tracker/lib/test-lanes.mjs';
import { runPool } from './run-tests-pool.mjs';
import { nativeSerialSection } from './run-tests-native-sections.mjs';
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

  const label = (entry) => (typeof entry === 'string' ? entry : entry.label);
  const executionSections = [
    { name: 'pooled', files: pooledEntries.map(label), elapsedMs: pooledElapsedMs },
    { name: 'subprocess', files: subprocessEntries.map(label), elapsedMs: subprocessElapsedMs },
    {
      name: 'slow-parallel',
      files: slowParallelEntries.map(label),
      elapsedMs: slowParallelElapsedMs,
    },
  ].filter((section) => section.files.length);
  const serialPlan = planSerialSections(serialEntries);
  const serialStart = now();
  const resultsByEntry = new Map();
  for (const section of serialPlan) {
    const start = now();
    for (const entry of section.entries) resultsByEntry.set(entry, await runOne(entry));
    executionSections.push({
      name: section.name,
      files: section.entries.map(label),
      elapsedMs: Number(now() - start) / 1e6,
    });
  }
  const serialElapsedMs = Number(now() - serialStart) / 1e6;
  const serialResults = serialEntries.map((entry) => resultsByEntry.get(entry));

  return {
    pooledResults: pooled.results,
    subprocessResults: subprocess.results,
    slowParallelResults: slowParallel.results,
    serialResults,
    executionSections,
    pooledPeakConcurrency: pooled.peakConcurrency,
    subprocessPeakConcurrency: subprocess.peakConcurrency,
    slowParallelPeakConcurrency: slowParallel.peakConcurrency,
    pooledElapsedMs,
    subprocessElapsedMs,
    slowParallelElapsedMs,
    serialElapsedMs,
  };
}

// Pure partition of the already canonical selected serial entries. All members
// remain sequential; section boundaries change no concurrency or timeout.
export function planSerialSections(entries) {
  if (!Array.isArray(entries)) throw new TypeError('run-tests: serial entries required');
  const seen = new Set(),
    groups = new Map();
  for (const entry of entries) {
    const label = typeof entry === 'string' ? entry : entry?.label;
    if (typeof label !== 'string' || !label || seen.has(label))
      throw new Error('run-tests: duplicate or invalid serial member');
    seen.add(label);
    const name = nativeSerialSection(entry);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(entry);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([name, members]) => ({ name, entries: members }));
}
