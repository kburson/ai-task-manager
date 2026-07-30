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
import { activeTaskPath, getActiveTask, setActiveTask } from '../../../session-state.mjs';
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
      log.push(`release:${request.idempotencyKey}:${request.reason}`);
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
          async ({ lease }) => {
            log.push(name);
            if (name === 'session') {
              setActiveTask('session-1', { issue: '#1049', lease }, dir);
            }
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
      'release:release-after-claim:lease-1:7:assignee-changed-after-acquire',
    ]);
    assert.deepEqual(readFileSync(activeTaskPath('session-1', dir)), before);
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
