// @story #663
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs, resolveTargetIssue, runPlanEstimate } from '../../../verbs/plan-estimate.mjs';
import { commandByName, routeIdentityForCommand } from '../../../lib/command-surface/catalog.mjs';

const CFG = { repo: 'o/r', projectId: 'PVT_x' };

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------
test('parseArgs extracts planned/current/rationale and strips trailing h', () => {
  const { target, planned, current, rationale } = parseArgs(
    [
      '663',
      '--planned-size',
      'S',
      '--planned-estimate',
      '3h',
      '--current-size',
      'M',
      '--current-estimate',
      '6',
      '--rationale',
      'plan confirms refine',
    ],
    null
  );
  assert.equal(target, 663);
  assert.deepEqual(planned, { size: 'S', estimate: 3 });
  assert.deepEqual(current, { size: 'M', estimate: 6 });
  assert.equal(rationale, 'plan confirms refine');
});

test('parseArgs omits absent current keys and falls back to active issue', () => {
  const { target, planned, current } = parseArgs(['--planned-estimate', '4'], '#42');
  assert.equal(target, 42);
  assert.deepEqual(planned, { estimate: 4 });
  assert.deepEqual(current, {});
});

test('parseArgs selects v1 evidence or explicit legacy compatibility mode', () => {
  const adaptive = parseArgs(['1091', '--evidence-file', '.tmp/plan/1091.json'], null);
  assert.equal(adaptive.evidenceFile, '.tmp/plan/1091.json');
  assert.equal(adaptive.compatibilityMode, false);
  const legacy = parseArgs(
    ['1091', '--compatibility-mode', '--planned-size', 'XL', '--planned-estimate', '40'],
    null
  );
  assert.equal(legacy.compatibilityMode, true);
});

test('runPlanEstimate delegates evidence-file execution to adaptive authority', async () => {
  const calls = [];
  const result = await runPlanEstimate({
    target: 1091,
    evidenceFile: '.tmp/plan/1091.json',
    cfg: CFG,
    deps: {
      runAdaptivePlanEstimate: async (input) => {
        calls.push(input);
        return { status: 'converged', forecastRecordId: '01J00000000000000000000601' };
      },
    },
  });
  assert.equal(result.status, 'converged');
  assert.equal(calls[0].issueNumber, 1091);
  assert.equal(calls[0].evidenceFile, '.tmp/plan/1091.json');
});

test('legacy planned flags require explicit compatibility mode', async () => {
  await assert.rejects(
    runPlanEstimate({
      target: 663,
      planned: { size: 'S', estimate: 3 },
      current: { size: 'S', estimate: 3 },
      cfg: CFG,
    }),
    /--compatibility-mode/
  );
});

test('resolveTargetIssue prefers explicit positional over active', () => {
  assert.equal(resolveTargetIssue({ rest: ['#7'], activeIssue: '99' }), 7);
  assert.equal(resolveTargetIssue({ rest: [], activeIssue: '99' }), 99);
  assert.equal(resolveTargetIssue({ rest: [], activeIssue: null }), null);
});

// ---------------------------------------------------------------------------
// runPlanEstimate — guards
// ---------------------------------------------------------------------------
test('runPlanEstimate rejects missing target', async () => {
  await assert.rejects(
    () => runPlanEstimate({ target: 0, planned: { size: 'S' }, cfg: CFG }),
    /no target issue/
  );
});

test('runPlanEstimate rejects missing cfg.repo', async () => {
  await assert.rejects(
    () => runPlanEstimate({ target: 663, planned: { size: 'S' }, cfg: {} }),
    /cfg.repo is required/
  );
});

test('runPlanEstimate rejects empty planned column', async () => {
  await assert.rejects(
    () => runPlanEstimate({ target: 663, planned: {}, compatibilityMode: true, cfg: CFG }),
    /at least one of --planned/
  );
});

// ---------------------------------------------------------------------------
// runPlanEstimate — append path with explicit current
// ---------------------------------------------------------------------------
test('runPlanEstimate appends with explicit current (no board read)', async () => {
  const calls = [];
  const res = await runPlanEstimate({
    target: 663,
    compatibilityMode: true,
    planned: { size: 'S', estimate: 3 },
    current: { size: 'M', estimate: 6 },
    rationale: 'r',
    cfg: CFG,
    deps: {
      appendPlannedEstimate: async (a) => {
        calls.push(a);
        return { status: 'appended', commentId: 1 };
      },
      projectValuesForIssue: async () => {
        throw new Error('board should not be read when current is explicit');
      },
    },
  });
  assert.equal(res.status, 'appended');
  assert.equal(res.target, 663);
  assert.deepEqual(calls[0].current, { size: 'M', estimate: 6 });
  assert.deepEqual(calls[0].planned, { size: 'S', estimate: 3 });
});

