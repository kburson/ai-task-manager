#!/usr/bin/env node
// @story #619
// Coverage for verbs/reconcile.mjs (drift-recovery verb). Drives runReconcile
// through its dep seam offline to hit every result branch — arg guards
// (issueNumber/cfg/mode/unknown-mode), no-live+no-recorded, backfill
// (no-holes / backfilled), no-drift-refused, accept-live (no-live error /
// reconciled with external-mutation vs marker-write-failed reason vs
// listComments-throws), and revert-to-recorded (no-recorded error /
// transition-failed / reconciled), plus the best-effort audit-marker catch on
// both write paths. verbReconcile's CLI arms (usage, generic-error→1,
// no-drift-refused→4, backfill no-holes→stdout) are driven via a
// process.exit/stdout/stderr trap and a fake `gh` on PATH so the default
// fetch/live helpers run offline. Lock-acquiring verb tests use unique issue
// numbers so the real withIssueLock never collides (the #618 lesson).
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import { runReconcile, verbReconcile } from '../../verbs/reconcile.mjs';
import { writeLastKnownState } from '../../gh-timing-comment.mjs';
import { stampEntryMarker } from '../../lib/stage-entry-markers.mjs';

const cfg = { repo: 'o/r', projectId: 'PID' };
const FIXED_TS = '2026-06-29T00:00:00Z';
const now = () => FIXED_TS;

// Isolated project dir keeps withIssueLock's lock files under scratch.
const PROJ = mkdtempSync(join(projectScratchDir('test'), 'reconcile-proj-'));

// --- fixture-body builders --------------------------------------------------
// Entry-marker timestamps must sort in stage order for verifyChainIntegrity.
function withEntries(base, ...stagesAtTs) {
  let b = base;
  for (const [stage, ts] of stagesAtTs) b = stampEntryMarker(b, stage, ts);
  return b;
}
const BASE = '## AC\n- [x] x\n';
// Contiguous chain refine→plan→develop at develop → no holes.
const CHAIN_FULL = withEntries(
  BASE,
  ['refine', '2026-06-01T00:00:00Z'],
  ['plan', '2026-06-02T00:00:00Z'],
  ['develop', '2026-06-03T00:00:00Z']
);
// refine→develop, missing plan → one non-optional hole at develop.
const CHAIN_HOLE = withEntries(
  BASE,
  ['refine', '2026-06-01T00:00:00Z'],
  ['develop', '2026-06-03T00:00:00Z']
);
const RECORDED_DEVELOP = writeLastKnownState(BASE, 'develop');

// --- runReconcile dep harness ----------------------------------------------
function makeDeps(overrides = {}) {
  const calls = { writes: [], mutations: [], moves: [], persists: [] };
  return {
    calls,
    deps: {
      fetchIssueBody: async () => {
        if (overrides.fetchThrows) throw new Error('fetch boom');
        return { body: overrides.body ?? BASE };
      },
      getLiveState: async () => overrides.live ?? null,
      writeIssueBody: async ({ body }) => {
        calls.writes.push(body);
      },
      runMoveState: async () => {
        calls.moves.push(true);
        return overrides.moveExit ?? 0;
      },
      persistTrackerState: (a) => calls.persists.push(a),
      mutateIssueBody: async ({ mutate }) => {
        if (overrides.mutateThrows) throw new Error('mutate boom');
        calls.mutations.push(mutate(overrides.body ?? BASE));
        return { status: 'ok' };
      },
      ...(overrides.listComments ? { listComments: overrides.listComments } : {}),
      ...overrides.deps,
    },
  };
}
function run(mode, overrides = {}) {
  const { deps, calls } = makeDeps(overrides);
  return runReconcile({
    issueNumber: overrides.issueNumber ?? 990000 + Math.floor(0),
    mode,
    cfg,
    deps,
    now,
  }).then((r) => ({ r, calls }));
}
// Distinct issue numbers for the no-drift path (it consults the real session
// store via getActiveTask) and for lock-acquiring verb tests.
let _seq = 9_100_000;
const nextIssue = () => ++_seq;

