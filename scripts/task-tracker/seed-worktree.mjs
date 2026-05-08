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
import path from 'node:path';

const SRC_FILES = ['task-tracker.json', 'pickup-directive.md', 'definition-of-done.md'];
const EMPTY_FILES = ['task-tracker-state.json'];

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
    throw new Error(`seed-worktree: refusing to overwrite populated target ${tgtDir} (already has task-tracker.json)`);
  }

  mkdirSync(tgtDir, { recursive: true });

  for (const f of SRC_FILES) {
    const data = readFileSync(path.join(srcDir, f));
    writeFileSync(path.join(tgtDir, f), data);
  }
  for (const f of EMPTY_FILES) {
    const p = path.join(tgtDir, f);
    if (!existsSync(p)) writeFileSync(p, '{}\n', 'utf8');
  }
  return { ok: true, target: tgtDir, copied: [...SRC_FILES, ...EMPTY_FILES] };
}

function parseArgs(argv) {
  const out = { target: null, source: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') { out.source = argv[++i]; continue; }
    if (a === '-h' || a === '--help') { out.help = true; continue; }
    if (!out.target) { out.target = a; continue; }
  }
  return out;
}

function isMain() {
  if (typeof process === 'undefined' || !process.argv[1]) return false;
  try {
    const url = new URL(import.meta.url);
    return path.resolve(url.pathname) === path.resolve(process.argv[1]);
  } catch { return false; }
}

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.target) {
    process.stdout.write('Usage: seed-worktree.mjs <worktree-path> [--source <parent-repo>]\n');
    process.exit(args.help ? 0 : 2);
  }
  try {
    const r = seedWorktree({ source: args.source, target: args.target });
    process.stdout.write(`seeded ${r.target} (${r.copied.join(', ')})\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
