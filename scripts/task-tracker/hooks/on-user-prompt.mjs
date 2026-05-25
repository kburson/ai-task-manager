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

function currentSid(env = process.env) {
  return env.CLAUDE_SESSION_ID || env.AI_TASK_MANAGER_SESSION_ID || null;
}

// Backwards-compatible export — older tests/imports may still call this.
// Returns { status: 'no-session'|'no-marker'|'sub-threshold'|'posted'|... }
// for compatibility with the previous shape used by on-user-prompt.test.mjs.
export async function processPendingPause({
  env = process.env,
  now = () => new Date(),
  deps = {},
} = {}) {
  const sid = currentSid(env);
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
  processPendingPause()
    .catch(() => {})
    .finally(() => process.exit(0));
}
