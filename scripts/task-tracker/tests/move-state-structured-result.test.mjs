#!/usr/bin/env node
// @story #385
// #385 — regression coverage for the swallowed move-to-done failure.
//
// Before this fix, runtime.mjs `ctx.runMoveState` caught every move-state.mjs
// failure, emitted a generic "Could not move" warning, and returned undefined.
// close.mjs could not tell a genuine board-move failure (board stuck at
// review, real gate refusal) from the benign `done → done` no-op that occurs
// when GitHub Projects' auto-close workflow already moved the item to Done —
// so it printed "Closed" and cleared active state regardless.
//
// The fix: runMoveState returns a structured `{ ok, status, stderr, benign }`
// result; the benign no-op is the ONLY non-zero treated as success (and
// silenced); every genuine failure is surfaced with its real stderr and a
// non-zero outcome. This test exercises the pure classification helpers and
// asserts close.mjs branches on the structured result.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyMoveStateBenign, buildMoveStateErrorResult } from '../runtime.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- classifyMoveStateBenign: the exit-5 done→done signature ----------------

assert.equal(
  classifyMoveStateBenign({
    state: 'done',
    status: 5,
    stderr:
      '⛔ Refusing to move #1 to done:\n   BLOCKED: illegal transition: done → done. Allowed: none.',
  }),
  true,
  'done→done exit-5 illegal-transition must classify benign'
);

// Case-insensitive / spacing tolerant on the reason string.
assert.equal(
  classifyMoveStateBenign({
    state: 'done',
    status: 5,
    stderr: 'Illegal Transition: done  →  done',
  }),
  true,
  'benign classifier tolerates case/spacing in the reason'
);

// --- #444: the exit-5 test→test self-loop (in-place re-verify) -------------

assert.equal(
  classifyMoveStateBenign({
    state: 'test',
    status: 5,
    stderr:
      '⛔ Refusing to move #1 to test:\n   BLOCKED: illegal transition: test → test. Allowed: review, develop.',
  }),
  true,
  'test→test exit-5 illegal-transition must classify benign (in-place re-verify)'
);

assert.equal(
  classifyMoveStateBenign({
    state: 'test',
    status: 5,
    stderr: 'Illegal Transition: test  →  test',
  }),
  true,
  'test→test benign classifier tolerates case/spacing in the reason'
);

assert.equal(
  classifyMoveStateBenign({ state: 'test', status: 4, stderr: 'illegal transition: test → test' }),
  false,
  'a non-5 exit with the test→test reason is NOT benign'
);

assert.equal(
  classifyMoveStateBenign({
    state: 'test',
    status: 5,
    stderr: 'BLOCKED: develop→test some-other-gate refused',
  }),
  false,
  'exit 5 in test state with a different reason (real gate refusal) is NOT benign'
);

// --- genuine failures must NOT classify benign ------------------------------

assert.equal(
  classifyMoveStateBenign({ state: 'done', status: 4, stderr: 'illegal transition: done → done' }),
  false,
  'a non-5 exit with the same reason is NOT benign'
);
assert.equal(
  classifyMoveStateBenign({
    state: 'done',
    status: 5,
    stderr: 'BLOCKED: review-to-done-some-other-gate refused',
  }),
  false,
  'exit 5 with a different reason (real gate refusal) is NOT benign'
);
assert.equal(
  classifyMoveStateBenign({
    state: 'review',
    status: 5,
    stderr: 'illegal transition: review → done',
  }),
  false,
  'a non-done target self-loop is NOT benign'
);
assert.equal(
  classifyMoveStateBenign({ state: 'done', status: null, stderr: 'spawn ENOENT' }),
  false,
  'a spawn failure (no numeric status) is NOT benign'
);

// --- buildMoveStateErrorResult: maps the pexec error shape ------------------

