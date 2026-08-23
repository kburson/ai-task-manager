// @story #171
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSweepReport,
  formatSweepReport,
  hasStrictDiscussMarker,
} from '../../../../gh/verify-open-issue-bodies.mjs';

const CANONICAL_BODY = [
  '## User Story',
  '',
  'As a task author',
  'I want to create a canonical issue',
  'So that the open-issue audit accepts it',
  '',
  '## Scope',
  '',
  'Some scope text.',
  '',
  '## Story Origin',
  '',
  '- **kind**: code',
  '',
  '## Plan Metadata',
  '',
  '- **size**: S',
  '',
  '## Acceptance Criteria',
  '',
  '- [ ] Something works <!-- aitm-verified vc-list="vc:1" -->',
  '',
  '## Verification Commands',
  '',
  '- [ ] `node --test x.test.mjs` <!-- id=1 -->',
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
  '> Follow: `.ai-task-manager/templates/pickup-directive.md`',
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

// ── #480 AC9: {discuss} backlog stubs are exempt (pending Refine) ────────────
test('hasStrictDiscussMarker: matches only a bare-token line, not prose/backtick mentions', () => {
  assert.equal(hasStrictDiscussMarker('foo\n{discuss}\nbar'), true);
  assert.equal(hasStrictDiscussMarker('foo\n  {discuss}  \nbar'), true, 'trims whitespace');
  // #479 false-positive shapes the strict rule must REJECT:
  assert.equal(hasStrictDiscussMarker('we should {discuss} this later'), false);
  assert.equal(hasStrictDiscussMarker('use the `{discuss}` token'), false);
  assert.equal(hasStrictDiscussMarker(''), false);
  assert.equal(hasStrictDiscussMarker(undefined), false);
});

test('buildSweepReport: {discuss} stub is skipped, not failed', () => {
  const stub = '# Request\n\n{discuss}\n\nSomething to brainstorm later.\n';
  const issues = [
    { number: 1, title: 'good', body: CANONICAL_BODY },
    { number: 451, title: 'stub', body: stub },
    { number: 2, title: 'bad', body: '## Scope\nonly\n' },
  ];
  const { reports, failCount } = buildSweepReport(issues);
  assert.equal(failCount, 1, 'only the genuinely-malformed body counts as a failure');
  const stubReport = reports.find((r) => r.number === 451);
  assert.equal(stubReport.skipped, true);
  assert.equal(stubReport.ok, true);
  assert.deepEqual(stubReport.missing, []);
});

test('formatSweepReport: skipped stubs are listed distinctly and noted in the summary', () => {
  const stub = '# Request\n\n{discuss}\n';
  const out = formatSweepReport(
    buildSweepReport([
      { number: 10, title: 'good', body: CANONICAL_BODY },
      { number: 451, title: 'stub', body: stub },
    ])
  );
  assert.match(out, /#451 — stub/);
  assert.match(out, /⏭ skipped — \{discuss\} stub, pending Refine/);
  // scored count excludes the skip; summary notes the skip.
  assert.match(out, /All 1 open issue bodies are canonical \(1 skipped: \{discuss\} stubs\)\./);
});
