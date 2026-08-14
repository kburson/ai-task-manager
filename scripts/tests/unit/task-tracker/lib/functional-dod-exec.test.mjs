#!/usr/bin/env node
// @story #231
// #231 — End-to-end proof that the sandbox results path (the `results` array
// shape `runVerbTest` produces) ticks Functional DoD items via `autoTickVerified`
// when their `aitm-verified cmd="..."` command passed, and leaves them unticked
// when it failed. `autoTickVerified` is invoked by `verbs/test.mjs` on the green
// path with one entry per `## Verification Commands` line; this test exercises
// the same contract with synthetic results.
// (#468 retired the legacy `aitm-verified-by:` form; fixtures updated.)
// (#721 extended autoTickVerified to also AND-fan-in-tick `## Acceptance
// Criteria` items whose `aitm-verified cmd="..."` resolves — via `vc:<n>`
// citation or legacy embedded command — to only passing commands; fixtures
// and assertions below updated to match.)
import { strict as assert } from 'node:assert';
import { autoTickVerified } from '../../../../task-tracker/lib/auto-tick-verified.mjs';

const BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] Hole 1 closed <!-- aitm-verified cmd="`node --test scripts/tests/unit/task-tracker/evidence-markers.test.mjs`" -->',
  '',
  '### Verification Commands',
  '',
  '- [ ] `node --test scripts/tests/unit/task-tracker/evidence-markers.test.mjs`',
  '- [ ] `npm test`',
  '- [ ] `npm run lint`',
  '',
  '## Definition of Done',
  '',
  '#### Functional (verified at Test)',
  '',
  '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test`" -->',
  '- [ ] Lint clean <!-- aitm-verified cmd="`npm run lint`" -->',
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
      command: 'node --test scripts/tests/unit/task-tracker/evidence-markers.test.mjs',
      passed: true,
      exit: 0,
    },
    { command: 'npm test', passed: true, exit: 0 },
    { command: 'npm run lint', passed: true, exit: 0 },
  ];
  const out = autoTickVerified(BODY, results);
  assert.deepEqual(out.tickedVc.sort(), [
    'node --test scripts/tests/unit/task-tracker/evidence-markers.test.mjs',
    'npm run lint',
    'npm test',
  ]);
  assert.deepEqual(out.tickedFunctional.sort(), ['All automated tests pass', 'Lint clean']);
  // Judgment item left alone.
  assert.match(out.body, /- \[ \] Acceptance criteria met \(judgment item — no marker\)/);
  // Lifecycle item left alone.
  assert.match(out.body, /- \[ \] Passed final human review/);
  // #721 — AC checkbox ticks too: its lone declared command passed.
  assert.deepEqual(out.tickedAc, ['Hole 1 closed']);
  assert.match(out.body, /- \[x\] Hole 1 closed <!-- aitm-verified cmd=/);
  console.log('PASS: all-green ticks VC + Functional + AC command-backed items');
}

// `npm test` FAILED → Functional `All automated tests pass` stays unticked even
// though `npm run lint` and the AC test passed.
{
  const results = [
    {
      command: 'node --test scripts/tests/unit/task-tracker/evidence-markers.test.mjs',
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
  assert.match(out.body, /- \[ \] All automated tests pass <!-- aitm-verified cmd=/);
  // Lint Functional item still ticked.
  assert.ok(out.tickedFunctional.includes('Lint clean'));
  // #721 — AC ticks independently: its own cited command passed, regardless
  // of `npm test`'s unrelated failure.
  assert.deepEqual(out.tickedAc, ['Hole 1 closed']);
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
      command: 'node --test scripts/tests/unit/task-tracker/evidence-markers.test.mjs',
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
  assert.equal(second.tickedAc.length, 0, 'no new AC ticks the second pass');
  console.log('PASS: idempotent over green body');
}

console.log('functional-dod-exec.test.mjs: all passed');
