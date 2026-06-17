#!/usr/bin/env node
// @story #231
// #231 — End-to-end proof that the sandbox results path (the `results` array
// shape `runVerbTest` produces) ticks Functional DoD items via `autoTickVerified`
// when their `aitm-verified-by` command passed, and leaves them unticked when it
// failed. `autoTickVerified` is invoked by `verbs/test.mjs` on the green path
// with one entry per `## Verification Commands` line; this test exercises the
// same contract with synthetic results.
import { strict as assert } from 'node:assert';
import { autoTickVerified } from '../lib/auto-tick-verified.mjs';

const BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] Hole 1 closed <!-- aitm-verified-by: `node --test scripts/task-tracker/tests/evidence-markers.test.mjs` -->',
  '',
  '### Verification Commands',
  '',
  '- [ ] `node --test scripts/task-tracker/tests/evidence-markers.test.mjs`',
  '- [ ] `npm test`',
  '- [ ] `npm run lint`',
  '',
  '## Definition of Done',
  '',
  '#### Functional (verified at Test)',
  '',
  '- [ ] All automated tests pass <!-- aitm-verified-by: `npm test` -->',
  '- [ ] Lint clean <!-- aitm-verified-by: `npm run lint` -->',
  '- [ ] Acceptance criteria met (judgment item — no marker)',
  '',
  '#### Lifecycle (auto-ticked at Review/Close)',
  '',
  '- [ ] Passed final human review',
].join('\n');

// All-green sandbox results → AC unchanged (autoTickVerified only does VC +
// Functional), VC all ticked, Functional command-backed items ticked, judgment
// item & lifecycle untouched.
{
  const results = [
    {
      command: 'node --test scripts/task-tracker/tests/evidence-markers.test.mjs',
      passed: true,
      exit: 0,
    },
    { command: 'npm test', passed: true, exit: 0 },
    { command: 'npm run lint', passed: true, exit: 0 },
  ];
  const out = autoTickVerified(BODY, results);
  assert.deepEqual(out.tickedVc.sort(), [
    'node --test scripts/task-tracker/tests/evidence-markers.test.mjs',
    'npm run lint',
    'npm test',
  ]);
  assert.deepEqual(out.tickedFunctional.sort(), ['All automated tests pass', 'Lint clean']);
  // Judgment item left alone.
  assert.match(out.body, /- \[ \] Acceptance criteria met \(judgment item — no marker\)/);
  // Lifecycle item left alone.
  assert.match(out.body, /- \[ \] Passed final human review/);
  // AC checkbox is NOT ticked by autoTickVerified — that's outside its scope.
  assert.match(out.body, /- \[ \] Hole 1 closed <!-- aitm-verified-by:/);
  console.log('PASS: all-green ticks VC + Functional command-backed items only');
}

// `npm test` FAILED → Functional `All automated tests pass` stays unticked even
// though `npm run lint` and the AC test passed.
{
  const results = [
    {
      command: 'node --test scripts/task-tracker/tests/evidence-markers.test.mjs',
      passed: true,
      exit: 0,
    },
    { command: 'npm test', passed: false, exit: 1 },
    { command: 'npm run lint', passed: true, exit: 0 },
  ];
  const out = autoTickVerified(BODY, results);
  // `npm test` not ticked in VC.
  assert.ok(!out.tickedVc.includes('npm test'));
  assert.match(out.body, /- \[ \] `npm test`/);
  // `npm test`-backed Functional item not ticked.
  assert.ok(!out.tickedFunctional.includes('All automated tests pass'));
  assert.match(out.body, /- \[ \] All automated tests pass <!-- aitm-verified-by: `npm test` -->/);
  // Lint Functional item still ticked.
  assert.ok(out.tickedFunctional.includes('Lint clean'));
  console.log('PASS: failed exit leaves command-backed Functional item unticked');
}

// Empty results → no-op (red path or pre-execution call).
{
  const out = autoTickVerified(BODY, []);
  assert.equal(out.tickedVc.length, 0);
  assert.equal(out.tickedFunctional.length, 0);
  assert.equal(out.body, BODY);
  console.log('PASS: empty results is a no-op');
}

// Idempotent — running again over the already-green body re-emits the same
// ticks (the boxes are already `[x]`, so no additional changes, but the function
// must not throw or corrupt the body).
{
  const greenResults = [
    {
      command: 'node --test scripts/task-tracker/tests/evidence-markers.test.mjs',
      passed: true,
      exit: 0,
    },
    { command: 'npm test', passed: true, exit: 0 },
    { command: 'npm run lint', passed: true, exit: 0 },
  ];
  const first = autoTickVerified(BODY, greenResults);
  const second = autoTickVerified(first.body, greenResults);
  assert.equal(second.body, first.body);
  assert.equal(second.tickedVc.length, 0, 'no new VC ticks the second pass');
  assert.equal(second.tickedFunctional.length, 0, 'no new Functional ticks the second pass');
  console.log('PASS: idempotent over green body');
}

console.log('functional-dod-exec.test.mjs: all passed');
