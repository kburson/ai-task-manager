// @story #606
// Smoke leaf for `scripts/task-tracker/verify-sweep-comment.mjs` (epic #586, Group B).
//
// Per the #586 smoke-only split this #539-AC5 verifier is covered by a
// clean-invocation smoke rather than a >=80% coverage target. The script's
// success path requires a live GitHub issue carrying an `aitm-sweep-result`
// comment marker, so a coverage test is impractical. The argument guard,
// however, runs fully offline: parseArgs requires an issue number and exits 2
// with `issue number required` before any `gh` call is made. The smoke drives
// the two no-issue argv paths as child processes and asserts that guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../verify-sweep-comment.mjs', import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

test('verify-sweep-comment smoke: no arguments → exits 2 with issue-required guard', () => {
  const res = run([]);
  assert.equal(res.status, 2, res.stdout);
  assert.match(res.stderr, /verify-sweep-comment: issue number required/);
});

test('verify-sweep-comment smoke: --repo but no issue → still exits 2 before any network call', () => {
  const res = run(['--repo', 'example/repo']);
  assert.equal(res.status, 2, res.stdout);
  assert.match(res.stderr, /verify-sweep-comment: issue number required/);
});
