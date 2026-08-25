#!/usr/bin/env node
// @story #708
// Behavioral tests for `/task close --repair` (#708).
//
// The defect: a PR closing-reference ("Closes #N") auto-closes an issue
// out-of-band, so the board reads Done / the issue reads CLOSED. Every
// subsequent `/task close` then hits the `noop` convergence branch, which
// clears local state and returns WITHOUT running the timing flush, lifecycle-box
// ticking, or the review→done audit rows — there was no sanctioned path to
// replay the full atomic close from Done.
//
// The fix threads a `--repair` flag through close.mjs into
// `decideCloseConvergence`, which then forces `proceed` regardless of
// board/issue state so the full pipeline replays. These tests exercise the verb
// end-to-end (offline, injected collaborators) to prove the two observable
// halves of the contract:
//   AC2 — with --repair the noop short-circuit is bypassed and the full atomic
//         close runs (timing flush + audit rows + terminal board move + close);
//         without it, the same board/issue state still short-circuits (the bug).
//   AC4 — `--repair` is documented in the `close` verb help output.

import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

import { installStubGh } from '../../../fixtures/stub-gh.mjs';
import { verbClose } from '../../../../task-tracker/verbs/close.mjs';
import { verbHelp } from '../../../../task-tracker/verbs/help.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';

// #1408 — "offline, injected collaborators" above was aspiration, not fact. A
// census counted 12 live `gh` invocations from this file. They already fail
// (fixture repo `o/r` does not exist) and the verb already swallows them, so
// they buy nothing — but they are not free, and they are not reliable: under
// sandbox load the AC2 baseline case burned its full 10s timeout waiting on one
// and produced no stdout at all, failing an assertion that passes in 0.6s when
// the network happens to answer quickly. The double refuses instantly, which is
// what the nonexistent repo did anyway, so the cases keep their meaning and
// stop depending on network weather.
let stubGh;
before(() => {
  stubGh = installStubGh();
});
after(() => {
  stubGh?.restore();
});

// A body that satisfies assertFieldsPersisted (engagedTime non-null) so the
// full-pipeline path reaches its terminal "Closed" line offline.
const CLOSE_BODY = [
  '# A closed issue',
  '',
  '<!-- aitm-fields: {"engagedTime":42,"idleTime":0} -->',
  '',
].join('\n');

function withRealStateFile({ active }) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'tt-close-repair-'));
  const statePath = path.join(dir, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({
      active,
      lastActive: active,
      entryStartTs: '2026-07-05T12:00:00Z',
      wordsAtEntryStart: 0,
      lastWordMarker: 0,
    })
  );
  return statePath;
}

