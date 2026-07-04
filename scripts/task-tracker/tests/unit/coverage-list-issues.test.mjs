// @story #646
// Offline coverage-lift for scripts/gh/lib/list-issues.mjs. Drives the paginated
// listAllIssues() loop through the injectable child_process `deps` seam — no gh,
// no network — covering the empty-first-page break, the short-page break, the
// multi-page accumulation path, the null-stdout default, and error propagation.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { deps, listAllIssues } from '../../../gh/lib/list-issues.mjs';

const realExecFile = deps.execFile;
afterEach(() => {
  deps.execFile = realExecFile;
});

// A fake execFile matching the node callback signature promisify expects:
// (file, args, options, cb) → cb(err, stdout, stderr). `pages` is an array of
// per-call stdout strings; each invocation shifts the next one. When exhausted
// it returns '[]'. An `error` short-circuits to cb(err).
function fakeExecFile({ pages = [], error = null } = {}) {
  const calls = [];
  const fn = (file, args, options, cb) => {
    calls.push({ file, args, options });
    if (error) {
      cb(error);
      return;
    }
    const stdout = pages.length ? pages.shift() : '[]';
    cb(null, { stdout, stderr: '' });
  };
  fn.calls = calls;
  return fn;
}

function rows(n, startAt = 1) {
  return Array.from({ length: n }, (_, i) => ({
    number: startAt + i,
    title: `t${startAt + i}`,
    state: 'open',
  }));
}

test('returns [] and stops after one call when first page is empty', async () => {
  const fx = fakeExecFile({ pages: [JSON.stringify([])] });
  deps.execFile = fx;
  const out = await listAllIssues('o/r');
  assert.deepEqual(out, []);
  assert.equal(fx.calls.length, 1);
});

test('single short page: accumulates and breaks without a second call', async () => {
  const fx = fakeExecFile({ pages: [JSON.stringify(rows(3))] });
  deps.execFile = fx;
  const out = await listAllIssues('o/r', { perPage: 100 });
  assert.equal(out.length, 3);
  assert.equal(fx.calls.length, 1);
  // per_page and page=1 are threaded into the gh api path
  assert.match(fx.calls[0].args[1], /per_page=100&page=1/);
});

test('multi-page: full page then a short page, paginates then stops', async () => {
  const fx = fakeExecFile({
    pages: [JSON.stringify(rows(2, 1)), JSON.stringify(rows(1, 3))],
  });
  deps.execFile = fx;
  const out = await listAllIssues('o/r', { perPage: 2 });
  assert.deepEqual(
    out.map((i) => i.number),
    [1, 2, 3]
  );
  assert.equal(fx.calls.length, 2);
  assert.match(fx.calls[1].args[1], /page=2/);
});

test('full page followed by an empty page breaks on the empty batch', async () => {
  const fx = fakeExecFile({
    pages: [JSON.stringify(rows(2, 1)), JSON.stringify([])],
  });
  deps.execFile = fx;
  const out = await listAllIssues('o/r', { perPage: 2 });
  assert.equal(out.length, 2);
  assert.equal(fx.calls.length, 2);
});

test('null/empty stdout falls back to [] and stops', async () => {
  const fx = fakeExecFile({ pages: [''] });
  deps.execFile = fx;
  const out = await listAllIssues('o/r');
  assert.deepEqual(out, []);
});

test('propagates an execFile error', async () => {
  deps.execFile = fakeExecFile({ error: new Error('gh boom') });
  await assert.rejects(() => listAllIssues('o/r'), /gh boom/);
});
