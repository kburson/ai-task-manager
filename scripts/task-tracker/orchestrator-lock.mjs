#!/usr/bin/env node
// Orchestrator lock — companion CLI to agent-guard.mjs.
//
// Writes/reads/clears `<main>/.ai-task-manager/orchestrator.lock` so a Claude
// session running on the main worktree can legitimately fan out Agent tool
// spawns (each spawn must still set `isolation: "worktree"` — enforced by
// agent-guard.mjs).
//
// Verbs:
//   acquire <epic> [--ttl-hours <h>]
//                    write lock {epic, startedAt, ttlMs}. Refuses if a
//                    non-expired lock already exists; auto-replaces an
//                    expired lock.
//   release          remove lock unconditionally. Idempotent.
//   status           print lock state to stdout (json). Exit 0.
//
// Default TTL: 4 hours. Override per-acquire with `--ttl-hours`.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
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

function lockPath() {
  const main = canon(findMainWorktreePath(process.cwd()));
  return orchestratorLockPath(main);
}

function readLockFile(p) {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
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

function fail(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

const argv = process.argv.slice(2);
const verb = argv[0];
const rest = argv.slice(1);
const p = lockPath();

function takeFlag(name) {
  const i = rest.indexOf(name);
  if (i === -1) return null;
  const v = rest[i + 1];
  rest.splice(i, 2);
  return v;
}

if (verb === 'acquire') {
  const ttlHours = takeFlag('--ttl-hours');
  const epic = rest[0];
  if (!epic) fail('usage: orchestrator-lock.mjs acquire <epic> [--ttl-hours <h>]');
  const ttlMs = ttlHours ? Math.round(Number(ttlHours) * 3600 * 1000) : DEFAULT_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) fail(`invalid --ttl-hours: ${ttlHours}`);
  const existing = readLockFile(p);
  if (existing && !lockExpired(existing)) {
    fail(
      `lock held for ${existing.epic} (startedAt=${existing.startedAt}). ` +
        `Run \`release\` first.`
    );
  }
  mkdirSync(path.dirname(p), { recursive: true });
  const body = { epic, startedAt: new Date().toISOString(), ttlMs };
  writeFileSync(p, JSON.stringify(body, null, 2) + '\n', 'utf8');
  process.stdout.write(`acquired orchestrator lock for ${epic} (ttl=${ttlMs}ms)\n`);
  process.exit(0);
}

if (verb === 'release') {
  if (existsSync(p)) rmSync(p, { force: true });
  process.stdout.write('orchestrator lock released\n');
  process.exit(0);
}

if (verb === 'status') {
  const lock = readLockFile(p);
  if (!lock) {
    process.stdout.write(JSON.stringify({ held: false }) + '\n');
    process.exit(0);
  }
  process.stdout.write(JSON.stringify({ held: true, expired: lockExpired(lock), ...lock }) + '\n');
  process.exit(0);
}

fail('usage: orchestrator-lock.mjs <acquire <epic> [--ttl-hours <h>] | release | status>');
