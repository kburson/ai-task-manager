// @story #1049
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { WorkLeaseError } from '@kburson/aitm-ledger';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import {
  coordinateWorkLeaseAcquire,
  buildTrustedWorkLeaseBinding,
  buildTrustedWorkLeaseHolder,
} from '../../../lib/work-lease/guard.mjs';
import * as workLeaseGuard from '../../../lib/work-lease/guard.mjs';
import {
  activeTaskPath,
  attachWorkLeaseIntentReceipt,
  checkpointWorkLeaseProjection,
  getActiveTask,
  setActiveTask,
} from '../../../session-state.mjs';
import { loadState } from '../../../state.mjs';
import { renewWorkLeaseBeforeResume, verbResume } from '../../../verbs/resume.mjs';
import { loadMarker, markerPathFor } from '../../../word-counter.mjs';
import { readFileSync as readSourceFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NOW = new Date('2026-07-30T12:00:00.000Z');
const WORKTREE = {
  worktreeId: 'wt:v1:worktree-1',
  pathHash: 'path-hash-1',
  displayPath: '/repo/worktree-1',
};
const LEASE = {
  projectId: 'project-1',
  leaseId: 'lease-1',
  issueId: '1049',
  mode: 'write',
  fencingToken: '7',
  state: 'active',
  holder: {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    pid: 123,
    worktreeId: WORKTREE.worktreeId,
    pathHash: WORKTREE.pathHash,
    branch: 'codex/1049-exclusive-work-lease',
  },
  acquiredAt: NOW.toISOString(),
  heartbeatAt: NOW.toISOString(),
  expiresAt: '2026-07-30T12:15:00.000Z',
};

function sandbox() {
  return mkdtempProjectIsolated('tt-exclusive-bind-');
}

function options(dir, overrides = {}) {
  const log = [];
  const store = {
    projectId: 'project-1',
    async acquire(request) {
      log.push(`acquire:${request.idempotencyKey}`);
      return LEASE;
    },
    async release(request) {
      log.push(`release:${request.idempotencyKey}:${request.releasedAt}:${request.reason}`);
      return { released: true };
    },
  };
  return {
    log,
    input: {
      issueId: '1049',
      sessionId: 'session-1',
      projectDir: dir,
      hostId: 'host-1',
      provider: 'codex',
      agentRunId: 'run-1',
      pid: 123,
      branch: 'codex/1049-exclusive-work-lease',
      getStore: async () => {
        log.push('provider');
        return store;
      },
      preparedEligibility: {
        ok: true,
        claimRequired: true,
        currentUser: 'worker',
        assignees: [],
      },
      readEligibility: async () => {
        log.push('eligibility');
        return {
          ok: true,
          claimRequired: false,
          currentUser: 'worker',
          assignees: ['worker'],
        };
      },
      reconcileClaim: async ({ projectionId }) => {
        log.push('claim');
        return {
          reconciled: true,
          projectionName: 'github-claim',
          projectionId,
          assignmentResult: 'assigned-to-current',
        };
      },
      resolveWorktreeIdentity: async () => {
        log.push('identity');
        return WORKTREE;
      },
      now: () => NOW,
      randomUUID: () => 'request-1',
      projectionInputs: {
        session: { issue: '#1049' },
        fleet: { issue: '#1049', worktreeId: WORKTREE.worktreeId },
        timing: { issue: '#1049', event: 'start' },
        github: {
          issueNumber: '1049',
          repo: 'owner/repo',
          skippedNetwork: false,
          assigneePolicy: 'enforced',
          claimRequired: true,
          currentUser: 'worker',
          preparedKind: 'unassigned',
          preparedAssignees: [],
          auditBody: 'exact prepared audit',
        },
      },
      projections: Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async ({ lease, projectionName, projectionId }) => {
            log.push(name);
            if (name === 'session') {
              setActiveTask('session-1', { issue: '#1049', lease }, dir);
            }
            return { reconciled: true, projectionName, projectionId };
          },
        ])
      ),
      ...overrides,
    },
  };
}

function resumeOptions(dir, overrides = {}) {
  const log = [];
  const store = {
    projectId: 'project-1',
    async verify(request) {
      log.push(`verify:${request.verifiedAt}`);
      return { allowed: true, lease: LEASE };
    },
    async renew(request) {
      log.push(`renew:${request.idempotencyKey}`);
      return LEASE;
    },
  };
  setActiveTask(
    'session-1',
    {
      issue: '#1049',
      lease: {
        projectId: LEASE.projectId,
        leaseId: LEASE.leaseId,
        fencingToken: LEASE.fencingToken,
        worktreeId: WORKTREE.worktreeId,
      },
    },
    dir
  );
  return {
    log,
    input: {
      issueId: '1049',
      sessionId: 'session-1',
      projectDir: dir,
      hostId: 'host-1',
      holderIdentity: {
        ...LEASE.holder,
        displayPath: WORKTREE.displayPath,
      },
      getStore: async () => store,
      readEligibility: async () => ({
        ok: true,
        claimRequired: false,
        currentUser: 'worker',
        assignees: ['worker'],
      }),
      reconcileClaim: async ({ projectionId }) => ({
        reconciled: true,
        projectionName: 'github-claim',
        projectionId,
        assignmentResult: 'assigned-to-current',
      }),
      resolveWorktreeIdentity: async () => WORKTREE,
      now: () => NOW,
      randomUUID: () => 'request-1',
      projectionInputs: {
        session: { issue: '#1049', paused: false },
        fleet: { issue: '#1049', status: 'active' },
        timing: { rows: [{ row: 'resume row', subOperationId: 'resume' }] },
        github: {
          issueNumber: '1049',
          repo: 'owner/repo',
          skippedNetwork: false,
          assigneePolicy: 'enforced',
          claimRequired: false,
          currentUser: 'worker',
          preparedKind: 'assigned-to-current',
          preparedAssignees: ['worker'],
          auditBody: null,
        },
      },
      projections: Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async ({ projectionName, projectionId }) => {
            log.push(name);
            return { reconciled: true, projectionName, projectionId };
          },
        ])
      ),
      ...overrides,
    },
  };
}

test('trusted holder is built only from explicit runtime identity plus canonical worktree identity', async () => {
  const holder = await buildTrustedWorkLeaseHolder({
    projectDir: '/repo/worktree-1',
    hostId: 'host-1',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    pid: 123,
    branch: 'codex/1049-exclusive-work-lease',
    resolveWorktreeIdentity: async () => WORKTREE,
    env: {
      AITM_LEASE_ID: 'untrusted-env-lease',
      AITM_FENCING_TOKEN: '999',
      AITM_LEASE_AUTH_TOKEN: 'secret',
    },
    fleet: { holder: 'untrusted-fleet-holder' },
    cache: { holder: 'untrusted-cache-holder' },
  });

  assert.deepEqual(holder, LEASE.holder);
  assert.equal(JSON.stringify(holder).includes('secret'), false);
  assert.equal(JSON.stringify(holder).includes('untrusted'), false);
});

