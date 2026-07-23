#!/usr/bin/env node
// @story #806
// #806 — the Functional-DoD command-extraction path reaches vc-list parity with
// the AC path (#803). These cases pin the two widened read-sites:
//   - `extractVerifiedCommands(label, vcItems)` (lib/proof-marker.mjs) resolves a
//     `vc-list` citation against the issue's parsed VC list, falls back to the
//     legacy inline `cmd=` scan, and `hasVerifiedDeclaration` stays a non-throwing
//     presence check.
//   - `parseFunctionalDodKeys(body)` (lib/functional-dod-evidence.mjs) parses the
//     body's `## Verification Commands` section once and threads it in, so each
//     `dod:functional:<key>` line's `vc-list` citation resolves in
//     `evidenceCommands`.

import { strict as assert } from 'node:assert';
import test from 'node:test';

import { extractVerifiedCommands, hasVerifiedDeclaration } from '../../../lib/proof-marker.mjs';
import { parseFunctionalDodKeys } from '../../../lib/functional-dod-evidence.mjs';
import { parseVerificationCommands } from '../../../lib/verification-commands.mjs';
import { renderVcSection, deleteVcById, appendVcCommands } from '../../../lib/vc-emit.mjs';

// A body with an id-stamped VC list (ids 1,2,3) and a Functional DoD subsection
// whose three keyed lines cite: a single id, a multi-id run, and a legacy inline
// command respectively.
function bodyWith(functionalLines) {
  const vc = renderVcSection(['node --test a.test.mjs', 'npm run lint', 'npm run format:check']); // ids 1,2,3
  return [vc, '', '#### Functional (verified at Test)', '', ...functionalLines, ''].join('\n');
}

const BODY = bodyWith([
  '- [ ] tests green <!-- dod:functional:tests --> <!-- aitm-verified vc-list="vc:1" -->',
  '- [ ] lint + format clean <!-- dod:functional:lint --> <!-- aitm-verified vc-list="vc:2 vc:3" -->',
  '- [ ] commits attributed <!-- dod:functional:commits --> <!-- aitm-verified cmd="`git log --oneline -1`" -->',
]);

test('#806 parseFunctionalDodKeys resolves a single-id vc-list citation (AC1)', () => {
  const items = parseFunctionalDodKeys(BODY);
  const tests = items.find((it) => it.key === 'tests');
  assert.ok(tests, 'the tests DoD line is parsed');
  assert.deepEqual(
    tests.evidenceCommands,
    ['node --test a.test.mjs'],
    'vc:1 resolves to its VC command'
  );
});

test('#806 multi-id vc-list resolves each cited id in order (AC4)', () => {
  const items = parseFunctionalDodKeys(BODY);
  const lint = items.find((it) => it.key === 'lint');
  assert.deepEqual(
    lint.evidenceCommands,
    ['npm run lint', 'npm run format:check'],
    'vc:2 vc:3 resolves both, in citation order'
  );
});

test('#806 legacy inline cmd on a Functional DoD line still resolves — no regression (AC5)', () => {
  const items = parseFunctionalDodKeys(BODY);
  const commits = items.find((it) => it.key === 'commits');
  assert.deepEqual(
    commits.evidenceCommands,
    ['git log --oneline -1'],
    'a backtick-embedded cmd resolves byte-identically to the pre-#806 scan'
  );
});

test('#806 a citation to a tombstoned id throws loudly (AC4 tombstone semantics)', () => {
  // Delete id 3 (format:check), then cite vc:3 from a Functional line.
  let vc = renderVcSection(['node --test a.test.mjs', 'npm run lint', 'npm run format:check']);
  vc = deleteVcById(vc, 3);
  vc = appendVcCommands(vc, ['npm run build']); // id 4, NOT a reuse of 3
  const body = [
    vc,
    '',
    '#### Functional (verified at Test)',
    '',
    '- [ ] stale citation <!-- dod:functional:tests --> <!-- aitm-verified vc-list="vc:3" -->',
    '',
  ].join('\n');
  assert.throws(() => parseFunctionalDodKeys(body), /vc:3 does not exist/);
});

test('#806 extractVerifiedCommands resolves vc-list against supplied vcItems', () => {
  const vcItems = parseVerificationCommands(BODY);
  assert.deepEqual(extractVerifiedCommands('x <!-- aitm-verified vc-list="vc:2" -->', vcItems), [
    'npm run lint',
  ]);
});

test('#806 extractVerifiedCommands on a vc-list label with no vcItems throws (parity with AC path)', () => {
  assert.throws(
    () => extractVerifiedCommands('x <!-- aitm-verified vc-list="vc:1" -->'),
    /vc:1 does not exist/,
    'an unresolvable citation is a loud malformed-body signal, not a silent []'
  );
});

test('#806 hasVerifiedDeclaration is a non-throwing presence check for vc-list and legacy forms', () => {
  // The critical no-throw case: a vc-list label with NO vcItems must not blow up.
  assert.equal(
    hasVerifiedDeclaration('x <!-- aitm-verified vc-list="vc:1" -->'),
    true,
    'a vc-list declaration is recognized without resolving'
  );
  assert.equal(
    hasVerifiedDeclaration('x <!-- aitm-verified cmd="`npm test`" -->'),
    true,
    'a legacy backtick cmd is recognized'
  );
  assert.equal(
    hasVerifiedDeclaration('x <!-- aitm-verified cmd="vc:2" -->'),
    true,
    'a legacy inline vc:<n> citation is recognized'
  );
  assert.equal(
    hasVerifiedDeclaration('x with no marker'),
    false,
    'a bare label is not a declaration'
  );
});
