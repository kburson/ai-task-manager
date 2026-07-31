// @story #561
// Proves the runtime context decomposes into named capability objects (AC1),
// that a large verb (verbClose) is migrated to that narrow interface (AC2),
// and that the migrated verb runs against a small hand-built fixture instead of
// the full runtime context (AC3).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import { assembleCapabilities, CAPABILITY_SURFACES } from '../../../lib/runtime-capabilities.mjs';
import { buildContext, createLazyWorkLeaseStore } from '../../../runtime.mjs';
import { verbClose } from '../../../verbs/close.mjs';
import { renewWorkLeaseBeforeResume } from '../../../verbs/resume.mjs';
import { clearActiveTask, setActiveTask } from '../../../session-state.mjs';
import { resolveWorktreeIdentity } from '../../../lib/work-lease/worktree-identity.mjs';
import { deps as githubProjectsDeps } from '../../../../gh/lib/github-projects.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)) + '/..';

test('work-lease authority is lazy and memoized outside read-only runtime construction', () => {
  let opens = 0;
  const getStore = createLazyWorkLeaseStore(() => {
    opens += 1;
    return { projectId: 'project-1' };
  });

  assert.equal(opens, 0);
  assert.equal(getStore(), getStore());
  assert.equal(opens, 1);
});

// --- AC1: buildContext exposes the grouped capability objects ---------------
test('AC1: buildContext decomposes into named capability objects', () => {
  const prev = process.env.TT_SKIP_NETWORK;
  const prevSelf = process.env.TT_SKIP_FIELD_SELF_CHECK;
  process.env.TT_SKIP_NETWORK = '1';
  process.env.TT_SKIP_FIELD_SELF_CHECK = '1';
  try {
    const ctx = buildContext(['status']);
    for (const name of Object.keys(CAPABILITY_SURFACES)) {
      assert.ok(
        ctx[name] && typeof ctx[name] === 'object',
        `ctx.${name} capability object must be present`
      );
    }
    // Each capability exposes exactly its declared surface.
    for (const [name, keys] of Object.entries(CAPABILITY_SURFACES)) {
      for (const k of keys) {
        assert.ok(k in ctx[name], `ctx.${name} must expose '${k}'`);
      }
    }
    // Back-compat: the flat members still resolve to the same callables, so no
    // existing verb that reads the flat ctx members breaks.
    assert.equal(ctx.projectConfig.cfg, ctx.cfg, 'grouped cfg === flat cfg');
    assert.equal(
      ctx.stateRunner.runMoveState,
      ctx.runMoveState,
      'grouped runMoveState === flat runMoveState'
    );
    assert.equal(
      ctx.timingRecorder.drainQueueIfAny,
      ctx.drainQueueIfAny,
      'grouped drainQueueIfAny === flat drainQueueIfAny'
    );
    // issueBodyMutator is the one synthesized capability (a narrow wrapper).
    assert.equal(typeof ctx.issueBodyMutator.mutate, 'function');
    assert.equal(typeof ctx.withGovernedEffect, 'function');
    assert.equal(
      typeof ctx.verifyGovernedEffect,
      'function',
      'private Task5B resume renewal seam remains available'
    );
    assert.equal(typeof ctx.getWorkLeaseStore, 'function');
    assert.equal(
      ctx.workLeaseGuard.withGovernedEffect,
      ctx.withGovernedEffect,
      'the runtime capability exposes only the operation-aware governed-effect adapter'
    );
  } finally {
    if (prev === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prev;
    if (prevSelf === undefined) delete process.env.TT_SKIP_FIELD_SELF_CHECK;
    else process.env.TT_SKIP_FIELD_SELF_CHECK = prevSelf;
  }
});

// --- AC2: assembleCapabilities groups a flat ctx by reference ---------------
test('AC2: assembleCapabilities groups flat members by reference', () => {
  const fakePexec = async () => ({ stdout: '', stderr: '' });
  const flat = {
    cfg: { repo: 'o/r' },
    projectDir: '/tmp/proj',
    statePath: '/tmp/state.json',
    queuePath: '/tmp/queue.json',
    SKIP_NETWORK: true,
    pexec: fakePexec,
    nowIso: () => 'T',
    minutesBetween: () => 0,
    CLOSE_OWNED_CHECKBOXES: [],
    uncheckedPreCloseCheckboxes: () => [],
    safePostTiming: async () => ({ ok: true }),
    safeRecordSessionRef: async () => ({ ok: true }),
    drainQueueIfAny: async () => {},
    flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    flushActiveToGH: async () => ({}),
    runLogIssueTime: async () => {},
    runMigrate: async () => {},
    runMoveState: async () => ({ ok: true }),
    runMoveStateDone: async () => ({ ok: true }),
    worktreeLabel: () => 'main',
    buildStateOptionMap: () => ({}),
    fetchSubIssueBoardSnapshot: async () => ({ status: 'ok', children: [] }),
    fetchSubIssues: async () => [],
    fetchParentIssue: async () => null,
    getIssueBoardState: async () => null,
    getIssueCloseSnapshot: async () => ({ issueClosed: null, stateReason: null }),
    getIssueClosedState: async () => null,
  };
  const caps = assembleCapabilities(flat);
  assert.equal(caps.projectConfig.statePath, '/tmp/state.json');
  assert.equal(caps.stateRunner.runMoveState, flat.runMoveState, 'by reference');
  assert.equal(
    caps.githubClient.fetchSubIssueBoardSnapshot,
    flat.fetchSubIssueBoardSnapshot,
    'strict snapshot by reference'
  );
  assert.equal(caps.githubClient.fetchSubIssues, flat.fetchSubIssues, 'by reference');
  assert.equal(typeof caps.issueBodyMutator.mutate, 'function');
});

test('issueBodyMutator preserves a caller-scoped governed continuation', async () => {
  const caps = assembleCapabilities({
    projectDir: '/tmp/proj',
    pexec: async () => {
      throw new Error('remote I/O must remain behind the supplied authority');
    },
  });
  const authorityResult = { authenticated: true };
  const result = await caps.issueBodyMutator.mutate({
    issueNumber: 1049,
    repo: 'o/r',
    mutate: (body) => body,
    operation: 'close',
    withGovernedEffect: async (options) => {
      assert.equal(options.issueId, '1049');
      assert.equal(options.operation, 'close');
      return authorityResult;
    },
  });

  assert.equal(result, authorityResult);
});

test('workLeaseGuard capability exposes only the governed-effect adapter', () => {
  const withGovernedEffect = async () => ({ allowed: true });
  const caps = assembleCapabilities({ withGovernedEffect });

  assert.deepEqual(CAPABILITY_SURFACES.workLeaseGuard, ['withGovernedEffect']);
  assert.deepEqual(Object.keys(caps.workLeaseGuard), ['withGovernedEffect']);
  assert.equal(caps.workLeaseGuard.withGovernedEffect, withGovernedEffect);
});

test('real buildContext resume renewal reaches the retained private verifier', async () => {
  const priorSession = process.env.CODEX_SESSION_ID;
  const priorProject = process.env.AI_TASK_MANAGER_PROJECT_DIR;
  const priorSkip = process.env.TT_SKIP_NETWORK;
  const priorSelf = process.env.TT_SKIP_FIELD_SELF_CHECK;
  const projectDir = path.resolve(here, '..', '..', '..', '..', '..');
  const sessionId = `wave1-runtime-resume-${process.pid}`;
  process.env.CODEX_SESSION_ID = sessionId;
  process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
  process.env.TT_SKIP_NETWORK = '1';
  process.env.TT_SKIP_FIELD_SELF_CHECK = '1';
  try {
    const ctx = buildContext(['resume', '#1049']);
    const identity = ctx.getWorkLeaseIdentity();
    const worktree = await resolveWorktreeIdentity(projectDir, { hostId: identity.hostId });
    const persistedLease = {
      projectId: 'project-runtime-resume',
      leaseId: 'lease-runtime-resume',
      fencingToken: '42',
      worktreeId: worktree.worktreeId,
    };
    const holder = {
      principalKind: 'worker',
      provider: identity.provider,
      agentRunId: identity.agentRunId,
      sessionId,
      hostId: identity.hostId,
      pid: identity.pid,
      worktreeId: worktree.worktreeId,
      pathHash: worktree.pathHash,
      branch: identity.branch,
    };
    const binding = {
      sessionId,
      issueId: '1049',
      worktreeId: worktree.worktreeId,
      displayPath: worktree.displayPath,
    };
    setActiveTask(
      sessionId,
      { issue: '#1049', lease: persistedLease, holder, binding },
      projectDir
    );
    const leaseAt = (timestamp) => ({
      ...persistedLease,
      issueId: '1049',
      state: 'active',
      acquiredAt: new Date(Date.parse(timestamp) - 60_000).toISOString(),
      heartbeatAt: timestamp,
      expiresAt: new Date(Date.parse(timestamp) + 15 * 60_000).toISOString(),
      holder,
    });
    const calls = [];
    ctx.getWorkLeaseStore = () => ({
      verify(request) {
        calls.push(`verify:${request.operation}`);
        return { allowed: true, lease: leaseAt(request.verifiedAt) };
      },
      renew(request) {
        calls.push('renew');
        return leaseAt(request.requestedAt);
      },
    });

    await renewWorkLeaseBeforeResume(ctx, {
      issue: '#1049',
      sessionId,
      holderIdentity: { ...holder, displayPath: worktree.displayPath },
    });
    assert.deepEqual(calls, ['verify:task-bind', 'renew']);
  } finally {
    clearActiveTask(sessionId, projectDir);
    if (priorSession === undefined) delete process.env.CODEX_SESSION_ID;
    else process.env.CODEX_SESSION_ID = priorSession;
    if (priorProject === undefined) delete process.env.AI_TASK_MANAGER_PROJECT_DIR;
    else process.env.AI_TASK_MANAGER_PROJECT_DIR = priorProject;
    if (priorSkip === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = priorSkip;
    if (priorSelf === undefined) delete process.env.TT_SKIP_FIELD_SELF_CHECK;
    else process.env.TT_SKIP_FIELD_SELF_CHECK = priorSelf;
  }
});

test('strict sub-issue capability fetches project identity and Status name in one query', () => {
  const src = readFileSync(path.resolve(here, '..', '..', 'runtime.mjs'), 'utf8');
  const start = src.indexOf('ctx.fetchSubIssueBoardSnapshot = async');
  const end = src.indexOf('ctx.fetchSubIssues = async', start);

  assert.notEqual(start, -1, 'runtime defines fetchSubIssueBoardSnapshot');
  assert.ok(end > start, 'legacy fetchSubIssues follows the strict capability');

  const capabilitySource = src.slice(start, end);
  assert.match(capabilitySource, /subIssues\(first:\s*100\)/);
  assert.match(capabilitySource, /projectItems\(first:\s*\d+\)/);
  assert.match(capabilitySource, /project\s*\{\s*id\s*\}/);
  assert.match(capabilitySource, /fieldValueByName\(name:\s*"Status"\)/);
  assert.match(
    capabilitySource,
    /ProjectV2ItemFieldSingleSelectValue\s*\{\s*name\s*\}/,
    'the same child query requests the Status name'
  );
});

test('strict sub-issue capability reports a thrown GraphQL query as unknown', async () => {
  const prevSkipNetwork = process.env.TT_SKIP_NETWORK;
  const prevSelfCheck = process.env.TT_SKIP_FIELD_SELF_CHECK;
  const originalSpawn = githubProjectsDeps.spawn;
  process.env.TT_SKIP_NETWORK = '';
  process.env.TT_SKIP_FIELD_SELF_CHECK = '1';
  githubProjectsDeps.spawn = () => {
    throw new Error('query exploded');
  };

  try {
    const result = await buildContext(['status']).fetchSubIssueBoardSnapshot(925);
    assert.deepEqual(result, { status: 'unknown', error: 'query exploded' });
  } finally {
    githubProjectsDeps.spawn = originalSpawn;
    if (prevSkipNetwork === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prevSkipNetwork;
    if (prevSelfCheck === undefined) delete process.env.TT_SKIP_FIELD_SELF_CHECK;
    else process.env.TT_SKIP_FIELD_SELF_CHECK = prevSelfCheck;
  }
});

test('legacy fetchSubIssues delegates and preserves numeric issue numbers only for ok snapshots', async () => {
  const prevSkipNetwork = process.env.TT_SKIP_NETWORK;
  const prevSelfCheck = process.env.TT_SKIP_FIELD_SELF_CHECK;
  process.env.TT_SKIP_NETWORK = '1';
  process.env.TT_SKIP_FIELD_SELF_CHECK = '1';

  try {
    const ctx = buildContext(['status']);
    ctx.fetchSubIssueBoardSnapshot = async () => ({
      status: 'ok',
      children: [
        { number: 11, boardState: 'done' },
        { number: 12, boardState: 'review' },
      ],
    });
    assert.deepEqual(await ctx.fetchSubIssues(925), [11, 12]);

    ctx.fetchSubIssueBoardSnapshot = async () => ({
      status: 'unknown',
      error: 'query exploded',
    });
    assert.deepEqual(await ctx.fetchSubIssues(925), []);
  } finally {
    if (prevSkipNetwork === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prevSkipNetwork;
    if (prevSelfCheck === undefined) delete process.env.TT_SKIP_FIELD_SELF_CHECK;
    else process.env.TT_SKIP_FIELD_SELF_CHECK = prevSelfCheck;
  }
});

// --- AC2 (source): verbClose reads the grouped capability interface ---------
test('AC2: verbClose is migrated to the narrow capability interface', () => {
  const src = readFileSync(path.resolve(here, '..', '..', 'verbs', 'close.mjs'), 'utf8');
  assert.match(src, /ctx\.projectConfig\s*\?\?\s*ctx/, 'reads ctx.projectConfig');
  assert.match(src, /ctx\.timingRecorder\s*\?\?\s*ctx/, 'reads ctx.timingRecorder');
  assert.match(src, /ctx\.stateRunner\s*\?\?\s*ctx/, 'reads ctx.stateRunner');
  assert.match(src, /ctx\.githubClient\s*\?\?\s*ctx/, 'reads ctx.githubClient');
});

// --- AC3: verbClose runs against a small fixture, no full runtime -----------
test('AC3: verbClose runs against a narrow fixture (no active task path)', async () => {
  const dir = mkdtempProjectIsolated('aitm-561-');
  const statePath = path.join(dir, 'task-tracker-state.json');
  // No active task and no target arg → pure pre-queue "no active task" outcome.
  writeFileSync(statePath, JSON.stringify({ active: null, lastActive: null }));

  let drained = false;
  const logs = [];
  const origLog = console.log;
  console.log = (...a) => logs.push(a.join(' '));

  const fixture = {
    rest: [],
    projectConfig: { statePath, SKIP_NETWORK: true },
    timingRecorder: {
      drainQueueIfAny: async () => {
        drained = true;
      },
    },
    stateRunner: {},
    githubClient: {},
  };

  try {
    const result = await verbClose(fixture);
    assert.deepEqual(result, { status: 'no-target' });
  } finally {
    console.log = origLog;
  }

  assert.equal(drained, false, 'pure no-target classification must not drain the timing queue');
  assert.ok(
    logs.some((l) => l.includes('no active task')),
    'verbClose reported "no active task" running on the fixture alone'
  );
});
