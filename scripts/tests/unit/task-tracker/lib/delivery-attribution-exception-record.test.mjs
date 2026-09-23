// @story #1755

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  buildDeliveryAttributionProposal,
  parseDeliveryAttributionExceptionComment,
  renderDeliveryAttributionExceptionComment,
  resolveActiveDeliveryAttributionException,
  upperBoundDeliveryAttributionCommentBytes,
} from '../../../../task-tracker/lib/delivery-attribution-exception-record.mjs';
import { canonicalSourceInventory } from '../../../../task-tracker/lib/delivery-attribution-exception.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const ID1 = '01M00000000000000000000001';
const ID2 = '01M00000000000000000000002';
const ID3 = '01M00000000000000000000003';
const BASE = {
  exceptionId: ID1,
  operationId: ID2,
  repository: 'kburson/ai-task-manager',
  issueNumber: 1755,
  prNumber: 1800,
  baseRef: 'trunk',
  headRef: 'codex/defect-1755-delivery-attribution-exception',
  headSha: B,
  sourceDigest: `sha256:${'c'.repeat(64)}`,
  mappings: [{ oid: A, messageHeadline: 'untagged work', issueNumber: 1755 }],
  attributionTokens: ['#1755'],
  expiresAt: '2026-09-24T00:00:00.000Z',
};
const AUTHORITY = {
  sourceReference: 'codex-session/v1:turn-10',
  statement: 'Authorize exact proposal digest for #1755',
  actor: 'kpburson',
  level: 'host-verified-user-message',
};

function record(overrides = {}) {
  const built = buildDeliveryAttributionProposal(BASE);
  return {
    schema: 'aitm.delivery-attribution-exception/v1',
    kind: 'grant',
    recordId: ID1,
    predecessorId: null,
    proposal: built.proposal,
    proposalDigest: built.proposalDigest,
    authority: AUTHORITY,
    createdAt: '2026-09-23T00:00:00.000Z',
    ...overrides,
  };
}