// A verbClose ctx whose board reads Done and whose GitHub issue reads CLOSED —
// the exact bypass state a PR closing-reference leaves behind. `pexec` answers
// every `gh` shape the offline pipeline touches; all collaborators record their
// invocation into `sideEffects` so we can assert which halves of the close ran.
function buildCtx({ statePath, rest, sideEffects }) {
  const pexec = async (_cmd, args = []) => {
    const a = args.join(' ');
    if (a.includes('rev-parse')) return { stdout: 'abc1234', stderr: '' };
    // `gh issue view … --json body --jq .body` → raw body; `--json body` → JSON.
    if (a.includes('issue view') && a.includes('--jq')) return { stdout: CLOSE_BODY, stderr: '' };
    if (a.includes('issue view'))
      return { stdout: JSON.stringify({ body: CLOSE_BODY }), stderr: '' };
    return { stdout: '', stderr: '' };
  };
  return {
    cfg: { repo: 'o/r' },
    statePath,
    projectDir: path.dirname(statePath),
    rest,
    SKIP_NETWORK: false,
    pexec,
    issueBodyMutator: {
      mutate: (args) => mutateIssueBody({ ...args, deps: { pexec } }),
    },
    // Real now: the timing rows go through buildRow's anti-backdating guard,
    // which refuses a `ts` more than 60s from wall-clock (data-fabrication
    // guard). A fixed literal would trip it.
    nowIso: () => new Date().toISOString(),
    // #655 — seed the live body so the review:approved emission gate is offline.
    closeBody: CLOSE_BODY,
    // #692 — inject the timing-comment reader so the close-pair emission runs
    // offline; empty body → neither half pending → both emitted.
    readTimingCommentBody: async () => '',
    applyReviewDelta: async () => {
      sideEffects.push('applyReviewDelta');
      return { status: 'applied' };
    },
    drainQueueIfAny: async () => {},
    safePostTiming: async () => {
      sideEffects.push('safePostTiming');
    },
    flushAndForgetQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    flushQueueFor: async () => ({ delivered: 0, discarded: 0 }),
    runMoveState: async () => ({ ok: true }),
    runMoveStateDone: async () => {
      sideEffects.push('runMoveStateDone');
      return { ok: true };
    },
    writeTerminalDisposition: async ({ disposition }) => {
      sideEffects.push(`writeTerminalDisposition:${disposition}`);
      return { disposition };
    },
    releaseIssueBindings: () => {
      sideEffects.push('releaseIssueBindings');
      return { released: [] };
    },
    deregisterTask: () => sideEffects.push('deregisterTask'),
    releaseBindingOccupancy: () => {
      sideEffects.push('releaseBindingOccupancy');
      return { status: 'released' };
    },
    runLogIssueTime: async () => {
      sideEffects.push('runLogIssueTime');
    },
    fetchSubIssues: async () => [],
    getIssueBoardState: async () => 'done',
    getIssueClosedState: async () => true,
    uncheckedPreCloseCheckboxes: () => [],
    loadCloseDeliveryBody: async () => CLOSE_BODY,
    loadCloseDeliveryGateInput: async () => ({
      issueNumber: 708,
      lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
      branch: 'feature/708',
      acceptedSha: 'a'.repeat(40),
      localHeadSha: 'a'.repeat(40),
      pullRequests: [],
      records: null,
    }),
    resolveReviewAuthorization: () => ({ mode: 'full-auto', standing: true, source: 'test' }),
    requireDeliveryReceipt: () => ({ skipped: false, receipt: {} }),
  };
}

async function runClose(ctx) {
  const realExit = process.exit;
  const realLog = console.log;
  const realErr = console.error;
  const realWarn = console.warn;
  // The offline pipeline runs the workspace dirty-check against the real repo
  // (dirty during development). This test targets the convergence branch, not
  // the dirty gate, so skip it — the dirty gate has its own coverage.
  const prevSkipDirty = process.env.TT_SKIP_DIRTY_CHECK;
  process.env.TT_SKIP_DIRTY_CHECK = '1';
  let exitCode = null;
  const stdout = [];
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`__test_exit_${code}__`);
  };
  console.log = (...x) => stdout.push(x.join(' '));
  console.error = () => {};
  console.warn = () => {};
  let caught = null;
  let result = null;
  try {
    result = await verbClose(ctx);
  } catch (err) {
    if (!/__test_exit_\d+__/.test(err.message)) caught = err;
  } finally {
    process.exit = realExit;
    console.log = realLog;
    console.error = realErr;
    console.warn = realWarn;
    if (prevSkipDirty === undefined) delete process.env.TT_SKIP_DIRTY_CHECK;
    else process.env.TT_SKIP_DIRTY_CHECK = prevSkipDirty;
  }
  return { exitCode, stdout: stdout.join('\n'), caught, result };
}

// ── AC2 ──────────────────────────────────────────────────────────────────────

