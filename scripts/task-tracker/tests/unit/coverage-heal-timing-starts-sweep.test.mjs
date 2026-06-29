// @story #603
// Smoke leaf for `scripts/task-tracker/heal-timing-starts-sweep.mjs` (epic #586,
// Group B). Per the #586 smoke-only split this backlog-wide heal driver is
// covered by a clean-invocation smoke rather than a >=80% coverage target: its
// real work (project enumeration + per-issue timing-log heal) requires a live
// GitHub project and would write to issues, so it is exercised only on the
// argv-handling paths that exit before any network call — `--help` (usage,
// exit 0) and an invalid `--state` (error, exit 2). Both terminate inside
// `parseArgs`, before `main()` ever calls `loadConfig`/`gql`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../heal-timing-starts-sweep.mjs', import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

test('heal-timing-starts-sweep smoke: --help prints usage and exits 0', () => {
  const res = run(['--help']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Usage: heal-timing-starts-sweep\.mjs/);
  assert.match(res.stdout, /--state closed\|open\|all/);
});

test('heal-timing-starts-sweep smoke: invalid --state errors and exits 2', () => {
  const res = run(['--state', 'bogus']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /invalid --state bogus/);
});
