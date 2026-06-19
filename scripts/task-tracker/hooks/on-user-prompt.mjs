#!/usr/bin/env node
// Claude Code `UserPromptSubmit` hook — thin wrapper around
// `finalizeOrphanPause({sid, reason: 'natural'})`. The shared library at
// `scripts/task-tracker/orphan-finalize.mjs` owns all marker I/O, gap
// math, and timing-row posting. See that module for the contract.
//
// EPIC #207 / #215 — Seq 4. Was Seq 2's inlined implementation; the logic
// moved out so all four finalize triggers share one code path.

import { getProjectDir } from '../paths.mjs';
import { finalizeOrphanPause, computeGapSeconds } from '../orphan-finalize.mjs';
import { readFileSync } from 'node:fs';

function parseHookPayload(stdin = '') {
  if (!stdin) return {};
  try {
    return JSON.parse(stdin);
  } catch {
    return {};
  }
}

function readHookStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function currentSid(env = process.env, payload = {}) {
  return (
    env.CLAUDE_SESSION_ID ||
    env.AI_TASK_MANAGER_SESSION_ID ||
    env.CODEX_SESSION_ID ||
    payload.session_id ||
    null
  );
}

// Backwards-compatible export — older tests/imports may still call this.
// Returns { status: 'no-session'|'no-marker'|'sub-threshold'|'posted'|... }
// for compatibility with the previous shape used by on-user-prompt.test.mjs.
export async function processPendingPause({
  env = process.env,
  now = () => new Date(),
  deps = {},
  hookInput = {},
} = {}) {
  const payload = typeof hookInput === 'string' ? parseHookPayload(hookInput) : hookInput;
  const sid = currentSid(env, payload);
  if (!sid) return { status: 'no-session' };
  const projDir = getProjectDir(env);
  const result = await finalizeOrphanPause({
    sid,
    reason: 'natural',
    projDir,
    now,
    deps,
  });
  if (!result) {
    // finalizeOrphanPause returns null for several cases; the legacy hook
    // only needs a coarse signal. The status here is informational —
    // callers who need fine-grained outcomes should use finalizeOrphanPause
    // directly.
    return { status: 'no-op' };
  }
  return {
    status: 'posted',
    gapSec: result.idleSeconds,
    issue: result.issue,
    reason: result.reason,
  };
}

export { computeGapSeconds };

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/on-user-prompt.mjs') ||
  process.argv[1]?.endsWith('\\on-user-prompt.mjs');
if (invokedDirectly) {
  processPendingPause({ hookInput: readHookStdin() })
    .catch(() => {})
    .finally(() => process.exit(0));
}
