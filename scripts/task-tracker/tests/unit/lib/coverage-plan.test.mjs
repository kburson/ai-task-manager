#!/usr/bin/env node
// @story #617
// Coverage for verbs/plan.mjs. Drives runPlan directly through its dep seam
// (assertBound / getLiveState / verbPromote) so every result branch is hit
// without network: arg guards (missing cfg, non-positive issue#), bind
// assertion, wrong-state refusal, and the promoted success path. The default
// getLiveState (gql → gh api graphql) is exercised via a fake `gh` on PATH.
// verbPlan's usage/catch/wrong-state/success arms are driven via a
// process.exit/stdout/stderr trap and the verb's optional ctx.deps seam.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';
import { runPlan, verbPlan } from '../../../verbs/plan.mjs';

const CFG = { repo: 'o/r' };

// A fake `gh` on PATH so the default getLiveState (gql → `gh api graphql`) runs
// offline. It reads the GraphQL payload on stdin and answers a projectItems
// query with a single Status = "Refine" node, which normalizes to `refine`.
const FAKE_GH_DIR = mkdtempSync(join(projectScratchDir('test'), 'plan-gh-'));
writeFileSync(
  join(FAKE_GH_DIR, 'gh'),
  [
    '#!/usr/bin/env node',
    "let input = '';",
    "process.stdin.on('data', (c) => (input += c));",
    "process.stdin.on('end', () => {",
    "  const data = { repository: { issue: { projectItems: { nodes: [{ project: { id: 'P' }, fieldValueByName: { name: 'Refine' } }] } } } };",
    '  process.stdout.write(JSON.stringify({ data }));',
    '});',
  ].join('\n'),
  { mode: 0o755 }
);
chmodSync(join(FAKE_GH_DIR, 'gh'), 0o755);
process.env.PATH = `${FAKE_GH_DIR}:${process.env.PATH}`;

// Assemble a deps object; defaults give a bound, refine-state, promote-ok path.
function deps({ live = 'refine', boundThrows = false, onPromote } = {}) {
  return {
    assertBound: () => {
      if (boundThrows) throw new Error('not bound to #5');
    },
    getLiveState: async () => live,
    verbPromote: async (rest, cfg) => {
      if (onPromote) onPromote(rest, cfg);
    },
  };
}

test('runPlan: throws without cfg', async () => {
  await assert.rejects(() => runPlan({ issueNumber: 5 }), /cfg is required/);
});

test('runPlan: throws on non-positive issue#', async () => {
  await assert.rejects(() => runPlan({ issueNumber: 0, cfg: CFG }), /positive integer/);
  await assert.rejects(() => runPlan({ issueNumber: -3, cfg: CFG }), /positive integer/);
  await assert.rejects(() => runPlan({ issueNumber: 1.5, cfg: CFG }), /positive integer/);
});

test('runPlan: assertBound is invoked and may throw', async () => {
  await assert.rejects(
    () => runPlan({ issueNumber: 5, cfg: CFG, deps: deps({ boundThrows: true }) }),
    /not bound/
  );
});

test('runPlan: current !== refine → wrong-state (no promote)', async () => {
  let promoted = false;
  const r = await runPlan({
    issueNumber: 5,
    cfg: CFG,
    deps: deps({ live: 'develop', onPromote: () => (promoted = true) }),
  });
  assert.equal(r.status, 'wrong-state');
  assert.equal(r.current, 'develop');
  assert.match(r.message, /only enters Sprint-Planning from Refine/);
  assert.equal(promoted, false);
});

test('runPlan: unknown live state → wrong-state message names "unknown"', async () => {
  const r = await runPlan({ issueNumber: 5, cfg: CFG, deps: deps({ live: null }) });
  assert.equal(r.status, 'wrong-state');
  assert.match(r.message, /unknown/);
});

test('runPlan: refine → promoted (promote called with issue#)', async () => {
  let seen = null;
  const r = await runPlan({
    issueNumber: 5,
    cfg: CFG,
    deps: deps({ live: 'refine', onPromote: (rest) => (seen = rest) }),
  });
  assert.equal(r.status, 'promoted');
  assert.equal(r.issueNumber, 5);
  assert.equal(r.from, 'refine');
  assert.equal(r.to, 'plan');
  assert.deepEqual(seen, ['5']);
});

test('runPlan: default getLiveState via fake gh → promoted', async () => {
  // No getLiveState injected → defaultGetLiveState runs through `gql` → fake gh,
  // which reports Status "Refine". Only verbPromote + assertBound are stubbed so
  // the test stays offline and side-effect-free.
  const r = await runPlan({
    issueNumber: 5,
    cfg: { repo: 'o/r', projectId: 'P' },
    deps: { assertBound: () => {}, verbPromote: async () => {} },
  });
  assert.equal(r.status, 'promoted');
  assert.equal(r.from, 'refine');
  assert.equal(r.to, 'plan');
});

// --- verbPlan: process.exit + stdout/stderr trapped, ctx.deps injected ---
function runVerb(rest, { deps } = {}) {
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
  return verbPlan({ cfg: CFG, rest, deps })
    .then(result)
    .catch((err) => {
      if (!/__exit_\d+__/.test(err.message)) throw err;
      return result();
    })
    .finally(restore);
}

test('verbPlan: no issue number → usage, exit 2', async () => {
  const r = await runVerb([]);
  assert.equal(r.exitCode, 2);
  assert.match(r.stderr, /Usage: \/task plan/);
});

test('verbPlan: refine → promoted, no exit', async () => {
  const r = await runVerb(['5'], { deps: deps({ live: 'refine' }) });
  assert.equal(r.exitCode, null);
});

test('verbPlan: wrong-state → stderr, exit 1', async () => {
  const r = await runVerb(['5'], { deps: deps({ live: 'develop' }) });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /refuses to run/);
});

test('verbPlan: runPlan throws → stderr, exit 1', async () => {
  const r = await runVerb(['5'], { deps: deps({ boundThrows: true }) });
  assert.equal(r.exitCode, 1);
  assert.match(r.stderr, /plan: not bound/);
});

console.log('coverage-plan.test.mjs: defined');
