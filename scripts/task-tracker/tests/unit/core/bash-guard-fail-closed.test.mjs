// @story #751
// #751 — bash-guard PreToolUse hook must fail CLOSED on an internal
// evaluation error, not fail OPEN (silently allow the command through).
//
// The guard is a standalone process invoked by the Claude Code hook runner: it
// reads a JSON payload on stdin and either emits `{"decision":"block"}` on
// stdout (to block) or emits nothing (to allow). The historical defect: any
// uncaught throw during evaluation (a dependency module that throws on import,
// a config read that throws, an unexpected exception) exited the process
// non-zero WITHOUT emitting a block — and Claude Code reads the *absence* of a
// block decision as ALLOW. One broken dependency therefore disabled every Bash
// protection at once.
//
// These tests drive the real guard as a subprocess and assert the two distinct
// failure modes are handled correctly:
//   1. An internal evaluation error → block emitted AND non-zero exit (closed).
//   2. A malformed stdin payload → no block, exit 0 (unchanged pass-through).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const GUARD = path.resolve(__dir, '..', '..', 'bash-guard.mjs');

// Run the guard as a subprocess with the given stdin payload and optional env
// overrides. Resolves with { stdout, stderr, code }.
function runGuard(stdin, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [GUARD], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
    child.stdin.end(stdin);
  });
}

test('fails CLOSED when internal evaluation throws — blocks AND exits non-zero', async () => {
  const { stdout, code } = await runGuard(
    JSON.stringify({ tool_input: { command: 'echo hello' } }),
    { AITM_GUARD_FORCE_THROW: 'simulated dependency load failure' }
  );

  // A benign command that would normally be allowed must be BLOCKED when the
  // guard's own evaluation fails — the fail-closed contract.
  const decision = JSON.parse(stdout);
  assert.equal(decision.decision, 'block', 'must emit a block decision on internal error');
  assert.match(
    decision.reason,
    /fail(ing|s)?\s+CLOSED/i,
    'block reason must explain the fail-closed behavior'
  );
  assert.match(
    decision.reason,
    /simulated dependency load failure/,
    'block reason must surface the underlying error detail'
  );

  // Non-zero exit distinguishes a fail-closed error from a normal policy block.
  assert.notEqual(code, 0, 'fail-closed must exit non-zero');
});

test('malformed stdin payload passes through — no block, exit 0 (unchanged)', async () => {
  const { stdout, code } = await runGuard('this is not valid json {{{');

  assert.equal(stdout, '', 'a malformed payload must NOT emit a block decision');
  assert.equal(code, 0, 'a malformed payload is a pass-through, not a guard failure');
});

test('a benign command with healthy deps is allowed — no block, exit 0', async () => {
  const { stdout, code } = await runGuard(
    JSON.stringify({ tool_input: { command: 'echo hello' } })
  );

  assert.equal(stdout, '', 'a benign command must not be blocked');
  assert.equal(code, 0, 'a benign command exits 0');
});
