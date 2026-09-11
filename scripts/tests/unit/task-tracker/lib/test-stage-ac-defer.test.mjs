// @story #1599
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { autoTickVerified } from '../../../../task-tracker/lib/auto-tick-verified.mjs';
import { gateCodeComplete } from '../../../../task-tracker/lib/code-complete-gate.mjs';

const cfg = { repo: 'o/r' };

function bodyFor({ citation = 'vc:1 vc:2 vc:3 vc:4', includeSlow = true } = {}) {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] Test-stage AC <!-- aitm-verified vc-list="${citation}" -->`,
    '',
    '## Verification Commands',
    '',
    '- [ ] `npm test` <!-- id=1 -->',
    ...(includeSlow ? ['- [ ] `npm run test:slow` <!-- id=2 -->'] : []),
    '- [ ] `npm run lint` <!-- id=3 -->',
    '- [ ] `npm run format:check` <!-- id=4 -->',
    '',
    '## Definition of Done',
    '',
  ].join('\n');
}

function gateDeps() {
  return {
    listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: abc123 -->' }],
    filesForSha: async () => [],
    dirtyFiles: async () => new Set(),
  };
}

test('Develop exit defers an unchecked AC that contains a Test-restricted verifier', async () => {
  const result = await gateCodeComplete({
    cfg,
    issueNumber: 1599,
    body: bodyFor(),
    deps: gateDeps(),
  });

  assert.equal(result.ok, true, JSON.stringify(result.blockers));
  assert.deepEqual(result.blockers, []);
});

test('Develop exit keeps an ordinary unchecked targeted AC blocking', async () => {
  const body = [
    '## Acceptance Criteria',
    '',
    '- [ ] Targeted AC <!-- aitm-verified vc-list="vc:1" -->',
    '',
    '## Verification Commands',
    '',
    '- [ ] `node --test scripts/tests/unit/example.test.mjs` <!-- id=1 -->',
    '',
  ].join('\n');
  const result = await gateCodeComplete({
    cfg,
    issueNumber: 1599,
    body,
    deps: gateDeps(),
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes('code-complete-ac-unticked')));
});

test('Develop exit keeps a dangling Test-stage citation blocking', async () => {
  const result = await gateCodeComplete({
    cfg,
    issueNumber: 1599,
    body: bodyFor({ citation: 'vc:99' }),
    deps: gateDeps(),
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes('code-complete-ac-unticked')));
});

test('Develop exit keeps a malformed Test-stage citation blocking', async () => {
  const result = await gateCodeComplete({
    cfg,
    issueNumber: 1599,
    body: bodyFor({ citation: 'vc:slow' }),
    deps: gateDeps(),
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes('code-complete-ac-unticked')));
});

test('Test auto-tick still requires every command cited by the deferred AC to pass', () => {
  const body = bodyFor();
  const partial = autoTickVerified(body, [
    { command: 'npm test', passed: true, exit: 0 },
    { command: 'npm run lint', passed: true, exit: 0 },
    { command: 'npm run format:check', passed: true, exit: 0 },
  ]);
  assert.match(partial.body, /- \[ \] Test-stage AC/);

  const complete = autoTickVerified(body, [
    { command: 'npm test', passed: true, exit: 0 },
    { command: 'npm run test:slow', passed: true, exit: 0 },
    { command: 'npm run lint', passed: true, exit: 0 },
    { command: 'npm run format:check', passed: true, exit: 0 },
  ]);
  assert.match(complete.body, /- \[x\] Test-stage AC/);
  assert.deepEqual(complete.tickedAc, ['Test-stage AC']);
});
