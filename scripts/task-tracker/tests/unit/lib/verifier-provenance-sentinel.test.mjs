// @story #678
// Unit tests for the placeholder-sentinel gap fixed by #678:
// `validateDeclarationCmd` must reject bare/braced sentinel words
// (`tbd`, `{tbd}`, `todo`, ...), and the Refine-exit AC classifier
// (`findAcsWithoutVerifierOrInvalidTag`) must flag an AC whose only
// declared verifier is such a sentinel with the new `malformed-verifier`
// reason instead of silently treating it as OK.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclarationCmd } from '../../../lib/proof-marker.mjs';
import { findAcsWithoutVerifierOrInvalidTag } from '../../../lib/body-invariants.mjs';

test('validateDeclarationCmd rejects bare and braced placeholder sentinels', () => {
  for (const sentinel of ['tbd', 'todo', 'wip', 'xxx', 'fixme', 'tba', 'n/a']) {
    assert.ok(validateDeclarationCmd(sentinel), `rejects bare sentinel "${sentinel}"`);
    assert.ok(validateDeclarationCmd(`{${sentinel}}`), `rejects braced sentinel "{${sentinel}}"`);
  }
});

test('validateDeclarationCmd sentinel rejection is case-insensitive and tolerates surrounding whitespace', () => {
  assert.ok(validateDeclarationCmd('TBD'), 'rejects uppercase TBD');
  assert.ok(validateDeclarationCmd('  tbd  '), 'rejects whitespace-padded tbd');
  assert.ok(validateDeclarationCmd('{ TODO }'), 'rejects braced TODO with inner spaces');
});

test('validateDeclarationCmd does NOT reject real commands that merely contain a sentinel word as a substring', () => {
  assert.equal(
    validateDeclarationCmd('node scripts/task-tracker/tests/unit/wip-cleanup.test.mjs'),
    null,
    'a real path containing "wip" as a substring is not a whole-value match'
  );
  assert.equal(
    validateDeclarationCmd('`npm run lint:todo-report`'),
    null,
    'a real command containing "todo" as a substring is not a whole-value match'
  );
});

test('findAcsWithoutVerifierOrInvalidTag flags a backtick-wrapped {tbd} sentinel as malformed-verifier, not OK', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] Some AC <!-- aitm-verified cmd="`{tbd}`" -->',
    '## Definition of Done',
  ].join('\n');
  const offenders = findAcsWithoutVerifierOrInvalidTag(body);
  assert.equal(offenders.length, 1, 'the sentinel-only AC is flagged');
  assert.ok(
    offenders[0].reason.startsWith('malformed-verifier'),
    `reason should start with malformed-verifier, got "${offenders[0].reason}"`
  );
  assert.ok(
    offenders[0].reason.includes('placeholder sentinel'),
    'reason surfaces the underlying validateDeclarationCmd message'
  );
});

test('findAcsWithoutVerifierOrInvalidTag still passes a real backtick-wrapped verifier command', () => {
  const body = [
    '## Acceptance Criteria',
    '- [ ] Some AC <!-- aitm-verified cmd="`node --test scripts/task-tracker/tests/unit/body-invariants.test.mjs`" -->',
    '## Definition of Done',
  ].join('\n');
  assert.deepEqual(
    findAcsWithoutVerifierOrInvalidTag(body),
    [],
    'a real targeted verifier command is not flagged'
  );
});

console.log('verifier-provenance-sentinel.test.mjs: all assertions passed');