test('trusted bind identity includes the canonical display path while authority holder stays schema exact', async () => {
  const identity = await buildTrustedWorkLeaseBinding({
    projectDir: '/repo/worktree-1',
    hostId: 'host-1',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    pid: 123,
    branch: 'codex/1049-exclusive-work-lease',
    resolveWorktreeIdentity: async () => WORKTREE,
  });
  assert.deepEqual(identity, { ...LEASE.holder, displayPath: WORKTREE.displayPath });
  const holder = await buildTrustedWorkLeaseHolder({
    projectDir: '/repo/worktree-1',
    hostId: 'host-1',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    pid: 123,
    branch: 'codex/1049-exclusive-work-lease',
    resolveWorktreeIdentity: async () => WORKTREE,
  });
  assert.equal(Object.hasOwn(holder, 'displayPath'), false);
});

for (const [field, value] of [
  ['principalKind', 'integration'],
  ['provider', 'claude'],
  ['agentRunId', 'run-other'],
  ['sessionId', 'session-other'],
  ['hostId', 'host-other'],
  ['worktreeId', 'wt:v1:other'],
  ['displayPath', '/repo/other'],
  ['pathHash', 'path-other'],
  ['branch', 'other-branch'],
]) {
  test(`resume rejects trusted bind identity drift in ${field} before projection`, async () => {
    const dir = sandbox();
    try {
      const { input, log } = resumeOptions(dir, {
        holderIdentity: { ...LEASE.holder, displayPath: WORKTREE.displayPath, [field]: value },
      });
      await assert.rejects(
        () => workLeaseGuard.coordinateWorkLeaseResume(input),
        /trusted|holder|canonical worktree/i
      );
      assert.equal(log.includes('session'), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('cold Full-Auto bind persists intent, acquires, claims, and reconciles every projection in order', async () => {
  const dir = sandbox();
  try {
    const { input, log } = options(dir);
    const result = await coordinateWorkLeaseAcquire(input);

    assert.deepEqual(log, [
      'identity',
      'provider',
      'acquire:acquire:session-1:1049:request-1',
      'eligibility',
      'claim',
      'session',
      'fleet',
      'timing',
      'github',
    ]);
    assert.deepEqual(result.lease, {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '7',
      worktreeId: WORKTREE.worktreeId,
    });
    const session = getActiveTask('session-1', dir);
    assert.deepEqual(session.lease, result.lease);
    assert.equal(session.workLeaseIntent, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fresh acquire persists one prepared claim intent and reconciles only that intent after authority', async () => {
  const dir = sandbox();
  try {
    const { input, log } = options(dir);
    const githubInput = {
      issueNumber: '1049',
      repo: 'owner/repo',
      skippedNetwork: false,
      assigneePolicy: 'enforced',
      claimRequired: true,
      currentUser: 'worker',
      preparedKind: 'unassigned',
      preparedAssignees: [],
      auditBody: 'exact prepared audit',
    };
    input.projectionInputs.github = githubInput;
    input.preparedEligibility = {
      ok: true,
      claimRequired: true,
      currentUser: 'worker',
      assignees: [],
      assigneeKind: 'unassigned',
    };
    input.readEligibility = async () => {
      log.push('eligibility-after-authority');
      return {
        ok: true,
        claimRequired: false,
        currentUser: 'worker',
        assignees: ['worker'],
        assigneeKind: 'assigned-to-current',
      };
    };
    delete input.claim;
    input.reconcileClaim = async ({ input: persisted, projectionId, liveEligibility }) => {
      log.push(`claim:${projectionId}`);
      assert.deepEqual(persisted, githubInput);
      assert.deepEqual(liveEligibility.assignees, ['worker']);
      return {
        reconciled: true,
        projectionName: 'github-claim',
        projectionId,
        assignmentResult: 'assigned-to-current',
      };
    };

    await coordinateWorkLeaseAcquire(input);

    const acquireIndex = log.findIndex((entry) => entry.startsWith('acquire:'));
    const eligibilityIndex = log.indexOf('eligibility-after-authority');
    const claimIndex = log.findIndex((entry) => entry.startsWith('claim:'));
    const sessionIndex = log.indexOf('session');
    assert.ok(acquireIndex >= 0 && acquireIndex < eligibilityIndex);
    assert.ok(eligibilityIndex < claimIndex && claimIndex < sessionIndex);
    assert.equal(
      log.filter((entry) => entry === 'eligibility-after-authority').length,
      1,
      'the prepared decision must not be re-created before authority'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resume reconciles a persisted required claim before session, fleet, or timing', async () => {
  const dir = sandbox();
  try {
    const { input, log } = resumeOptions(dir);
    input.projectionInputs.github = {
      issueNumber: '1049',
      repo: 'owner/repo',
      skippedNetwork: false,
      assigneePolicy: 'enforced',
      claimRequired: true,
      currentUser: 'worker',
      preparedKind: 'unassigned',
      preparedAssignees: [],
      auditBody: 'exact prepared audit',
    };
    input.readEligibility = async () => {
      log.push('eligibility-after-authority');
      return {
        ok: true,
        claimRequired: true,
        currentUser: 'worker',
        assignees: [],
        assigneeKind: 'unassigned',
      };
    };
    input.reconcileClaim = async ({ input: persisted, projectionId }) => {
      log.push(`claim:${projectionId}`);
      assert.equal(persisted.claimRequired, true);
      return {
        reconciled: true,
        projectionName: 'github-claim',
        projectionId,
        assignmentResult: 'assigned-to-current',
      };
    };

    await workLeaseGuard.coordinateWorkLeaseResume(input);

    const renewIndex = log.findIndex((entry) => entry.startsWith('renew:'));
    const claimIndex = log.findIndex((entry) => entry.startsWith('claim:'));
    assert.ok(renewIndex >= 0 && renewIndex < claimIndex);
    assert.ok(claimIndex < log.indexOf('session'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('terminal contention restores exact prior session bytes and performs no bind projection', async () => {
  const dir = sandbox();
  try {
    const p = activeTaskPath('session-1', dir);
    setActiveTask('session-1', { issue: '#1049', wordsAtStart: 3 }, dir);
    writeFileSync(p, '{\n  "issue": "#1049",\n  "wordsAtStart": 3\n}\n', 'utf8');
    const before = readFileSync(p);
    const { input, log } = options(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          log.push('acquire:contended');
          throw new WorkLeaseError('lease-contended', 'held elsewhere');
        },
      }),
      reconcileClaim: async () => assert.fail('claim must not run'),
      projections: Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async () => assert.fail(`${name} must not run`),
        ])
      ),
    });

    await assert.rejects(
      () => coordinateWorkLeaseAcquire(input),
      (error) => {
        assert.equal(error.code, 'lease-contended');
        return true;
      }
    );
    assert.deepEqual(readFileSync(p), before);
    assert.deepEqual(log, ['identity', 'acquire:contended']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ambiguous authority failure retains exact intent and performs no bind projection', async () => {
  const dir = sandbox();
  try {
    const { input } = options(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        },
      }),
      claim: async () => assert.fail('claim must not run'),
      projections: Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async () => assert.fail(`${name} must not run`),
        ])
      ),
    });

    await assert.rejects(
      () => coordinateWorkLeaseAcquire(input),
      (error) => {
        assert.equal(error.code, 'authority-unavailable');
        return true;
      }
    );
    const intent = getActiveTask('session-1', dir).workLeaseIntent;
    assert.equal(intent.idempotencyKey, 'acquire:session-1:1049:request-1');
    assert.equal(intent.receipt, undefined);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(intent.projections).map(([name, projection]) => [name, projection.completed])
      ),
      { session: false, fleet: false, timing: false, github: false }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('foreign assignee discovered after acquire releases before restoring and never projects', async () => {
  const dir = sandbox();
  try {
    setActiveTask('session-1', { issue: '#1049', wordsAtStart: 11 }, dir);
    const before = readFileSync(activeTaskPath('session-1', dir));
    const { input, log } = options(dir, {
      reconcileClaim: async () => {
        log.push('claim:foreign');
        throw new WorkLeaseError('authority-forbidden', 'foreign assignee');
      },
      projections: Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async () => assert.fail(`${name} must not run`),
        ])
      ),
    });

    await assert.rejects(
      () => coordinateWorkLeaseAcquire(input),
      (error) => {
        assert.equal(error.code, 'authority-forbidden');
        return true;
      }
    );
    assert.deepEqual(log, [
      'identity',
      'provider',
      'acquire:acquire:session-1:1049:request-1',
      'eligibility',
      'claim:foreign',
      'release:release-after-claim:acquire:session-1:1049:request-1:2026-07-30T12:00:00.000Z:assignee-changed-after-acquire',
    ]);
    assert.deepEqual(readFileSync(activeTaskPath('session-1', dir)), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persisted acquire replays authority before current eligibility and validates the replayed receipt', async () => {
  const dir = sandbox();
  try {
    const first = options(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        },
      }),
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(first.input), /response lost/);

    const log = [];
    const retry = options(dir, {
      readEligibility: async () => {
        log.push('eligibility');
        return { ok: true, claimRequired: false };
      },
      getStore: async () => ({
        projectId: 'project-1',
        async acquire(request) {
          log.push(`acquire:${request.idempotencyKey}`);
          return LEASE;
        },
      }),
      projections: Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async ({ projectionName, projectionId }) => ({
            reconciled: true,
            projectionName,
            projectionId,
          }),
        ])
      ),
    });
    await coordinateWorkLeaseAcquire(retry.input);
    assert.deepEqual(log.slice(0, 2), ['acquire:acquire:session-1:1049:request-1', 'eligibility']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('response-lost acquire replays the original PID request after process restart', async () => {
  const dir = sandbox();
  try {
    const acquireRequests = [];
    let acquireAttempts = 0;
    const store = {
      projectId: 'project-1',
      async acquire(request) {
        acquireRequests.push(structuredClone(request));
        acquireAttempts += 1;
        if (acquireAttempts === 1) {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        }
        return LEASE;
      },
    };
    const first = options(dir, {
      getStore: async () => store,
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(first.input), /response lost/);

    const restarted = options(dir, {
      pid: 456,
      getStore: async () => store,
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await coordinateWorkLeaseAcquire(restarted.input);

    assert.equal(acquireRequests.length, 2);
    assert.deepEqual(acquireRequests[1], acquireRequests[0]);
    assert.equal(acquireRequests[1].holder.pid, 123);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('response-lost acquire refuses changed logical holder identity before authority replay', async () => {
  const dir = sandbox();
  try {
    const first = options(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        },
      }),
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(first.input), /response lost/);

    let authorityCalls = 0;
    const changedHolders = [
      { provider: 'claude' },
      { agentRunId: 'run-2' },
      { hostId: 'host-2' },
      { branch: 'codex/other-branch' },
      {
        resolveWorktreeIdentity: async () => ({
          ...WORKTREE,
          worktreeId: 'wt:v1:worktree-2',
        }),
      },
      {
        sessionId: 'session-2',
        loadSession: async () => getActiveTask('session-1', dir),
      },
    ];
    for (const changedHolder of changedHolders) {
      const retry = options(dir, {
        ...changedHolder,
        getStore: async () => ({
          projectId: 'project-1',
          async acquire() {
            authorityCalls += 1;
            return LEASE;
          },
        }),
        readEligibility: async () => assert.fail('eligibility must follow validated replay'),
      });
      await assert.rejects(() => coordinateWorkLeaseAcquire(retry.input), /holder/);
    }
    assert.equal(authorityCalls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fresh bind validates deferred claim callback before acquiring', async () => {
  const dir = sandbox();
  try {
    let acquires = 0;
    const { input } = options(dir, {
      reconcileClaim: undefined,
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          acquires += 1;
          return LEASE;
        },
      }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(input), /deferred assignee claim/);
    assert.equal(acquires, 0);
    assert.equal(getActiveTask('session-1', dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persisted request rejects attacker holder and store project mismatch before authority replay', async () => {
  const dir = sandbox();
  try {
    const first = options(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        },
      }),
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(first.input));

    const p = activeTaskPath('session-1', dir);
    const record = JSON.parse(readFileSync(p, 'utf8'));
    const request = JSON.parse(record.workLeaseIntent.canonicalRequest);
    request.holder.agentRunId = 'attacker-run';
    record.workLeaseIntent.canonicalRequest = JSON.stringify(request);
    writeFileSync(p, JSON.stringify(record, null, 2) + '\n');

    let authorityCalls = 0;
    const retry = options(dir, {
      getStore: async () => ({
        projectId: 'attacker-project',
        async acquire() {
          authorityCalls += 1;
          return LEASE;
        },
      }),
      readEligibility: async () => assert.fail('eligibility must follow validated replay'),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(retry.input), /holder|project/);
    assert.equal(authorityCalls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('minimal corrupt persisted receipt is rejected before eligibility or projection', async () => {
  const dir = sandbox();
  try {
    const first = options(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        },
      }),
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(first.input));
    const p = activeTaskPath('session-1', dir);
    const record = JSON.parse(readFileSync(p, 'utf8'));
    record.workLeaseIntent.receipt = {
      projectId: 'project-1',
      leaseId: 'lease-1',
      fencingToken: '7',
    };
    writeFileSync(p, JSON.stringify(record, null, 2) + '\n');

    const retry = options(dir, {
      readEligibility: async () => assert.fail('eligibility must not run'),
      projections: Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async () => assert.fail(`${name} must not run`),
        ])
      ),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(retry.input), /receipt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persisted acquire rejects authority project drift before replay', async () => {
  const dir = sandbox();
  try {
    const first = options(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        },
      }),
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(first.input));

    let authorityCalls = 0;
    const retry = options(dir, {
      getStore: async () => ({
        projectId: 'project-2',
        async acquire() {
          authorityCalls += 1;
          return LEASE;
        },
      }),
      readEligibility: async () => assert.fail('eligibility must not run'),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(retry.input), /project/);
    assert.equal(authorityCalls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persisted receipt rejects mismatched identity, holder, fence, state, and timestamps', async () => {
  const corruptions = [
    ['project', (lease) => ({ ...lease, projectId: 'project-2' })],
    ['issue', (lease) => ({ ...lease, issueId: '1051' })],
    ['mode', (lease) => ({ ...lease, mode: 'read' })],
    ['state', (lease) => ({ ...lease, state: 'paused' })],
    [
      'holder',
      (lease) => ({
        ...lease,
        holder: { ...lease.holder, worktreeId: 'wt:v1:attacker' },
      }),
    ],
    ['fence', (lease) => ({ ...lease, fencingToken: '0' })],
    ['timestamp', (lease) => ({ ...lease, expiresAt: lease.heartbeatAt })],
  ];
  for (const [label, corrupt] of corruptions) {
    const dir = sandbox();
    try {
      const first = options(dir, {
        getStore: async () => ({
          projectId: 'project-1',
          async acquire() {
            throw new WorkLeaseError('authority-unavailable', 'response lost');
          },
        }),
        readEligibility: async () => ({ ok: true, claimRequired: false }),
      });
      await assert.rejects(() => coordinateWorkLeaseAcquire(first.input));
      const p = activeTaskPath('session-1', dir);
      const record = JSON.parse(readFileSync(p, 'utf8'));
      record.workLeaseIntent.receipt = corrupt(LEASE);
      writeFileSync(p, JSON.stringify(record, null, 2) + '\n');

      const retry = options(dir, {
        readEligibility: async () => assert.fail(`${label}: eligibility must not run`),
      });
      await assert.rejects(
        () => coordinateWorkLeaseAcquire(retry.input),
        (error) => {
          assert.equal(error.code, 'invalid-request', label);
          return true;
        }
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('incomplete persisted projection inputs fail before every projection effect', async () => {
  const dir = sandbox();
  try {
    const first = options(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        },
      }),
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(first.input));
    const p = activeTaskPath('session-1', dir);
    const record = JSON.parse(readFileSync(p, 'utf8'));
    delete record.workLeaseIntent.projections.github;
    writeFileSync(p, JSON.stringify(record, null, 2) + '\n');

    let effects = 0;
    const retry = options(dir, {
      readEligibility: async () => ({ ok: true, claimRequired: false }),
      projections: Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async () => {
            effects += 1;
            return { reconciled: true };
          },
        ])
      ),
    });
    await assert.rejects(
      () => coordinateWorkLeaseAcquire(retry.input),
      /all four persisted projections/
    );
    assert.equal(effects, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resumed grant with missing claim releases and restores the durable prior session', async () => {
  const dir = sandbox();
  try {
    setActiveTask('session-1', { issue: '#1049', wordsAtStart: 19 }, dir);
    const before = readFileSync(activeTaskPath('session-1', dir));
    const first = options(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        },
      }),
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(first.input));

    const releaseRequests = [];
    const retry = options(dir, {
      reconcileClaim: undefined,
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          return LEASE;
        },
        async release(request) {
          releaseRequests.push(request);
          return { released: true };
        },
      }),
      readEligibility: async () => ({
        ok: true,
        claimRequired: true,
        currentUser: 'worker',
      }),
    });
    await assert.rejects(
      () => coordinateWorkLeaseAcquire(retry.input),
      /persisted assignee claim reconciler/
    );
    assert.equal(releaseRequests.length, 1);
    assert.deepEqual(readFileSync(activeTaskPath('session-1', dir)), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('worktree contention restores exact fresh absence and restart restores durable original bytes', async () => {
  const freshDir = sandbox();
  const restartDir = sandbox();
  try {
    const fresh = options(freshDir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('worktree-contended', 'worktree busy');
        },
      }),
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(fresh.input), /worktree busy/);
    assert.equal(getActiveTask('session-1', freshDir), null);

    setActiveTask('session-1', { issue: '#1049', wordsAtStart: 23 }, restartDir);
    const original = readFileSync(activeTaskPath('session-1', restartDir));
    const ambiguous = options(restartDir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        },
      }),
      readEligibility: async () => ({ ok: true, claimRequired: false }),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(ambiguous.input));

    const restarted = options(restartDir, {
      getStore: async () => ({
        projectId: 'project-1',
        async acquire() {
          throw new WorkLeaseError('worktree-contended', 'worktree busy');
        },
      }),
      readEligibility: async () => assert.fail('eligibility follows authority replay'),
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(restarted.input), /worktree busy/);
    assert.deepEqual(readFileSync(activeTaskPath('session-1', restartDir)), original);
  } finally {
    rmSync(freshDir, { recursive: true, force: true });
    rmSync(restartDir, { recursive: true, force: true });
  }
});

for (const code of [
  'invalid-request',
  'idempotency-conflict',
  'lease-contended',
  'worktree-contended',
  'fence-stale',
  'authority-unauthenticated',
  'authority-forbidden',
  'holder-live',
  'lease-not-held',
  'main-worktree-unresolved',
]) {
  test(`${code} is a definitive no-grant outcome that restores exact absence`, async () => {
    const dir = sandbox();
    try {
      const { input } = options(dir, {
        readEligibility: async () => ({ ok: true, claimRequired: false }),
        getStore: async () => ({
          projectId: 'project-1',
          async acquire() {
            throw new WorkLeaseError(code, `${code} refusal`);
          },
        }),
      });
      await assert.rejects(
        () => coordinateWorkLeaseAcquire(input),
        (error) => {
          assert.equal(error.code, code);
          return true;
        }
      );
      assert.equal(getActiveTask('session-1', dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('response-lost release replays byte-identical request then restores the durable snapshot', async () => {
  const dir = sandbox();
  try {
    setActiveTask('session-1', { issue: '#1049', wordsAtStart: 29 }, dir);
    const before = readFileSync(activeTaskPath('session-1', dir));
    const lateLease = {
      ...LEASE,
      acquiredAt: '2026-07-30T12:00:05.000Z',
      heartbeatAt: '2026-07-30T12:00:05.000Z',
      expiresAt: '2026-07-30T12:15:05.000Z',
    };
    const releaseRequests = [];
    let releaseAttempts = 0;
    const store = {
      projectId: 'project-1',
      async acquire() {
        return lateLease;
      },
      async release(request) {
        releaseRequests.push(structuredClone(request));
        releaseAttempts += 1;
        if (releaseAttempts === 1) {
          throw new WorkLeaseError('authority-unavailable', 'release response lost');
        }
        return { released: true };
      },
    };
    const attempt = () =>
      options(dir, {
        getStore: async () => store,
        reconcileClaim: async () => {
          throw new WorkLeaseError('authority-forbidden', 'foreign assignee');
        },
      }).input;

    await assert.rejects(() => coordinateWorkLeaseAcquire(attempt()), /release response lost/);
    assert.ok(getActiveTask('session-1', dir).workLeaseIntent.receipt);
    await assert.rejects(() => coordinateWorkLeaseAcquire(attempt()), /foreign assignee/);
    assert.equal(releaseRequests[0].releasedAt, lateLease.acquiredAt);
    assert.ok(releaseRequests[0].releasedAt >= lateLease.acquiredAt);
    assert.deepEqual(releaseRequests[1], releaseRequests[0]);
    assert.deepEqual(readFileSync(activeTaskPath('session-1', dir)), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const crashProjection of ['session', 'fleet', 'timing', 'github']) {
  test(`${crashProjection} callback success and checkpoint crash replay one external effect with the same projectionId`, async () => {
    const dir = sandbox();
    try {
      const effects = new Map();
      const projectionIds = new Map();
      let crashed = false;
      const callbacks = Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async ({ projectionName, projectionId }) => {
            assert.equal(projectionName, name);
            const priorId = projectionIds.get(name);
            if (priorId === undefined) {
              projectionIds.set(name, projectionId);
              effects.set(name, 1);
            } else {
              assert.equal(projectionId, priorId);
            }
            return { reconciled: true, projectionName, projectionId };
          },
        ])
      );
      const checkpoint = (...args) => {
        const [, name] = args;
        if (name === crashProjection && !crashed) {
          crashed = true;
          throw new Error(`checkpoint crash:${name}`);
        }
        return checkpointWorkLeaseProjection(...args);
      };
      const attempt = () =>
        options(dir, {
          readEligibility: async () => ({ ok: true, claimRequired: false }),
          projections: callbacks,
          checkpointProjection: checkpoint,
        }).input;

      await assert.rejects(
        () => coordinateWorkLeaseAcquire(attempt()),
        new RegExp(`checkpoint crash:${crashProjection}`)
      );
      await coordinateWorkLeaseAcquire(attempt());
      assert.deepEqual(Object.fromEntries(effects), {
        session: 1,
        fleet: 1,
        timing: 1,
        github: 1,
      });
      assert.equal(new Set(projectionIds.values()).size, 4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('projection callback requires positive matching reconciliation proof', async () => {
  const dir = sandbox();
  try {
    const { input } = options(dir, {
      readEligibility: async () => ({ ok: true, claimRequired: false }),
      projections: {
        session: async () => ({ reconciled: false }),
        fleet: async () => assert.fail('fleet must not run'),
        timing: async () => assert.fail('timing must not run'),
        github: async () => assert.fail('github must not run'),
      },
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(input), /reconciliation proof/);
    assert.equal(
      getActiveTask('session-1', dir).workLeaseIntent.projections.session.completed,
      false
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('clear failure is fail-closed and leaves the reconciled journal persisted', async () => {
  const dir = sandbox();
  try {
    const { input } = options(dir, {
      readEligibility: async () => ({ ok: true, claimRequired: false }),
      clearIntent: () => false,
    });
    await assert.rejects(() => coordinateWorkLeaseAcquire(input), /clear reconciled work-lease/);
    const intent = getActiveTask('session-1', dir).workLeaseIntent;
    assert.ok(intent);
    assert.ok(Object.values(intent.projections).every((projection) => projection.completed));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('response-lost resume renew replays one exact request before four projections', async () => {
  const dir = sandbox();
  try {
    const renewRequests = [];
    let renewAttempts = 0;
    const store = {
      projectId: 'project-1',
      async verify() {
        return { allowed: true, lease: LEASE };
      },
      async renew(request) {
        renewRequests.push(structuredClone(request));
        renewAttempts += 1;
        if (renewAttempts === 1) {
          throw new WorkLeaseError('authority-unavailable', 'renew response lost');
        }
        return LEASE;
      },
    };
    const first = resumeOptions(dir, { getStore: async () => store });
    await assert.rejects(
      () => workLeaseGuard.coordinateWorkLeaseResume(first.input),
      /renew response lost/
    );
    const pending = getActiveTask('session-1', dir).workLeaseIntent;
    assert.equal(pending.operation, 'resume');
    assert.equal(pending.receipt, undefined);
    assert.ok(Object.values(pending.projections).every((projection) => !projection.completed));

    const retry = resumeOptions(dir, { getStore: async () => store });
    await workLeaseGuard.coordinateWorkLeaseResume(retry.input);

    assert.equal(renewRequests.length, 2);
    assert.deepEqual(renewRequests[1], renewRequests[0]);
    assert.deepEqual(retry.log.slice(-4), ['session', 'fleet', 'timing', 'github']);
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resume retries the exact renew after authority success and receipt persistence crash', async () => {
  const dir = sandbox();
  try {
    const renewRequests = [];
    const store = {
      projectId: 'project-1',
      async verify() {
        return { allowed: true, lease: LEASE };
      },
      async renew(request) {
        renewRequests.push(structuredClone(request));
        return LEASE;
      },
    };
    let attachAttempts = 0;
    const first = resumeOptions(dir, {
      getStore: async () => store,
      attachReceipt(...args) {
        attachAttempts += 1;
        if (attachAttempts === 1) throw new Error('receipt persistence crash');
        return attachWorkLeaseIntentReceipt(...args);
      },
    });
    await assert.rejects(
      () => workLeaseGuard.coordinateWorkLeaseResume(first.input),
      /receipt persistence crash/
    );

    const retry = resumeOptions(dir, {
      getStore: async () => store,
      attachReceipt: attachWorkLeaseIntentReceipt,
    });
    await workLeaseGuard.coordinateWorkLeaseResume(retry.input);

    assert.deepEqual(renewRequests[1], renewRequests[0]);
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resume rejects a renewal receipt not stamped by its original exact request', async () => {
  const dir = sandbox();
  try {
    const mismatch = resumeOptions(dir, {
      getStore: async () => ({
        projectId: 'project-1',
        async verify() {
          return { allowed: true, lease: LEASE };
        },
        async renew() {
          return {
            ...LEASE,
            heartbeatAt: '2026-07-30T12:00:01.000Z',
            expiresAt: '2026-07-30T12:15:01.000Z',
          };
        },
      }),
    });
    await assert.rejects(
      () => workLeaseGuard.coordinateWorkLeaseResume(mismatch.input),
      /renewal receipt.*request/
    );
    const session = getActiveTask('session-1', dir);
    assert.equal(session.workLeaseIntent, undefined);
    assert.equal(session.issue, '#1049');
    assert.equal(session.lease.leaseId, LEASE.leaseId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const crashProjection of ['session', 'fleet', 'timing', 'github']) {
  test(`resume ${crashProjection} remote success and local checkpoint crash replays one effect`, async () => {
    const dir = sandbox();
    try {
      const effects = new Map();
      const projectionIds = new Map();
      let crashed = false;
      const projections = Object.fromEntries(
        ['session', 'fleet', 'timing', 'github'].map((name) => [
          name,
          async ({ projectionName, projectionId }) => {
            assert.equal(projectionName, name);
            const priorId = projectionIds.get(name);
            if (priorId === undefined) {
              projectionIds.set(name, projectionId);
              effects.set(name, 1);
            } else {
              assert.equal(projectionId, priorId);
            }
            return { reconciled: true, projectionName, projectionId };
          },
        ])
      );
      const checkpoint = (...args) => {
        const [, name] = args;
        if (name === crashProjection && !crashed) {
          crashed = true;
          throw new Error(`resume checkpoint crash:${name}`);
        }
        return checkpointWorkLeaseProjection(...args);
      };
      const first = resumeOptions(dir, {
        projections,
        checkpointProjection: checkpoint,
      });
      await assert.rejects(
        () => workLeaseGuard.coordinateWorkLeaseResume(first.input),
        new RegExp(`resume checkpoint crash:${crashProjection}`)
      );
      const retry = resumeOptions(dir, {
        projections,
        checkpointProjection: checkpoint,
      });
      await workLeaseGuard.coordinateWorkLeaseResume(retry.input);

      for (const name of ['session', 'fleet', 'timing', 'github']) {
        assert.equal(effects.get(name), 1, name);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('no-argument resume force-renews authority before queue, marker, timing, or GitHub effects', async () => {
  const log = [];
  await renewWorkLeaseBeforeResume(
    {
      projectDir: '/repo/worktree-1',
      getWorkLeaseStore: () => ({ projectId: 'project-1' }),
      getWorkLeaseIdentity: () => ({
        hostId: 'host-1',
        provider: 'codex',
        agentRunId: 'run-1',
      }),
      verifyGovernedEffect: async (input) => {
        log.push(`verify:${input.forceRenewal}:${input.operation}`);
        return { allowed: true };
      },
    },
    { issue: '#1049', sessionId: 'session-1' }
  );
  log.push('queue');
  log.push('marker');
  log.push('timing');
  log.push('github');

  assert.deepEqual(log, ['verify:true:task-bind', 'queue', 'marker', 'timing', 'github']);
});

function governedResumeContext(dir, { rest, state, session, coordinator = 'acquire' } = {}) {
  const sessionId = `resume-wiring-${Math.random().toString(16).slice(2)}`;
  process.env.AI_TASK_MANAGER_SESSION_ID = sessionId;
  const statePath = path.join(dir, `${sessionId}-state.json`);
  writeFileSync(statePath, JSON.stringify(state), 'utf8');
  if (session) setActiveTask(sessionId, session, dir);
  const events = [];
  const durableLease = {
    projectId: LEASE.projectId,
    leaseId: LEASE.leaseId,
    fencingToken: LEASE.fencingToken,
    worktreeId: WORKTREE.worktreeId,
  };
  const runCoordinator = async (input) => {
    events.push(coordinator);
    if (coordinator === 'lose') throw new WorkLeaseError('lease-contended', 'held elsewhere');
    const requestId = input.randomUUID();
    const issueId = String(input.issueId).replace(/^#/, '');
    const idempotencyKey = `${coordinator}:${input.sessionId}:${issueId}:${requestId}`;
    const projectionSetId = `${coordinator}:${idempotencyKey}`;
    for (const name of ['session', 'fleet', 'timing', 'github']) {
      await input.projections[name]({
        input: input.projectionInputs[name],
        lease: durableLease,
        projectionName: name,
        projectionId: `${projectionSetId}:${name}`,
      });
    }
    return { lease: durableLease, projectionInputs: input.projectionInputs };
  };
  return {
    events,
    ctx: {
      rest,
      cfg: {},
      statePath,
      projectDir: dir,
      role: 'agent',
      nowIso: () => new Date().toISOString(),
      getWorkLeaseIdentity: () => ({
        hostId: 'host-1',
        provider: 'codex',
        agentRunId: 'run-1',
        sessionId,
        pid: 123,
        branch: 'feature/child/1049',
      }),
      getWorkLeaseStore: () => ({ projectId: LEASE.projectId }),
      runReadOnlyBindPreflight: async () => {
        events.push('preflight');
        return {
          ok: true,
          claimRequired: false,
          currentUser: 'worker',
          stateAfter: state,
        };
      },
      coordinateWorkLeaseAcquire: runCoordinator,
      coordinateWorkLeaseResume: runCoordinator,
      applyWorkLeaseSessionProjection: async ({ projectionId }) => {
        events.push('session');
        return { reconciled: true, projectionName: 'session', projectionId };
      },
      applyWorkLeaseFleetProjection: async ({ projectionId }) => {
        events.push('fleet');
        return { reconciled: true, projectionName: 'fleet', projectionId };
      },
      applyWorkLeaseTimingProjection: async ({ projectionId }) => {
        events.push('timing');
        return { reconciled: true, projectionName: 'timing', projectionId };
      },
      applyWorkLeaseGithubProjection: async ({ projectionId }) => {
        events.push('github');
        return { reconciled: true, projectionName: 'github', projectionId };
      },
      createWorkLeaseHeartbeat: () => events.push('heartbeat'),
      readWorkLeaseKanbanProjection: async () => null,
      readTimingCommentBody: async () => ({ status: 'absent', body: '', error: null }),
      drainQueueIfAny: async () => events.push('queue'),
      safePostTiming: async () => events.push('legacy-timing'),
      seedKanban: async () => events.push('legacy-kanban'),
      verbSwitch: async () => events.push('unsafe-switch'),
      runMoveInvariantAudit: async () => events.push('audit'),
    },
  };
}

test('cold bind runs preflight, acquires, reconciles four projections, then starts heartbeat', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: null, lastActive: null },
      coordinator: 'acquire',
    });
    await verbResume(ctx);
    assert.deepEqual(events, [
      'preflight',
      'acquire',
      'session',
      'fleet',
      'timing',
      'github',
      'heartbeat',
      'audit',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('offline bind persists skip policy and performs no timing or GitHub network projection', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: null, lastActive: null },
      coordinator: 'acquire',
    });
    ctx.runReadOnlyBindPreflight = async () => {
      events.push('preflight');
      return {
        ok: true,
        skippedNetwork: true,
        claimRequired: false,
        stateAfter: { active: null, lastActive: null },
      };
    };
    ctx.readTimingCommentBody = async () => assert.fail('offline timing read must not run');
    ctx.drainQueueIfAny = async () => assert.fail('offline queue drain must not run');
    ctx.applyWorkLeaseTimingProjection = async () =>
      assert.fail('offline timing override must not run');
    ctx.applyWorkLeaseGithubProjection = async () =>
      assert.fail('offline GitHub override must not run');
    ctx.runMoveInvariantAudit = async () => assert.fail('offline GitHub audit must not run');

    await verbResume(ctx);

    assert.deepEqual(events, ['preflight', 'acquire', 'session', 'fleet', 'heartbeat']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('losing cold acquire has no queue, marker, session, fleet, timing, GitHub, or heartbeat effect', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: null, lastActive: null },
      coordinator: 'lose',
    });
    await assert.rejects(() => verbResume(ctx), /held elsewhere/);
    assert.deepEqual(events, ['preflight', 'lose']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('production projection override cannot fabricate reconciliation success', async () => {
  const dir = sandbox();
  try {
    const { ctx } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: null, lastActive: null },
      coordinator: 'acquire',
    });
    ctx.applyWorkLeaseSessionProjection = async () => undefined;
    await assert.rejects(() => verbResume(ctx), /session.*proof/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('persisted projection input is validated before an override is invoked', async () => {
  const dir = sandbox();
  try {
    const { ctx } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: null, lastActive: null },
      coordinator: 'acquire',
    });
    let overrideCalls = 0;
    ctx.applyWorkLeaseSessionProjection = async () => {
      overrideCalls += 1;
      return {
        reconciled: true,
        projectionName: 'session',
        projectionId: 'wrong',
      };
    };
    ctx.coordinateWorkLeaseAcquire = async (input) => {
      await input.projections.session({
        input: { malformed: true },
        lease: {
          projectId: LEASE.projectId,
          leaseId: LEASE.leaseId,
          fencingToken: LEASE.fencingToken,
          worktreeId: WORKTREE.worktreeId,
        },
        projectionName: 'session',
        projectionId: 'acquire:exact:session',
      });
    };
    await assert.rejects(() => verbResume(ctx), /persisted session projection is malformed/);
    assert.equal(overrideCalls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no-argument resume journals renewal projections before bind effects and heartbeat', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: [],
      state: {
        active: null,
        lastActive: '#1049',
        paused: true,
        pausedAtTs: new Date(Date.now() - 5_000).toISOString(),
      },
      session: {
        issue: null,
        leaseIssue: '#1049',
        lease: {
          projectId: LEASE.projectId,
          leaseId: LEASE.leaseId,
          fencingToken: LEASE.fencingToken,
          worktreeId: WORKTREE.worktreeId,
        },
      },
      coordinator: 'resume',
    });
    await verbResume(ctx);
    assert.deepEqual(events, [
      'preflight',
      'resume',
      'session',
      'fleet',
      'timing',
      'github',
      'heartbeat',
      'audit',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no-argument renewal loss has no queue, marker, session, fleet, timing, GitHub, or heartbeat effect', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: [],
      state: {
        active: null,
        lastActive: '#1049',
        paused: true,
        pausedAtTs: new Date(Date.now() - 5_000).toISOString(),
      },
      session: {
        issue: null,
        leaseIssue: '#1049',
        lease: {
          projectId: LEASE.projectId,
          leaseId: LEASE.leaseId,
          fencingToken: LEASE.fencingToken,
          worktreeId: WORKTREE.worktreeId,
        },
      },
      coordinator: 'lose',
    });
    await assert.rejects(() => verbResume(ctx), /held elsewhere/);
    assert.deepEqual(events, ['preflight', 'lose']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-upgrade same-session binding adopts before its first governed effect', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: {
        active: '#1049',
        lastActive: '#1049',
        entryStartTs: new Date(Date.now() - 5_000).toISOString(),
        wordsAtEntryStart: 17,
      },
      session: {
        issue: '#1049',
        entryStartTs: new Date(Date.now() - 5_000).toISOString(),
        wordsAtStart: 17,
      },
      coordinator: 'acquire',
    });
    await verbResume(ctx);
    assert.deepEqual(events, [
      'preflight',
      'acquire',
      'session',
      'fleet',
      'timing',
      'github',
      'heartbeat',
      'audit',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adoption session projection reads back exact global, session, lease, and kanban state', async () => {
  const dir = sandbox();
  try {
    const initialState = {
      active: '#1049',
      lastActive: '#1049',
      entryStartTs: '2026-07-30T11:55:00.000Z',
      wordsAtEntryStart: 17,
    };
    const { ctx } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: initialState,
      session: {
        issue: '#1049',
        entryStartTs: initialState.entryStartTs,
        wordsAtStart: 17,
      },
      coordinator: 'acquire',
    });
    delete ctx.applyWorkLeaseSessionProjection;
    ctx.runReadOnlyBindPreflight = async () => ({
      ok: true,
      claimRequired: false,
      currentUser: 'worker',
      kanbanState: 'develop',
      stateAfter: initialState,
    });
    const projectedState = loadState(ctx.statePath);

    await verbResume(ctx);

    assert.deepEqual(JSON.parse(readFileSync(ctx.statePath, 'utf8')), projectedState);
    const persisted = getActiveTask(ctx.getWorkLeaseIdentity().sessionId, dir);
    assert.equal(persisted.issue, '#1049');
    assert.equal(persisted.lease.leaseId, LEASE.leaseId);
    assert.equal(persisted.kanbanState, 'develop');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bind persists and replays one exact marker including timestamp, task, and full count', async () => {
  const dir = sandbox();
  try {
    const fixedTs = new Date().toISOString();
    const { ctx } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: null, lastActive: null },
      coordinator: 'acquire',
    });
    ctx.nowIso = () => fixedTs;
    delete ctx.applyWorkLeaseSessionProjection;
    const coordinate = ctx.coordinateWorkLeaseAcquire;
    let markerInput;
    ctx.coordinateWorkLeaseAcquire = async (input) => {
      markerInput = structuredClone(input.projectionInputs.session.marker);
      return coordinate(input);
    };

    await verbResume(ctx);

    assert.deepEqual(markerInput, {
      path: markerPathFor(ctx.getWorkLeaseIdentity().sessionId),
      line: 0,
      words: 0,
      wordsFull: 0,
      task: '#1049',
      ts: fixedTs,
    });
    assert.deepEqual(loadMarker(markerInput.path), {
      line: 0,
      words: 0,
      wordsFull: 0,
      task: '#1049',
      ts: fixedTs,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('governed bind surfaces persisted review remediation only after reconciliation', async () => {
  const dir = sandbox();
  const lines = [];
  const originalLog = console.log;
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: null, lastActive: null },
      coordinator: 'acquire',
    });
    ctx.runReadOnlyBindPreflight = async () => ({
      ok: true,
      claimRequired: false,
      currentUser: 'worker',
      kanbanState: 'review',
      reviewRemediationHint: 'Run /task review #1049. Do NOT demote.',
    });
    console.log = (...args) => lines.push(args.join(' '));

    await verbResume(ctx);

    assert.deepEqual(events.slice(-2), ['heartbeat', 'audit']);
    assert.match(lines.join('\n'), /\/task review #1049/);
    assert.match(lines.join('\n'), /Do NOT demote/);
  } finally {
    console.log = originalLog;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('governed bind suppresses a duplicate timing row over a confirmed recent active span', async () => {
  const dir = sandbox();
  try {
    const { ctx } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: null, lastActive: null },
      coordinator: 'acquire',
    });
    const fixedNow = '2026-07-30T12:05:00.000Z';
    const recentRow =
      '| 2026-07-30 12:00:00 +00:00 | plan:started | 0 | 0 | 0 | 0 | test | <!-- row-sec: a=0 i=0 -->';
    ctx.cfg = { repo: 'owner/repo' };
    ctx.nowIso = () => fixedNow;
    ctx.readTimingCommentBody = async () => ({
      status: 'found',
      body: ['| Timestamp | Event |', '|---|---|', recentRow].join('\n'),
    });
    let timingInput;
    const coordinate = ctx.coordinateWorkLeaseAcquire;
    ctx.coordinateWorkLeaseAcquire = async (input) => {
      timingInput = structuredClone(input.projectionInputs.timing);
      return coordinate(input);
    };

    await verbResume(ctx);

    assert.equal(timingInput.decision.suppressed, true);
    assert.equal(timingInput.rows.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('governed paused resume persists the paired reason and exact idle accounting', async () => {
  const dir = sandbox();
  try {
    const resumeNow = new Date();
    const resumeAt = resumeNow.toISOString();
    const pausedAt = new Date(resumeNow.getTime() - 5_000).toISOString();
    const { ctx } = governedResumeContext(dir, {
      rest: [],
      state: {
        active: null,
        lastActive: '#1049',
        paused: true,
        pausedAtTs: pausedAt,
        pauseReasonSlug: 'question',
        pauseReasonText: 'waiting for operator',
      },
      session: {
        issue: null,
        leaseIssue: '#1049',
        lease: {
          projectId: LEASE.projectId,
          leaseId: LEASE.leaseId,
          fencingToken: LEASE.fencingToken,
          worktreeId: WORKTREE.worktreeId,
        },
      },
      coordinator: 'resume',
    });
    ctx.nowIso = () => resumeAt;
    let projectionInputs;
    const coordinate = ctx.coordinateWorkLeaseResume;
    ctx.coordinateWorkLeaseResume = async (input) => {
      projectionInputs = structuredClone(input.projectionInputs);
      return coordinate(input);
    };

    await verbResume(ctx);

    assert.equal(projectionInputs.timing.decision.mode, 'resume');
    assert.equal(projectionInputs.timing.decision.selectedEvent, 'resume:question');
    assert.equal(projectionInputs.timing.decision.idleSec, 5);
    assert.match(projectionInputs.timing.rows[0].row, /\| resume:question \|/);
    assert.equal(projectionInputs.session.state.active, '#1049');
    assert.equal(projectionInputs.session.state.pausedAtTs, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('governed bind prints the deferred pickup banner from the persisted kanban state', async () => {
  const dir = sandbox();
  const lines = [];
  const originalLog = console.log;
  try {
    const { ctx } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: null, lastActive: null },
      coordinator: 'acquire',
    });
    ctx.runReadOnlyBindPreflight = async () => ({
      ok: true,
      claimRequired: false,
      currentUser: 'worker',
      kanbanState: 'refine',
      stateAfter: { active: null, lastActive: null },
    });
    console.log = (...args) => lines.push(args.join(' '));

    await verbResume(ctx);

    assert.match(lines.join('\n'), /PICKUP DIRECTIVE DEFERRED/);
    assert.match(lines.join('\n'), /\/task promote #1049/);
  } finally {
    console.log = originalLog;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('same-issue held lease with a prepared claim uses governed resume before projections', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: '#1049', lastActive: '#1049' },
      session: {
        issue: '#1049',
        lease: {
          projectId: LEASE.projectId,
          leaseId: LEASE.leaseId,
          fencingToken: LEASE.fencingToken,
          worktreeId: WORKTREE.worktreeId,
        },
      },
      coordinator: 'resume',
    });
    ctx.runReadOnlyBindPreflight = async () => {
      events.push('preflight');
      return {
        ok: true,
        claimRequired: true,
        assigneeKind: 'unassigned',
        currentUser: 'worker',
        assignees: [],
      };
    };

    await verbResume(ctx);

    assert.ok(events.indexOf('resume') > events.indexOf('preflight'));
    assert.ok(events.indexOf('session') > events.indexOf('resume'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid no-argument resume is read-only', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: [],
      state: { active: null, lastActive: null, paused: false },
    });
    await verbResume(ctx);
    assert.deepEqual(events, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('production resume fails closed without a work-lease authority', async () => {
  await assert.rejects(() => verbResume({}), /resume requires a lazy work-lease authority/);
});

test('same-issue held-lease self-bind renews without duplicate bind projections', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: {
        active: '#1049',
        lastActive: '#1049',
        entryStartTs: new Date(Date.now() - 5_000).toISOString(),
        wordsAtEntryStart: 17,
      },
      session: {
        issue: '#1049',
        entryStartTs: new Date(Date.now() - 5_000).toISOString(),
        wordsAtStart: 17,
        lease: {
          projectId: LEASE.projectId,
          leaseId: LEASE.leaseId,
          fencingToken: LEASE.fencingToken,
          worktreeId: WORKTREE.worktreeId,
        },
      },
      coordinator: 'resume',
    });
    ctx.verifyGovernedEffect = async ({ forceRenewal }) => {
      events.push(`renew:${forceRenewal}`);
      return { allowed: true };
    };
    await verbResume(ctx);
    assert.deepEqual(events, ['preflight', 'renew:true', 'heartbeat', 'audit']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('genuine cross-issue bind refuses before unsafe legacy switch', async () => {
  const dir = sandbox();
  try {
    const { ctx, events } = governedResumeContext(dir, {
      rest: ['#1049'],
      state: { active: '#1048', lastActive: '#1048' },
      session: {
        issue: '#1048',
        lease: {
          projectId: LEASE.projectId,
          leaseId: LEASE.leaseId,
          fencingToken: LEASE.fencingToken,
          worktreeId: WORKTREE.worktreeId,
        },
      },
      coordinator: 'resume',
    });
    await assert.rejects(() => verbResume(ctx), /atomic work-lease switch/i);
    assert.deepEqual(events, ['preflight']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dispatcher leaves start and resume out of legacy mutating preflight', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dispatcher = readSourceFileSync(
    path.resolve(here, '..', '..', '..', 'task-tracker.mjs'),
    'utf8'
  );
  const map = dispatcher.slice(
    dispatcher.indexOf('const PREFLIGHT_MODE = {'),
    dispatcher.indexOf('};', dispatcher.indexOf('const PREFLIGHT_MODE = {')) + 2
  );
  assert.doesNotMatch(map, /^\s*(start|resume):/m);
});
