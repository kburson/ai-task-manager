#!/usr/bin/env node
// @story #675 (AC5)
// The move-state guard in bash-guard.mjs used a bare `\bmove-state\.(mjs|sh)\b`
// substring match against the quote-stripped command, so any UNQUOTED mention
// of the filename anywhere in the command — an unquoted grep pattern, prose in
// an `echo` — tripped the refusal even though no invocation was occurring.
// Fixed to require command position (first token of a `&&`/`||`/`;`/`&`/`|`/
// newline/`$(`-separated segment, optionally preceded by `node `/`bash `/`./`).
//
// The hook reads a JSON payload from stdin and emits either nothing (pass) or
// `{decision:'block', reason:'...'}` on stdout, then exits 0.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const GUARD = path.resolve(__dir, '..', '..', 'bash-guard.mjs');

function runGuard(command) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [GUARD], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.on('error', reject);
    child.on('close', () => resolve({ stdout }));
    child.stdin.end(JSON.stringify({ tool_input: { command } }));
  });
}

function isBlocked(stdout) {
  if (!stdout.trim()) return false;
  try {
    return JSON.parse(stdout).decision === 'block';
  } catch {
    return false;
  }
}

// -- genuine invocations still blocked, including chained/subshell forms ----

test('blocks move-state.mjs as the second command after &&', async () => {
  const { stdout } = await runGuard('echo hi && node scripts/gh/move-state.mjs 540 done');
  assert.equal(isBlocked(stdout), true);
});

test('blocks move-state.mjs after a semicolon', async () => {
  const { stdout } = await runGuard('echo hi; node scripts/gh/move-state.mjs 540 done');
  assert.equal(isBlocked(stdout), true);
});

test('blocks move-state.mjs inside a $() subshell', async () => {
  const { stdout } = await runGuard('x=$(node scripts/gh/move-state.mjs 540 done)');
  assert.equal(isBlocked(stdout), true);
});

test('blocks a bare relative move-state.mjs run directly as the command', async () => {
  const { stdout } = await runGuard('scripts/gh/move-state.mjs 540 done');
  assert.equal(isBlocked(stdout), true);
});

// -- AC5: unquoted non-executing mentions are allowed ------------------------

test('allows an unquoted grep for move-state.mjs (not an invocation)', async () => {
  const { stdout } = await runGuard('grep -rn move-state.mjs scripts/task-tracker');
  assert.equal(isBlocked(stdout), false);
});

test('allows unquoted prose mentioning move-state.mjs in an echo', async () => {
  const { stdout } = await runGuard('echo you should not call move-state.mjs directly');
  assert.equal(isBlocked(stdout), false);
});

test('allows unquoted prose mentioning move-state.sh mid-sentence', async () => {
  const { stdout } = await runGuard('echo see move-state.sh for details');
  assert.equal(isBlocked(stdout), false);
});
