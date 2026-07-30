// @story #1049
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';

import { WorkLeaseError } from '@kburson/aitm-ledger';

import { claimAuditProjectionMarker } from '../../../lib/assignee-guard.mjs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import { coordinateWorkLeaseSwitch } from '../../../lib/work-lease/switch-orchestration.mjs';
import { jsonlPath } from '../../../word-counter.mjs';
import {
  activeTaskPath,
  checkpointWorkLeaseProjection,
  getActiveTask,
  restoreCompensatedActiveTask,
  setActiveTask,
} from '../../../session-state.mjs';

const NOW = new Date('2026-07-30T12:00:00.000Z');
const WORKTREE = Object.freeze({
  worktreeId: 'wt:v1:worktree-1',
  pathHash: 'path-hash-1',
  displayPath: '/repo/worktree-1',
});
const HOLDER = Object.freeze({
  principalKind: 'worker',
  provider: 'codex',
  agentRunId: 'run-1',
  sessionId: 'session-1',
  hostId: 'host-1',
  pid: 123,
  worktreeId: WORKTREE.worktreeId,
  pathHash: WORKTREE.pathHash,
  branch: 'feature/child/1049',
});
const SOURCE_LEASE = Object.freeze({
  projectId: 'project-1',
  leaseId: 'lease-source',
  fencingToken: '7',
  worktreeId: WORKTREE.worktreeId,
});
const TARGET_AUTHORITY_LEASE = Object.freeze({
  projectId: 'project-1',
  issueId: '1051',
  mode: 'write',
  leaseId: 'lease-target',
  fencingToken: '9',
  state: 'active',
  holder: HOLDER,
  acquiredAt: NOW.toISOString(),
  heartbeatAt: NOW.toISOString(),
  expiresAt: '2026-07-30T12:15:00.000Z',
  audit: {},
});
const FORWARD_RECEIPT = Object.freeze({
  lease: TARGET_AUTHORITY_LEASE,
  transition: {
    transitionId: 'transition-forward',
    fromIssueId: '1049',
    fromLeaseId: SOURCE_LEASE.leaseId,
    fromToken: SOURCE_LEASE.fencingToken,
    toIssueId: '1051',
  },
});
const COMPENSATION_AT = NOW.toISOString();
const COMPENSATION_AUTHORITY_LEASE = Object.freeze({
  projectId: 'project-1',
  issueId: '1049',
  mode: 'write',
  leaseId: 'lease-source-restored',
  fencingToken: '11',
  state: 'active',
  holder: HOLDER,
  acquiredAt: COMPENSATION_AT,
  heartbeatAt: COMPENSATION_AT,
  expiresAt: '2026-07-30T12:15:00.000Z',
  audit: {},
});
const COMPENSATION_RECEIPT = Object.freeze({
  lease: COMPENSATION_AUTHORITY_LEASE,
  transition: {
    transitionId: 'transition-compensation',
    fromIssueId: '1051',
    fromLeaseId: TARGET_AUTHORITY_LEASE.leaseId,
    fromToken: TARGET_AUTHORITY_LEASE.fencingToken,
    toIssueId: '1049',
  },
});

function sandbox() {
  return mkdtempProjectIsolated('tt-work-lease-switch-');
}

function seedSource(dir) {
  setActiveTask(
    'session-1',
    {
      issue: '#1049',
      entryStartTs: '2026-07-30T11:45:00.000Z',
      wordsAtStart: 12,
      paused: false,
      lease: SOURCE_LEASE,
    },
    dir
  );
}

