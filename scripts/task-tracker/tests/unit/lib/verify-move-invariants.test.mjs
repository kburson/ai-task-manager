// @story #758
// The move-invariant auditor (Design §8/§10). `classifyMoveInvariants` is a PURE
// classifier over the three location signals — board Status, the recorded-state
// marker, and the move-complete sentinel — that names an out-of-band Status
// change (a wrapper/raw-API bypass) without ever trusting the board over the
// saga-written markers. `planReconcile` turns a drift verdict into concrete ops
// and is structurally forbidden from minting a sentinel. `auditMoveInvariants`
// is the injectable-I/O seam that bind + pull-next call. Every case here runs
// offline over synthetic inputs — no `gh` spawn, no network.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  classifyMoveInvariants,
  planReconcile,
  auditMoveInvariants,
  runMoveInvariantAudit,
} from '../../../lib/verify-move-invariants.mjs';

const cleanDeps = {
  fetchBody: async () => 'body',
  readBoardState: async () => 'develop',
  readRecordedState: () => ({ state: 'develop' }),
  readSentinelState: () => 'develop',
};
const driftDeps = {
  fetchBody: async () => 'body',
  readBoardState: async () => 'review',
  readRecordedState: () => ({ state: 'develop' }),
  readSentinelState: () => 'develop',
};

// --- AC1: classify — clean vs out-of-band -----------------------------------
test('clean triple (board == recorded == sentinel) ⇒ ok, no drift (#758 AC1)', () => {
  const v = classifyMoveInvariants({
    boardState: 'develop',
    recordedState: 'develop',
    sentinelState: 'develop',
  });
  assert.equal(v.ok, true);
  assert.equal(v.drift, 'none');
  assert.equal(v.reconcileAction, 'none');
});

test('Status changed with no matching sentinel ⇒ out-of-band, names board vs sentinel (#758 AC1)', () => {
  const v = classifyMoveInvariants({
    boardState: 'review',
    recordedState: 'develop',
    sentinelState: 'develop',
  });
  assert.equal(v.ok, false);
  assert.equal(v.drift, 'out-of-band');
  assert.equal(v.boardState, 'review');
  assert.equal(v.sentinelState, 'develop');
  assert.match(v.message, /review/, 'names the suspect board state');
  assert.match(v.message, /develop/, 'names the verified sentinel state');
});

test('board disagrees but NO sentinel present at all ⇒ indeterminate, report-only (#758 AC1)', () => {
  const v = classifyMoveInvariants({
    boardState: 'review',
    recordedState: 'develop',
    sentinelState: '',
  });
  assert.equal(v.ok, false);
  assert.equal(v.drift, 'indeterminate');
  assert.equal(v.reconcileAction, 'report-only');
});

// --- AC2: auditMoveInvariants composes readers + renders a readout -----------
test('auditMoveInvariants composes injected readers into the classifier (#758 AC2)', async () => {
  const res = await auditMoveInvariants({
    issueNumber: 758,
    cfg: { repo: 'o/r' },
    deps: {
      fetchBody: async () => 'body',
      readBoardState: async () => 'review',
      readRecordedState: () => ({ state: 'develop' }),
      readSentinelState: () => 'develop',
    },
  });
  assert.equal(res.verdict.drift, 'out-of-band');
  assert.equal(res.verdict.boardState, 'review');
  assert.ok(res.readout && res.readout.length > 0, 'drift yields a non-empty readout');
});

test('auditMoveInvariants on a clean issue reports ok and a clean readout (#758 AC2)', async () => {
  const res = await auditMoveInvariants({
    issueNumber: 758,
    cfg: { repo: 'o/r' },
    deps: {
      fetchBody: async () => 'body',
      readBoardState: async () => 'develop',
      readRecordedState: () => ({ state: 'develop' }),
      readSentinelState: () => 'develop',
    },
  });
  assert.equal(res.verdict.ok, true);
  assert.equal(res.verdict.drift, 'none');
});

// --- AC3: reconciliation never fabricates a sentinel ------------------------
test('planReconcile on out-of-band emits set-status→sentinel and NO sentinel write (#758 AC3)', () => {
  const v = classifyMoveInvariants({
    boardState: 'review',
    recordedState: 'develop',
    sentinelState: 'develop',
  });
  const ops = planReconcile(v);
  assert.deepEqual(ops, [{ op: 'set-status', to: 'develop' }]);
  for (const op of ops) {
    assert.ok(!/sentinel/i.test(op.op), 'reconcile never mints a sentinel');
  }
});

test('planReconcile never emits a sentinel-writing op for ANY verdict (#758 AC3)', () => {
  for (const sentinelState of ['develop', '']) {
    for (const boardState of ['develop', 'review', 'test']) {
      const v = classifyMoveInvariants({ boardState, recordedState: 'develop', sentinelState });
      for (const op of planReconcile(v)) {
        assert.ok(!/sentinel|move-complete/i.test(op.op));
        assert.ok(op.op !== 'write-sentinel');
      }
    }
  }
});

test('planReconcile on report-only / clean yields no ops (#758 AC3)', () => {
  const indeterminate = classifyMoveInvariants({
    boardState: 'review',
    recordedState: 'develop',
    sentinelState: '',
  });
  assert.deepEqual(planReconcile(indeterminate), []);
  const clean = classifyMoveInvariants({
    boardState: 'develop',
    recordedState: 'develop',
    sentinelState: 'develop',
  });
  assert.deepEqual(planReconcile(clean), []);
});

// --- AC2 (wiring seam): runMoveInvariantAudit is best-effort + non-throwing --
test('runMoveInvariantAudit warns on drift, stays silent on clean (#758 AC2)', async () => {
  const warns = [];
  const logs = [];
  const drift = await runMoveInvariantAudit({
    issueNumber: 758,
    cfg: { repo: 'o/r' },
    deps: driftDeps,
    warn: (m) => warns.push(m),
    log: (m) => logs.push(m),
  });
  assert.equal(drift.drift, 'out-of-band');
  assert.equal(warns.length, 1, 'drift emits exactly one warning');

  warns.length = 0;
  const clean = await runMoveInvariantAudit({
    issueNumber: 758,
    cfg: { repo: 'o/r' },
    deps: cleanDeps,
    warn: (m) => warns.push(m),
    log: (m) => logs.push(m),
  });
  assert.equal(clean.ok, true);
  assert.equal(warns.length, 0, 'a clean audit is silent by default');
});

test('runMoveInvariantAudit is a no-op without repo, and never throws (#758 AC2)', async () => {
  assert.equal(await runMoveInvariantAudit({ issueNumber: 758, cfg: {} }), null);
  // A reader that throws must be swallowed — a bad audit read cannot abort bind.
  const res = await runMoveInvariantAudit({
    issueNumber: 758,
    cfg: { repo: 'o/r' },
    deps: {
      fetchBody: async () => {
        throw new Error('gql down');
      },
      readBoardState: async () => 'develop',
    },
    warn: () => {},
  });
  assert.equal(res.drift, 'error', 'read failure resolves to an error verdict, not a throw');
});

// --- AC4: a legitimate saga move is never flagged ---------------------------
test('board == sentinel with a LAGGING recordedState ⇒ ok, not flagged (#758 AC4)', () => {
  const v = classifyMoveInvariants({
    boardState: 'test',
    recordedState: 'develop', // marker one step behind, still a legit saga move
    sentinelState: 'test',
  });
  assert.equal(v.ok, true);
  assert.equal(v.drift, 'none');
  assert.equal(v.reconcileAction, 'none');
});