test('canonical proposal binds compact mappings rather than full 111-entry inventory', () => {
  const inventory = Array.from({ length: 111 }, (_, index) => ({
    oid: index.toString(16).padStart(40, '0'),
    messageHeadline: index < 21 ? `untagged work ${index}` : '[#1755] attributed work',
  }));
  const sourceDigest = canonicalSourceInventory(inventory, inventory.at(-1).oid).sourceDigest;
  const mappings = inventory.slice(0, 21).map(({ oid, messageHeadline }) => ({
    oid,
    messageHeadline,
    issueNumber: 1755,
  }));
  const built = buildDeliveryAttributionProposal({
    ...BASE,
    headSha: inventory.at(-1).oid,
    sourceDigest,
    mappings,
  });
  assert.match(built.proposalDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(built.proposal.mappings.length, 21);
  assert.equal(built.proposal.sourceDigest, sourceDigest);
  assert.ok(!built.canonicalBytes.includes('attributed work'));
  assert.equal(
    buildDeliveryAttributionProposal(built.proposal).canonicalBytes,
    built.canonicalBytes
  );
  for (const bad of [
    { ...BASE, issueNumber: 0 },
    { ...BASE, headSha: 'A'.repeat(40) },
    { ...BASE, sourceDigest: 'not a digest' },
    { ...BASE, mappings: [{ ...BASE.mappings[0], issueNumber: 0 }] },
    { ...BASE, mappings: [...BASE.mappings, BASE.mappings[0]] },
    { ...BASE, attributionTokens: ['#0'] },
    { ...BASE, expiresAt: 'tomorrow' },
    { ...BASE, unexpected: true },
  ])
    assert.throws(() => buildDeliveryAttributionProposal(bad));
});

test('comment roundtrip preserves canonical bytes and rejects edited or wrong-scope records', () => {
  const first = record();
  const rendered = renderDeliveryAttributionExceptionComment(first);
  assert.deepEqual(parseDeliveryAttributionExceptionComment(rendered, BASE), first);
  assert.throws(() => parseDeliveryAttributionExceptionComment(rendered + ' edited', BASE));
  for (const [key, value] of [
    ['operationId', ID3],
    ['repository', 'other/repo'],
    ['issueNumber', 1756],
    ['prNumber', 1801],
    ['baseRef', 'main'],
    ['headRef', 'other-branch'],
    ['headSha', A],
    ['sourceDigest', `sha256:${'d'.repeat(64)}`],
  ])
    assert.throws(() =>
      parseDeliveryAttributionExceptionComment(rendered, { ...BASE, [key]: value })
    );
  assert.throws(() =>
    resolveActiveDeliveryAttributionException(
      [rendered, '<!-- aitm-delivery-attribution-exception/v2 unknown -->'],
      BASE,
      '2026-09-23T12:00:00.000Z'
    )
  );
  assert.throws(() => renderDeliveryAttributionExceptionComment({ ...first, schema: 'v2' }));
  assert.throws(() =>
    renderDeliveryAttributionExceptionComment({ ...first, proposalDigest: BASE.sourceDigest })
  );
});

test('one live chain resolves; forks, duplicate IDs, expiry and revocation refuse', () => {
  const first = record();
  const next = record({
    kind: 'revision',
    recordId: ID2,
    predecessorId: ID1,
    createdAt: '2026-09-23T01:00:00.000Z',
    proposal: buildDeliveryAttributionProposal({ ...BASE, exceptionId: ID2 }).proposal,
    proposalDigest: buildDeliveryAttributionProposal({ ...BASE, exceptionId: ID2 }).proposalDigest,
    authority: { ...AUTHORITY, sourceReference: 'codex-session/v1:turn-11' },
  });
  const comments = [
    renderDeliveryAttributionExceptionComment(first),
    renderDeliveryAttributionExceptionComment(next),
  ];
  assert.equal(
    resolveActiveDeliveryAttributionException(comments, BASE, '2026-09-23T12:00:00.000Z').recordId,
    ID2
  );
  assert.throws(() =>
    resolveActiveDeliveryAttributionException(
      [...comments, comments[1]],
      BASE,
      '2026-09-23T12:00:00.000Z'
    )
  );
  assert.throws(() =>
    resolveActiveDeliveryAttributionException(
      [
        ...comments,
        renderDeliveryAttributionExceptionComment(
          record({
            kind: 'revision',
            recordId: ID3,
            predecessorId: ID1,
            createdAt: '2026-09-23T02:00:00.000Z',
            proposal: buildDeliveryAttributionProposal({ ...BASE, exceptionId: ID3 }).proposal,
            proposalDigest: buildDeliveryAttributionProposal({ ...BASE, exceptionId: ID3 })
              .proposalDigest,
            authority: { ...AUTHORITY, sourceReference: 'codex-session/v1:turn-12' },
          })
        ),
      ],
      BASE,
      '2026-09-23T12:00:00.000Z'
    )
  );
  assert.throws(() =>
    resolveActiveDeliveryAttributionException(comments, BASE, '2026-09-25T00:00:00.000Z')
  );
  const revoked = record({
    kind: 'revocation',
    recordId: ID3,
    predecessorId: ID2,
    createdAt: '2026-09-23T02:00:00.000Z',
    proposal: buildDeliveryAttributionProposal({ ...BASE, exceptionId: ID3 }).proposal,
    proposalDigest: buildDeliveryAttributionProposal({ ...BASE, exceptionId: ID3 }).proposalDigest,
    authority: { ...AUTHORITY, sourceReference: 'codex-session/v1:turn-12' },
  });
  assert.throws(() =>
    resolveActiveDeliveryAttributionException(
      [...comments, renderDeliveryAttributionExceptionComment(revoked)],
      BASE,
      '2026-09-23T12:00:00.000Z'
    )
  );
  const editedRevocation = renderDeliveryAttributionExceptionComment(revoked).replace(
    /<!-- aitm-delivery-attribution-exception\/v1 [A-Za-z0-9_-]+ -->/,
    '<!-- removed -->'
  );
  assert.throws(() =>
    resolveActiveDeliveryAttributionException(
      [...comments, editedRevocation],
      BASE,
      '2026-09-23T12:00:00.000Z'
    )
  );
});

test('escaped rendered comment bound includes future authority fields', () => {
  const proposal = buildDeliveryAttributionProposal(BASE).proposal;
  assert.ok(upperBoundDeliveryAttributionCommentBytes(proposal) > 0);
  const large = {
    ...BASE,
    mappings: Array.from({ length: 110 }, (_, index) => ({
      oid: index.toString(16).padStart(40, '0'),
      messageHeadline: '🧪'.repeat(250),
      issueNumber: 1755,
    })),
  };
  assert.throws(() =>
    upperBoundDeliveryAttributionCommentBytes(buildDeliveryAttributionProposal(large).proposal)
  );
});

test('raw first-line mapping subjects retain tabs and edge spaces', () => {
  const mappings = [
    { oid: A, messageHeadline: ' leading subject ', issueNumber: 1755 },
    { oid: B, messageHeadline: 'tab\tsubject', issueNumber: 1755 },
  ];
  const built = buildDeliveryAttributionProposal({ ...BASE, mappings });
  assert.deepEqual(built.proposal.mappings, mappings);
  assert.throws(() =>
    buildDeliveryAttributionProposal({
      ...BASE,
      mappings: [{ oid: A, messageHeadline: 'line\nbreak', issueNumber: 1755 }],
    })
  );
});