// --- arg guards -------------------------------------------------------------
test('runReconcile: throws without issueNumber', async () => {
  await assert.rejects(() => runReconcile({ mode: 'accept-live', cfg }), /issueNumber is required/);
});
test('runReconcile: throws without cfg', async () => {
  await assert.rejects(
    () => runReconcile({ issueNumber: 1, mode: 'accept-live' }),
    /cfg is required/
  );
});
test('runReconcile: missing mode → error status', async () => {
  const r = await runReconcile({ issueNumber: 1, cfg, deps: makeDeps().deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /mode is required/);
});
test('runReconcile: unknown mode → error status', async () => {
  const r = await runReconcile({ issueNumber: 1, mode: 'bogus', cfg, deps: makeDeps().deps });
  assert.equal(r.status, 'error');
  assert.match(r.message, /unknown mode/);
});

// --- no live + no recorded --------------------------------------------------
test('runReconcile: no live and no recorded → error', async () => {
  const { r } = await run('accept-live', { body: BASE, live: null });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no live or recorded state/);
});

// --- backfill ---------------------------------------------------------------
test('runReconcile: backfill with no holes → no-holes', async () => {
  const { r, calls } = await run('backfill', { body: CHAIN_FULL, live: 'develop' });
  assert.equal(r.status, 'no-holes');
  assert.equal(calls.writes.length, 0);
});
test('runReconcile: backfill fills a hole → backfilled', async () => {
  const { r, calls } = await run('backfill', { body: CHAIN_HOLE, live: 'develop' });
  assert.equal(r.status, 'backfilled');
  assert.equal(r.stage, 'develop');
  assert.deepEqual(r.filled, ['plan']);
  assert.equal(calls.writes.length, 1);
  assert.match(calls.writes[0], /aitm-entered-plan/);
  assert.equal(calls.persists.length, 1);
});

// --- no-drift-refused -------------------------------------------------------
test('runReconcile: recorded === live and no cache gap → no-drift-refused', async () => {
  const { r } = await run('accept-live', {
    issueNumber: nextIssue(),
    body: RECORDED_DEVELOP,
    live: 'develop',
  });
  assert.equal(r.status, 'no-drift-refused');
  assert.equal(r.live, 'develop');
  assert.equal(r.recorded, 'develop');
});

// --- accept-live ------------------------------------------------------------
test('runReconcile: accept-live with no live → error', async () => {
  const { r } = await run('accept-live', { body: RECORDED_DEVELOP, live: null });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no live state/);
});
test('runReconcile: accept-live reconciled (external-mutation reason)', async () => {
  const { r, calls } = await run('accept-live', { body: BASE, live: 'develop' });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.from, null);
  assert.equal(r.to, 'develop');
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.mutations.length, 1);
  assert.match(calls.mutations[0], /aitm-reconciled/);
  assert.match(calls.mutations[0], /external-mutation/);
});
test('runReconcile: accept-live reason from recording-failure comment', async () => {
  const listComments = async () => [
    {
      body: 'oops <!-- aitm-state-recording-failed -->',
      createdAt: '2026-06-28T12:00:00Z',
    },
  ];
  const { r, calls } = await run('accept-live', { body: BASE, live: 'develop', listComments });
  assert.equal(r.status, 'reconciled');
  assert.match(calls.mutations[0], /marker-write-failed at 2026-06-28T12:00:00Z/);
});
test('runReconcile: accept-live tolerates listComments throwing', async () => {
  const listComments = async () => {
    throw new Error('list boom');
  };
  const { r, calls } = await run('accept-live', { body: BASE, live: 'develop', listComments });
  assert.equal(r.status, 'reconciled');
  assert.match(calls.mutations[0], /external-mutation/);
});
test('runReconcile: accept-live tolerates audit-marker write throwing', async () => {
  const { r, calls } = await run('accept-live', {
    body: BASE,
    live: 'develop',
    mutateThrows: true,
  });
  assert.equal(r.status, 'reconciled');
  assert.equal(calls.writes.length, 1);
});

