#!/usr/bin/env node
// @story #634 — coverage lift for scripts/task-tracker/heal-timing-starts.mjs.
// Exercises `runHeal` across every status branch plus its guard throws, and
// drives the CLI `main` fully offline through injected deps (loadConfig,
// withLock, runHeal, getProjectDir, out/err streams, exit) so parseArgs,
// printUsage, timingLockPath, and every main branch are covered without any
// network or filesystem I/O.
import { strict as assert } from 'node:assert';
import {
  runHeal,
  parseArgs,
  printUsage,
  timingLockPath,
  main,
} from '../../../heal-timing-starts.mjs';

const HEADER = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |',
  '|---|---|---|---|---|---|---|',
];
const log = (...rows) => [...HEADER, ...rows].join('\n');
const DUP = log(
  '| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |',
  '| 2026-06-24 11:00 -05:00 | start | 0 | 0 | 0 | 150 | back |'
);
const CANON = log('| 2026-06-24 09:00 -05:00 | start | 0 | 0 | 0 | 100 | first |');

function fakeDeps(commentBody) {
  const calls = { update: [] };
  return {
    calls,
    findTimingComment: async () =>
      commentBody == null ? null : { id: 'C_kwDO', url: 'u', body: commentBody },
    updateTimingComment: async (id, repo, body) => {
      calls.update.push({ id, repo, body });
    },
  };
}

// Collect writes to a stream-like sink.
function sink() {
  const chunks = [];
  return { chunks, write: (s) => chunks.push(String(s)), text: () => chunks.join('') };
}

// ---- runHeal: guard throws -------------------------------------------------
await assert.rejects(() => runHeal({ repo: 'o/r' }), /issueNumber is required/);
await assert.rejects(() => runHeal({ issueNumber: '1' }), /repo is required/);

// ---- runHeal: no-comment ---------------------------------------------------
{
  const deps = fakeDeps(null);
  const res = await runHeal({ issueNumber: '9', repo: 'o/r', apply: true, deps });
  assert.equal(res.status, 'no-comment');
  assert.equal(res.commentId, null);
}

// ---- runHeal: dry-run (default apply=false) --------------------------------
{
  const deps = fakeDeps(DUP);
  const res = await runHeal({ issueNumber: '5', repo: 'o/r', deps });
  assert.equal(res.status, 'dry-run');
  assert.equal(res.startsBefore, 2);
  assert.equal(res.startsAfter, 1);
  assert.equal(deps.calls.update.length, 0);
}

// ---- runHeal: healed (apply=true) ------------------------------------------
{
  const deps = fakeDeps(DUP);
  const res = await runHeal({ issueNumber: '5', repo: 'o/r', apply: true, deps });
  assert.equal(res.status, 'healed');
  assert.equal(deps.calls.update.length, 1);
}

// ---- runHeal: already-canonical --------------------------------------------
{
  const deps = fakeDeps(CANON);
  const res = await runHeal({ issueNumber: '5', repo: 'o/r', apply: true, deps });
  assert.equal(res.status, 'already-canonical');
  assert.equal(deps.calls.update.length, 0);
}

// ---- parseArgs -------------------------------------------------------------
assert.deepEqual(parseArgs(['#42', '--apply']), { issue: '42', apply: true, help: false });
assert.deepEqual(parseArgs(['7', '--check-only']), { issue: '7', apply: false, help: false });
assert.deepEqual(parseArgs(['-h']), { issue: null, apply: false, help: true });
assert.deepEqual(parseArgs(['--help']), { issue: null, apply: false, help: true });
assert.deepEqual(parseArgs([]), { issue: null, apply: false, help: false });

// ---- printUsage writes to the injected stream ------------------------------
{
  const out = sink();
  printUsage(out);
  assert.match(out.text(), /Usage: node scripts\/task-tracker\/heal-timing-starts\.mjs/);
}

// ---- timingLockPath sanitizes the issue token ------------------------------
{
  const p = timingLockPath('4/2 x', '/proj');
  assert.match(p, /4_2_x/);
}

// ---- main: --help exits 0 after usage --------------------------------------
{
  const out = sink();
  let code = null;
  await main(['--help'], { out, exit: (c) => (code = c) });
  assert.equal(code, 0);
  assert.match(out.text(), /Usage:/);
}

// ---- main: no issue exits 2 ------------------------------------------------
{
  const out = sink();
  let code = null;
  await main([], { out, exit: (c) => (code = c) });
  assert.equal(code, 2);
}

// ---- main: missing repo in config exits 2 ----------------------------------
{
  const err = sink();
  let code = null;
  await main(['5'], { loadConfig: async () => ({}), err, exit: (c) => (code = c) });
  assert.equal(code, 2);
  assert.match(err.text(), /no repo configured/);
}

// ---- main: full apply path through injected withLock + runHeal -------------
{
  const out = sink();
  const seen = { lock: null, ran: null };
  await main(['#5', '--apply'], {
    loadConfig: async () => ({ repo: 'o/r' }),
    getProjectDir: () => '/proj',
    withLock: async (lockPath, fn) => {
      seen.lock = lockPath;
      return fn();
    },
    runHeal: async (opts) => {
      seen.ran = opts;
      return { status: 'healed', startsBefore: 2, startsAfter: 1, commentId: 'C' };
    },
    out,
  });
  assert.match(seen.lock, /5/);
  assert.equal(seen.ran.apply, true);
  assert.equal(seen.ran.issueNumber, '5');
  assert.match(out.text(), /#5 \[apply\] healed: 2 start row\(s\) → 1 after heal/);
}

// ---- main: dry-run path prints the re-run hint -----------------------------
{
  const out = sink();
  await main(['5'], {
    loadConfig: async () => ({ repo: 'o/r' }),
    getProjectDir: () => '/proj',
    withLock: async (lockPath, fn) => fn(),
    runHeal: async () => ({
      status: 'dry-run',
      startsBefore: 2,
      startsAfter: 1,
      commentId: 'C',
    }),
    out,
  });
  assert.match(out.text(), /check-only/);
  assert.match(out.text(), /dry-run — re-run with --apply/);
}

// ---- main: no-comment path omits the "after heal" suffix -------------------
{
  const out = sink();
  await main(['5'], {
    loadConfig: async () => ({ repo: 'o/r' }),
    getProjectDir: () => '/proj',
    withLock: async (lockPath, fn) => fn(),
    runHeal: async () => ({
      status: 'no-comment',
      startsBefore: 0,
      startsAfter: 0,
      commentId: null,
    }),
    out,
  });
  assert.match(out.text(), /no-comment: 0 start row\(s\)\n/);
  assert.doesNotMatch(out.text(), /after heal/);
}

console.log('coverage-heal-timing-starts.test.mjs: ok');
