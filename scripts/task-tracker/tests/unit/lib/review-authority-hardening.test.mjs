// @story #1050
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  derivePersistedReviewAuthority,
  deriveReviewAuthority,
  serializeAgentReviewProof,
  serializeReviewApproval,
} from '../../../lib/review-authority.mjs';

const EPOCH = 'review:1:2026-07-29T10:00:00Z';
const REVIEW_ENTRY = '<!-- aitm-entered-review ts="2026-07-29T10:00:00Z" -->';

const proof = (sha = 'abc1234') =>
  serializeAgentReviewProof({
    epoch: EPOCH,
    sha,
    ts: '2026-07-29T10:01:00Z',
    validators: 'unit,lint',
    result: 'pass',
  });

const approval = (proofSha = 'abc1234') =>
  serializeReviewApproval({
    epoch: EPOCH,
    proofSha,
    ts: '2026-07-29T10:02:00Z',
    provenance: 'human',
  });

test('legacy approval is stale after later entered-Develop demotion evidence', () => {
  const body = [
    '<!-- aitm-review-approved ts="2026-07-29T10:02:00Z" -->',
    '<!-- aitm-entered-develop-2 ts="2026-07-29T10:03:00Z" -->',
  ].join('\n');

  const authority = deriveReviewAuthority(body, { verifiedSha: 'abc1234' });

  assert.equal(authority.status, 'stale');
  assert.deepEqual(authority.reasons, ['legacy-authority-superseded']);
});

test('malformed later entered-Develop evidence fails closed instead of preserving legacy authority', () => {
  const body = [
    '<!-- aitm-review-approved ts="2026-07-29T10:02:00Z" -->',
    '<!-- aitm-entered-develop-2 ts=2026-07-29T10:03:00Z -->',
  ].join('\n');

  const authority = deriveReviewAuthority(body, { verifiedSha: 'abc1234' });

  assert.equal(authority.status, 'malformed');
  assert.deepEqual(authority.reasons, ['malformed-review-authority-marker']);
});

test('legacy Full-Auto companion marker projects Full-Auto provenance', () => {
  const body = [
    '<!-- aitm-review-approved ts="2026-07-29T10:02:00Z" -->',
    '<!-- aitm-full-auto-approved: 2026-07-29T10:02:00Z:ci=1,reviewer-unset=1 -->',
  ].join('\n');

  const authority = deriveReviewAuthority(body, { verifiedSha: 'abc1234' });

  assert.equal(authority.status, 'current');
  assert.equal(authority.approval.provenance, 'full-auto');
  assert.equal(authority.approval.signals, 'ci=1,reviewer-unset=1');
});

test('versioned proof and approval markers reject non-Git object IDs', () => {
  const cases = [
    {
      name: 'proof SHA is arbitrary text',
      body: [REVIEW_ENTRY, proof('not-a-git-object'), approval('not-a-git-object')].join('\n'),
    },
    {
      name: 'approval proof SHA is arbitrary text',
      body: [REVIEW_ENTRY, proof(), approval('not-a-git-object')].join('\n'),
    },
    {
      name: 'proof SHA is shorter than the repository abbreviation floor',
      body: [REVIEW_ENTRY, proof('abc123'), approval('abc123')].join('\n'),
    },
  ];

  for (const item of cases) {
    const authority = deriveReviewAuthority(item.body, { verifiedSha: 'abc1234' });
    assert.equal(authority.status, 'malformed', item.name);
    assert.ok(authority.reasons.includes('malformed-review-authority-marker'), item.name);
  }
});

test('persisted verified SHA must be a 7-40 character Git object ID', () => {
  const body = [
    '<!-- aitm-dod-verified sha="not-a-git-object" ts="2026-07-29T09:59:00Z" -->',
    REVIEW_ENTRY,
    proof(),
    approval(),
  ].join('\n');

  const authority = derivePersistedReviewAuthority(body);

  assert.equal(authority.status, 'malformed');
  assert.ok(authority.reasons.includes('verified-sha-invalid'));
});

test('authority compares valid full and abbreviated Git object IDs safely', () => {
  const fullSha = 'abc1234deadbeefabc1234deadbeefabc1234dea';
  const body = [REVIEW_ENTRY, proof(fullSha), approval('abc1234')].join('\n');

  assert.equal(deriveReviewAuthority(body, { verifiedSha: 'abc1234' }).status, 'current');
  assert.equal(deriveReviewAuthority(body, { verifiedSha: 'abc1235' }).status, 'stale');
});
