// @story #2014
import test from 'node:test';
import assert from 'node:assert/strict';
import * as recovery from '../../../../task-tracker/lib/epic-rank-wave-restore-worktree.mjs';

const observation = () => ({
  epic: 107,
  role: 'orchestrator',
  sid: 'native-parent',
  provider: 'codex',
  repository: 'o/r',
  observedRepository: 'o/r',
  active: {
    issue: '#107',
    entryStartTs: '2026-10-14T01:00:00.000Z',
    worktreeBranch: 'parent',
    bindingGenerationId: 'generation',
  },
  claim: { issue: 107, sid: 'native-parent', provider: 'codex', bindingGenerationId: 'generation' },
  user: { login: 'owner' },
  issue: { number: 107, state: 'OPEN', assignees: [{ login: 'owner' }] },
  binding: {
    issue: 107,
    worktree: '/owned/parent',
    branch: 'parent',
    commonDir: '/owned/.git',
    provider: 'codex',
    sessionId: 'native-parent',
    generation: 'generation',
  },
  native: { verified: true, sessionId: 'native-parent' },
  parentContract: true,
  location: { worktreePath: '/owned/parent', worktreeBranch: 'parent' },
});

// Removing any parent-identity check must allow a table row that should refuse.
test('recovery parent validation rejects wrong owner role timer session generation repository and recorded location', () => {
  assert.equal(typeof recovery.verifyWorktreeRecoveryParent, 'function');
  assert.deepEqual(recovery.verifyWorktreeRecoveryParent(observation()), observation().binding);
  for (const mutate of [
    (x) => {
      x.role = 'agent';
    },
    (x) => {
      x.active.issue = '#108';
    },
    (x) => {
      x.claim.issue = 108;
    },
    (x) => {
      x.claim.sid = 'other';
    },
    (x) => {
      x.claim.provider = 'claude';
    },
    (x) => {
      x.active.bindingGenerationId = 'other';
    },
    (x) => {
      x.binding.sessionId = 'other';
    },
    (x) => {
      x.active.entryStartTs = null;
    },
    (x) => {
      x.active.entryStartTs = 'invalid';
    },
    (x) => {
      x.active.pausedAtTs = '2026-10-14T01:00:01.000Z';
    },
    (x) => {
      x.active.closedAt = '2026-10-14T01:00:01.000Z';
    },
    (x) => {
      x.observedRepository = 'foreign/repo';
    },
    (x) => {
      x.user.login = 'other';
    },
    (x) => {
      x.issue.assignees.push({ login: 'other' });
    },
    (x) => {
      x.issue.state = 'CLOSED';
    },
    (x) => {
      x.issue.number = 108;
    },
    (x) => {
      x.parentContract = false;
    },
    (x) => {
      x.native.verified = false;
    },
    (x) => {
      x.native.sessionId = 'other';
    },
    (x) => {
      x.location.worktreeBranch = 'other';
    },
    (x) => {
      x.location.worktreePath = '/other';
    },
    (x) => {
      x.active.worktreeBranch = 'other';
    },
  ]) {
    const x = observation();
    mutate(x);
    assert.throws(() => recovery.verifyWorktreeRecoveryParent(x));
  }
});
