#!/usr/bin/env node
// @story #259
// #303 — Gate tests for the Functional DoD evidence-marker contract enforced
// by `verbs/check.mjs::gateFunctionalDodTick`.
//
// Behaviour matrix:
//   - body without `dod:functional:KEY` markers → pass (legacy compat)
//   - tick request for label NOT in the Functional section → pass
//   - tick request for a stampable key WITHOUT evidence marker → refuse-missing-evidence
//   - tick request for a stampable key WITH evidence marker → pass
//   - tick request for a derived key (acs / checkboxes) → refuse-derived
//   - "untick" of an already-ticked Functional key → pass (gate only blocks ticks)

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { gateFunctionalDodTick } from '../../../verbs/check.mjs';

const KEYED_BODY = [
  '## Definition of Done',
  '',
  '#### Functional (verified at Test)',
  '',
  '- [ ] All automated tests pass <!-- aitm-verified-by: `npm test` --> <!-- dod:functional:tests -->',
  '- [ ] Lint and format checks pass <!-- aitm-verified-by: `npm run lint` --> <!-- dod:functional:lint -->',
  '- [ ] All changes committed <!-- aitm-verified-by: `git log` --> <!-- dod:functional:commits -->',
  '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
  '- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
  '',
].join('\n');

const LEGACY_BODY = [
  '## Definition of Done',
  '',
  '#### Functional (verified at Test)',
  '',
  '- [ ] All automated tests pass',
  '- [ ] Lint and format checks pass',
  '',
].join('\n');

test('legacy body without dod:functional markers passes the gate', () => {
  const r = gateFunctionalDodTick(LEGACY_BODY, 'All automated tests pass');
  assert.equal(r.kind, 'pass');
});

test('label outside Functional section passes the gate', () => {
  const r = gateFunctionalDodTick(KEYED_BODY, 'Some unrelated checkbox');
  assert.equal(r.kind, 'pass');
});

test('stampable key without evidence marker refuses with missing-evidence', () => {
  const r = gateFunctionalDodTick(KEYED_BODY, 'All automated tests pass');
  assert.equal(r.kind, 'refuse-missing-evidence');
  assert.equal(r.key, 'tests');
});

test('stampable key WITH evidence marker passes', () => {
  const stamped = KEYED_BODY.replace(
    '<!-- dod:functional:tests -->',
    '<!-- dod:functional:tests --> <!-- aitm-dod-evidence:tests cmd="npm test" exit=0 sha=abc ts=2026-01-01T00:00:00Z -->'
  );
  const r = gateFunctionalDodTick(stamped, 'All automated tests pass');
  assert.equal(r.kind, 'pass');
});

test('derived keys refuse outright with refuse-derived', () => {
  const acs = gateFunctionalDodTick(KEYED_BODY, 'Acceptance criteria met');
  assert.equal(acs.kind, 'refuse-derived');
  assert.equal(acs.key, 'acs');

  const cb = gateFunctionalDodTick(KEYED_BODY, 'Issue body checkboxes ticked');
  assert.equal(cb.kind, 'refuse-derived');
  assert.equal(cb.key, 'checkboxes');
});

test('already-ticked Functional key passes (unticking allowed)', () => {
  const ticked = KEYED_BODY.replace(
    '- [ ] All automated tests pass',
    '- [x] All automated tests pass'
  );
  const r = gateFunctionalDodTick(ticked, 'All automated tests pass');
  assert.equal(r.kind, 'pass');
});