// ---------------------------------------------------------------------------
// runPlanEstimate — board-sourced current
// ---------------------------------------------------------------------------
test('runPlanEstimate sources current from the board when --current-* omitted', async () => {
  let appended;
  const res = await runPlanEstimate({
    target: 663,
    compatibilityMode: true,
    planned: { size: 'S', estimate: 3 },
    current: {},
    cfg: CFG,
    deps: {
      appendPlannedEstimate: async (a) => {
        appended = a;
        return { status: 'appended', commentId: 2 };
      },
      projectValuesForIssue: async () => ({ size: 'L', estimate: 12 }),
      loadProjectFieldDefs: () => [],
    },
  });
  assert.equal(res.status, 'appended');
  assert.deepEqual(appended.current, { size: 'L', estimate: 12 });
});

// ---------------------------------------------------------------------------
// runPlanEstimate — board empty → mirror planned (load-bearing fallback)
// ---------------------------------------------------------------------------
test('runPlanEstimate mirrors planned when board read is empty', async () => {
  let appended;
  await runPlanEstimate({
    target: 663,
    compatibilityMode: true,
    planned: { size: 'S', estimate: 3 },
    current: {},
    cfg: CFG,
    deps: {
      appendPlannedEstimate: async (a) => {
        appended = a;
        return { status: 'appended', commentId: 3 };
      },
      projectValuesForIssue: async () => ({}),
      loadProjectFieldDefs: () => [],
    },
  });
  assert.deepEqual(appended.current, { size: 'S', estimate: 3 });
});

test('runPlanEstimate mirrors planned when board read throws', async () => {
  let appended;
  await runPlanEstimate({
    target: 663,
    compatibilityMode: true,
    planned: { estimate: 3 },
    current: {},
    cfg: CFG,
    deps: {
      appendPlannedEstimate: async (a) => {
        appended = a;
        return { status: 'appended', commentId: 4 };
      },
      projectValuesForIssue: async () => {
        throw new Error('board down');
      },
      loadProjectFieldDefs: () => [],
    },
  });
  assert.deepEqual(appended.current, { estimate: 3 });
});

test('runPlanEstimate skips board read when projectId is absent', async () => {
  let appended;
  await runPlanEstimate({
    target: 663,
    compatibilityMode: true,
    planned: { size: 'S' },
    current: {},
    cfg: { repo: 'o/r' },
    deps: {
      appendPlannedEstimate: async (a) => {
        appended = a;
        return { status: 'appended', commentId: 5 };
      },
      projectValuesForIssue: async () => {
        throw new Error('board should not be read without projectId');
      },
    },
  });
  assert.deepEqual(appended.current, { size: 'S' });
});

// ---------------------------------------------------------------------------
// runPlanEstimate — empty-appendix repopulate path
// ---------------------------------------------------------------------------
test('runPlanEstimate heals an empty appendix via repopulate on duplicate', async () => {
  let repopulated;
  const res = await runPlanEstimate({
    target: 663,
    compatibilityMode: true,
    planned: { size: 'S', estimate: 3 },
    current: { size: 'S', estimate: 3 },
    cfg: CFG,
    deps: {
      appendPlannedEstimate: async () => ({ status: 'duplicate', commentId: 9 }),
      repopulateEmptyPlannedAppendix: async (a) => {
        repopulated = a;
        return { status: 'repopulated', commentId: 9 };
      },
    },
  });
  assert.equal(res.status, 'repopulated');
  assert.equal(res.target, 663);
  assert.deepEqual(repopulated.planned, { size: 'S', estimate: 3 });
});

test('runPlanEstimate surfaces no-refine-comment from append', async () => {
  const res = await runPlanEstimate({
    target: 663,
    compatibilityMode: true,
    planned: { size: 'S' },
    current: { size: 'S' },
    cfg: CFG,
    deps: {
      appendPlannedEstimate: async () => ({ status: 'no-refine-comment' }),
    },
  });
  assert.equal(res.status, 'no-refine-comment');
  assert.equal(res.target, 663);
});

// ---------------------------------------------------------------------------
// Manifest + dispatch parity
// ---------------------------------------------------------------------------
test('plan-estimate is registered in the command catalog', () => {
  assert.equal(commandByName('plan-estimate')?.name, 'plan-estimate');
  const entry = routeIdentityForCommand('plan-estimate');
  assert.ok(entry, 'plan-estimate must resolve in routing identities');
  assert.equal(entry.dispatch, 'verbs/plan-estimate.mjs');
  const flags = commandByName('plan-estimate').arguments.map((option) => option.name);
  assert.ok(flags.includes('--evidence-file <path>'));
  assert.ok(flags.includes('--compatibility-mode'));
});
