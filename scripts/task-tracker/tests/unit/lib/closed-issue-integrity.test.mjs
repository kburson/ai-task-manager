// @story #925
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  deriveClosedIssueIntegrity,
  normalizeIssueCloseSnapshot,
} from '../../../lib/closed-issue-convergence.mjs';

function body({ criterion = '[x]', tests = '[x]', agentReview = '[x]', finalReview = '[x]' } = {}) {
  return [
    '## Acceptance Criteria',
    '',
    `- ${criterion} The delivered behavior is verified`,
    '',
    '### Functional (verified at Test)',
    '',
    `- ${tests} All automated tests pass`,
    '- [x] Lint and format checks pass',
    '',
    '### Lifecycle (auto-ticked at Review/Close)',
    '',
    `- ${agentReview} Agent Review Passed`,
    `- ${finalReview} Final Review Passed`,
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
  ].join('\n');
}

test('normalizes GitHub issue close state and reason without inventing completion', () => {
  assert.deepEqual(normalizeIssueCloseSnapshot({ state: 'CLOSED', stateReason: 'COMPLETED' }), {
    issueClosed: true,
    stateReason: 'completed',
  });
  assert.deepEqual(normalizeIssueCloseSnapshot({ state: 'closed', stateReason: 'NOT_PLANNED' }), {
    issueClosed: true,
    stateReason: 'not_planned',
  });
  assert.deepEqual(normalizeIssueCloseSnapshot({ state: 'CLOSED', stateReason: 'duplicate' }), {
    issueClosed: true,
    stateReason: 'duplicate',
  });
  assert.deepEqual(normalizeIssueCloseSnapshot({ state: 'CLOSED', stateReason: null }), {
    issueClosed: true,
    stateReason: null,
  });
  assert.deepEqual(normalizeIssueCloseSnapshot({ state: 'OPEN', stateReason: 'COMPLETED' }), {
    issueClosed: false,
    stateReason: null,
  });
  assert.deepEqual(normalizeIssueCloseSnapshot({ state: 'other' }), {
    issueClosed: null,
    stateReason: null,
  });
});

test('human-gated integrity requires Agent Review and Final Review', () => {
  assert.deepEqual(deriveClosedIssueIntegrity({ body: body(), fullAuto: false }), {
    allTicked: true,
    unticked: [],
    childrenDone: true,
  });

  const missingFinal = deriveClosedIssueIntegrity({
    body: body({ finalReview: '[ ]' }),
    fullAuto: false,
  });
  assert.equal(missingFinal.allTicked, false);
  assert.deepEqual(missingFinal.unticked, ['Final Review Passed']);

  const missingAgent = deriveClosedIssueIntegrity({
    body: body({ agentReview: '[ ]' }),
    fullAuto: false,
  });
  assert.equal(missingAgent.allTicked, false);
  assert.deepEqual(missingAgent.unticked, ['Agent Review Passed']);
});

test('explicit full-auto mode exempts Final Review but never Agent Review', () => {
  assert.deepEqual(
    deriveClosedIssueIntegrity({
      body: body({ finalReview: '[ ]' }),
      fullAuto: true,
    }),
    { allTicked: true, unticked: [], childrenDone: true }
  );

  const missingAgent = deriveClosedIssueIntegrity({
    body: body({ agentReview: '[ ]', finalReview: '[ ]' }),
    fullAuto: true,
  });
  assert.equal(missingAgent.allTicked, false);
  assert.deepEqual(missingAgent.unticked, ['Agent Review Passed']);
});

test('functional and acceptance checkboxes remain part of close integrity', () => {
  const result = deriveClosedIssueIntegrity({
    body: body({ criterion: '[ ]', tests: '[ ]' }),
    fullAuto: true,
  });
  assert.equal(result.allTicked, false);
  assert.deepEqual(result.unticked, [
    'The delivered behavior is verified',
    'All automated tests pass',
  ]);
});

test('close-owned lifecycle boxes, fenced examples, and waived ACs are exempt', () => {
  const source = [
    body(),
    '',
    '```md',
    '- [ ] Example only',
    '```',
    '',
    '- [ ] Intentionally waived remote proof <!-- aitm-ac-waived -->',
  ].join('\n');
  assert.deepEqual(deriveClosedIssueIntegrity({ body: source, fullAuto: false }), {
    allTicked: true,
    unticked: [],
    childrenDone: true,
  });
});

test('legacy Final Review label satisfies the human-gated integrity key', () => {
  const source = body().replace('Final Review Passed', 'Passed final human review');
  assert.deepEqual(deriveClosedIssueIntegrity({ body: source, fullAuto: false }), {
    allTicked: true,
    unticked: [],
    childrenDone: true,
  });
});

test('epic integrity requires every raw child board state to be Done', () => {
  assert.deepEqual(
    deriveClosedIssueIntegrity({
      body: body(),
      fullAuto: false,
      childBoardStates: [
        { number: 1, state: 'done' },
        { number: 2, state: 'Done' },
      ],
    }),
    { allTicked: true, unticked: [], childrenDone: true }
  );

  const result = deriveClosedIssueIntegrity({
    body: body(),
    fullAuto: false,
    childBoardStates: [
      { number: 1, state: 'done' },
      { number: 2, state: 'review' },
      { number: 3, state: null },
    ],
  });
  assert.equal(result.allTicked, false);
  assert.equal(result.childrenDone, false);
  assert.deepEqual(result.unticked, ['child #2 board=review', 'child #3 board=unknown']);
});

test('runtime exposes an additive state plus stateReason snapshot query', () => {
  const runtime = readFileSync(new URL('../../../runtime.mjs', import.meta.url), 'utf8');
  assert.match(runtime, /getIssueCloseSnapshot/);
  assert.match(runtime, /--json',\s*'state,stateReason'/);
  assert.match(runtime, /normalizeIssueCloseSnapshot/);
});
