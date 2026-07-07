// @story #721
import assert from 'node:assert/strict';

import { autoTickVerified } from '../../lib/auto-tick-verified.mjs';

function fixtureBody() {
  return [
    '## Verification Commands',
    '',
    '- [ ] `npm test`',
    '- [ ] `npm run lint`',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Legacy single-command AC <!-- aitm-verified cmd="`npm test`" -->',
    '- [ ] Legacy multi-command AC <!-- aitm-verified cmd="`npm test` `npm run lint`" -->',
    '- [ ] Plain AC with no verifier',
    '',
    '## Definition of Done',
    '',
  ].join('\n');
}

const NPM_TEST_PASSED = { command: 'npm test', passed: true, exit: 0 };
const NPM_LINT_PASSED = { command: 'npm run lint', passed: true, exit: 0 };

// --- legacy embedded-command AC ticks exactly as before ---------------------
{
  const { body, tickedAc } = autoTickVerified(fixtureBody(), [NPM_TEST_PASSED]);
  assert.ok(body.includes('- [x] Legacy single-command AC'), 'legacy single-command AC ticked');
  assert.ok(
    body.includes('- [ ] Legacy multi-command AC'),
    'legacy multi-command AC unticked when only one of its commands passed'
  );
  assert.ok(body.includes('- [ ] Plain AC with no verifier'), 'unmarked AC never auto-ticked');
  assert.deepEqual(
    tickedAc,
    ['Legacy single-command AC'],
    'tickedAc reports only the fully-satisfied legacy AC'
  );
}

// --- legacy multi-command AC still requires AND-fan-in across its commands -
{
  const { body } = autoTickVerified(fixtureBody(), [NPM_TEST_PASSED, NPM_LINT_PASSED]);
  assert.ok(
    body.includes('- [x] Legacy multi-command AC'),
    'legacy multi-command AC ticks once every embedded command passed'
  );
}

// --- declaration preserved verbatim (no silent rewrite to citation form) ----
{
  const { body } = autoTickVerified(fixtureBody(), [NPM_TEST_PASSED]);
  assert.ok(
    body.includes('cmd="`npm test`"'),
    'legacy declaration cmd is preserved unchanged, not rewritten to a citation'
  );
}

console.log('auto-tick-legacy-cmd-compat.test.mjs: all assertions passed');