// --- revert-to-recorded -----------------------------------------------------
test('runReconcile: revert with no recorded → error', async () => {
  const { r } = await run('revert-to-recorded', { body: BASE, live: 'develop' });
  assert.equal(r.status, 'error');
  assert.match(r.message, /no recorded state/);
});
// #740 — revert-to-recorded is forward-only: the walk runs only when `recorded`
// is AHEAD of the live board. These use recorded=develop / live=plan (a single
// legal plan→develop forward hop). The old fixtures used live=review /
// recorded=develop, which is now the `wrong-direction` refusal path (covered
// by its own test below), never the move path.
test('runReconcile: revert transition-failed when move-state non-zero', async () => {
  const { r, calls } = await run('revert-to-recorded', {
    body: RECORDED_DEVELOP,
    live: 'plan',
    moveExit: 2,
  });
  assert.equal(r.status, 'transition-failed');
  assert.equal(r.exitCode, 2);
  assert.equal(r.failedAt, 'develop');
  assert.equal(calls.moves.length, 1);
  assert.equal(calls.mutations.length, 0);
});
test('runReconcile: revert reconciled when move-state succeeds', async () => {
  const { r, calls } = await run('revert-to-recorded', {
    body: RECORDED_DEVELOP,
    live: 'plan',
    moveExit: 0,
  });
  assert.equal(r.status, 'reconciled');
  assert.equal(r.from, 'plan');
  assert.equal(r.to, 'develop');
  assert.deepEqual(r.walked, ['develop']);
  assert.equal(calls.mutations.length, 1);
  assert.match(calls.mutations[0], /aitm-reverted/);
});
test('runReconcile: revert tolerates audit-marker write throwing', async () => {
  const { r } = await run('revert-to-recorded', {
    body: RECORDED_DEVELOP,
    live: 'plan',
    moveExit: 0,
    mutateThrows: true,
  });
  assert.equal(r.status, 'reconciled');
});
test('runReconcile: revert refuses when recorded is BEHIND live (wrong-direction, #740)', async () => {
  const { r, calls } = await run('revert-to-recorded', {
    body: RECORDED_DEVELOP,
    live: 'review',
    moveExit: 0,
  });
  assert.equal(r.status, 'wrong-direction');
  assert.equal(r.from, 'review');
  assert.equal(r.to, 'develop');
  assert.match(r.message, /accept-live/);
  // Forward-only: no board move, no audit-marker write on a refused revert.
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.mutations.length, 0);
});

// --- default persistTrackerState (un-injected) ------------------------------
test('runReconcile: default persistTrackerState runs without a session', async () => {
  const { deps } = makeDeps({ body: BASE, live: 'develop' });
  delete deps.persistTrackerState;
  const r = await runReconcile({ issueNumber: nextIssue(), mode: 'accept-live', cfg, deps, now });
  assert.equal(r.status, 'reconciled');
});

