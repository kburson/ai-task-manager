#!/usr/bin/env node
// #413 — `aitm`: the operational orchestrator for the /task skill.
//
// One public entrypoint so neither the human nor the AI invokes a support
// script by its `node_modules/ai-task-manager/**/*.mjs` filepath. Every call is
// `npx aitm <name> <args>` — the same invocation a user would type.
//
// Routing (see bin/aitm-registry.mjs):
//   - <name> is a /task verb   → delegate to task-tracker.mjs <name> <args>
//   - <name> is an exposed script → spawn that script with <args>
//   - else                      → error listing available commands (names only)
//
// Delegation is child_process with inherited stdio and a passthrough exit code,
// so behavior is byte-identical to invoking the target directly. Zero logic is
// duplicated here. `aitm <name> help` / `aitm <name> ?` forwards the help token
// to the target, which self-documents (verbs via task-tracker's help flag,
// scripts via scripts/lib/self-doc.mjs).
//
// `ai-task-manager` (bin/cli.mjs) remains the installer/lifecycle CLI; `aitm`
// is the daily driver.

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, TASK_TRACKER_PATH, SCRIPTS, kind, groupedListing } from './aitm-registry.mjs';

const HELP_NAMES = new Set(['help', '?', '--help', '-h', undefined, '']);

function printListing(write = (s) => process.stdout.write(s)) {
  const { verbs, scriptGroups } = groupedListing();
  const out = [];
  out.push('aitm — operational orchestrator for the /task skill.');
  out.push('');
  out.push('Usage: npx aitm <command> [args]    ·    npx aitm <command> help');
  out.push('');
  out.push('Workflow verbs (delegate to the /task state machine):');
  // Wrap the verb names at a sensible width; names only, never filepaths.
  let line = '  ';
  for (const v of verbs) {
    if ((line + v + ' ').length > 78) {
      out.push(line.replace(/\s+$/, ''));
      line = '  ';
    }
    line += v + ' ';
  }
  if (line.trim()) out.push(line.replace(/\s+$/, ''));
  out.push('');
  for (const group of Object.keys(scriptGroups).sort()) {
    out.push(`${group}:`);
    for (const { name, synopsis } of scriptGroups[group]) {
      out.push(`  ${name.padEnd(24)} ${synopsis}`);
    }
    out.push('');
  }
  out.push("Run `npx aitm <command> help` for a command's full API.");
  out.push('');
  write(out.join('\n'));
}

function delegate(targetPath, args) {
  const res = spawnSync(process.execPath, [targetPath, ...args], {
    stdio: 'inherit',
    shell: false,
    cwd: process.cwd(),
  });
  if (res.error) {
    process.stderr.write(
      `aitm: failed to launch ${path.basename(targetPath)}: ${res.error.message}\n`
    );
    return 1;
  }
  // Passthrough exit code (signal → 128+n convention).
  if (typeof res.status === 'number') return res.status;
  if (res.signal) return 1;
  return 0;
}

export function run(argv = process.argv.slice(2)) {
  const [name, ...rest] = argv;

  if (HELP_NAMES.has(name)) {
    printListing();
    return 0;
  }

  const k = kind(name);
  if (k === 'verb') {
    return delegate(TASK_TRACKER_PATH, [name, ...rest]);
  }
  if (k === 'script') {
    const target = path.join(REPO_ROOT, SCRIPTS[name].path);
    return delegate(target, rest);
  }

  process.stderr.write(`aitm: unknown command "${name}"\n\n`);
  printListing((s) => process.stderr.write(s));
  return 2;
}

// #506 — `npm`/`npx` installs `aitm` as a symlink (`node_modules/.bin/aitm ->
// ../ai-task-manager/bin/aitm.mjs`). `path.resolve` normalizes but does NOT
// dereference symlinks, so comparing the resolved `argv[1]` against the real
// module path made `isMain` false through the shim and the CLI ran nothing.
// Realpath both sides before comparing. Fail-closed (`false`) on any throw.
export function resolvesAsMain(moduleUrl, argvPath, { realpath = realpathSync } = {}) {
  try {
    if (!argvPath) return false;
    return realpath(fileURLToPath(moduleUrl)) === realpath(path.resolve(argvPath));
  } catch {
    return false;
  }
}

const isMain = resolvesAsMain(import.meta.url, process.argv[1]);

if (isMain) {
  process.exit(run());
}
