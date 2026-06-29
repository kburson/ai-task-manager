#!/usr/bin/env node
// @story #615
// Coverage for verbs/plan-approve.mjs. Drives runPlanApprove directly through
// its dep seam (fetchIssueBody / mutateIssueBody / getBoardState / nowIso) so
// every result branch is hit without network: arg guards, wrong-state,
// forbidden-command lint, already-approved no-op, the approve mutate closure,
// and the re-stamped-entry path. verbPlanApprove's two offline-reachable
// guards (no issue number, TT_SKIP_NETWORK) are driven via process.exit trap.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runPlanApprove, verbPlanApprove } from '../../verbs/plan-approve.mjs';

const CFG = { repo: 'o/r' };
const TS = '2026-06-29T00:00:00Z';

// Body with both an approval marker and a plan-entry marker → already-approved.
const APPROVED_BODY =
  '## Plan\n\n<!-- aitm-entered-plan ts="2026-06-01T00:00:00Z" -->\n<!-- aitm-plan-approved ts="2026-06-01T00:00:00Z" -->\n';
// Approval present but NO plan-entry marker → re-stamped-entry.
const APPROVED_NO_ENTRY = '## Plan\n\n<!-- aitm-plan-approved ts="2026-06-01T00:00:00Z" -->\n';
// Clean plan body, no markers → approved.
const CLEAN_BODY = '## Plan\n\nNothing approved yet.\n';
// AC carries a compound evidence command → lint error → forbidden-command.
const FORBIDDEN_BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] does it <!-- aitm-verified cmd="`npm test && npm run lint`" -->',
  '',
].join('\n');

function deps({ body = CLEAN_BODY, state = 'plan', onMutate } = {}) {
  return {
    getBoardState: async () => state,
    fetchIssueBody: async () => body,
    nowIso: () => TS,
    mutateIssueBody: async ({ mutate }) => {
      if (onMutate) onMutate(mutate(body));
      return { status: 'ok' };
    },
  };
}

test('runPlanApprove: throws without issueNumber', async () => {
  await assert.rejects(() => runPlanApprove({ cfg: CFG }), /issueNumber is required/);
});

test('runPlanApprove: throws without cfg', async () => {
  await assert.rejects(() => runPlanApprove({ issueNumber: 5 }), /cfg is required/);
});

test('runPlanApprove: not in plan state → wrong-state', async () => {
  const r = await runPlanApprove({ issueNumber: 5, cfg: CFG, deps: deps({ state: 'develop' }) });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /expected 'plan'/);
});

test('runPlanApprove: forbidden compound command in AC → forbidden-command', async () => {
  const r = await runPlanApprove({
    issueNumber: 5,
    cfg: CFG,
    deps: deps({ body: FORBIDDEN_BODY }),
  });
  assert.equal(r.status, 'forbidden-command');
  assert.ok(r.violations.length >= 1);
});

test('runPlanApprove: both markers present → already-approved (no write)', async () => {
  let wrote = false;
  const r = await runPlanApprove({
    issueNumber: 5,
    cfg: CFG,
    deps: deps({ body: APPROVED_BODY, onMutate: () => (wrote = true) }),
  });
  assert.equal(r.status, 'already-approved');
  assert.equal(wrote, false);
});

test('runPlanApprove: clean body → approved, mutate stamps both markers', async () => {
  let next = null;
  const r = await runPlanApprove({
    issueNumber: 5,
    cfg: CFG,
    deps: deps({ body: CLEAN_BODY, onMutate: (b) => (next = b) }),
  });
  assert.equal(r.status, 'approved');
  assert.equal(r.ts, TS);
  assert.match(next, /aitm-entered-plan/);
  assert.match(next, /aitm-plan-approved/);
});

test('runPlanApprove: approval present, entry missing → re-stamped-entry', async () => {
  let next = null;
  const r = await runPlanApprove({
    issueNumber: 5,
    cfg: CFG,
    deps: deps({ body: APPROVED_NO_ENTRY, onMutate: (b) => (next = b) }),
  });
  assert.equal(r.status, 're-stamped-entry');
  assert.match(next, /aitm-entered-plan/);
});

// --- verbPlanApprove: process.exit + stdout/stderr trapped, deps injected ---
// The verb forwards its third arg straight to runPlanApprove's dep seam, so we
// drive every switch branch (and the try/catch) offline without any network.
function runVerb(rest, { env = {}, deps } = {}) {
  const realExit = process.exit;
  const realErr = process.stderr.write.bind(process.stderr);
  const realOut = process.stdout.write.bind(process.stdout);
  const prevSkip = process.env.TT_SKIP_NETWORK;
  if (env.TT_SKIP_NETWORK !== undefined) process.env.TT_SKIP_NETWORK = env.TT_SKIP_NETWORK;
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
    if (prevSkip === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prevSkip;
  };
  const result = () => ({ exitCode, stderr: errOut.join(''), stdout: outOut.join('') });
  return verbPlanApprove(rest, CFG, deps)
    .then(result)
    .catch((err) => {
      if (!/__exit_\d+__/.test(err.message)) throw err;
      return result();
    })
    .finally(restore);
}

test('verbPlanApprove: no issue number → usage, exit 1', async () => {
  const r = await runVerb([]);
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /Usage:/);
});

test('verbPlanApprove: TT_SKIP_NETWORK set → refuses, exit 1', async () => {
  const r = await runVerb(['#5'], { env: { TT_SKIP_NETWORK: '1' } });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /refusing to run gate offline/);
});

test('verbPlanApprove: approved → stdout, no exit', async () => {
  const r = await runVerb(['5'], { deps: deps({ body: CLEAN_BODY }) });
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, /Plan approved for #5/);
});

test('verbPlanApprove: already-approved → stdout, no exit', async () => {
  const r = await runVerb(['5'], { deps: deps({ body: APPROVED_BODY }) });
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, /already has a plan-approval marker/);
});

test('verbPlanApprove: re-stamped-entry → stdout, no exit', async () => {
  const r = await runVerb(['5'], { deps: deps({ body: APPROVED_NO_ENTRY }) });
  assert.equal(r.exitCode, null);
  assert.match(r.stdout, /Re-stamped missing aitm-entered-plan/);
});

test('verbPlanApprove: wrong-state → stderr, exit 3', async () => {
  const r = await runVerb(['5'], { deps: deps({ state: 'develop' }) });
  assert.equal(r.exitCode, 3);
  assert.match(r.stderr, /expected 'plan'/);
});

test('verbPlanApprove: forbidden-command → stderr, exit 12', async () => {
  const r = await runVerb(['5'], { deps: deps({ body: FORBIDDEN_BODY }) });
  assert.equal(r.exitCode, 12);
  assert.match(r.stderr, /forbidden compound commands/);
});

test('verbPlanApprove: runPlanApprove throws → stderr, exit 1', async () => {
  const boom = {
    getBoardState: async () => {
      throw new Error('kaboom');
    },
  };
  const r = await runVerb(['5'], { deps: boom });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /plan-approve: kaboom/);
});
// NB: verbPlanApprove's `default` switch arm is unreachable here on purpose —
// runPlanApprove only ever returns the five statuses tested above, so forcing
// it would require fabricating an impossible result. Left uncovered honestly.

console.log('coverage-plan-approve.test.mjs: defined');
