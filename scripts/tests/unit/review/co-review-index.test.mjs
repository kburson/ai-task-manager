// @story #1325
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

import {
  allowsCoReviewOccupancy,
  isActiveCoReviewWorktree,
  markProtocolLifecycle,
  readProtocolIndex,
  recordReviewerClaim,
  registerProtocol,
  resolveReviewerGrant,
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
    initialization: { runtimeDir: '.tmp/custom-review' },
    integrity: { ok: true, errors: [] },
  };
  return { worktree, dir, indexFile, state };
}

test('registers a custom ignored protocol directory idempotently', () => {
  const { indexFile, state } = fixture();
  assert.equal(registerProtocol({ indexFile, state }).status, 'registered');
  assert.equal(registerProtocol({ indexFile, state }).status, 'unchanged');
  const row = readProtocolIndex(indexFile)['protocol-1'];
  assert.equal(row.dir, path.join(state.worktree, '.tmp/custom-review'));
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

test('grant resolution requires live integrity and a matching durable claim', () => {
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
    claim: { role: 'reviewer', actor: 'Reviewer' },
    lastHandoff: {
      from: 'owner',
      commit: '0123456789012345678901234567890123456789',
    },
  };
  const statusProtocol = () => live;
  const grant = resolveReviewerGrant({
    indexFile,
    worktreePath: state.worktree,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    statusProtocol,
  });
  assert.equal(
    grant.pendingReviewPath,
    path.join(state.worktree, '.tmp/custom-review/round-2-reviewer-review.md')
  );
  assert.equal(grant.ownerHandoffCommit, live.lastHandoff.commit);
  assert.equal(
    resolveReviewerGrant({
      indexFile,
      worktreePath: state.worktree,
      provider: 'grok',
      sid: 'other',
      statusProtocol,
    }),
    null
  );
  assert.equal(
    resolveReviewerGrant({
      indexFile,
      worktreePath: state.worktree,
      provider: 'grok',
      sid: 'grok-reviewer-sid',
      statusProtocol: () => ({ ...live, integrity: { ok: false }, lifecycle: 'active' }),
    }),
    null
  );
});

test('grant resolution targets the command runtime before verifying its worktree', () => {
  const { indexFile, state, dir } = fixture();
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
    claim: { role: 'reviewer', actor: 'Reviewer' },
    lastHandoff: {
      from: 'owner',
      commit: '0123456789012345678901234567890123456789',
    },
  };
  const grant = resolveReviewerGrant({
    indexFile,
    worktreePath: '/different/caller/worktree',
    runtimeDir: dir,
    runtimeRoot: state.worktree,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    statusProtocol: () => live,
  });
  assert.equal(grant.protocolId, state.protocolId);
  assert.equal(grant.worktree, state.worktree);
});

test('unrelated stale active row cannot block an exact healthy reviewer grant', () => {
  const { indexFile, state, dir } = fixture();
  const staleWorktree = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-stale-index-'));
  const staleDir = path.join(staleWorktree, '.tmp', 'stale-review');
  mkdirSync(staleDir, { recursive: true });
  registerProtocol({
    indexFile,
    state: {
      ...state,
      protocolId: 'stale-protocol',
      repositoryRoot: staleWorktree,
      worktree: staleWorktree,
      roles: { owner: 'StaleOwner', reviewer: 'StaleReviewer' },
      initialization: { runtimeDir: '.tmp/stale-review' },
    },
  });
  recordReviewerClaim({
    indexFile,
    protocolId: 'stale-protocol',
    provider: 'claude',
    sid: 'unrelated-session',
    round: 2,
  });
  registerProtocol({ indexFile, state });
  recordReviewerClaim({
    indexFile,
    protocolId: state.protocolId,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    round: 2,
  });
  rmSync(staleDir, { recursive: true });
  const live = {
    ...state,
    turnState: 'claimed',
    claim: { role: 'reviewer', actor: 'Reviewer' },
    lastHandoff: {
      from: 'owner',
      commit: '0123456789012345678901234567890123456789',
    },
  };

  const grant = resolveReviewerGrant({
    indexFile,
    runtimeDir: dir,
    runtimeRoot: state.worktree,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    statusProtocol: () => live,
  });
  assert.equal(grant.protocolId, state.protocolId);
});

test('identity-matching stale runtime remains fail-closed', () => {
  const { indexFile, state, dir } = fixture();
  registerProtocol({ indexFile, state });
  recordReviewerClaim({
    indexFile,
    protocolId: state.protocolId,
    provider: 'grok',
    sid: 'grok-reviewer-sid',
    round: 2,
  });
  rmSync(dir, { recursive: true });
  assert.throws(
    () =>
      resolveReviewerGrant({
        indexFile,
        runtimeDir: state.worktree,
        runtimeRoot: state.worktree,
        provider: 'grok',
        sid: 'grok-reviewer-sid',
        statusProtocol: () => null,
      }),
    /ENOENT/
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
    claim: { role: 'reviewer', actor: 'Reviewer' },
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
