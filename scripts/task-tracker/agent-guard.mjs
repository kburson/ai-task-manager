#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY, and not exposed through `aitm`.
// Plumbing: invoked only by the Claude Code hook runner, never by a human or
// the AI. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.
//
// PreToolUse hook — gates `Agent` tool spawns from the main git worktree.
//
// Background (epic #61): an orchestrator running in the main worktree once
// spawned sub-agents that inherited the same cwd; concurrent edits corrupted
// code + issue state. The original rule was a flat block from the main
// worktree with no override.
//
// Current rule: spawning from the main worktree is allowed **only** when
//   (a) an orchestrator lock file is present at <main>/.ai-task-manager/orchestrator.lock,
//   (b) the lock has not expired (now < startedAt + ttlMs, default 4h), and
//   (c) the Agent tool input requests `isolation: "worktree"`.
//
// (c) is the teeth: agents must run in their own worktree, so they can't
// stomp on the orchestrator's checkout. Without (c) we fall back to the
// original block, preserving the #61 protection.
//
// TTL exists because Claude Code's pid isn't reachable through the bash →
// node lock-acquire chain; pid-liveness would mark every lock stale
// immediately. The orchestrator is expected to release the lock when the
// wave ends; the TTL is a forgotten-lock backstop.
//
// Acquire/release via `scripts/task-tracker/orchestrator-lock.mjs`.

import { readFileSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { findMainWorktreePath } from './fleet-registry.mjs';
import { orchestratorLockPath } from './paths.mjs';

const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000;

function canon(p) {
  try {
    return realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

function readLock(mainPath) {
  const lockPath = orchestratorLockPath(mainPath);
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function lockExpired(lock) {
  const ttl = Number.isFinite(lock.ttlMs) && lock.ttlMs > 0 ? lock.ttlMs : DEFAULT_TTL_MS;
  const started = Date.parse(lock.startedAt);
  if (!Number.isFinite(started)) return true;
  return Date.now() - started > ttl;
}

function emitBlock(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

let input = {};
try {
  // #737 — read hook stdin via fd 0, not the `/dev/stdin` path (flaky on Linux CI pipes).
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const cwd = canon(process.env.PWD || process.cwd());
const main = canon(findMainWorktreePath(cwd));

if (cwd !== main) process.exit(0);

const lock = readLock(main);
if (!lock) {
  emitBlock(
    `Agent tool spawns are forbidden in the main worktree ` +
      `(cwd=${cwd}, main=${main}). ` +
      `No orchestrator lock present. ` +
      `Acquire via \`node scripts/task-tracker/orchestrator-lock.mjs acquire <epic>\` ` +
      `or spawn from a linked worktree.`
  );
}

if (lockExpired(lock)) {
  emitBlock(
    `Agent tool spawns are forbidden in the main worktree ` +
      `(cwd=${cwd}, main=${main}). ` +
      `Orchestrator lock expired (startedAt=${lock.startedAt}). ` +
      `Release with \`node scripts/task-tracker/orchestrator-lock.mjs release\` and re-acquire.`
  );
}

const isolation = input?.tool_input?.isolation;
if (isolation !== 'worktree') {
  emitBlock(
    `Agent tool spawns from the main worktree must set \`isolation: "worktree"\` ` +
      `(cwd=${cwd}, main=${main}, lock.epic=${lock.epic ?? '?'}). ` +
      `Got isolation=${JSON.stringify(isolation)}. ` +
      `This prevents sub-agents from inheriting the orchestrator's checkout (epic #61).`
  );
}

process.exit(0);
