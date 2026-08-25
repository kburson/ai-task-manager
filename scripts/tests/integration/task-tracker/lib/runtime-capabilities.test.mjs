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

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  assembleCapabilities,
  CAPABILITY_SURFACES,
} from '../../../../task-tracker/lib/runtime-capabilities.mjs';
import { buildContext } from '../../../../task-tracker/runtime.mjs';
import { verbClose } from '../../../../task-tracker/verbs/close.mjs';
import { deps as githubProjectsDeps } from '../../../../gh/lib/github-projects.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)) + '/..';

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
    assert.equal(
      ctx.timingRecorder.flushQueueFor,
      ctx.flushQueueFor,
      'grouped strict flushQueueFor === flat flushQueueFor'
    );
    // issueBodyMutator is the one synthesized capability (a narrow wrapper).
    assert.equal(typeof ctx.issueBodyMutator.mutate, 'function');
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
    flushQueueFor: async () => ({ delivered: 0, pending: 0 }),
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

test('strict sub-issue capability fetches project identity and Status name in one query', () => {
  const src = readFileSync(path.resolve(here, '../../../task-tracker/runtime.mjs'), 'utf8');
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
  const src = readFileSync(path.resolve(here, '../../../task-tracker/verbs/close.mjs'), 'utf8');
  assert.match(src, /ctx\.projectConfig\s*\?\?\s*ctx/, 'reads ctx.projectConfig');
  assert.match(src, /ctx\.timingRecorder\s*\?\?\s*ctx/, 'reads ctx.timingRecorder');
  assert.match(src, /ctx\.stateRunner\s*\?\?\s*ctx/, 'reads ctx.stateRunner');
  assert.match(src, /ctx\.githubClient\s*\?\?\s*ctx/, 'reads ctx.githubClient');
});

// --- AC3: verbClose runs against a small fixture, no full runtime -----------
test('AC3: verbClose runs against a narrow fixture (no active task path)', async () => {
  const dir = mkdtempProjectIsolated('aitm-561-');
  const statePath = path.join(dir, 'task-tracker-state.json');
  // No active task and no target arg → the early "no active task" return,
  // which touches only timingRecorder.drainQueueIfAny + projectConfig.statePath.
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
    assert.equal(result, undefined, 'early return is void');
  } finally {
    console.log = origLog;
  }

  assert.ok(drained, 'verbClose drained the timing queue via the timingRecorder capability');
  assert.ok(
    logs.some((l) => l.includes('no active task')),
    'verbClose reported "no active task" running on the fixture alone'
  );
});
