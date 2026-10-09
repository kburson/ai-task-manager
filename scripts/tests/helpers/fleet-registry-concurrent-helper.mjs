#!/usr/bin/env node
import { registerTask } from '../../task-tracker/fleet-registry.mjs';
const [, , projectDir, issueRef, branch, delayMs] = process.argv;
if (delayMs) {
  const until = Date.now() + Number(delayMs);
  // eslint-disable-next-line no-empty -- intentional busy-wait for concurrency test
  while (Date.now() < until) {}
}
// The synchronous kernel refuses competing admission with a typed busy result.
// Retry only that result, never reclaim ownership, and retain a finite deadline.
const deadline = Date.now() + 15_000;
for (;;) {
  try {
    registerTask(projectDir, issueRef, `./.scratch/test/wt-${issueRef.replace('#', '')}`, branch);
    break;
  } catch (error) {
    if (error.code !== 'RUNTIME_MIGRATION_BUSY' || Date.now() >= deadline) throw error;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}
