// @story #1918 #1919
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { evaluateSections, ceilingMsForLane } from '../../../../run-tests-ceiling.mjs';
import {
  sandboxTimeoutMs,
  testExecutionTimeoutMs,
} from '../../../../task-tracker/lib/process-timeouts.mjs';
import { runVerifiers } from '../../../../task-tracker/lib/evidence-runner.mjs';

test('explicit contention suspension records elapsed time without a duration failure', () => {
  const result = evaluateSections({
    lane: 'integration',
    env: { AITM_TEST_EXECUTION_LIMITS: 'suspended' },
    sections: [{ name: 'serial', count: 159, elapsedMs: 627650 }],
  });
  assert.equal(result.breached, false);
  assert.equal(result.totalElapsedMs, 627650);
  assert.equal(result.sections[0].ceilingMs, null);
  assert.equal(result.sections[0].suspended, true);
});
test('revoking or misspelling suspension restores the original ceiling', () => {
  for (const value of ['', 'true', 'SUSPENDED'])
    assert.equal(ceilingMsForLane('integration', { AITM_TEST_EXECUTION_LIMITS: value }), 600000);
});
test('explicit suspension removes the lifecycle verifier execution deadline', () => {
  assert.equal(sandboxTimeoutMs({ AITM_TEST_EXECUTION_LIMITS: 'suspended' }), 0);
});

test('test-file and aggregate deadlines suspend only for the exact setting', () => {
  for (const deadline of [600000, 1200000]) {
    assert.equal(testExecutionTimeoutMs(deadline, { AITM_TEST_EXECUTION_LIMITS: 'suspended' }), 0);
    assert.equal(testExecutionTimeoutMs(deadline, {}), deadline);
    assert.equal(
      testExecutionTimeoutMs(deadline, { AITM_TEST_EXECUTION_LIMITS: 'true' }),
      deadline
    );
  }
});

test('suspended duration enforcement still rejects a real failing verifier and stops the next command', async () => {
  const result = await runVerifiers({
    commands: [
      `"${process.execPath}" -e "process.exit(3)"`,
      `"${process.execPath}" -e "process.exit(0)"`,
    ],
    pexec: promisify(execFile),
    cwd: process.cwd(),
    env: { ...process.env, AITM_TEST_EXECUTION_LIMITS: 'suspended' },
  });
  assert.equal(result.allPassed, false);
  assert.equal(result.firstFailure.exit, 3);
  assert.equal(result.ran.length, 1);
});
