import assert from 'node:assert/strict';

import { autoTickVerified } from '../lib/auto-tick-verified.mjs';

// ---------------------------------------------------------------------------
// Fixture: an issue body with a Verification Commands section and a DoD whose
// Functional items carry `aitm-verified-by` markers (command-backed) plus one
// judgment item with no marker, and a Lifecycle section that must never be
// touched here.
// ---------------------------------------------------------------------------
function fixtureBody() {
  return [
    '## Verification Commands',
    '',
    '- [ ] `npm test`',
    '- [ ] `npm run lint`',
    '- [ ] `npm run format:check`',
    '',
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified-by: `npm test` -->',
    '- [ ] Lint/format pass <!-- aitm-verified-by: `npm run lint` `npm run format:check` -->',
    '- [ ] Acceptance criteria met',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Passed final human review',
    '- [ ] Story closed',
    '',
  ].join('\n');
}

const ALL_GREEN = [
  { command: 'npm test', passed: true, exit: 0 },
  { command: 'npm run lint', passed: true, exit: 0 },
  { command: 'npm run format:check', passed: true, exit: 0 },
];

// --- all-green: VC boxes + command-backed Functional items ticked -----------
{
  const { body, tickedVc, tickedFunctional } = autoTickVerified(fixtureBody(), ALL_GREEN);
  assert.ok(body.includes('- [x] `npm test`'), 'npm test VC ticked');
  assert.ok(body.includes('- [x] `npm run lint`'), 'lint VC ticked');
  assert.ok(body.includes('- [x] `npm run format:check`'), 'format VC ticked');
  assert.ok(
    body.includes('- [x] All automated tests pass'),
    'npm test-backed Functional item ticked'
  );
  assert.ok(body.includes('- [x] Lint/format pass'), 'lint+format-backed Functional item ticked');
  assert.deepEqual(
    tickedVc.slice().sort(),
    ['npm run format:check', 'npm run lint', 'npm test'],
    'tickedVc reported'
  );
  assert.equal(tickedFunctional.length, 2, 'two Functional items reported');
}

// --- judgment item (no marker) left unticked on green -----------------------
{
  const { body } = autoTickVerified(fixtureBody(), ALL_GREEN);
  assert.ok(
    body.includes('- [ ] Acceptance criteria met'),
    'judgment item with no command marker stays unticked'
  );
}

// --- Lifecycle section never touched ----------------------------------------
{
  const { body } = autoTickVerified(fixtureBody(), ALL_GREEN);
  assert.ok(body.includes('- [ ] Passed final human review'), 'lifecycle item untouched');
  assert.ok(body.includes('- [ ] Story closed'), 'lifecycle item untouched');
}

// --- Functional item whose command is NOT in results -> unticked ------------
{
  const onlyLint = [{ command: 'npm run lint', passed: true, exit: 0 }];
  const { body } = autoTickVerified(fixtureBody(), onlyLint);
  assert.ok(body.includes('- [x] `npm run lint`'), 'lint VC ticked');
  assert.ok(body.includes('- [ ] `npm test`'), 'absent-result VC stays unticked');
  assert.ok(
    body.includes('- [ ] All automated tests pass'),
    'item needing npm test (no result) stays unticked'
  );
  // Lint/format item needs BOTH lint AND format:check; format absent -> unticked.
  assert.ok(
    body.includes('- [ ] Lint/format pass'),
    'item needing all of multiple commands stays unticked when one is absent'
  );
}

// --- mixed/red: only passing VC boxes tick ----------------------------------
{
  const mixed = [
    { command: 'npm test', passed: false, exit: 1 },
    { command: 'npm run lint', passed: true, exit: 0 },
    { command: 'npm run format:check', passed: true, exit: 0 },
  ];
  const { body } = autoTickVerified(fixtureBody(), mixed);
  assert.ok(body.includes('- [ ] `npm test`'), 'failed VC box stays unticked');
  assert.ok(body.includes('- [x] `npm run lint`'), 'passing VC box ticked');
  assert.ok(body.includes('- [x] `npm run format:check`'), 'passing VC box ticked');
  assert.ok(
    body.includes('- [ ] All automated tests pass'),
    'item depending on failed command stays unticked'
  );
  assert.ok(
    body.includes('- [x] Lint/format pass'),
    'item whose commands all passed is ticked even amid other failures'
  );
}

// --- idempotent: second pass over an already-ticked body is a no-op ---------
{
  const once = autoTickVerified(fixtureBody(), ALL_GREEN);
  const twice = autoTickVerified(once.body, ALL_GREEN);
  assert.equal(twice.body, once.body, 'second pass leaves body unchanged');
  assert.equal(twice.tickedVc.length, 0, 'nothing newly ticked on second pass');
  assert.equal(twice.tickedFunctional.length, 0, 'no Functional newly ticked on second pass');
}

// --- empty results -> no ticks ----------------------------------------------
{
  const { body, tickedVc, tickedFunctional } = autoTickVerified(fixtureBody(), []);
  assert.equal(body, fixtureBody(), 'empty results leave body unchanged');
  assert.equal(tickedVc.length, 0, 'no VC ticked');
  assert.equal(tickedFunctional.length, 0, 'no Functional ticked');
}

console.log('auto-tick-verified.test.mjs: all assertions passed');
