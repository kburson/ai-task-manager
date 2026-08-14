#!/usr/bin/env node
// @story #610
// Coverage tests for the pure helpers in scripts/task-tracker/verbs/check.mjs:
// `toggleChecklistLine`, `toggleChecklistLines`, `parseCheckArgs`,
// `classifyUnverifiedTick`, `formatUnverifiedHatchRefusal`,
// `appendUnverifiedTickAudit`, `gateFunctionalDodTick`, and `gateEvidenceTick`.
//
// The async `verbCheck` orchestrator is covered by the sibling file
// `coverage-check-verb.test.mjs` (split out to keep each file under the
// 400-line cap). The pure functions are exercised directly here.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  toggleChecklistLine,
  toggleChecklistLines,
  parseCheckArgs,
  classifyUnverifiedTick,
  formatUnverifiedHatchRefusal,
  appendUnverifiedTickAudit,
  gateFunctionalDodTick,
  gateEvidenceTick,
} from '../../../../task-tracker/verbs/check.mjs';

// ---------------------------------------------------------------------------
// Shared issue-body fixture: an Acceptance-Criteria section and a Functional
// Definition-of-Done subsection covering every gate branch.
// ---------------------------------------------------------------------------
const AC_PLAIN = 'plain ac no verifier';
const AC_UNDECLARED = 'undeclared ac no verifier no marker';
const AC_VERIFIED = 'verified ac unchecked';
const AC_VERIFIED_CHECKED = 'verified ac checked';
const AC_DUP = 'dup label';
const DOD_TESTS = 'All automated tests pass';
const DOD_ACS = 'Acceptance criteria met';
const DOD_LINT_CHECKED = 'Lint and format checks pass';

