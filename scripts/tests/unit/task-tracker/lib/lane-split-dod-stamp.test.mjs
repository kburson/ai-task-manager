#!/usr/bin/env node
// @story #934
// AC2 — a Functional-DoD `tests` line declaring the two lane commands resolves
// to both commands, and `runVerifiers` runs each as a SEPARATE child under its
// own (unchanged) TEST_RUNNER_TIMEOUT_MS budget. No real ~500s suite runs here:
// `pexec` is stubbed to record its invocations.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { parseEvidenceChecklist } from '../../../../task-tracker/lib/evidence-markers.mjs';
import { runVerifiers } from '../../../../task-tracker/lib/evidence-runner.mjs';
import { TEST_RUNNER_TIMEOUT_MS } from '../../../../task-tracker/lib/process-timeouts.mjs';

const TWO_LANE_BODY = [
  '## Definition of Done',
  '',
  '### Functional (verified at Test)',
  '',
  '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test` `npm run test:slow`" --> <!-- dod:functional:tests -->',
  '',
].join('\n');

test('two-lane tests DoD line resolves to both lane commands', () => {
  const parsed = parseEvidenceChecklist(TWO_LANE_BODY);
  const tests = parsed.functionalDodItems.find((it) => /automated tests/.test(it.label));
  assert.ok(tests, 'tests DoD item is parsed');
  assert.deepEqual(tests.evidenceCommands, ['npm test', 'npm run test:slow']);
});

test('runVerifiers spawns each lane as its own child under TEST_RUNNER_TIMEOUT_MS', async () => {
  const calls = [];
  const pexec = async (bin, args, opts) => {
    calls.push({ bin, args, timeout: opts.timeout });
    return { stdout: '', stderr: '' };
  };
  const res = await runVerifiers({
    commands: ['npm test', 'npm run test:slow'],
    pexec,
    cwd: '/tmp',
  });

  assert.equal(calls.length, 2, 'exactly two children spawned — one per lane');
  assert.deepEqual(
    calls.map((c) => [c.bin, ...c.args]),
    [
      ['npm', 'test'],
      ['npm', 'run', 'test:slow'],
    ]
  );
  // Each child gets the per-command budget, and it is the untouched 600s cap.
  assert.equal(TEST_RUNNER_TIMEOUT_MS, 600000);
  for (const c of calls) assert.equal(c.timeout, TEST_RUNNER_TIMEOUT_MS);
  assert.ok(res.allPassed, 'both lanes green');
});
