// @story #171
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSweepReport, formatSweepReport } from '../../../gh/verify-open-issue-bodies.mjs';

const CANONICAL_BODY = [
  '## Scope',
  '',
  'Some scope text.',
  '',
  '## Acceptance Criteria',
  '',
  '- [ ] Something works',
  '',
  '### Definition of Done',
  '',
  '#### Functional (verified at Test)',
  '',
  '- [ ] npm test passes',
  '',
  '#### Lifecycle (auto-ticked at Review/Close)',
  '',
  '- [ ] Story closed and moved to Done',
  '',
  '## Pickup Directive — MANDATORY, DO NOT SKIP',
  '> Follow: `.ai-task-manager/pickup-directive.md`',
  '',
].join('\n');

test('buildSweepReport: flags non-canonical bodies and counts failures', () => {
  const issues = [
    { number: 1, title: 'good', body: CANONICAL_BODY },
    { number: 2, title: 'bad', body: '## Scope\njust a scope, nothing else\n' },
    { number: 3, title: 'empty', body: '' },
  ];
  const { reports, failCount } = buildSweepReport(issues);
  assert.equal(failCount, 2);
  assert.equal(reports.find((r) => r.number === 1).ok, true);
  assert.equal(reports.find((r) => r.number === 2).ok, false);
  assert.ok(reports.find((r) => r.number === 2).missing.includes('## Acceptance Criteria'));
  assert.equal(reports.find((r) => r.number === 3).ok, false);
});

test('buildSweepReport: all-canonical corpus reports zero failures', () => {
  const issues = [
    { number: 10, title: 'a', body: CANONICAL_BODY },
    { number: 11, title: 'b', body: CANONICAL_BODY.replace('## Scope', '## Problem') },
  ];
  const { failCount } = buildSweepReport(issues);
  assert.equal(failCount, 0);
});

test('buildSweepReport: tolerates missing body field', () => {
  const { reports, failCount } = buildSweepReport([{ number: 7, title: 'x' }]);
  assert.equal(failCount, 1);
  assert.equal(reports[0].ok, false);
});

test('formatSweepReport: success summary names the corpus size', () => {
  const out = formatSweepReport(
    buildSweepReport([{ number: 1, title: 'a', body: CANONICAL_BODY }])
  );
  assert.match(out, /All 1 open issue bodies are canonical\./);
});

test('formatSweepReport: failure summary lists offending issue and ratio', () => {
  const out = formatSweepReport(
    buildSweepReport([{ number: 2, title: 'bad', body: '## Scope\nonly\n' }])
  );
  assert.match(out, /#2 — bad/);
  assert.match(out, /1\/1 open issue bodies failed the verifier\./);
});