// Benign no-op: numeric .code === 5 + done→done reason.
const benignErr = Object.assign(new Error('Command failed'), {
  code: 5,
  stderr: '   BLOCKED: illegal transition: done → done. Allowed: none.',
  stdout: '',
});
const benignResult = buildMoveStateErrorResult({ state: 'done', err: benignErr });
assert.equal(benignResult.ok, false, 'benign result is still ok:false');
assert.equal(benignResult.benign, true, 'benign result flags benign:true');
assert.equal(benignResult.status, 5, 'benign result carries the numeric exit status');

// Genuine failure: arbitrary exit + real stderr that must be surfaced.
const genuineErr = Object.assign(new Error('Command failed'), {
  code: 4,
  stderr: '   BLOCKED: review-to-done-passed-human-review-unticked',
  stdout: '',
});
const genuineResult = buildMoveStateErrorResult({ state: 'done', err: genuineErr });
assert.equal(genuineResult.ok, false, 'genuine result is ok:false');
assert.equal(genuineResult.benign, false, 'genuine result is benign:false');
assert.equal(genuineResult.status, 4, 'genuine result carries the numeric exit status');
assert.match(
  genuineResult.stderr,
  /review-to-done-passed-human-review-unticked/,
  'genuine result preserves the real stderr so the caller can surface it'
);

// Spawn failure: string .code ('ENOENT') → status null, not benign.
const spawnErr = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT', stderr: '' });
const spawnResult = buildMoveStateErrorResult({ state: 'done', err: spawnErr });
assert.equal(spawnResult.status, null, 'string .code yields null numeric status');
assert.equal(spawnResult.benign, false, 'spawn failure is not benign');

// --- runtime.mjs source: SKIP_NETWORK + success return a structured shape ----

const runtimeSrc = readFileSync(path.resolve(__dirname, '..', 'runtime.mjs'), 'utf8');
assert.match(
  runtimeSrc,
  /if \(SKIP_NETWORK\) \{\s*\n\s*return \{ ok: true, status: 0, benign: false, skipped: true/,
  'SKIP_NETWORK path must return a structured ok result, not bare undefined'
);
assert.match(
  runtimeSrc,
  /return \{ ok: true, status: 0, benign: false, stdout:/,
  'the success path must return a structured ok result'
);

// --- close.mjs source: branch on the structured result ----------------------

const closeSrc = readFileSync(path.resolve(__dirname, '..', 'verbs/close.mjs'), 'utf8');

// The move-to-done result is captured, not discarded.
assert.match(
  closeSrc,
  /const moveResult = await runMoveStateDone\(/,
  'close.mjs must capture the structured runMoveStateDone result'
);
// Genuine failure short-circuits the success path with a non-zero exit.
assert.match(
  closeSrc,
  /!moveResult\.ok && !moveResult\.benign/,
  'close.mjs must branch on a genuine (non-benign) failure'
);
assert.match(
  closeSrc,
  /process\.exitCode = 1;/,
  'close.mjs must signal a non-zero outcome on genuine failure'
);
// The "Closed" success line must come AFTER the failure branch (i.e. it is no
// longer reached unconditionally).
const failBranchIdx = closeSrc.indexOf('!moveResult.ok && !moveResult.benign');
const closedLineIdx = closeSrc.indexOf('console.log(`Closed ${s.active}.`)');
assert.ok(
  failBranchIdx >= 0 && closedLineIdx >= 0,
  'both the failure branch and the Closed line must exist'
);
assert.ok(
  failBranchIdx < closedLineIdx,
  'the genuine-failure branch must guard the "Closed" success line'
);

// Cascade child move is also captured and surfaced (but does not abort).
assert.match(
  closeSrc,
  /const childMove = await runMoveState\(child\.num, 'done'/,
  'cascade child move must capture the structured result'
);
assert.match(
  closeSrc,
  /!childMove\.ok && !childMove\.benign/,
  'cascade must surface a genuine child move failure'
);

console.log('move-state-structured-result.test.mjs: all passed');
