// @story #1208
/** Pure partitioning seam for the runner's sequential execution phases. */

import { laneOf } from './task-tracker/lib/test-lanes.mjs';
import {
  TEST_SCHEDULING_CLASSES,
  testSchedulingClass,
} from './task-tracker/lib/test-parallel-safety.mjs';

/**
 * Partition canonical run entries without executing them. Only unit entries
 * can enter a concurrent phase; integration and slow entries stay serial.
 *
 * @param {Array<{label:string, full?:string}>} entries
 * @param {object} [options]
 * @param {(entry: object) => string} [options.laneOfEntry]
 * @param {(entry: object) => string} [options.classify]
 */
export function partitionTestEntries(
  entries,
  {
    laneOfEntry = (entry) => laneOf(entry.label),
    classify = (entry) => testSchedulingClass(entry.full),
  } = {}
) {
  const pooledEntries = [];
  const subprocessEntries = [];
  const serialEntries = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (laneOfEntry(entry) !== 'unit') {
      serialEntries.push(entry);
      continue;
    }
    const schedulingClass = classify(entry);
    if (schedulingClass === TEST_SCHEDULING_CLASSES.POOLED) pooledEntries.push(entry);
    else if (schedulingClass === TEST_SCHEDULING_CLASSES.SUBPROCESS) subprocessEntries.push(entry);
    else if (schedulingClass === TEST_SCHEDULING_CLASSES.SERIAL) serialEntries.push(entry);
    else throw new Error(`run-tests: unknown scheduling class ${String(schedulingClass)}`);
  }

  return { pooledEntries, subprocessEntries, serialEntries };
}
