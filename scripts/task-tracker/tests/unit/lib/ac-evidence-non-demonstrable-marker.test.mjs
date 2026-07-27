// @story #891
// findAcSectionCheckbox (ac-evidence.mjs) locates an AC-section checkbox line
// by visible label regardless of whether it declares a verifier — filling
// the gap parseEvidenceAcs/findEvidenceAc leave for verifier-less AC lines.
// classifyUnverifiedTick (verbs/check.mjs) uses it to add the `refuse-undeclared-ac`
// classification: an --allow-unverified-ticks tick against an AC line with no
// verifier AND no `<!-- aitm-non-demonstrable -->` marker is refused, closing
// the hole where such a line could be waved through the hatch forever.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findAcSectionCheckbox } from '../../../lib/ac-evidence.mjs';
import { classifyUnverifiedTick, formatUndeclaredAcRefusal } from '../../../verbs/check.mjs';

const HEAD = '## Acceptance Criteria\n\n';
const TAIL = '\n\n## Definition of Done\n\n- [ ] Passed final human review\n';

test('findAcSectionCheckbox finds a plain AC line with no verifier', () => {
  const body = HEAD + '- [ ] A plain criterion with no verifier' + TAIL;
  const found = findAcSectionCheckbox(body, 'A plain criterion with no verifier');
  assert.ok(found);
  assert.equal(found.checked, false);
  assert.equal(found.label, 'A plain criterion with no verifier');
});

test('findAcSectionCheckbox finds a marker-tagged AC by its stripped label', () => {
  const body = HEAD + '- [ ] Subjective goal <!-- aitm-non-demonstrable -->' + TAIL;
  const found = findAcSectionCheckbox(body, 'Subjective goal');
  assert.ok(found);
  assert.match(found.raw, /aitm-non-demonstrable/);
});

test('findAcSectionCheckbox returns null for a Definition of Done line (outside the AC section)', () => {
  const body = HEAD + '- [ ] Some AC' + TAIL;
  assert.equal(findAcSectionCheckbox(body, 'Passed final human review'), null);
});

test('findAcSectionCheckbox returns null when no line matches the label', () => {
  const body = HEAD + '- [ ] Some AC' + TAIL;
  assert.equal(findAcSectionCheckbox(body, 'Nonexistent AC'), null);
});

test('classifyUnverifiedTick refuses an undeclared AC (no verifier, no opt-out marker)', () => {
  const body = HEAD + '- [ ] A plain criterion with no verifier' + TAIL;
  const cls = classifyUnverifiedTick(body, 'A plain criterion with no verifier');
  assert.equal(cls.kind, 'refuse-undeclared-ac');
  assert.equal(cls.label, 'A plain criterion with no verifier');
});

test('classifyUnverifiedTick is eligible once the opt-out marker is present', () => {
  const body = HEAD + '- [ ] Subjective goal <!-- aitm-non-demonstrable -->' + TAIL;
  const cls = classifyUnverifiedTick(body, 'Subjective goal');
  assert.equal(cls.kind, 'eligible');
});

test('classifyUnverifiedTick still refuses a real-verifier AC as refuse-verifier-ac, not refuse-undeclared-ac', () => {
  const body =
    HEAD + '- [ ] Verified thing <!-- aitm-verified cmd="`node --test foo.test.mjs`" -->' + TAIL;
  const cls = classifyUnverifiedTick(body, 'Verified thing');
  assert.equal(cls.kind, 'refuse-verifier-ac');
});

test('classifyUnverifiedTick is eligible for a checkbox outside the AC section (unaffected)', () => {
  const body =
    HEAD + '- [ ] Some AC <!-- aitm-verified cmd="`node --test foo.test.mjs`" -->' + TAIL;
  const cls = classifyUnverifiedTick(body, 'Passed final human review');
  assert.equal(cls.kind, 'eligible');
});

test('formatUndeclaredAcRefusal names the label and points at both fixes', () => {
  const msg = formatUndeclaredAcRefusal({ label: 'A plain criterion', issueRef: '#891' });
  assert.match(msg, /A plain criterion/);
  assert.match(msg, /#891/);
  assert.match(msg, /ac-stamp/);
  assert.match(msg, /aitm-non-demonstrable/);
});
