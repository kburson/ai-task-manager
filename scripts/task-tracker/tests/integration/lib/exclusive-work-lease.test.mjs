// @story #1049
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { WorkLeaseError } from '@kburson/aitm-ledger';

import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import {
  coordinateWorkLeaseAcquire,
  buildTrustedWorkLeaseHolder,
} from '../../../lib/work-lease/guard.mjs';
import {
  activeTaskPath,
  checkpointWorkLeaseProjection,
  getActiveTask,
  setActiveTask,
} from '../../../session-state.mjs';
import { renewWorkLeaseBeforeResume } from '../../../verbs/resume.mjs';
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
  return mkdtempSync(path.join(projectScratchDir('test'), 'tt-exclusive-bind-'));
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
      readEligibility: async () => {
        log.push('eligibility');
        return { ok: true, claimRequired: true, currentUser: 'worker' };
      },
      claim: async () => {
        log.push('claim');
        return { ok: true, claimed: true };
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
        github: { issue: '#1049', claimRequired: true },
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

test('cold Full-Auto bind persists intent, acquires, claims, and reconciles every projection in order', async () => {
  const dir = sandbox();
  try {
    const { input, log } = options(dir);
    const result = await coordinateWorkLeaseAcquire(input);

    assert.deepEqual(log, [
      'eligibility',
      'identity',
      'provider',
      'acquire:acquire:session-1:1049:request-1',
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
        assert.equal(error.code, 'lease-contended');
        return true;
      }
    );
    assert.deepEqual(readFileSync(p), before);
    assert.deepEqual(log, ['eligibility', 'identity', 'acquire:contended']);
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
      claim: async () => {
        log.push('claim:foreign');
        return { ok: false, kind: 'already-assigned', assignees: ['other'] };
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
      'eligibility',
      'identity',
      'provider',
      'acquire:acquire:session-1:1049:request-1',
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

test('fresh bind validates deferred claim callback before acquiring', async () => {
  const dir = sandbox();
  try {
    let acquires = 0;
    const { input } = options(dir, {
      claim: undefined,
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
      claim: undefined,
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
    await assert.rejects(() => coordinateWorkLeaseAcquire(retry.input), /deferred assignee claim/);
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
    const releaseRequests = [];
    let releaseAttempts = 0;
    const store = {
      projectId: 'project-1',
      async acquire() {
        return LEASE;
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
        claim: async () => ({
          ok: false,
          kind: 'already-assigned',
          assignees: ['other'],
        }),
      }).input;

    await assert.rejects(() => coordinateWorkLeaseAcquire(attempt()), /release response lost/);
    assert.ok(getActiveTask('session-1', dir).workLeaseIntent.receipt);
    await assert.rejects(() => coordinateWorkLeaseAcquire(attempt()), /assignee changed/);
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
