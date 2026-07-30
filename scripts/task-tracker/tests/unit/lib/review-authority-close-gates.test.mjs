// @story #1050
import assert from 'node:assert/strict';
import test from 'node:test';

import { assertLifecycleSatisfied } from '../../../close-gate.mjs';
import { shouldEmitReviewApprovedRow } from '../../../lib/close-convergence.mjs';
import { hasGenuineReviewApprovedMarker } from '../../../lib/human-reviewer-audit.mjs';
import { reviewExitReviewApprovedGuard } from '../../../lib/review-exit-review-approved-guard.mjs';
import { detectLifecyclePretick } from '../../../lib/lifecycle-dod.mjs';
import {
  serializeAgentReviewProof,
  serializeReviewApproval,
  serializeReviewInvalidation,
} from '../../../lib/review-authority.mjs';
import { decideCloseConvergence } from '../../../lib/close-convergence.mjs';

const epoch = 'review:1:2026-07-29T10:00:00Z';

function bodyWithAuthority({ invalidated = false, provenance = 'human' } = {}) {
  return [
    '<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T09:59:00Z" -->',
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->',
    serializeAgentReviewProof({
      epoch,
      sha: 'abc1234',
      ts: '2026-07-29T10:01:00Z',
      validators: 'unit',
      result: 'pass',
    }),
    serializeReviewApproval({
      epoch,
      proofSha: 'abc1234',
      ts: '2026-07-29T10:02:00Z',
      provenance,
      signals: provenance === 'full-auto' ? 'ci=1' : '',
    }),
    ...(invalidated
      ? [serializeReviewInvalidation({ epoch, ts: '2026-07-29T10:03:00Z', reason: 'demoted' })]
      : []),
  ].join('\n');
}

function lifecycleBody(authority) {
  return [
    authority,
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Agent Review Passed',
    '- [x] Final Review Passed',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
  ].join('\n');
}

test('#1050 stale approval cannot satisfy the review exit, lifecycle final review, audit, or close convergence', () => {
  const body = lifecycleBody(bodyWithAuthority({ invalidated: true }));

  assert.equal(reviewExitReviewApprovedGuard.run({ body, toState: 'done' }).ok, false);
  assert.equal(assertLifecycleSatisfied({ body }).block, true);
  assert.equal(hasGenuineReviewApprovedMarker(body), false);
  assert.equal(shouldEmitReviewApprovedRow({ body, reviewGateBypassed: false }), false);
});

test('#1050 stale Full-Auto authority cannot satisfy Final Review or emit a close audit row', () => {
  const body = lifecycleBody(bodyWithAuthority({ invalidated: true, provenance: 'full-auto' }));
  const gate = assertLifecycleSatisfied({ body });

  assert.equal(gate.block, true);
  assert.equal(
    gate.results.find((result) => result.key === 'passed-final-review').status,
    'missing'
  );
  assert.equal(shouldEmitReviewApprovedRow({ body, reviewGateBypassed: false }), false);
  assert.equal(hasGenuineReviewApprovedMarker(body), false);
});

test('#1050 a standalone historical Full-Auto marker cannot satisfy a new Review epoch', () => {
  const epoch = 'review:1:2026-07-29T10:00:00Z';
  const body = [
    '<!-- aitm-dod-verified sha="abc1234" ts="2026-07-29T09:59:00Z" -->',
    '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->',
    serializeAgentReviewProof({
      epoch,
      sha: 'abc1234',
      ts: '2026-07-29T10:01:00Z',
      validators: 'unit',
      result: 'pass',
    }),
    '<!-- aitm-full-auto-approved: 2026-07-29T10:02:00Z:ci=1 -->',
    '#### Lifecycle (auto-ticked at Review/Close)',
    '- [x] Agent Review Passed',
    '- [ ] Final Review Passed',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
  ].join('\n');

  assert.equal(assertLifecycleSatisfied({ body }).block, true);
});

test('#1050 Test normalization obtains the persisted authority before removing a pre-ticked Final Review', () => {
  const body = lifecycleBody(bodyWithAuthority({ provenance: 'human' }));
  const normalized = detectLifecyclePretick(body);

  assert.equal(normalized.authority.status, 'current');
  assert.match(normalized.body, /- \[ \] Final Review Passed/);
});

test('#1050 current full-auto authority alone satisfies Final Review as an audited lifecycle result', () => {
  const body = lifecycleBody(bodyWithAuthority({ provenance: 'full-auto' }));
  const gate = assertLifecycleSatisfied({ body });

  assert.equal(gate.block, false);
  assert.equal(
    gate.results.find((result) => result.key === 'passed-final-review').status,
    'audited'
  );
});

test('#1050 Done-board convergence admits only current authority and preserves the explicit bypass', () => {
  const cases = [
    ['current', lifecycleBody(bodyWithAuthority()), 'close-issue'],
    ['stale', lifecycleBody(bodyWithAuthority({ invalidated: true })), 'authority-refused'],
    ['missing', '', 'authority-refused'],
    ['malformed', '<!-- aitm-review-approved schema="1" -->', 'authority-refused'],
  ];
  for (const [name, body, expected] of cases) {
    assert.equal(
      decideCloseConvergence({ boardState: 'done', issueClosed: false, body }).action,
      expected,
      name
    );
  }
  assert.equal(
    decideCloseConvergence({
      boardState: 'done',
      issueClosed: false,
      body: '',
      reviewGateBypassed: true,
    }).action,
    'close-issue'
  );
});
