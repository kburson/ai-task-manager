#!/usr/bin/env node
// @story #841
// #841 — marker-robust pre-close completeness scan. `uncheckedPreCloseCheckboxes`
// must recognize a lifecycle box even when it carries an HTML-comment evidence
// marker (the proven "Agent Review Passed" box), and must skip an
// intentionally-waived AC. Both the Test→Review completeness gate and the close
// gate funnel through this one function, so this covers both.
//
// Coverage:
//   - a MARKED unticked lifecycle box is still classified as lifecycle (excluded
//     from the unfinished-work set) — the marker no longer defeats the label
//     lookup.
//   - a plain unticked lifecycle box remains excluded (no regression).
//   - a waived unticked AC is excluded (never blocks close).
//   - a genuine unticked non-lifecycle, non-waived AC still blocks.
//   - fenced example checkboxes are still ignored.

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { uncheckedPreCloseCheckboxes } from '../../../close-gate.mjs';

test('a marked unticked lifecycle box is recognized as lifecycle (excluded)', () => {
  const body = [
    '## Definition of Done',
    '',
    '- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-07-16T00:00:00.000Z" sha="sandbox" validators="V1,V2" result="pass" -->',
    '',
  ].join('\n');
  assert.deepEqual(uncheckedPreCloseCheckboxes(body), []);
});

test('a plain unticked lifecycle box is excluded (no regression)', () => {
  const body = '## Definition of Done\n\n- [ ] Agent Review Passed\n';
  assert.deepEqual(uncheckedPreCloseCheckboxes(body), []);
});

test('a waived unticked AC is excluded (never blocks close)', () => {
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] Remote migration on #823 <!-- aitm-ac-waived -->',
    '',
  ].join('\n');
  assert.deepEqual(uncheckedPreCloseCheckboxes(body), []);
});

test('a genuine unticked non-lifecycle, non-waived AC still blocks', () => {
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] A real unfinished criterion',
    '- [ ] Agent Review Passed <!-- aitm-verified gate="agent-review" ts="2026-07-16T00:00:00.000Z" sha="sandbox" validators="V1" result="pass" -->',
    '',
  ].join('\n');
  assert.deepEqual(uncheckedPreCloseCheckboxes(body), ['- [ ] A real unfinished criterion']);
});

test('fenced example checkboxes are still ignored', () => {
  const body = [
    '## Notes',
    '',
    '```',
    '- [ ] An example box inside a fence',
    '```',
    '',
    '- [ ] A real unfinished criterion',
    '',
  ].join('\n');
  assert.deepEqual(uncheckedPreCloseCheckboxes(body), ['- [ ] A real unfinished criterion']);
});
