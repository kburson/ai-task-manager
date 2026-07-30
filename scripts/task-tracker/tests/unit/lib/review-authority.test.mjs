import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveReviewAuthority,
  derivePersistedReviewAuthority,
  parseReviewAuthority,
  reviewEpochId,
  serializeAgentReviewProof,
  serializeReviewApproval,
  serializeReviewInvalidation,
} from '../../../lib/review-authority.mjs';
import { hasReviewApprovedMarker, parseReviewApprovedMarker } from '../../../lib/markers.mjs';

const review = (visit, enteredReviewAt) =>
  `<!-- aitm-entered-review${visit > 1 ? `-${visit}` : ''} ts="${enteredReviewAt}" -->`;

const proof = ({ epoch, sha = 'abc123', ts = '2026-07-29T10:01:00Z', result = 'pass' } = {}) =>
  serializeAgentReviewProof({
    epoch,
    sha,
    ts,
    validators: 'unit,lint',
    result,
  });

const approval = ({
  epoch,
  proofSha = 'abc123',
  ts = '2026-07-29T10:02:00Z',
  provenance = 'human',
  signals = '',
} = {}) => serializeReviewApproval({ epoch, proofSha, ts, provenance, signals });

test('reviewEpochId derives a stable structural identity', () => {
  assert.equal(
    reviewEpochId({ visit: 2, enteredReviewAt: '2026-07-29T10:00:00Z' }),
    'review:2:2026-07-29T10:00:00Z'
  );
  assert.throws(() => reviewEpochId({ visit: 0, enteredReviewAt: '2026-07-29T10:00:00Z' }));
});

test('serializers emit deterministic versioned markers', () => {
  const epoch = 'review:1:2026-07-29T10:00:00Z';
  assert.equal(
    proof({ epoch }),
    '<!-- aitm-agent-review-proof schema="1" epoch="review:1:2026-07-29T10:00:00Z" sha="abc123" ts="2026-07-29T10:01:00Z" validators="unit,lint" result="pass" -->'
  );
  assert.equal(
    approval({ epoch, provenance: 'full-auto', signals: 'env=both' }),
    '<!-- aitm-review-approved schema="1" epoch="review:1:2026-07-29T10:00:00Z" proof-sha="abc123" ts="2026-07-29T10:02:00Z" provenance="full-auto" signals="env=both" -->'
  );
  assert.equal(
    serializeReviewInvalidation({
      epoch,
      ts: '2026-07-29T10:03:00Z',
      reason: 'demoted',
    }),
    '<!-- aitm-review-invalidated schema="1" epoch="review:1:2026-07-29T10:00:00Z" ts="2026-07-29T10:03:00Z" reason="demoted" -->'
  );
});

test('existing review-approved helpers recognize the versioned authority marker', () => {
  const marker = approval({
    epoch: 'review:1:2026-07-29T10:00:00Z',
    provenance: 'full-auto',
    signals: 'env=both',
  });
  assert.equal(hasReviewApprovedMarker(marker), true);
  assert.deepEqual(parseReviewApprovedMarker(marker), {
    ts: '2026-07-29T10:02:00Z',
    epoch: 'review:1:2026-07-29T10:00:00Z',
    proofSha: 'abc123',
    provenance: 'full-auto',
    fullAuto: true,
    signals: 'env=both',
  });
});