function switchOptions(dir, overrides = {}) {
  const log = [];
  const store = {
    projectId: 'project-1',
    async switchLease(request) {
      const persisted = getActiveTask('session-1', dir).workLeaseIntent;
      assert.equal(persisted.operation, 'switchLease');
      assert.deepEqual(JSON.parse(persisted.canonicalRequest), request);
      log.push(`authority:${request.idempotencyKey}`);
      return FORWARD_RECEIPT;
    },
    async verify() {
      log.push('verify');
      return { allowed: true, lease: TARGET_AUTHORITY_LEASE };
    },
  };
  const projectionInputs = {
    session: {
      sessionId: 'session-1',
      switch: { sourceIssue: '#1049', targetIssue: '#1051' },
    },
    fleet: {
      sourceIssue: '#1049',
      targetIssue: '#1051',
      source: { issue: '#1049' },
      target: { issue: '#1051' },
    },
    timing: {
      skippedNetwork: false,
      sourceIssue: '#1049',
      targetIssue: '#1051',
      operations: ['outgoing', 'incoming'],
      rows: [
        { issueNumber: '1049', subOperationId: 'outgoing:switch-out' },
        { issueNumber: '1051', subOperationId: 'incoming:bind' },
      ],
    },
    github: {
      issueNumber: '1051',
      sourceIssue: '#1049',
      targetIssue: '#1051',
      skippedNetwork: false,
      assigneePolicy: 'enforced',
      claimRequired: false,
      currentUser: 'worker',
      preparedKind: 'assigned-to-current',
      preparedAssignees: ['worker'],
      auditBody: null,
      operations: ['source', 'target'],
      switch: {
        sourceIssue: '#1049',
        targetIssue: '#1051',
        sessionId: 'session-1',
        jsonlPath: jsonlPath('session-1'),
        ts: NOW.toISOString(),
        subOperations: {
          sessionRef: 'switchLease:switch:session-1:1049:1051:request-1:github:source-session-ref',
          issueTime: 'switchLease:switch:session-1:1049:1051:request-1:github:source-issue-time',
        },
      },
    },
  };
  const projections = Object.fromEntries(
    ['session', 'fleet', 'timing', 'github'].map((name) => [
      name,
      async ({ phase = 'forward', lease, projectionName, projectionId, transitionId }) => {
        log.push(`projection:${phase}:${name}:${transitionId}`);
        if (phase === 'compensation' && name === 'session') {
          restoreCompensatedActiveTask('session-1', lease, transitionId, projectionId, dir);
        }
        return { reconciled: true, projectionName, projectionId };
      },
    ])
  );
  return {
    log,
    store,
    input: {
      sourceIssueId: '1049',
      targetIssueId: '1051',
      sessionId: 'session-1',
      projectDir: dir,
      hostId: 'host-1',
      provider: 'codex',
      agentRunId: 'run-1',
      pid: 123,
      branch: HOLDER.branch,
      getStore: async () => {
        log.push('provider');
        return store;
      },
      preparedEligibility: {
        ok: true,
        claimRequired: false,
        currentUser: 'worker',
        assignees: ['worker'],
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
      projectionInputs,
      projections,
      resolveWorktreeIdentity: async () => {
        log.push('identity');
        return WORKTREE;
      },
      now: () => NOW,
      randomUUID: () => 'request-1',
      ...overrides,
    },
  };
}

test('switch persists exact intent before authority and reconciles claim before every projection', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    const { input, log } = switchOptions(dir);

    const result = await coordinateWorkLeaseSwitch(input);

    assert.equal(result.receipt.transition.transitionId, 'transition-forward');
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
    assert.deepEqual(log, [
      'identity',
      'provider',
      'authority:switch:session-1:1049:1051:request-1',
      'eligibility',
      'claim',
      'projection:forward:session:transition-forward',
      'projection:forward:fleet:transition-forward',
      'projection:forward:timing:transition-forward',
      'projection:forward:github:transition-forward',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('required claim audit is correlated to the immutable GitHub projection identity', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    const base = switchOptions(dir);
    const projectionId = 'switchLease:switch:session-1:1049:1051:request-1:github';
    base.input.projectionInputs.github = {
      ...base.input.projectionInputs.github,
      claimRequired: true,
      preparedKind: 'unassigned',
      preparedAssignees: [],
      auditBody: `claim audit\n${claimAuditProjectionMarker(projectionId)}`,
    };
    base.input.preparedEligibility = {
      ok: true,
      claimRequired: true,
      currentUser: 'worker',
      assignees: [],
    };
    base.input.readEligibility = async () => ({
      ok: true,
      claimRequired: true,
      currentUser: 'worker',
      assignees: [],
    });

    await coordinateWorkLeaseSwitch(base.input);

    assert.equal(base.log.includes('claim'), true);
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('definitive foreign target persists and proves deterministic compensation before restore', async () => {
  const dir = sandbox();
  try {
    setActiveTask(
      'session-1',
      {
        issue: null,
        leaseIssue: '#1049',
        entryStartTs: '2026-07-30T11:45:00.000Z',
        wordsAtStart: 12,
        paused: true,
        pauseReasonSlug: 'question',
        pendingPause: { preserved: true },
        lease: SOURCE_LEASE,
      },
      dir
    );
    const { input, store, log } = switchOptions(dir, {
      readEligibility: async () => {
        log.push('eligibility:foreign');
        return {
          ok: false,
          kind: 'assignee-mismatch',
          assigneeKind: 'foreign',
          assignees: ['other-worker'],
        };
      },
    });
    const requests = [];
    store.switchLease = async (request) => {
      requests.push(structuredClone(request));
      if (requests.length === 1) return FORWARD_RECEIPT;
      const intent = getActiveTask('session-1', dir).workLeaseIntent;
      assert.ok(intent.compensation, 'compensation must persist before authority');
      assert.deepEqual(JSON.parse(intent.compensation.canonicalRequest), request);
      return COMPENSATION_RECEIPT;
    };
    store.verify = async (request) => {
      log.push(`verify:${request.leaseId}`);
      return { allowed: true, lease: COMPENSATION_AUTHORITY_LEASE };
    };

    await assert.rejects(
      () => coordinateWorkLeaseSwitch(input),
      (error) => error.code === 'authority-forbidden'
    );

    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], {
      projectId: 'project-1',
      issueId: '1051',
      leaseId: TARGET_AUTHORITY_LEASE.leaseId,
      fencingToken: TARGET_AUTHORITY_LEASE.fencingToken,
      idempotencyKey: 'compensate:transition-forward',
      switchedAt: COMPENSATION_AT,
      target: {
        projectId: 'project-1',
        issueId: '1049',
        mode: 'write',
        idempotencyKey: 'compensate-target:transition-forward',
        requestedAt: COMPENSATION_AT,
        ttlMs: 15 * 60 * 1000,
        holder: HOLDER,
      },
    });
    const restored = getActiveTask('session-1', dir);
    assert.equal(restored.issue, null);
    assert.equal(restored.leaseIssue, '#1049');
    assert.equal(restored.paused, true);
    assert.equal(restored.pauseReasonSlug, 'question');
    assert.deepEqual(restored.pendingPause, { preserved: true });
    assert.deepEqual(restored.lease, {
      projectId: 'project-1',
      leaseId: 'lease-source-restored',
      fencingToken: '11',
      worktreeId: WORKTREE.worktreeId,
    });
    assert.equal(restored.entryStartTs, '2026-07-30T11:45:00.000Z');
    assert.equal(restored.workLeaseIntent, undefined);
    assert.ok(
      log.indexOf('eligibility:foreign') <
        log.indexOf('projection:compensation:session:transition-compensation')
    );
    assert.equal(
      log.some((entry) => entry.startsWith('projection:forward:')),
      false,
      'forward projections must not run after definitive target rejection'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compensation response loss replays exact persisted request before any fresh target gate', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    const first = switchOptions(dir, {
      readEligibility: async () => ({
        ok: false,
        kind: 'assignee-mismatch',
        assigneeKind: 'foreign',
      }),
    });
    const requests = [];
    first.store.switchLease = async (request) => {
      requests.push(structuredClone(request));
      if (requests.length === 1) return FORWARD_RECEIPT;
      throw new WorkLeaseError('authority-unavailable', 'compensation response lost');
    };

    await assert.rejects(
      () => coordinateWorkLeaseSwitch(first.input),
      (error) => error.code === 'authority-unavailable'
    );
    const recovery = getActiveTask('session-1', dir).workLeaseIntent;
    assert.ok(recovery.compensation);
    assert.equal(recovery.compensation.receipt, undefined);

    const retry = switchOptions(dir, {
      randomUUID: () => {
        throw new Error('compensation replay must not generate a request');
      },
      readEligibility: async () => {
        throw new Error('compensation replay must precede a fresh target gate');
      },
    });
    retry.store.switchLease = async (request) => {
      requests.push(structuredClone(request));
      return COMPENSATION_RECEIPT;
    };
    retry.store.verify = async () => ({
      allowed: true,
      lease: COMPENSATION_AUTHORITY_LEASE,
    });

    await assert.rejects(
      () => coordinateWorkLeaseSwitch(retry.input),
      (error) => error.code === 'authority-forbidden'
    );
    assert.deepEqual(requests[2], requests[1]);
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unprovable compensation authority retains receipt and recovery state fail closed', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    const { input, store } = switchOptions(dir, {
      readEligibility: async () => ({
        ok: false,
        kind: 'assignee-mismatch',
        assigneeKind: 'foreign',
      }),
    });
    let calls = 0;
    store.switchLease = async () => {
      calls += 1;
      return calls === 1 ? FORWARD_RECEIPT : COMPENSATION_RECEIPT;
    };
    store.verify = async () => {
      throw new WorkLeaseError('authority-unavailable', 'verify unavailable');
    };

    await assert.rejects(
      () => coordinateWorkLeaseSwitch(input),
      (error) => error.code === 'authority-unavailable'
    );

    const recovery = getActiveTask('session-1', dir).workLeaseIntent;
    assert.equal(recovery.receipt.transition.transitionId, 'transition-forward');
    assert.equal(recovery.compensation.receipt.transition.transitionId, 'transition-compensation');
    assert.equal(
      Object.values(recovery.compensation.projections).some((projection) => projection.completed),
      false
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ambiguous forward response retains recovery state and replays byte-identical request', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    const first = switchOptions(dir);
    const requests = [];
    first.store.switchLease = async (request) => {
      requests.push(structuredClone(request));
      throw new WorkLeaseError('authority-unavailable', 'response lost');
    };

    await assert.rejects(
      () => coordinateWorkLeaseSwitch(first.input),
      (error) => error.code === 'authority-unavailable'
    );
    const afterLoss = getActiveTask('session-1', dir).workLeaseIntent;
    assert.equal(afterLoss.receipt, undefined);

    const retry = switchOptions(dir, {
      randomUUID: () => {
        throw new Error('restart must not generate a replacement request');
      },
    });
    retry.store.switchLease = async (request) => {
      requests.push(structuredClone(request));
      return FORWARD_RECEIPT;
    };
    await coordinateWorkLeaseSwitch(retry.input);

    assert.deepEqual(requests[1], requests[0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('receipt-less restart accepts PID churn but verifies recovered authority before target gate', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    const first = switchOptions(dir);
    first.store.switchLease = async () => {
      throw new WorkLeaseError('authority-unavailable', 'response lost');
    };
    await assert.rejects(() => coordinateWorkLeaseSwitch(first.input));

    const retry = switchOptions(dir, {
      pid: 456,
      readEligibility: async () => {
        retry.log.push('eligibility:retry');
        return {
          ok: true,
          claimRequired: false,
          currentUser: 'worker',
          assignees: ['worker'],
        };
      },
    });
    retry.store.switchLease = async () => {
      retry.log.push('authority:replay');
      return FORWARD_RECEIPT;
    };
    retry.store.verify = async () => {
      retry.log.push('verify:recovered');
      return { allowed: true, lease: TARGET_AUTHORITY_LEASE };
    };

    await coordinateWorkLeaseSwitch(retry.input);

    assert.ok(
      retry.log.indexOf('verify:recovered') < retry.log.indexOf('eligibility:retry'),
      'historical receipt recovered on restart must be verified before a fresh target gate'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('switch receipt correlation rejects target, holder, fence, chronology, and transition drift', async (t) => {
  const cases = {
    'wrong target': (receipt) => ({
      ...receipt,
      lease: { ...receipt.lease, issueId: '1052' },
    }),
    'wrong full holder': (receipt) => ({
      ...receipt,
      lease: {
        ...receipt.lease,
        holder: { ...receipt.lease.holder, pid: 456 },
      },
    }),
    'non-advanced fence': (receipt) => ({
      ...receipt,
      lease: { ...receipt.lease, fencingToken: SOURCE_LEASE.fencingToken },
    }),
    'wrong acquisition chronology': (receipt) => ({
      ...receipt,
      lease: {
        ...receipt.lease,
        acquiredAt: '2026-07-30T12:00:01.000Z',
      },
    }),
    'wrong source transition': (receipt) => ({
      ...receipt,
      transition: { ...receipt.transition, fromLeaseId: 'lease-foreign' },
    }),
  };
  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, async () => {
      const dir = sandbox();
      try {
        seedSource(dir);
        const { input, store } = switchOptions(dir);
        store.switchLease = async () => mutate(structuredClone(FORWARD_RECEIPT));
        await assert.rejects(
          () => coordinateWorkLeaseSwitch(input),
          (error) => error.code === 'invalid-request'
        );
        const recovery = getActiveTask('session-1', dir).workLeaseIntent;
        assert.equal(recovery.receipt, undefined);
        assert.equal(
          Object.values(recovery.projections).some((projection) => projection.completed),
          false
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

test('projection checkpoint crash resumes after the persisted completed projection', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    let crashed = false;
    const first = switchOptions(dir, {
      checkpointProjection: (...args) => {
        const result = checkpointWorkLeaseProjection(...args);
        if (args[1] === 'fleet' && !crashed) {
          crashed = true;
          throw new WorkLeaseError('authority-unavailable', 'crash after checkpoint');
        }
        return result;
      },
    });
    await assert.rejects(
      () => coordinateWorkLeaseSwitch(first.input),
      (error) => error.code === 'authority-unavailable'
    );
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent.projections.fleet.completed, true);

    const retry = switchOptions(dir, {
      readEligibility: async () => {
        throw new Error('committed forward phase must not re-run target eligibility');
      },
    });
    await coordinateWorkLeaseSwitch(retry.input);
    assert.equal(
      retry.log.some((entry) => entry.includes('projection:forward:session')),
      false
    );
    assert.equal(
      retry.log.some((entry) => entry.includes('projection:forward:fleet')),
      false
    );
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('remote projection success before checkpoint commits forward and can never compensate', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    const externalReceipts = new Set();
    let responseLost = false;
    const first = switchOptions(dir);
    const sessionProjection = async ({ projectionName, projectionId }) => {
      const remoteReceipt = `${projectionId}:remote-session-effect`;
      externalReceipts.add(remoteReceipt);
      const intent = getActiveTask('session-1', dir).workLeaseIntent;
      assert.equal(intent.forwardPhase.transitionId, 'transition-forward');
      if (!responseLost) {
        responseLost = true;
        throw new WorkLeaseError('authority-unavailable', 'remote response lost');
      }
      return { reconciled: true, projectionName, projectionId };
    };
    first.input.projections.session = sessionProjection;
    await assert.rejects(
      () => coordinateWorkLeaseSwitch(first.input),
      (error) => error.code === 'authority-unavailable'
    );
    const recovery = getActiveTask('session-1', dir).workLeaseIntent;
    assert.equal(recovery.forwardPhase.transitionId, 'transition-forward');
    assert.equal(recovery.projections.session.completed, false);
    assert.equal(recovery.compensation, undefined);

    let eligibilityCalls = 0;
    const retry = switchOptions(dir, {
      readEligibility: async () => {
        eligibilityCalls += 1;
        return {
          ok: false,
          kind: 'assignee-mismatch',
          assigneeKind: 'foreign',
          assignees: ['other-worker'],
        };
      },
    });
    retry.input.projections.session = sessionProjection;
    await coordinateWorkLeaseSwitch(retry.input);

    assert.equal(externalReceipts.size, 1);
    assert.equal(eligibilityCalls, 0, 'recovery must use the durable positive claim proof');
    assert.equal(
      retry.log.some((entry) => entry.startsWith('authority:compensate:')),
      false
    );
    assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const projectionName of ['timing', 'github']) {
  test(`${projectionName} remote success with local response loss reuses one stable sub-operation`, async () => {
    const dir = sandbox();
    try {
      seedSource(dir);
      const externalReceipts = new Set();
      let responseLost = false;
      const first = switchOptions(dir);
      first.input.projections[projectionName] = async ({ projectionName: name, projectionId }) => {
        const subOperationId = `${projectionId}:remote-effect`;
        externalReceipts.add(subOperationId);
        if (!responseLost) {
          responseLost = true;
          throw new WorkLeaseError('authority-unavailable', 'remote response lost');
        }
        return { reconciled: true, projectionName: name, projectionId };
      };
      await assert.rejects(
        () => coordinateWorkLeaseSwitch(first.input),
        (error) => error.code === 'authority-unavailable'
      );

      let eligibilityCalls = 0;
      const retry = switchOptions(dir, {
        readEligibility: async () => {
          eligibilityCalls += 1;
          return {
            ok: false,
            kind: 'assignee-mismatch',
            assigneeKind: 'foreign',
          };
        },
      });
      retry.input.projections[projectionName] = first.input.projections[projectionName];
      await coordinateWorkLeaseSwitch(retry.input);

      assert.equal(externalReceipts.size, 1);
      assert.equal(eligibilityCalls, 0);
      assert.equal(getActiveTask('session-1', dir).workLeaseIntent, undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('offline and assignment-disabled switch gates never invoke the claim mutator', async (t) => {
  await t.test('offline', async () => {
    const dir = sandbox();
    try {
      seedSource(dir);
      const base = switchOptions(dir);
      base.input.projectionInputs.github = {
        ...base.input.projectionInputs.github,
        skippedNetwork: true,
        assigneePolicy: 'offline',
        claimRequired: false,
        currentUser: '',
        preparedKind: 'network-skipped',
        preparedAssignees: [],
      };
      base.input.preparedEligibility = {
        ok: true,
        claimRequired: false,
        currentUser: '',
        assignees: [],
      };
      base.input.readEligibility = async () => {
        throw new Error('offline switch must not read network eligibility');
      };
      base.input.reconcileClaim = async () => {
        throw new Error('offline switch must not claim');
      };
      await coordinateWorkLeaseSwitch(base.input);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await t.test('assignment-disabled', async () => {
    const dir = sandbox();
    try {
      seedSource(dir);
      const base = switchOptions(dir);
      base.input.projectionInputs.github = {
        ...base.input.projectionInputs.github,
        assigneePolicy: 'disabled',
        claimRequired: false,
        currentUser: '',
        preparedKind: '',
        preparedAssignees: [],
      };
      base.input.preparedEligibility = {
        ok: true,
        claimRequired: false,
        currentUser: '',
        assignees: [],
      };
      base.input.reconcileClaim = async () => {
        throw new Error('disabled assignment policy must not claim');
      };
      await coordinateWorkLeaseSwitch(base.input);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('malformed persisted GitHub switch inputs fail before identity, provider, or authority', async (t) => {
  const cases = {
    'non-string assignee': (github) => ({
      ...github,
      preparedAssignees: [123],
    }),
    'claim without audit body': (github) => ({
      ...github,
      claimRequired: true,
      preparedKind: 'unassigned',
      preparedAssignees: [],
      auditBody: null,
    }),
    'offline mismatch': (github) => ({
      ...github,
      skippedNetwork: true,
      assigneePolicy: 'enforced',
    }),
  };
  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, async () => {
      const dir = sandbox();
      try {
        seedSource(dir);
        const base = switchOptions(dir);
        base.input.projectionInputs.github = mutate(base.input.projectionInputs.github);
        await assert.rejects(
          () => coordinateWorkLeaseSwitch(base.input),
          (error) => error.code === 'invalid-request'
        );
        assert.deepEqual(base.log, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

test('malformed recovered GitHub input fails before identity, authority replay, or claim', async (t) => {
  const cases = {
    'assignment type': (input) => {
      input.preparedAssignees = [123];
    },
    'missing switch operation': (input) => {
      delete input.switch;
    },
    'wrong source': (input) => {
      input.switch.sourceIssue = '#999';
    },
    'wrong target': (input) => {
      input.switch.targetIssue = '#999';
    },
    'wrong session': (input) => {
      input.switch.sessionId = 'session-attacker';
    },
    'wrong timestamp': (input) => {
      input.switch.ts = '2026-07-30T12:00:01.000Z';
    },
    'wrong transcript path': (input) => {
      input.switch.jsonlPath = '/tmp/attacker.jsonl';
    },
    'wrong claim audit identity': (input) => {
      input.claimRequired = true;
      input.preparedKind = 'unassigned';
      input.preparedAssignees = [];
      input.auditBody = '<!-- wrong projection -->';
    },
  };
  for (const [name, corrupt] of Object.entries(cases)) {
    await t.test(name, async () => {
      const dir = sandbox();
      try {
        seedSource(dir);
        const first = switchOptions(dir);
        first.store.switchLease = async () => {
          first.log.push('authority:response-lost');
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        };
        await assert.rejects(
          () => coordinateWorkLeaseSwitch(first.input),
          (error) => error.code === 'authority-unavailable'
        );

        const path = activeTaskPath('session-1', dir);
        const persisted = JSON.parse(readFileSync(path, 'utf8'));
        corrupt(persisted.workLeaseIntent.projections.github.input);
        writeFileSync(path, `${JSON.stringify(persisted, null, 2)}\n`);

        first.log.length = 0;
        first.store.switchLease = async () => {
          throw new Error('malformed recovery must not replay authority');
        };
        await assert.rejects(
          () => coordinateWorkLeaseSwitch(first.input),
          (error) => error.code === 'invalid-request'
        );
        assert.deepEqual(first.log, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

test('malformed recovered non-GitHub inputs fail before identity, provider, or authority replay', async (t) => {
  const cases = {
    session: (input) => {
      input.switch.targetIssue = '#999';
    },
    fleet: (input) => {
      input.sourceIssue = '#999';
    },
    timing: (input) => {
      input.rows = [{ issueNumber: '999', subOperationId: 'wrong-issue' }];
    },
  };
  for (const [name, corrupt] of Object.entries(cases)) {
    await t.test(name, async () => {
      const dir = sandbox();
      try {
        seedSource(dir);
        const first = switchOptions(dir);
        first.input.projectionInputs.session.sessionId = 'session-1';
        first.input.projectionInputs.session.switch = {
          sourceIssue: '#1049',
          targetIssue: '#1051',
        };
        first.input.projectionInputs.fleet = {
          sourceIssue: '#1049',
          targetIssue: '#1051',
          source: { issue: '#1049' },
          target: { issue: '#1051' },
        };
        first.input.projectionInputs.timing.rows = [
          { issueNumber: '1049', subOperationId: 'outgoing:switch-out' },
          { issueNumber: '1051', subOperationId: 'incoming:bind' },
        ];
        first.store.switchLease = async () => {
          throw new WorkLeaseError('authority-unavailable', 'response lost');
        };
        await assert.rejects(
          () => coordinateWorkLeaseSwitch(first.input),
          (error) => error.code === 'authority-unavailable'
        );

        const persistedPath = activeTaskPath('session-1', dir);
        const persisted = JSON.parse(readFileSync(persistedPath, 'utf8'));
        corrupt(persisted.workLeaseIntent.projections[name].input);
        writeFileSync(persistedPath, `${JSON.stringify(persisted, null, 2)}\n`);

        const retry = switchOptions(dir);
        retry.input.resolveWorktreeIdentity = async () => {
          throw new Error('corrupt recovery must fail before identity');
        };
        retry.input.getStore = async () => {
          throw new Error('corrupt recovery must fail before provider');
        };
        await assert.rejects(
          () => coordinateWorkLeaseSwitch(retry.input),
          (error) => error.code === 'invalid-request'
        );
        assert.deepEqual(retry.log, []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

test('compensation persists a fresh authority timestamp and replays it exactly', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    const compensationNow = new Date('2026-07-30T12:05:00.000Z');
    let clockReads = 0;
    const first = switchOptions(dir);
    first.input.now = () => (clockReads++ === 0 ? NOW : compensationNow);
    first.input.readEligibility = async () => ({
      ok: false,
      kind: 'assignee-mismatch',
      assigneeKind: 'foreign',
      assignees: ['other-worker'],
    });
    first.store.switchLease = async (request) => {
      if (request.idempotencyKey.startsWith('switch:')) return FORWARD_RECEIPT;
      assert.equal(request.switchedAt, compensationNow.toISOString());
      assert.equal(request.target.requestedAt, compensationNow.toISOString());
      throw new WorkLeaseError('authority-unavailable', 'compensation response lost');
    };
    await assert.rejects(
      () => coordinateWorkLeaseSwitch(first.input),
      (error) => error.code === 'authority-unavailable'
    );
    const persisted = getActiveTask('session-1', dir).workLeaseIntent.compensation;
    const exactRequest = JSON.parse(persisted.canonicalRequest);
    assert.equal(exactRequest.switchedAt, compensationNow.toISOString());

    const replayed = [];
    const retry = switchOptions(dir, {
      now: () => new Date('2026-07-30T12:06:00.000Z'),
      readEligibility: async () => assert.fail('compensation replay must not re-read eligibility'),
    });
    retry.store.switchLease = async (request) => {
      replayed.push(request);
      throw new WorkLeaseError('authority-unavailable', 'still unavailable');
    };
    await assert.rejects(
      () => coordinateWorkLeaseSwitch(retry.input),
      (error) => error.code === 'authority-unavailable'
    );
    assert.deepEqual(replayed, [exactRequest]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('definitive target contention restores exact source session bytes and runs no projection', async () => {
  const dir = sandbox();
  try {
    seedSource(dir);
    const before = readFileSync(activeTaskPath('session-1', dir));
    const { input, store, log } = switchOptions(dir);
    store.switchLease = async () => {
      log.push('authority:contended');
      throw new WorkLeaseError('lease-contended', 'target held');
    };

    await assert.rejects(
      () => coordinateWorkLeaseSwitch(input),
      (error) => error.code === 'lease-contended'
    );

    assert.deepEqual(readFileSync(activeTaskPath('session-1', dir)), before);
    assert.deepEqual(log, ['identity', 'provider', 'authority:contended']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
