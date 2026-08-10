#!/usr/bin/env node
// @story #199
// Tests for the bash-guard `/tmp` contract (issue #199, Option A).
//
// Contract: project-local `./.tmp/` is the canonical scratch directory.
// System `/tmp/` and `/private/tmp/` are NOT in scope for writes or reads.
//
// The hook reads a JSON payload from stdin and emits either nothing (pass)
// or `{decision:'block', reason:'...'}` on stdout, then exits 0.

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const GUARD = path.resolve(__dir, '..', '..', 'bash-guard.mjs');

function runGuard(command) {
  return new Promise((resolve, reject) => {
    // #1166: this suite owns path-scope policy. Isolate the hook session so a
    // parent Test sandbox's real worktree binding cannot preempt that policy.
    const child = spawn('node', [GUARD], {
      env: { ...process.env, AI_TASK_MANAGER_SESSION_ID: 'bash-guard-tmp-contract-unbound' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify({ tool_input: { command } }));
  });
}

function parseDecision(stdout) {
  if (!stdout.trim()) return { block: false };
  try {
    const parsed = JSON.parse(stdout);
    return { block: parsed.decision === 'block', reason: parsed.reason };
  } catch {
    return { block: false };
  }
}

let failed = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// -- Allowed: project-local `./.tmp/foo` write ------------------------------

{
  const r = await runGuard('touch ./.tmp/gh/scratch.txt');
  const d = parseDecision(r.stdout);
  check('allows write to project-local ./.tmp/gh/scratch.txt', !d.block, d.reason);
}

{
  // Project-root absolute path under .tmp/ — must pass.
  const cwd = process.cwd();
  const r = await runGuard(`touch ${cwd}/.tmp/gh/scratch.txt`);
  const d = parseDecision(r.stdout);
  check('allows write to <projectRoot>/.tmp/gh/scratch.txt', !d.block, d.reason);
}

// -- Rejected: system /tmp write --------------------------------------------

{
  const r = await runGuard('touch /tmp/scratch.txt');
  const d = parseDecision(r.stdout);
  check(
    'blocks write to /tmp/scratch.txt',
    d.block && /outside allowed scope/.test(d.reason ?? ''),
    d.reason
  );
  check(
    'block message points at ./.tmp/ for scratch',
    d.block && /\.\/\.tmp\//.test(d.reason ?? ''),
    d.reason
  );
}

// -- Rejected: /private/tmp write -------------------------------------------

{
  const r = await runGuard('touch /private/tmp/scratch.txt');
  const d = parseDecision(r.stdout);
  check(
    'blocks write to /private/tmp/scratch.txt',
    d.block && /outside allowed scope/.test(d.reason ?? ''),
    d.reason
  );
}

// -- Rejected: redirection to /tmp ------------------------------------------

{
  const r = await runGuard('echo hi > /tmp/out.log');
  const d = parseDecision(r.stdout);
  check(
    'blocks redirection to /tmp/out.log',
    d.block && /outside allowed scope/.test(d.reason ?? ''),
    d.reason
  );
}

// -- Rejected: read from /tmp -----------------------------------------------
// The absPath regex captures `/tmp/foo`. Since `/tmp/` is not in READ_ALLOWED,
// it must be rejected.

{
  const r = await runGuard('cat /tmp/foo.log');
  const d = parseDecision(r.stdout);
  check(
    'blocks read from /tmp/foo.log',
    d.block && /outside allowed scope/.test(d.reason ?? ''),
    d.reason
  );
}

// -- Allowed: read from a system binary path --------------------------------

{
  const r = await runGuard('/usr/bin/env');
  const d = parseDecision(r.stdout);
  check('allows /usr/bin/env (system binary)', !d.block, d.reason);
}

if (failed > 0) {
  console.error(`bash-guard-tmp-contract: ${failed} failure(s)`);
  process.exit(1);
}
console.log('bash-guard-tmp-contract.test.mjs OK');
