// @story #1325
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

import {
  allowsCoReviewOccupancy,
  isActiveCoReviewWorktree,
  markProtocolLifecycle,
  readProtocolIndex,
  recordReviewerClaim,
  registerProtocol,
} from '../../../review/lib/index.mjs';

function fixture() {
  const worktree = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-review-index-'));
  const dir = path.join(worktree, '.tmp', 'custom-review');
  mkdirSync(dir, { recursive: true });
  const indexFile = path.join(worktree, '.tmp', 'aitm', 'fleet', 'co-review-index.json');
  const state = {
    protocolId: 'protocol-1',
    repositoryRoot: worktree,
    worktree,
    lifecycle: 'active',
    round: 2,
    currentRole: 'reviewer',
    turnState: 'available',
    claim: null,
    roles: { owner: 'Author', reviewer: 'Reviewer' },
    artifact: { path: 'docs/plan.md' },
    initialization: { runtimeDir: '.scratch/custom-review' },
    integrity: { ok: true, errors: [] },
  };
  return { worktree, dir, indexFile, state };
}

test('registers a custom ignored protocol directory idempotently', () => {
  const { indexFile, state } = fixture();
  assert.equal(registerProtocol({ indexFile, state }).status, 'registered');
  assert.equal(registerProtocol({ indexFile, state }).status, 'unchanged');
  const row = readProtocolIndex(indexFile)['protocol-1'];
  assert.equal(row.dir, path.join(state.worktree, '.scratch/custom-review'));
  assert.equal(row.lifecycle, 'active');
  assert.equal(row.claimedSid, null);
});

test('conflicting registration refuses instead of replacing authority', () => {
  const { indexFile, state } = fixture();
  registerProtocol({ indexFile, state });
  assert.throws(
    () => registerProtocol({ indexFile, state: { ...state, worktree: '/other' } }),
    /co-review-index: conflicting registration/
  );
});

test('reviewer claim records the exact provider session and pending round path', () => {
  const { indexFile, state } = fixture();
  registerProtocol({ indexFile, state });
  const claim = recordReviewerClaim({
    indexFile,
    protocolId: state.protocolId,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    round: 2,
  });
  assert.equal(claim.status, 'claimed');
  const row = readProtocolIndex(indexFile)[state.protocolId];
  assert.equal(row.claimedRole, 'reviewer');
  assert.equal(row.claimedProvider, 'grok');
  assert.equal(row.claimedSid, 'grok-reviewer-sid');
  assert.equal(row.pendingReviewPath, path.join(row.dir, 'round-2-reviewer-review.md'));
});

test('authoritative reviewer claim atomically registers an absent operational row', () => {
  const { indexFile, state } = fixture();
  const claim = {
    role: 'reviewer',
    actor: state.roles.reviewer,
    provider: 'claude',
    sid: 'authoritative-reviewer-sid',
  };
  const result = recordReviewerClaim({ indexFile, state, claim });
  assert.equal(result.status, 'claimed');
  assert.equal(result.row.protocolId, state.protocolId);
  assert.equal(result.row.claimedProvider, claim.provider);
  assert.equal(result.row.claimedSid, claim.sid);
});

test('authoritative reviewer claim repairs stale projection with the same registration identity', () => {
  const { indexFile, state } = fixture();
  registerProtocol({ indexFile, state });
  markProtocolLifecycle({ indexFile, protocolId: state.protocolId, lifecycle: 'accepted' });
  const result = recordReviewerClaim({
    indexFile,
    state,
    claim: { provider: 'claude', sid: 'repair-sid' },
  });
  assert.equal(result.row.lifecycle, 'active');
  assert.equal(result.row.claimedSid, 'repair-sid');
});

test('a later round may replace an inert prior reviewer session claim', () => {
  const { indexFile, state } = fixture();
  registerProtocol({ indexFile, state });
  recordReviewerClaim({
    indexFile,
    protocolId: state.protocolId,
    provider: 'grok',
    sid: 'grok-round-2',
    round: 2,
  });
  const next = recordReviewerClaim({
    indexFile,
    protocolId: state.protocolId,
    provider: 'grok',
    sid: 'grok-round-3',
    round: 3,
  });
  assert.equal(next.status, 'claimed');
  assert.equal(next.row.claimedSid, 'grok-round-3');
  assert.equal(next.row.pendingReviewPath, path.join(next.row.dir, 'round-3-reviewer-review.md'));
});

test('the same round cannot be prepared for a different reviewer session', () => {
  const { indexFile, state } = fixture();
  registerProtocol({ indexFile, state });
  recordReviewerClaim({
    indexFile,
    protocolId: state.protocolId,
    provider: 'grok',
    sid: 'grok-round-2',
    round: 2,
  });
  assert.throws(
    () =>
      recordReviewerClaim({
        indexFile,
        protocolId: state.protocolId,
        provider: 'grok',
        sid: 'other-round-2',
        round: 2,
      }),
    /already prepared for another session/
  );
});

test('active co-review worktree is derived from live protocol integrity', () => {
  const { indexFile, state } = fixture();
  registerProtocol({ indexFile, state });
  assert.equal(
    isActiveCoReviewWorktree({
      indexFile,
      worktreePath: state.worktree,
      statusProtocol: () => state,
    }),
    true
  );
  assert.equal(
    isActiveCoReviewWorktree({
      indexFile,
      worktreePath: state.worktree,
      statusProtocol: () => ({ ...state, lifecycle: 'accepted' }),
    }),
    false
  );
});

test('occupancy sharing is limited to the exact live reviewer provider session', () => {
  const { indexFile, state } = fixture();
  registerProtocol({ indexFile, state });
  recordReviewerClaim({
    indexFile,
    protocolId: state.protocolId,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    round: 2,
  });
  const live = {
    ...state,
    turnState: 'claimed',
    claim: {
      role: 'reviewer',
      actor: 'Reviewer',
      provider: 'grok',
      sid: 'grok-reviewer-sid',
    },
  };
  const occupancy = {
    indexFile,
    worktreePath: state.worktree,
    existing: { provider: 'codex', sid: 'author-sid' },
    occupants: [{ provider: 'codex', sid: 'author-sid' }],
    requested: { provider: 'grok', sid: 'grok-reviewer-sid' },
    statusProtocol: () => live,
  };
  assert.equal(allowsCoReviewOccupancy(occupancy), true);
  assert.equal(
    allowsCoReviewOccupancy({
      ...occupancy,
      requested: { provider: 'grok', sid: 'unrelated-third-session' },
    }),
    false
  );
  assert.equal(
    allowsCoReviewOccupancy({
      ...occupancy,
      occupants: [occupancy.existing, { provider: 'grok', sid: 'reviewer-from-another-protocol' }],
    }),
    false
  );
  assert.equal(
    allowsCoReviewOccupancy({
      ...occupancy,
      requested: { provider: 'codex', sid: 'another-author-session' },
    }),
    false
  );
  assert.equal(
    allowsCoReviewOccupancy({
      ...occupancy,
      statusProtocol: () => ({
        ...live,
        currentRole: 'owner',
        turnState: 'available',
        claim: null,
      }),
    }),
    false
  );
});

test('terminal lifecycle projection immediately invalidates a row', () => {
  const { indexFile, state } = fixture();
  registerProtocol({ indexFile, state });
  assert.equal(
    markProtocolLifecycle({ indexFile, protocolId: state.protocolId, lifecycle: 'accepted' })
      .status,
    'updated'
  );
  assert.equal(readProtocolIndex(indexFile)[state.protocolId].lifecycle, 'accepted');
});