// --- verbReconcile CLI arms (injected deps) ---------------------------------
// verbReconcile forwards an injected `deps` to runReconcile, so every CLI arm
// runs offline — no `gh` subprocess inside the process.exit/stdout/stderr trap
// window. (Trapping global process state across an awaited subprocess swallows
// node:test's buffered reporter output; injected deps keep the trap window to a
// single microtask.) The real withIssueLock still runs, so each lock-acquiring
// test takes a unique issue number (the #618 lesson).
function runVerb(rest, deps) {
  const realExit = process.exit;
  const realErr = process.stderr.write.bind(process.stderr);
  const realOut = process.stdout.write.bind(process.stdout);
  let exitCode = null;
  const errOut = [];
  const outOut = [];
  process.exit = (code) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}__`);
  };
  process.stderr.write = (s) => (errOut.push(String(s)), true);
  process.stdout.write = (s) => (outOut.push(String(s)), true);
  const restore = () => {
    process.exit = realExit;
    process.stderr.write = realErr;
    process.stdout.write = realOut;
  };
  const result = () => ({ exitCode, stderr: errOut.join(''), stdout: outOut.join('') });
  return verbReconcile(rest, cfg, deps)
    .then(result)
    .catch((err) => {
      if (!/__exit_\d+__/.test(err.message)) throw err;
      return result();
    })
    .finally(restore);
}

test('verbReconcile: missing issue number → usage, exit 1', async () => {
  const r = await runVerb(['accept-live'], makeDeps().deps);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /Usage: \/task reconcile/);
});
test('verbReconcile: missing mode → usage, exit 1', async () => {
  const r = await runVerb(['123'], makeDeps().deps);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /Usage: \/task reconcile/);
});
test('verbReconcile: fetch failure → generic error, exit 1', async () => {
  const r = await runVerb(
    [String(nextIssue()), 'accept-live'],
    makeDeps({ fetchThrows: true }).deps
  );
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /reconcile:/);
});
test('verbReconcile: no drift → refused, exit 4', async () => {
  const deps = makeDeps({ body: RECORDED_DEVELOP, live: 'develop' }).deps;
  const r = await runVerb([String(nextIssue()), 'accept-live'], deps);
  assert.equal(r.exitCode, 4);
  assert.match(r.stderr, /Refusing to reconcile/);
});
test('verbReconcile: backfill with no holes → stdout, no exit', async () => {
  const deps = makeDeps({ body: CHAIN_FULL, live: 'develop' }).deps;
  const r = await runVerb([String(nextIssue()), 'backfill'], deps);
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, /no contiguity holes/);
});
test('verbReconcile: revert wrong-direction → exit 5, names accept-live (#740)', async () => {
  // recorded=develop / live=review is behind-live: forward-only revert refuses.
  const deps = makeDeps({ body: RECORDED_DEVELOP, live: 'review' }).deps;
  const r = await runVerb([String(nextIssue()), 'revert-to-recorded'], deps);
  assert.equal(r.exitCode, 5);
  assert.match(r.stderr, /accept-live/);
});

// --- default read helpers (fetchIssueBody / getLiveState) via fake gh --------
// Drives runReconcile with the default gql-backed read seams (no injection) so
// defaultFetchIssueBody + defaultGetLiveState execute against a fake `gh` on
// PATH. No global stdout trap here, so the subprocess can't corrupt the
// reporter. RECORDED_DEVELOP + live Develop yields no-drift-refused with no
// write side-effects, so only the read helpers run.
const FAKE_GH_DIR = mkdtempSync(join(projectScratchDir('test'), 'reconcile-gh-'));
writeFileSync(
  join(FAKE_GH_DIR, 'gh'),
  [
    '#!/usr/bin/env node',
    'const body = process.env.FAKE_GH_BODY || "";',
    'const state = process.env.FAKE_GH_STATE || "Develop";',
    'const data = { repository: { issue: {',
    '  body,',
    '  projectItems: { nodes: [{ project: { id: "PID" }, fieldValueByName: { name: state } }] },',
    '} } };',
    'process.stdout.write(JSON.stringify({ data }));',
  ].join('\n'),
  { mode: 0o755 }
);
chmodSync(join(FAKE_GH_DIR, 'gh'), 0o755);
process.env.PATH = `${FAKE_GH_DIR}:${process.env.PATH}`;

test('runReconcile: default read helpers fetch body + live state via gh', async () => {
  process.env.FAKE_GH_BODY = RECORDED_DEVELOP;
  process.env.FAKE_GH_STATE = 'Develop';
  try {
    const r = await runReconcile({
      issueNumber: nextIssue(),
      mode: 'accept-live',
      cfg,
      now,
    });
    assert.equal(r.status, 'no-drift-refused');
    assert.equal(r.live, 'develop');
    assert.equal(r.recorded, 'develop');
  } finally {
    delete process.env.FAKE_GH_BODY;
    delete process.env.FAKE_GH_STATE;
  }
});

console.log('coverage-reconcile.test.mjs: defined');
