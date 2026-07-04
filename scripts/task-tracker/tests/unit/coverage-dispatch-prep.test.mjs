// @story #649
// Offline coverage-lift for scripts/gh/dispatch-prep.mjs. Drives the exported
// main(argv, deps) and parseArgs through injected execFile/loadConfig/buildRow/
// postTimingEvent/durableWordMarker/getProjectDir/emitSelfDoc/log/err/exit — no
// gh, no move-state, no network. Covers the help route, the missing-issue and
// invalid-issue usage exits, the no-repo guard, the skipNetwork happy path (no
// timing post), the network happy path (move-state exec + timing post), and the
// parseArgs --description / #-strip / default-description branches.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main, parseArgs } from '../../../gh/dispatch-prep.mjs';

const argv = (...rest) => ['node', 'dispatch-prep.mjs', ...rest];

// A fake execFile matching the node callback signature promisify expects:
// (file, args, options, cb) → cb(err, stdout, stderr). Records each call.
function fakeExecFile() {
  const calls = [];
  const fn = (file, args, options, cb) => {
    calls.push({ file, args, options });
    cb(null, { stdout: '', stderr: '' });
  };
  fn.calls = calls;
  return fn;
}

function harness({ cfg = { repo: 'o/r' }, execFile } = {}) {
  const logs = [];
  const errs = [];
  const exits = [];
  const posts = [];
  const overrides = {
    execFile: execFile || fakeExecFile(),
    loadConfig: () => cfg,
    buildRow: (r) => ({ row: r }),
    postTimingEvent: async (p) => posts.push(p),
    durableWordMarker: () => 'MARK',
    getProjectDir: () => '/proj',
    emitSelfDoc: () => logs.push('self-doc-emitted'),
    log: (s) => logs.push(s),
    err: (s) => errs.push(s),
    exit: (c) => exits.push(c),
  };
  return { overrides, logs, errs, exits, posts };
}

test('help route emits self-doc and exits 0', async () => {
  const h = harness();
  await main(argv('--help'), h.overrides);
  assert.deepEqual(h.exits, [0]);
  assert.ok(h.logs.includes('self-doc-emitted'));
});

test('missing issue → usage, exit 2', async () => {
  const h = harness();
  await main(argv(), h.overrides);
  assert.deepEqual(h.exits, [2]);
  assert.match(h.errs.join(''), /Usage:/);
});

test('non-numeric issue → invalid, exit 2', async () => {
  const h = harness();
  await main(argv('abc'), h.overrides);
  assert.deepEqual(h.exits, [2]);
  assert.match(h.errs.join(''), /invalid issue/);
});

test('no repo configured → config-not-found, exit 2', async () => {
  const h = harness({ cfg: {} });
  await main(argv('42'), h.overrides);
  assert.deepEqual(h.exits, [2]);
  assert.match(h.errs.join(''), /config-not-found/);
});

test('skipNetwork happy path: flips board, posts no timing row', async () => {
  const fx = fakeExecFile();
  const h = harness({ execFile: fx });
  await main(argv('42'), { ...h.overrides, skipNetwork: true });
  assert.equal(fx.calls.length, 1);
  // move-state.mjs invoked with the issue + develop
  assert.ok(fx.calls[0].args.some((a) => /move-state\.mjs$/.test(a)));
  assert.ok(fx.calls[0].args.includes('develop'));
  assert.equal(h.posts.length, 0);
  assert.match(h.logs.join(''), /flipped to In Progress/);
});

test('network happy path: flips board and posts a start timing row', async () => {
  const fx = fakeExecFile();
  const h = harness({ execFile: fx });
  await main(argv('42', '--description', 'boot pending'), { ...h.overrides, skipNetwork: false });
  assert.equal(fx.calls.length, 1);
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0].issueNumber, '#42');
  assert.equal(h.posts[0].repo, 'o/r');
  assert.deepEqual(h.exits, []);
});

// ── direct unit tests for the exported parser ────────────────────────────────
test('parseArgs strips leading # and reads --description', () => {
  const out = parseArgs(['#77', '--description', 'hello']);
  assert.equal(out.issue, '77');
  assert.equal(out.description, 'hello');
});

test('parseArgs defaults description and marks help', () => {
  const out = parseArgs(['5']);
  assert.equal(out.issue, '5');
  assert.match(out.description, /agent boot pending/);
  assert.equal(parseArgs(['--help']).help, true);
});