test('derives current review authority and fails closed for stale, malformed, and ambiguous history', () => {
  const epoch1 = 'review:1:2026-07-29T10:00:00Z';
  const epoch2 = 'review:2:2026-07-29T11:00:00Z';
  const legacyApproval = '<!-- aitm-review-approved ts="2026-07-29T10:02:00Z" -->';
  const cases = [
    {
      name: 'initial Review has current human authority',
      body: [
        review(1, '2026-07-29T10:00:00Z'),
        proof({ epoch: epoch1 }),
        approval({ epoch: epoch1 }),
      ].join('\n'),
      verifiedSha: 'abc123',
      status: 'current',
      epoch: epoch1,
      provenance: 'human',
    },
    {
      name: 'same-visit retry retains its first epoch',
      body: [
        review(1, '2026-07-29T10:00:00Z'),
        proof({ epoch: epoch1, sha: 'old123' }),
        approval({ epoch: epoch1, proofSha: 'old123' }),
        proof({ epoch: epoch1, sha: 'abc123', ts: '2026-07-29T10:03:00Z' }),
        approval({ epoch: epoch1, proofSha: 'abc123', ts: '2026-07-29T10:04:00Z' }),
      ].join('\n'),
      verifiedSha: 'abc123',
      status: 'current',
      epoch: epoch1,
      proofSha: 'abc123',
    },
    {
      name: 'Review re-entry makes prior authority stale',
      body: [
        review(1, '2026-07-29T10:00:00Z'),
        proof({ epoch: epoch1 }),
        approval({ epoch: epoch1 }),
        review(2, '2026-07-29T11:00:00Z'),
      ].join('\n'),
      verifiedSha: 'abc123',
      status: 'stale',
      epoch: epoch2,
    },
    {
      name: 'proof verified against a different SHA is stale',
      body: [
        review(1, '2026-07-29T10:00:00Z'),
        proof({ epoch: epoch1 }),
        approval({ epoch: epoch1 }),
      ].join('\n'),
      verifiedSha: 'def456',
      status: 'stale',
      epoch: epoch1,
    },
    {
      name: 'later invalidation makes authority stale',
      body: [
        review(1, '2026-07-29T10:00:00Z'),
        proof({ epoch: epoch1 }),
        approval({ epoch: epoch1 }),
        serializeReviewInvalidation({
          epoch: epoch1,
          ts: '2026-07-29T10:03:00Z',
          reason: 'demoted',
        }),
      ].join('\n'),
      verifiedSha: 'abc123',
      status: 'stale',
      epoch: epoch1,
    },
    {
      name: 'Full-Auto approval preserves truthful provenance',
      body: [
        review(1, '2026-07-29T10:00:00Z'),
        proof({ epoch: epoch1 }),
        approval({ epoch: epoch1, provenance: 'full-auto', signals: 'env=both' }),
      ].join('\n'),
      verifiedSha: 'abc123',
      status: 'current',
      epoch: epoch1,
      provenance: 'full-auto',
    },
    {
      name: 'malformed versioned attributes fail closed',
      body: [
        review(1, '2026-07-29T10:00:00Z'),
        '<!-- aitm-agent-review-proof schema="1" epoch="review:1:2026-07-29T10:00:00Z" sha="abc123" ts="2026-07-29T10:01:00Z" result="pass" -->',
        approval({ epoch: epoch1 }),
      ].join('\n'),
      verifiedSha: 'abc123',
      status: 'malformed',
      epoch: epoch1,
    },
    {
      name: 'legacy approval is current when no disqualifying history exists',
      body: legacyApproval,
      verifiedSha: 'abc123',
      status: 'current',
      epoch: null,
      legacy: true,
    },
    {
      name: 'legacy approval before a structural Review entry is stale',
      body: [legacyApproval, review(1, '2026-07-29T10:00:00Z')].join('\n'),
      verifiedSha: 'abc123',
      status: 'stale',
      epoch: epoch1,
      legacy: true,
    },
    {
      name: 'legacy approval is stale after Review re-entry',
      body: [
        legacyApproval,
        review(1, '2026-07-29T10:00:00Z'),
        review(2, '2026-07-29T11:00:00Z'),
      ].join('\n'),
      verifiedSha: 'abc123',
      status: 'stale',
      epoch: epoch2,
      legacy: true,
    },
    {
      name: 'multiple legacy approvals are ambiguous',
      body: `${legacyApproval}\n${legacyApproval}`,
      verifiedSha: 'abc123',
      status: 'ambiguous',
      epoch: null,
      legacy: true,
    },
  ];

  for (const item of cases) {
    const authority = deriveReviewAuthority(item.body, { verifiedSha: item.verifiedSha });
    assert.equal(authority.status, item.status, item.name);
    assert.equal(authority.epoch, item.epoch, `${item.name}: epoch`);
    if (item.provenance) assert.equal(authority.approval.provenance, item.provenance, item.name);
    if (item.proofSha) {
      assert.equal(authority.proof.sha, item.proofSha, `${item.name}: latest proof`);
      assert.equal(authority.approval.proofSha, item.proofSha, `${item.name}: latest approval`);
    }
    if (item.legacy) assert.equal(authority.approval.legacy, true, item.name);
  }
});

