// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sealRankWaveRecord,
  selectRankWaveRecord,
  rankWaveProposal,
} from '../../../../task-tracker/lib/epic-rank-wave-authority.mjs';
import { rankWaveDigest } from '../../../../task-tracker/lib/epic-rank-wave-policy.mjs';
const at = '2026-10-04T01:00:00.000Z';
const later = '2026-10-04T02:00:00.000Z';
function binding(issue) {
  return {
    issue,
    worktree: `/clone/${issue}`,
    branch: `story-${issue}`,
    commonDir: '/clone/.git',
    provider: 'codex',
    sessionId: `native-${issue}`,
    generation: `generation-${issue}`,
  };
}
function record(extra = {}) {
  const value = {
    schema: 'aitm.epic-rank-wave/v1',
    id: 'op-1',
    revision: 1,
    action: 'authorize',
    previousDigest: null,
    repository: 'o/r',
    epic: 107,
    rank: 2,
    members: [140, 144],
    graph: [
      { number: 140, rank: 2, blockedBy: [], refinementDigest: 'a'.repeat(64) },
      { number: 144, rank: 2, blockedBy: [], refinementDigest: 'b'.repeat(64) },
    ],
    bindings: [140, 144].map(binding),
    parent: binding(107),
    proposalDigest: 'c'.repeat(64),
    source: {
      schema: 'aitm.rank-wave-source/v1',
      sessionId: 'real',
      messages: [{ messageId: 'human', statementHash: `sha256:${'a'.repeat(64)}` }],
    },
    recordingActor: 'codex/session:real',
    createdAt: at,
    expiresAt: null,
    continuation: null,
    ...extra,
  };
  if (!Object.hasOwn(extra, 'proposalDigest'))
    value.proposalDigest = rankWaveDigest(rankWaveProposal(value));
  return value;
}
function select(records, now = at) {
  return selectRankWaveRecord(records, { repository: 'o/r', epic: 107, rank: 2, now });
}

test('immutable envelopes reject unknown keys, incomplete scope, partial membership and digest tampering', () => {
  for (const extra of [
    { injected: true },
    { epic: null },
    { members: [140] },
    { createdAt: 'yesterday' },
    { proposalDigest: 'bad' },
    { expiresAt: at },
  ]) {
    assert.throws(() => sealRankWaveRecord(record(extra)));
  }
  const sealed = sealRankWaveRecord(record());
  assert.equal(select([sealed]).status, 'ready');
  sealed.record.members.push(145);
  assert.equal(select([sealed]).status, 'malformed');
});

test('null expiry is explicit non-expiring; boundary expiry never resurrects an older record', () => {
  const first = sealRankWaveRecord(record());
  const second = sealRankWaveRecord(
    record({ id: 'op-2', revision: 2, previousDigest: first.digest, expiresAt: later })
  );
  assert.equal(select([first], '2027-10-04T01:00:00.000Z').status, 'ready');
  assert.equal(select([first, second], later).status, 'expired');
});

test('latest revoked revision wins; missing predecessor and unreadable newer revision refuse', () => {
  const first = sealRankWaveRecord(record());
  const revoked = sealRankWaveRecord(
    record({ id: 'op-2', revision: 2, action: 'revoke', previousDigest: first.digest })
  );
  assert.equal(select([first, revoked]).status, 'revoked');
  assert.equal(select([revoked]).status, 'malformed');
  assert.equal(
    select([first, { record: { ...revoked.record, members: null }, digest: revoked.digest }])
      .status,
    'malformed'
  );
});

test('same identity with conflicting bytes or conflicting revisions cannot authorize', () => {
  const first = sealRankWaveRecord(record());
  const conflicting = sealRankWaveRecord(record({ recordingActor: 'another/session' }));
  assert.equal(select([first, conflicting]).status, 'malformed');
  assert.equal(select([first, structuredClone(first)]).status, 'malformed');
});

test('sealed authority refuses caller flags and incomplete physical or human provenance', () => {
  for (const extra of [
    { parent: { ...binding(107), verified: true } },
    { bindings: [{ issue: 140 }, { issue: 144 }] },
    { source: { schema: 'aitm.rank-wave-source/v1' } },
  ])
    assert.throws(() => sealRankWaveRecord(record(extra)));
});