function fixtureBody() {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_PLAIN} <!-- aitm-non-demonstrable -->`,
    `- [ ] ${AC_UNDECLARED}`,
    `- [ ] ${AC_VERIFIED} <!-- aitm-verified cmd="\`echo ok\`" -->`,
    `- [x] ${AC_VERIFIED_CHECKED} <!-- aitm-verified cmd="\`echo ok\`" -->`,
    `- [ ] ${AC_DUP}`,
    `- [ ] ${AC_DUP}`,
    '',
    '## Definition of Done',
    '',
    '### Functional (verified at Test)',
    '',
    `- [ ] ${DOD_TESTS} <!-- aitm-verified cmd="\`npm run test:all\`" --> <!-- dod:functional:tests -->`,
    `- [ ] ${DOD_ACS} <!-- dod:functional:acs -->`,
    `- [x] ${DOD_LINT_CHECKED} <!-- aitm-verified cmd="\`npm run lint\`" --> <!-- dod:functional:lint -->`,
    '',
    '<!-- aitm-fields: {"schema":1,"values":{}} -->',
    '',
  ].join('\n');
}

// ===========================================================================
// Pure helpers
// ===========================================================================

test('toggleChecklistLine: not-found', () => {
  assert.equal(toggleChecklistLine('- [ ] a', 'zzz').status, 'not-found');
});

test('toggleChecklistLine: ambiguous', () => {
  const body = ['- [ ] same', '- [ ] same'].join('\n');
  const r = toggleChecklistLine(body, 'same');
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.count, 2);
});

test('toggleChecklistLine: toggles unchecked → checked, preserving markers', () => {
  const body = '- [ ] foo <!-- aitm-verified cmd="`x`" -->';
  const r = toggleChecklistLine(body, 'foo');
  assert.equal(r.status, 'toggled');
  assert.equal(r.alreadyChecked, false);
  assert.match(r.body, /^- \[x\] foo <!-- aitm-verified/);
});

test('toggleChecklistLine: toggles checked → unchecked (full-line label arg)', () => {
  const line = '- [x] bar <!-- m -->';
  const r = toggleChecklistLine(line, line.replace(/^- \[x\] /, ''));
  assert.equal(r.status, 'toggled');
  assert.equal(r.alreadyChecked, true);
  assert.match(r.body, /^- \[ \] bar/);
});

test('toggleChecklistLines: folds mixed results', () => {
  const body = ['- [ ] a', '- [ ] dup', '- [ ] dup'].join('\n');
  const { results } = toggleChecklistLines(body, ['a', 'missing', 'dup']);
  assert.equal(results[0].status, 'toggled');
  assert.equal(results[1].status, 'not-found');
  assert.equal(results[2].status, 'ambiguous');
});

test('parseCheckArgs: labels, labels-file, positional, hatch flag', () => {
  const p = parseCheckArgs([
    '--label',
    'one',
    '--labels-file',
    '/tmp/x',
    '--allow-unverified-ticks',
    'pos',
    'tail',
  ]);
  assert.deepEqual(p.labels, ['one']);
  assert.equal(p.labelsFile, '/tmp/x');
  assert.equal(p.allowUnverifiedTicks, true);
  assert.deepEqual(p.positional, ['pos', 'tail']);
});

test('parseCheckArgs: trailing --label with no value is ignored', () => {
  const p = parseCheckArgs(['--label']);
  assert.deepEqual(p.labels, []);
});

test('classifyUnverifiedTick: eligible for a proofless AC tagged non-demonstrable', () => {
  assert.deepEqual(classifyUnverifiedTick(fixtureBody(), AC_PLAIN), { kind: 'eligible' });
});

test('classifyUnverifiedTick: refuses an undeclared AC (no verifier, no marker)', () => {
  const r = classifyUnverifiedTick(fixtureBody(), AC_UNDECLARED);
  assert.equal(r.kind, 'refuse-undeclared-ac');
  assert.equal(r.label, AC_UNDECLARED);
});

test('classifyUnverifiedTick: refuses a Functional DoD item', () => {
  assert.equal(classifyUnverifiedTick(fixtureBody(), DOD_TESTS).kind, 'refuse-dod');
});

test('classifyUnverifiedTick: refuses a verifier-bearing AC', () => {
  const r = classifyUnverifiedTick(fixtureBody(), AC_VERIFIED);
  assert.equal(r.kind, 'refuse-verifier-ac');
  assert.equal(r.label, AC_VERIFIED);
  assert.ok(r.commands.length);
});

test('formatUnverifiedHatchRefusal: names label and verifier', () => {
  const msg = formatUnverifiedHatchRefusal({
    label: 'L',
    issueRef: '#7',
    commands: ['my-cmd'],
  });
  assert.match(msg, /UNVERIFIED_HATCH_REFUSED/);
  assert.match(msg, /my-cmd/);
});

test('formatUnverifiedHatchRefusal: falls back when no commands', () => {
  const msg = formatUnverifiedHatchRefusal({ label: 'L', issueRef: '#7', commands: [] });
  assert.match(msg, /<verifier>/);
});

test('appendUnverifiedTickAudit: appends marker then is idempotent', () => {
  const once = appendUnverifiedTickAudit('body', { label: 'L', ts: 'T' });
  assert.match(once, /aitm-unverified-tick label="L" ts="T"/);
  const twice = appendUnverifiedTickAudit(once, { label: 'L', ts: 'T' });
  assert.equal(twice, once);
});

test('gateFunctionalDodTick: pass when no Functional section', () => {
  assert.deepEqual(gateFunctionalDodTick('## Acceptance Criteria\n- [ ] x', 'x'), {
    kind: 'pass',
  });
});

test('gateFunctionalDodTick: pass when label is not a DoD key', () => {
  assert.equal(gateFunctionalDodTick(fixtureBody(), AC_PLAIN).kind, 'pass');
});

test('gateFunctionalDodTick: pass when DoD item already checked', () => {
  assert.equal(gateFunctionalDodTick(fixtureBody(), DOD_LINT_CHECKED).kind, 'pass');
});

test('gateFunctionalDodTick: refuse-derived for acs key', () => {
  assert.equal(gateFunctionalDodTick(fixtureBody(), DOD_ACS).kind, 'refuse-derived');
});

test('gateFunctionalDodTick: refuse-missing-evidence for unstamped stampable key', () => {
  assert.equal(gateFunctionalDodTick(fixtureBody(), DOD_TESTS).kind, 'refuse-missing-evidence');
});

test('gateEvidenceTick: DoD non-pass propagates through', () => {
  assert.equal(gateEvidenceTick(fixtureBody(), DOD_TESTS).kind, 'refuse-missing-evidence');
});

test('gateEvidenceTick: pass for a non-verifier AC', () => {
  assert.equal(gateEvidenceTick(fixtureBody(), AC_PLAIN).kind, 'pass');
});

test('gateEvidenceTick: pass when verifier AC already checked', () => {
  assert.equal(gateEvidenceTick(fixtureBody(), AC_VERIFIED_CHECKED).kind, 'pass');
});

test('gateEvidenceTick: refuse-ac-evidence for unstamped verifier AC', () => {
  assert.equal(gateEvidenceTick(fixtureBody(), AC_VERIFIED).kind, 'refuse-ac-evidence');
});

console.log('coverage-check.test.mjs: defined');