test('authority without a verified SHA fails closed', () => {
  const epoch = 'review:1:2026-07-29T10:00:00Z';
  const authority = deriveReviewAuthority(
    [review(1, '2026-07-29T10:00:00Z'), proof({ epoch }), approval({ epoch })].join('\n'),
    {}
  );
  assert.equal(authority.status, 'missing');
  assert.ok(authority.reasons.includes('verified-sha-missing'));
});

test('derivePersistedReviewAuthority uses only the durable DoD SHA', () => {
  const epoch = 'review:1:2026-07-29T10:00:00Z';
  const body = [
    '<!-- aitm-dod-verified sha="abc123" ts="2026-07-29T09:59:00Z" -->',
    review(1, '2026-07-29T10:00:00Z'),
    proof({ epoch, sha: 'abc123' }),
    approval({ epoch, proofSha: 'abc123' }),
  ].join('\n');

  const authority = derivePersistedReviewAuthority(body);

  assert.equal(authority.status, 'current');
  assert.equal(authority.epoch, epoch);
  assert.equal(authority.verifiedSha, 'abc123');
});

test('derivePersistedReviewAuthority ignores a DoD-shaped marker in fenced code', () => {
  const epoch = 'review:1:2026-07-29T10:00:00Z';
  const body = [
    '```md',
    '<!-- aitm-dod-verified sha="abc123" ts="2026-07-29T09:59:00Z" -->',
    '```',
    review(1, '2026-07-29T10:00:00Z'),
    proof({ epoch, sha: 'abc123' }),
    approval({ epoch, proofSha: 'abc123' }),
  ].join('\n');

  const authority = derivePersistedReviewAuthority(body);

  assert.equal(authority.status, 'missing');
  assert.equal(authority.verifiedSha, '');
  assert.ok(authority.reasons.includes('verified-sha-missing'));
});

test('derivePersistedReviewAuthority ignores a review-failed example in fenced code', () => {
  const epoch = 'review:1:2026-07-29T10:00:00Z';
  const body = [
    '<!-- aitm-dod-verified sha="abc123" ts="2026-07-29T09:59:00Z" -->',
    review(1, '2026-07-29T10:00:00Z'),
    proof({ epoch, sha: 'abc123' }),
    approval({ epoch, proofSha: 'abc123' }),
    '```md',
    '<!-- aitm-review-failed:start -->',
    '<!-- aitm-review-failed:end -->',
    '```',
  ].join('\n');

  assert.equal(derivePersistedReviewAuthority(body).status, 'current');
});

test('parseReviewAuthority retains every historical authority marker', () => {
  const epoch = 'review:1:2026-07-29T10:00:00Z';
  const parsed = parseReviewAuthority(
    [
      review(1, '2026-07-29T10:00:00Z'),
      proof({ epoch }),
      approval({ epoch }),
      serializeReviewInvalidation({ epoch, ts: '2026-07-29T10:03:00Z', reason: 'demoted' }),
    ].join('\n')
  );
  assert.equal(parsed.epochs.length, 1);
  assert.equal(parsed.proofs.length, 1);
  assert.equal(parsed.approvals.length, 1);
  assert.equal(parsed.invalidations.length, 1);
});