test('#708 AC2 (baseline): board=Done + issue=CLOSED without --repair → noop short-circuit (no timing flush)', async () => {
  const statePath = withRealStateFile({ active: '#708' });
  const sideEffects = [];
  const ctx = buildCtx({ statePath, rest: ['#708'], sideEffects });
  const r = await runClose(ctx);

  // The short-circuit fires: no full timing flush, no terminal move.
  assert.ifError(r.caught);
  assert.equal(r.exitCode, null);
  assert.equal(r.result?.status, 'completed', JSON.stringify(r.result));
  assert.match(r.stdout, /already fully closed/, 'must hit the noop convergence branch');
  assert.ok(
    !sideEffects.includes('runLogIssueTime'),
    'the noop branch must NOT replay the full timing flush — that stays --repair-only (#708)'
  );
  assert.ok(
    !sideEffects.includes('writeTerminalDisposition:Delivered'),
    'the noop branch must not infer Delivered without replaying the full repair pipeline'
  );
  // #801 SUPERSESSION: the noop branch now backfills the terminal
  // `review:approved → issue:wrap` audit pair (idempotent via
  // pendingClosePairState), because an out-of-band close otherwise loses its
  // closing rows and AI-value accounting under-reports. This replaces the
  // pre-#801 assertion that the noop branch replayed NO audit rows. The
  // distinction #708's --repair genuinely owns — the full timing FLUSH
  // (runLogIssueTime) — is still asserted above, so both contracts hold.
  assert.ok(
    sideEffects.includes('safePostTiming'),
    'the noop branch backfills the close audit pair (#801) — issue:wrap is unconditional'
  );
  assert.doesNotMatch(r.stdout, /^Closed #708\.?$/m, 'the full close terminal line must not print');
});

test('#708 AC2: same state WITH --repair → bypasses noop and replays the full atomic close', async () => {
  const statePath = withRealStateFile({ active: '#708' });
  const sideEffects = [];
  // --force skips the human review gate so the offline pipeline reaches its
  // terminal close; --repair is what forces `proceed` past the noop branch.
  const ctx = buildCtx({ statePath, rest: ['#708', '--repair', '--force'], sideEffects });
  const r = await runClose(ctx);

  assert.ok(!r.caught, `pipeline must run clean, got: ${r.caught && r.caught.stack}`);
  assert.equal(r.exitCode, null);
  assert.equal(r.result, undefined);
  assert.doesNotMatch(r.stdout, /already fully closed/, 'the noop branch must be bypassed');
  assert.ok(
    sideEffects.includes('runLogIssueTime'),
    'repair must replay the timing flush (runLogIssueTime)'
  );
  assert.ok(
    sideEffects.includes('safePostTiming'),
    'repair must replay the review→done audit rows (safePostTiming)'
  );
  assert.ok(
    sideEffects.includes('runMoveStateDone'),
    'repair must replay the terminal board move to Done'
  );
  assert.ok(
    sideEffects.includes('writeTerminalDisposition:Delivered'),
    'repair must replay the Delivered classification after the terminal board move'
  );
  assert.ok(sideEffects.includes('applyReviewDelta'), 'review delta must use the injected seam');
  assert.ok(sideEffects.includes('releaseIssueBindings'), 'binding cleanup must use the fixture');
  assert.ok(sideEffects.includes('deregisterTask'), 'fleet cleanup must use the fixture');
  assert.ok(
    sideEffects.includes('releaseBindingOccupancy'),
    'occupancy cleanup must use the fixture'
  );
  assert.ok(
    sideEffects.indexOf('writeTerminalDisposition:Delivered') >
      sideEffects.indexOf('runMoveStateDone'),
    'repair must move the board to Done before writing Delivered'
  );
  assert.match(r.stdout, /Closed #708/, 'the full close must reach its terminal line');
});

// ── AC4 ──────────────────────────────────────────────────────────────────────

test('#708 AC4: `--repair` is documented in the close verb help output', () => {
  const realLog = console.log;
  const out = [];
  console.log = (...x) => out.push(x.join(' '));
  try {
    verbHelp('close');
  } finally {
    console.log = realLog;
  }
  const text = out.join('\n');
  assert.match(text, /--repair/, 'close help must list the --repair flag');
  assert.match(text, /replay the full atomic close/, 'close help must describe what --repair does');
});

console.log('close-repair.test.mjs: all passed');
