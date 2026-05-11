#!/usr/bin/env node
// PreToolUse hook — enforces read/write path scoping on Bash commands.
//
// Write permissions: project root + /tmp/ only. All other destinations → block.
// Read permissions:  project root + /tmp/ + ~/.claude/ + system binaries.
//                    All other sources → block.
// ~/.claude/ writes: always blocked (read-only for the task manager).
//
// Detects write targets via output redirections (>/>>), tee, and common
// write-oriented commands. Everything else is treated as a read.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { evaluateGhEdit } from './lib/gh-edit-guard.mjs';

let input = {};
try {
  input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
} catch {
  process.exit(0); // malformed payload — don't block
}

const command = input?.tool_input?.command ?? '';
if (!command) process.exit(0);

// Resolve project root; fall back to cwd when not in a git repo.
let projectRoot;
try {
  projectRoot = execSync('git rev-parse --show-toplevel', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  projectRoot = process.cwd();
}

const homeDir = homedir();
const claudeDir = join(homeDir, '.claude');

// Unconditionally dangerous patterns — block regardless of path.
const ALWAYS_BLOCK = [
  { pattern: 'rm -rf /', label: 'recursive delete from root' },
  { pattern: 'sudo ',    label: 'sudo elevation' },
  { pattern: '> /dev/',  label: 'device write' },
  { pattern: 'mkfs',     label: 'filesystem format' },
  { pattern: 'dd if=',   label: 'raw disk write (dd)' },
];

for (const { pattern, label } of ALWAYS_BLOCK) {
  if (command.includes(pattern)) {
    block(`Command contains dangerous pattern (${label}): ${pattern}`);
  }
}

// Write-allowed prefixes — project root only (./tmp/ lives inside it).
const WRITE_ALLOWED = [
  projectRoot + '/',
];

// Read-allowed prefixes — project root, temp, ~/.claude, and system paths.
const READ_ALLOWED = [
  ...WRITE_ALLOWED,
  claudeDir + '/',
  '/usr/',
  '/opt/',
  '/bin/',
  '/sbin/',
  '/etc/',
  '/private/etc/',
  '/Library/Developer/',
  '/Applications/',
];

// --- Extract write targets ---

const writePaths = new Set();

// Output redirections: > /path or >> /path (not >&, 2>, etc.)
// Lookbehind avoids matching >& or 2>
const redirectRe = /(?<![0-9&])>>?\s*(\/[a-zA-Z0-9._~/-]+)/g;
for (const [, p] of command.matchAll(redirectRe)) writePaths.add(p);

// tee [-a] /path
const teeRe = /\btee\s+(?:-a\s+)?(\/[a-zA-Z0-9._~/-]+)/g;
for (const [, p] of command.matchAll(teeRe)) writePaths.add(p);

// touch, mkdir, rmdir, rm — first absolute path argument is the target
const writeCommandRe = /\b(?:touch|mkdir|rmdir|rm)\s+(?:-[^\s]+\s+)*(\/[a-zA-Z0-9._~/-]+)/g;
for (const [, p] of command.matchAll(writeCommandRe)) writePaths.add(p);

// --- Extract all absolute paths ---
// Lookbehind ensures we match only boundary-anchored paths, not mid-segment slashes
// inside relative paths like node_modules/pkg/sub.
const absPathRe = /(?<=^|[\s='"(`])\/[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*/gm;
const allPaths = new Set(command.match(absPathRe) ?? []);

// --- Validate write targets ---
for (const p of writePaths) {
  if (!WRITE_ALLOWED.some(prefix => p.startsWith(prefix))) {
    block(`Write operation to path outside allowed scope: ${p}\n  (writes permitted only inside project root and /tmp/)`);
  }
  // Explicit check: ~/.claude writes are blocked even if path somehow matched
  if (p.startsWith(claudeDir + '/') || p === claudeDir) {
    block(`Write operation to ~/.claude/ is not permitted: ${p}`);
  }
}

// --- Validate read/exec paths (everything not identified as a write target) ---
for (const p of allPaths) {
  if (writePaths.has(p)) continue; // already validated above
  if (!READ_ALLOWED.some(prefix => p.startsWith(prefix))) {
    block(`Access to path outside allowed scope: ${p}\n  (reads permitted in project root, /tmp/, and ~/.claude/)`);
  }
}

// --- gh issue edit body protection ---
// Refuses writes that would reintroduce deprecated visible-checkbox lines or
// drop hidden verb-completion markers. Diff-based: safe wholesale rewrites of
// bodies that never had the legacy lines or markers pass through.
const ghEditResult = evaluateGhEdit({
  command,
  readBodyFile: (p) => readFileSync(p, 'utf8'),
  fetchCurrentBody: (n) => execSync(`gh issue view ${Number(n)} --json body --jq .body`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10000,
  }),
});
if (ghEditResult.block) block(ghEditResult.reason);

// All checks passed.
process.exit(0);

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}
