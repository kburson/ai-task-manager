#!/usr/bin/env node
// @story #806
// #806 — `verbs/dod-stamp.mjs` gates a Functional DoD key on
// `parseFunctionalDodKeys(body).find(k => k.key === key).evidenceCommands.length`
// (it refuses with "carries no verifier command" when the set is empty, then runs
// the resolved command(s) as its evidence). Before #806 a Functional line citing
// `vc-list="vc:<n>"` resolved to an EMPTY set — so dod-stamp refused a canonically
// cited line. These cases pin the fix at that exact gate: a vc-list-cited line now
// yields the concrete VC command(s) dod-stamp will run, and a legacy inline `cmd=`
// line is unchanged (no regression).

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseFunctionalDodKeys } from '../../lib/functional-dod-evidence.mjs';
import { renderVcSection } from '../../lib/vc-emit.mjs';

function bodyWith(functionalLines) {
  const vc = renderVcSection(['node --test a.test.mjs', 'npm run lint', 'npm run format:check']);
  return [vc, '', '#### Functional (verified at Test)', '', ...functionalLines, ''].join('\n');
}

test('#806 a vc-list-cited Functional DoD line clears the dod-stamp empty-command refusal (AC3)', () => {
  const body = bodyWith([
    '- [ ] tests green <!-- dod:functional:tests --> <!-- aitm-verified vc-list="vc:1" -->',
  ]);
  const target = parseFunctionalDodKeys(body).find((k) => k.key === 'tests');
  assert.ok(target, 'the tests key is parsed');
  assert.ok(
    target.evidenceCommands.length > 0,
    'evidenceCommands is non-empty, so dod-stamp does not refuse'
  );
  assert.deepEqual(
    target.evidenceCommands,
    ['node --test a.test.mjs'],
    'dod-stamp will run the vc:1-resolved command as its evidence'
  );
});

test('#806 a multi-id vc-list DoD line resolves to the atomic commands dod-stamp runs (AC3/AC4)', () => {
  const body = bodyWith([
    '- [ ] lint + format <!-- dod:functional:lint --> <!-- aitm-verified vc-list="vc:2 vc:3" -->',
  ]);
  const target = parseFunctionalDodKeys(body).find((k) => k.key === 'lint');
  assert.deepEqual(target.evidenceCommands, ['npm run lint', 'npm run format:check']);
});

test('#806 a legacy inline cmd DoD line still resolves — dod-stamp unchanged for legacy (AC5)', () => {
  const body = bodyWith([
    '- [ ] commits <!-- dod:functional:commits --> <!-- aitm-verified cmd="`git log --oneline -1`" -->',
  ]);
  const target = parseFunctionalDodKeys(body).find((k) => k.key === 'commits');
  assert.deepEqual(target.evidenceCommands, ['git log --oneline -1']);
});
