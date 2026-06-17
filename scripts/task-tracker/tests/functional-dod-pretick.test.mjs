#!/usr/bin/env node
// @story #231
// #231 — `detectFunctionalPretick` un-ticks command-backed Functional DoD
// items so the sandbox-driven re-tick (autoTickVerified) is the only path to
// green. Judgment items (no `aitm-verified-by` marker) must be left alone.
import { strict as assert } from 'node:assert';
import { detectFunctionalPretick } from '../lib/lifecycle-dod.mjs';

// Pre-ticked command-backed item is un-ticked; regression is recorded.
{
  const body = [
    '## Definition of Done',
    '',
    '#### Functional (verified at Test)',
    '',
    '- [x] All automated tests pass <!-- aitm-verified-by: `npm test` -->',
    '- [x] Acceptance criteria met (including additions from deep dive)',
    '- [ ] Lint passes <!-- aitm-verified-by: `npm run lint` -->',
    '',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Passed final human review',
  ].join('\n');
  const out = detectFunctionalPretick(body);
  assert.equal(out.regressions.length, 1);
  assert.match(out.regressions[0].label, /All automated tests pass/);
  // Judgment item still ticked, command-backed item now un-ticked.
  assert.match(out.body, /- \[x\] Acceptance criteria met \(including additions from deep dive\)/);
  assert.match(out.body, /- \[ \] All automated tests pass <!-- aitm-verified-by: `npm test` -->/);
  // Lifecycle section untouched.
  assert.match(out.body, /- \[ \] Passed final human review/);
  console.log('PASS: command-backed pretick un-ticked, judgment item preserved');
}

// Idempotent — running again on already-clean body is a no-op.
{
  const body = [
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass <!-- aitm-verified-by: `npm test` -->',
  ].join('\n');
  const out = detectFunctionalPretick(body);
  assert.equal(out.regressions.length, 0);
  assert.equal(out.body, body);
  console.log('PASS: idempotent on clean body');
}

// No Functional section → safe return.
{
  const body = '## Acceptance Criteria\n- [ ] Something';
  const out = detectFunctionalPretick(body);
  assert.equal(out.regressions.length, 0);
  assert.equal(out.body, body);
  console.log('PASS: missing Functional section is safe');
}

// Multiple command-backed pre-ticks are all un-ticked in one pass.
{
  const body = [
    '#### Functional (verified at Test)',
    '',
    '- [x] Tests <!-- aitm-verified-by: `npm test` -->',
    '- [x] Lint <!-- aitm-verified-by: `npm run lint` -->',
    '- [x] Format <!-- aitm-verified-by: `npm run format:check` -->',
  ].join('\n');
  const out = detectFunctionalPretick(body);
  assert.equal(out.regressions.length, 3);
  assert.equal(out.body.match(/- \[ \]/g).length, 3);
  console.log('PASS: multiple pre-ticks un-ticked in one pass');
}

console.log('functional-dod-pretick.test.mjs: all passed');
