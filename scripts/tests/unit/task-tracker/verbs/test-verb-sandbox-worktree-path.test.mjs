#!/usr/bin/env node
// @story #563
// #563 — the sandbox worktree path must carry a per-run uniqueness component so
// concurrent/duplicate `test` runs for the same issue+sha never collide.
//
// Before this fix `test.mjs` built `.task-test-<issue>-<shortSha>` with no
// pid/uuid/timestamp, then unconditionally reclaimed it
// (`existsSync→removeWorktree`). Two concurrent same-issue+sha runs aliased the
// same directory and the second deleted the first's live worktree, producing a
// false-red "verification failed" comment. `sandboxWorktreePath` now appends a
// unique token; the token is the ownership boundary that makes the reclaim
// unable to target a peer's worktree.
//
// Coverage:
//   - AC1: two auto-token calls with identical inputs yield DIFFERENT paths,
//     both keeping the `.task-test-<issue>-<shortSha>-` prefix.
//   - AC2: an explicit token is deterministic; distinct tokens never alias.
//   - AC3 (regression): simulate two runs (same issue+sha) — path A ≠ path B,
//     so run B's reclaim target never names run A's live worktree.

import { strict as assert } from 'node:assert';
import path from 'node:path';
import test from 'node:test';

import { sandboxWorktreePath } from '../../../../task-tracker/verbs/test.mjs';

const projectDir = '/tmp/proj';
const issueNum = 563;
const sha = 'deadbeefcafe1234';
const prefix = `.task-test-${issueNum}-deadbeef-`; // shortSha = first 8 chars

test('AC1: two auto-token calls with identical inputs yield different paths', () => {
  const a = sandboxWorktreePath({ projectDir, issueNum, sha });
  const b = sandboxWorktreePath({ projectDir, issueNum, sha });
  assert.notEqual(a, b, 'concurrent runs must not alias the same worktree path');
  assert.equal(path.dirname(a), path.dirname(b), 'both live under the same tmp dir');
  assert.equal(path.dirname(a), path.join(projectDir, '.scratch'));
  assert.ok(path.basename(a).startsWith(prefix), `a keeps the deterministic prefix: ${a}`);
  assert.ok(path.basename(b).startsWith(prefix), `b keeps the deterministic prefix: ${b}`);
});

test('AC2: explicit token is deterministic; distinct tokens never alias', () => {
  const t1a = sandboxWorktreePath({ projectDir, issueNum, sha, token: 'tok1' });
  const t1b = sandboxWorktreePath({ projectDir, issueNum, sha, token: 'tok1' });
  assert.equal(t1a, t1b, 'same token → same path (cleanup/reclaim can target it)');
  assert.equal(path.basename(t1a), `${prefix}tok1`);

  const t2 = sandboxWorktreePath({ projectDir, issueNum, sha, token: 'tok2' });
  assert.notEqual(t1a, t2, 'different tokens must never produce the same path');
});

test('AC3 regression: run B reclaim target never names run A live worktree', () => {
  // Two runs for the same issue at the same HEAD, each with its own auto token.
  const runA = sandboxWorktreePath({ projectDir, issueNum, sha });
  const runB = sandboxWorktreePath({ projectDir, issueNum, sha });

  // The reclaim in test.mjs removes ONLY its own `wtPath`. Run B's reclaim
  // target is runB; it must not equal runA, so B cannot delete A's live tree.
  assert.notEqual(runB, runA, 'second run cannot collide with the first');

  // Model the reclaim: "remove wtPath if it exists" — keyed on the run's own
  // path. A set of live worktrees containing runA is untouched by removing runB.
  const live = new Set([runA]);
  live.delete(runB); // run B's reclaim of its own (absent) path
  assert.ok(live.has(runA), 'run A worktree survives run B reclaim → no false-red');
});
