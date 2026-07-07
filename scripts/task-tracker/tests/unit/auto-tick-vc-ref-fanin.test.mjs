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
    '- [ ] Single-citation AC <!-- aitm-verified cmd="vc:1" -->',
    '- [ ] Multi-citation AC (AND-fan-in) <!-- aitm-verified cmd="vc:1 vc:2" -->',
    '',
    '## Definition of Done',
    '',
  ].join('\n');
}

const NPM_TEST_PASSED = { command: 'npm test', passed: true, exit: 0 };
const NPM_LINT_PASSED = { command: 'npm run lint', passed: true, exit: 0 };

// --- single citation ticks once its one cited command passes ---------------
{
  const { body, tickedAc } = autoTickVerified(fixtureBody(), [NPM_TEST_PASSED]);
  assert.ok(body.includes('- [x] Single-citation AC'), 'single-citation AC ticked');
  assert.ok(
    body.includes('- [ ] Multi-citation AC'),
    'multi-citation AC left unticked when only one of its citations passed'
  );
  assert.deepEqual(
    tickedAc,
    ['Single-citation AC'],
    'tickedAc reports the single-citation AC only'
  );
}

// --- AND-fan-in: multi-citation AC ticks only once every citation passed ---
{
  const { body, tickedAc } = autoTickVerified(fixtureBody(), [NPM_TEST_PASSED, NPM_LINT_PASSED]);
  assert.ok(body.includes('- [x] Single-citation AC'), 'single-citation AC still ticked');
  assert.ok(
    body.includes('- [x] Multi-citation AC'),
    'multi-citation AC ticked once every cited command passed'
  );
  assert.deepEqual(
    tickedAc.slice().sort(),
    ['Multi-citation AC (AND-fan-in)', 'Single-citation AC'].sort(),
    'tickedAc reports both ACs'
  );
}

// --- partial fan-in: citing a failing (unlisted-as-passed) command leaves it unticked ---
{
  const { body } = autoTickVerified(fixtureBody(), [NPM_LINT_PASSED]);
  assert.ok(
    body.includes('- [ ] Multi-citation AC'),
    'multi-citation AC stays unticked when only its second citation passed'
  );
}

console.log('auto-tick-vc-ref-fanin.test.mjs: all assertions passed');
