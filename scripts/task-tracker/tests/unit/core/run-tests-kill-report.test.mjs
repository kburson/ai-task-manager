// @story #531 #1156
// #531 AC2 — the test runner never surfaces a bare `(exit null)` and never
// buffer-kills a passing file. A signal-killed child reports its signal +
// elapsed ms; an errored child reports its `error.code`; the per-file
// maxBuffer is raised well above the 1 MB default.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeSpawnResult,
  findFleetLeaks,
  formatFleetLeak,
  RUN_TESTS_MAX_BUFFER,
} from '../../../../run-tests-report.mjs';

test('findFleetLeaks ignores a concurrently added registered Git worktree', () => {
  const fleet = {
    '#1083': { worktreePath: '/repo/.worktrees/1083' },
    '#1145': { worktreePath: '/repo/.claude/worktrees/task-1145' },
  };

  assert.deepEqual(
    findFleetLeaks({
      keysBefore: new Set(['#1083']),
      fleetAfter: fleet,
      registeredWorktreePaths: new Set([
        '/repo',
        '/repo/.worktrees/1083',
        '/repo/.claude/worktrees/task-1145',
      ]),
    }),
    []
  );
});

test('findFleetLeaks retains new missing, malformed, and unregistered sandbox entries', () => {
  const fleet = {
    '#1083': { worktreePath: '/repo/.worktrees/1083' },
    '#201': { worktreePath: '/repo/.tmp/test/non-git-sandbox' },
    '#202': { branch: 'missing-worktree-path' },
    '#203': null,
  };

  assert.deepEqual(
    findFleetLeaks({
      keysBefore: new Set(['#1083']),
      fleetAfter: fleet,
      registeredWorktreePaths: new Set(['/repo', '/repo/.worktrees/1083']),
    }),
    ['#201', '#202', '#203']
  );
  assert.match(formatFleetLeak(['#201'], fleet), /non-git-sandbox/);
});

test('the runner applies registered-worktree classification before leak reporting', () => {
  const runner = readFileSync(new URL('../../../../run-tests.mjs', import.meta.url), 'utf8');
  assert.match(runner, /git', \['-C', repoRoot, 'worktree', 'list', '--porcelain', '-z'\]/);
  assert.match(runner, /const leaked = findFleetLeaks\(\{/);
  assert.match(runner, /registeredWorktreePaths: registeredWorktreePaths\(\)/);
  assert.ok(
    runner.indexOf('const leaked = findFleetLeaks') <
      runner.indexOf('console.error(formatFleetLeak')
  );
});

test('clean exit reports ok', () => {
  assert.equal(describeSpawnResult({ status: 0 }), 'ok');
});

test('numeric non-zero exit reports the code', () => {
  const msg = describeSpawnResult({ status: 3 });
  assert.match(msg, /exit 3/);
});

test('signal kill reports the signal and elapsed ms, never bare exit null', () => {
  const msg = describeSpawnResult({
    status: null,
    signal: 'SIGTERM',
    error: null,
    elapsedMs: 600000,
  });
  assert.match(msg, /SIGTERM/);
  assert.match(msg, /600000\s*ms/);
  assert.doesNotMatch(msg, /exit null/);
});

test('errored child reports error.code (e.g. ENOBUFS), never bare exit null', () => {
  const msg = describeSpawnResult({
    status: null,
    signal: null,
    error: { code: 'ENOBUFS' },
    elapsedMs: 42,
  });
  assert.match(msg, /ENOBUFS/);
  assert.doesNotMatch(msg, /exit null/);
});

test('a status-null kill with no signal/error still names a cause, not exit null', () => {
  const msg = describeSpawnResult({ status: null, signal: null, error: null });
  assert.doesNotMatch(msg, /exit null/);
  assert.match(msg, /kill|unknown/i);
});

test('per-file maxBuffer is raised well above the 1 MB default', () => {
  assert.ok(
    RUN_TESTS_MAX_BUFFER > 1048576,
    `expected maxBuffer > 1 MB, got ${RUN_TESTS_MAX_BUFFER}`
  );
});

// #746 — the AC2 leak reporter must dump each leaked entry's full record
// (worktreePath / sessionId / kind / branch), not just the key, so the CI log
// names the exact escaping sandbox.
test('formatFleetLeak dumps worktreePath/sessionId/kind/branch for each leaked key', () => {
  const fleet = {
    '#99': {
      worktreePath: '/runner/work/ai-task-manager/ai-task-manager',
      sessionId: 'sess-abc',
      kind: 'code',
      branch: 'fix/739-lockfile-reconcile',
    },
  };
  const msg = formatFleetLeak(['#99'], fleet);
  assert.match(msg, /#99/);
  assert.match(msg, /worktreePath="\/runner\/work\/ai-task-manager\/ai-task-manager"/);
  assert.match(msg, /sessionId="sess-abc"/);
  assert.match(msg, /kind="code"/);
  assert.match(msg, /branch="fix\/739-lockfile-reconcile"/);
  // Still names the remediation path.
  assert.match(msg, /mkdtempProjectIsolated/);
});

test('formatFleetLeak reports <entry absent> for a leaked key missing from the fleet', () => {
  const msg = formatFleetLeak(['#99'], {});
  assert.match(msg, /#99: <entry absent>/);
});

test('formatFleetLeak marks unset fields rather than printing undefined', () => {
  const msg = formatFleetLeak(['#99'], { '#99': { worktreePath: '/x' } });
  assert.match(msg, /worktreePath="\/x"/);
  assert.match(msg, /sessionId=<unset>/);
});

test('formatFleetLeak singular/plural entry count agrees with leak length', () => {
  assert.match(formatFleetLeak(['#1'], {}), /leaked 1 entry /);
  assert.match(formatFleetLeak(['#1', '#2'], {}), /leaked 2 entries /);
});
