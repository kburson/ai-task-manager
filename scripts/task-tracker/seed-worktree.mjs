#!/usr/bin/env node
// seed-worktree.mjs — copy .ai-task-manager/ runtime config from the parent repo into a fresh worktree.
//
// Usage:  seed-worktree.mjs <worktree-path> [--source <parent-repo-path>]
//
// Why: `.ai-task-manager/` is gitignored (holds user state), so `git worktree add`
// creates a worktree without it. Without the config file, agent bootstrap silently
// no-ops. Orchestrators MUST run this immediately after `git worktree add` and
// before booting the agent.

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

// Paths are relative to `.ai-task-manager`. The markdown templates consolidated
// under `templates/` (#574); task-tracker.json stays at the SHARED_DIR root.
const SRC_FILES = [
  'task-tracker.json',
  'templates/pickup-directive.md',
  'templates/definition-of-done.md',
];
const EMPTY_FILES = ['task-tracker-state.json'];
const TEMPLATE_FILES = ['templates/pickup-directive.md', 'templates/definition-of-done.md'];

export function seedWorktree({ source, target }) {
  if (!source || typeof source !== 'string') {
    throw new Error('seed-worktree: source is required');
  }
  if (!target || typeof target !== 'string') {
    throw new Error('seed-worktree: target is required');
  }
  const srcDir = path.resolve(source, '.ai-task-manager');
  const tgtDir = path.resolve(target, '.ai-task-manager');

  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    throw new Error(`seed-worktree: source .ai-task-manager not found at ${srcDir}`);
  }
  for (const f of SRC_FILES) {
    const p = path.join(srcDir, f);
    if (!existsSync(p)) throw new Error(`seed-worktree: missing source file ${p}`);
  }

  if (existsSync(path.join(tgtDir, 'task-tracker.json'))) {
    throw new Error(
      `seed-worktree: refusing to overwrite populated target ${tgtDir} (already has task-tracker.json)`
    );
  }

  mkdirSync(tgtDir, { recursive: true });

  for (const f of SRC_FILES) {
    const data = readFileSync(path.join(srcDir, f));
    const tgt = path.join(tgtDir, f);
    mkdirSync(path.dirname(tgt), { recursive: true });
    writeFileSync(tgt, data);
  }
  for (const f of EMPTY_FILES) {
    const p = path.join(tgtDir, f);
    if (!existsSync(p)) writeFileSync(p, '{}\n', 'utf8');
  }
  return { ok: true, target: tgtDir, copied: [...SRC_FILES, ...EMPTY_FILES] };
}

// Self-heal: copy any missing template .md files from source → target.
// Unlike seedWorktree, this is idempotent and silent when target is already populated.
// Used by SessionStart hook to fix worktrees provisioned by Claude Code's
// `isolation: "worktree"` mode, which doesn't carry gitignored files across.
export function seedMissingTemplates({ source, target }) {
  if (!source || !target) return { ok: false, copied: [] };
  const srcDir = path.resolve(source, '.ai-task-manager');
  const tgtDir = path.resolve(target, '.ai-task-manager');
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    return { ok: false, copied: [], reason: 'source missing' };
  }
  mkdirSync(tgtDir, { recursive: true });
  const copied = [];
  for (const f of TEMPLATE_FILES) {
    const tgt = path.join(tgtDir, f);
    if (existsSync(tgt)) continue;
    const src = path.join(srcDir, f);
    if (!existsSync(src)) continue;
    mkdirSync(path.dirname(tgt), { recursive: true });
    writeFileSync(tgt, readFileSync(src));
    copied.push(f);
  }
  return { ok: true, copied };
}

// Find the main worktree for the current repo. Returns null on failure.
// The first `worktree` line in `git worktree list --porcelain` is always the main one.
export function findMainWorktree(cwd = process.cwd()) {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    });
    const m = out.match(/^worktree (.+)$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const out = { target: null, source: process.cwd(), backfill: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') {
      out.source = argv[++i];
      continue;
    }
    if (a === '--backfill') {
      out.backfill = true;
      continue;
    }
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (!out.target) {
      out.target = a;
      continue;
    }
  }
  return out;
}

// Idempotent variant: backfill any of SRC_FILES + EMPTY_FILES missing from target.
// Use when target is partially populated (e.g. Claude Code's `isolation: "worktree"`
// copies task-tracker.json + activity-policy.json but not the gitignored templates).
export function seedWorktreeBackfill({ source, target }) {
  if (!source || !target) throw new Error('seed-worktree: source and target required');
  const srcDir = path.resolve(source, '.ai-task-manager');
  const tgtDir = path.resolve(target, '.ai-task-manager');
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    throw new Error(`seed-worktree: source .ai-task-manager not found at ${srcDir}`);
  }
  mkdirSync(tgtDir, { recursive: true });
  const copied = [];
  for (const f of SRC_FILES) {
    const tgt = path.join(tgtDir, f);
    if (existsSync(tgt)) continue;
    const src = path.join(srcDir, f);
    if (!existsSync(src)) continue;
    mkdirSync(path.dirname(tgt), { recursive: true });
    writeFileSync(tgt, readFileSync(src));
    copied.push(f);
  }
  for (const f of EMPTY_FILES) {
    const p = path.join(tgtDir, f);
    if (!existsSync(p)) {
      writeFileSync(p, '{}\n', 'utf8');
      copied.push(f);
    }
  }
  return { ok: true, target: tgtDir, copied };
}

function isMain() {
  if (typeof process === 'undefined' || !process.argv[1]) return false;
  try {
    const url = new URL(import.meta.url);
    return path.resolve(url.pathname) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMain()) {
  const rawArgs = process.argv.slice(2);
  if (wantsHelp(rawArgs)) {
    emitSelfDoc('seed-worktree');
    process.exit(0);
  }
  const args = parseArgs(rawArgs);
  if (!args.target) {
    process.stderr.write(
      'Usage: seed-worktree.mjs <worktree-path> [--source <parent-repo>] [--backfill]\n'
    );
    process.exit(2);
  }
  try {
    const r = args.backfill
      ? seedWorktreeBackfill({ source: args.source, target: args.target })
      : seedWorktree({ source: args.source, target: args.target });
    process.stdout.write(
      r.copied.length === 0
        ? `seed: nothing to do for ${r.target}\n`
        : `seeded ${r.target} (${r.copied.join(', ')})\n`
    );
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
